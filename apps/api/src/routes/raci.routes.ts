import { normalizePersonName } from '@pms/shared';
import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { recordAuditEvent } from '../services/audit.js';
import { projectWriter, readableProject } from './project-writer.js';

export const RACI_ROLES = ['R', 'A', 'C', 'I'] as const;
const RACI_ROW_TYPES = ['PHASE', 'WORK_PACKAGE', 'DELIVERABLE'] as const;
const cellSchema = z.object({
  wbsItemId: z.string().trim().min(1),
  personName: z.string().trim().min(2).max(120),
  role: z.enum(RACI_ROLES).nullable(),
});

/**
 * The project's RACI matrix: rows are its phases, work packages and
 * deliverables; people are named as on the structure. Anyone who reads the
 * project sees it; people who may change the project set cells. A row keeps
 * at most one Accountable, enforced by the database.
 */
export function createRaciRouter() {
  const router = Router();

  router.get('/projects/:projectId/raci', async (req, res) => {
    const project = await readableProject(req, String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const [rows, assignments, owners] = await Promise.all([
      prisma.wbsItem.findMany({
        where: { projectId: project.id, type: { in: [...RACI_ROW_TYPES] }, status: { not: 'CANCELLED' } },
        select: { id: true, code: true, title: true, type: true, parentId: true },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      }),
      prisma.raciAssignment.findMany({ where: { projectId: project.id }, select: { wbsItemId: true, personName: true, personKey: true, role: true } }),
      prisma.wbsItem.findMany({ where: { projectId: project.id, owner: { not: '' } }, select: { owner: true }, distinct: ['owner'] }),
    ]);
    // People: those with a role, then owners on the structure; each name once.
    const people = new Map<string, string>();
    for (const name of [...assignments.map((row) => row.personName), ...owners.map((row) => row.owner.trim())]) {
      const key = normalizePersonName(name);
      if (key && !people.has(key)) people.set(key, name);
    }
    res.json({ rows, people: [...people.values()], assignments });
  });

  router.put('/projects/:projectId/raci/cell', async (req, res) => {
    const context = await projectWriter(req, res, String(req.params.projectId));
    if (!context) return;
    const body = cellSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Укажите строку, человека и роль R, A, C или I' });
      return;
    }
    const row = await prisma.wbsItem.findFirst({
      where: { id: body.data.wbsItemId, projectId: context.project.id, type: { in: [...RACI_ROW_TYPES] } },
      select: { id: true, code: true },
    });
    if (!row) {
      res.status(400).json({ error: 'Строка RACI должна быть фазой, пакетом работ или результатом этого проекта' });
      return;
    }
    const personKey = normalizePersonName(body.data.personName);
    const where = { wbsItemId_personKey: { wbsItemId: row.id, personKey } };
    const write = () =>
      body.data.role === null
        ? prisma.raciAssignment.deleteMany({ where: { wbsItemId: row.id, personKey } })
        : prisma.raciAssignment.upsert({
            where,
            create: { projectId: context.project.id, wbsItemId: row.id, personName: body.data.personName, personKey, role: body.data.role },
            update: { role: body.data.role, personName: body.data.personName },
          });
    const conflict = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
    try {
      try {
        await write();
      } catch (error) {
        if (!conflict(error)) throw error;
        // Someone else holds this row's A: that is the one conflict to explain.
        const holder = await prisma.raciAssignment.findFirst({ where: { wbsItemId: row.id, role: 'A' }, select: { personName: true, personKey: true } });
        if (body.data.role === 'A' && holder && holder.personKey !== personKey) {
          res.status(409).json({ error: `У строки ${row.code} уже есть ответственный (A): ${holder.personName}` });
          return;
        }
        // Two writes of the same cell raced to create it: the second one updates it.
        await write();
      }
    } catch (error) {
      if (conflict(error)) {
        res.status(409).json({ error: 'Ячейка только что изменилась: обновите матрицу и повторите' });
        return;
      }
      throw error;
    }
    await recordAuditEvent({
      req,
      actor: context.user,
      action: 'raci.set',
      objectType: 'WbsItem',
      objectId: row.id,
      projectId: context.project.id,
      metadata: { person: body.data.personName, role: body.data.role },
    });
    res.json({ ok: true });
  });

  return router;
}
