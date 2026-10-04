import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { currentUser } from '../server/auth.js';
import { recordAuditEvent } from '../services/audit.js';
import { editableProjectIds } from '../services/workload.js';
import { readableProject } from './project-writer.js';

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value);
const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

const allocationSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    employeeId: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
    percent: z.number().int().min(1).max(100),
    startsOn: isoDate,
    endsOn: isoDate.nullable().default(null),
  })
  .refine((value) => !value.endsOn || value.endsOn >= value.startsOn, { message: 'Окончание раньше начала', path: ['endsOn'] });
const capacitySchema = z.object({ capacityPercent: z.number().int().min(0).max(100) });

/** People change shares in a session; the project must be open, readable and editable by them. */
async function editableOpenProject(req: Request, res: Response, projectId: string) {
  if (!currentUser(req)) {
    res.status(403).json({ error: 'Доли в проектах изменяются только из сессии пользователя' });
    return null;
  }
  const project = await readableProject(req, projectId);
  if (!project || project.status === 'CLOSED') {
    res.status(404).json({ error: 'Проект не найден' });
    return null;
  }
  if ((await editableProjectIds(req, [project.id])).length === 0) {
    res.status(403).json({ error: 'Нет доступа на изменение этого проекта' });
    return null;
  }
  return project;
}

/**
 * Shares of people's time planned for projects, and each person's capacity.
 * Whoever may change a project sets the shares on it; only an administrator
 * sets how much of a full week a person has. One person has at most one share
 * on a project at a time: periods of the same pair may not overlap.
 */
export function createWorkloadAllocationsRouter() {
  const router = Router();

  router.put('/workload/allocations', async (req, res) => {
    const parsed = allocationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Укажите человека, проект, долю от 1 до 100 % и период' });
      return;
    }
    const input = parsed.data;
    const existing = input.id ? await prisma.projectAllocation.findUnique({ where: { id: input.id } }) : null;
    if (input.id && !existing) {
      res.status(404).json({ error: 'Доля не найдена' });
      return;
    }
    // Moving a share to another project needs the right on both.
    if (existing && existing.projectId !== input.projectId && !(await editableOpenProject(req, res, existing.projectId))) return;
    if (!(await editableOpenProject(req, res, input.projectId))) return;
    const employee = await prisma.leaveEmployee.findFirst({ where: { id: input.employeeId, isActive: true }, select: { id: true } });
    if (!employee) {
      res.status(404).json({ error: 'Человек не найден в справочнике' });
      return;
    }
    const startsOn = toDate(input.startsOn);
    const endsOn = input.endsOn ? toDate(input.endsOn) : null;
    const data = { employeeId: input.employeeId, projectId: input.projectId, percent: input.percent, startsOn, endsOn };
    // The check and the write of one person and project run one at a time, so two requests cannot both pass the check.
    const saved = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`allocation:${input.employeeId}:${input.projectId}`}))`;
      const overlapping = await tx.projectAllocation.findFirst({
        where: {
          employeeId: input.employeeId,
          projectId: input.projectId,
          ...(input.id ? { id: { not: input.id } } : {}),
          OR: [{ endsOn: null }, { endsOn: { gte: startsOn } }],
          ...(endsOn ? { startsOn: { lte: endsOn } } : {}),
        },
        select: { id: true },
      });
      if (overlapping) return null;
      return existing ? tx.projectAllocation.update({ where: { id: existing.id }, data }) : tx.projectAllocation.create({ data });
    });
    if (!saved) {
      res.status(409).json({ error: 'У человека уже есть доля в этом проекте на часть этого периода' });
      return;
    }
    await recordAuditEvent({ req, action: existing ? 'allocation.update' : 'allocation.create', objectType: 'ProjectAllocation', objectId: saved.id, projectId: saved.projectId, beforeValue: existing ? { percent: existing.percent, startsOn: existing.startsOn, endsOn: existing.endsOn } : undefined, afterValue: { employeeId: saved.employeeId, percent: saved.percent, startsOn: input.startsOn, endsOn: input.endsOn } });
    res.json({ id: saved.id });
  });

  router.delete('/workload/allocations/:id', async (req, res) => {
    const existing = await prisma.projectAllocation.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) {
      res.status(404).json({ error: 'Доля не найдена' });
      return;
    }
    if (!(await editableOpenProject(req, res, existing.projectId))) return;
    await prisma.projectAllocation.delete({ where: { id: existing.id } });
    await recordAuditEvent({ req, action: 'allocation.delete', objectType: 'ProjectAllocation', objectId: existing.id, projectId: existing.projectId, beforeValue: { employeeId: existing.employeeId, percent: existing.percent } });
    res.status(204).end();
  });

  router.patch('/workload/employees/:id/capacity', async (req, res) => {
    if (currentUser(req)?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Ёмкость человека задаёт администратор' });
      return;
    }
    const parsed = capacitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Ёмкость — целое число от 0 до 100 %' });
      return;
    }
    const employee = await prisma.leaveEmployee.findUnique({ where: { id: String(req.params.id) }, select: { id: true, capacityPercent: true } });
    if (!employee) {
      res.status(404).json({ error: 'Человек не найден в справочнике' });
      return;
    }
    await prisma.leaveEmployee.update({ where: { id: employee.id }, data: { capacityPercent: parsed.data.capacityPercent } });
    await recordAuditEvent({ req, action: 'employee.capacity', objectType: 'LeaveEmployee', objectId: employee.id, beforeValue: { capacityPercent: employee.capacityPercent }, afterValue: { capacityPercent: parsed.data.capacityPercent } });
    res.json({ id: employee.id, capacityPercent: parsed.data.capacityPercent });
  });

  return router;
}
