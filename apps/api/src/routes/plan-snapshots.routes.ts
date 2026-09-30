import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { currentUser } from '../server/auth.js';
import { recordAuditEvent } from '../services/audit.js';
import { comparePlans, PLAN_SNAPSHOT_LIMITS, snapshotRows, type SnapshotRow } from '../services/plan-snapshots.js';
import { projectWriter, readableProject } from './project-writer.js';

const createSchema = z.object({ name: z.string().trim().min(2).max(PLAN_SNAPSHOT_LIMITS.name) });
const CURRENT = 'current';

class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const rowSelect = {
  id: true, parentId: true, code: true, title: true, type: true, status: true, owner: true,
  startDate: true, dueDate: true, baselineDueDate: true, progress: true,
} as const;

/**
 * Named copies of a project's plan for committees, and their comparison with
 * each other or with the plan today. A snapshot never changes and never touches
 * the baseline or the current plan. Reading and comparing need read access,
 * taking one the right to change the project; only an administrator deletes.
 */
export function createPlanSnapshotsRouter() {
  const router = Router();

  router.get('/projects/:projectId/plan-snapshots', async (req, res) => {
    const project = await readableProject(req, String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    res.json(
      await prisma.planSnapshot.findMany({
        where: { projectId: project.id },
        select: { id: true, name: true, takenAt: true, createdByName: true, rowCount: true },
        orderBy: { takenAt: 'desc' },
      }),
    );
  });

  router.post('/projects/:projectId/plan-snapshots', async (req, res) => {
    const context = await projectWriter(req, res, String(req.params.projectId));
    if (!context) return;
    const body = createSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: `Назовите срез: от 2 до ${PLAN_SNAPSHOT_LIMITS.name} символов` });
      return;
    }
    try {
      const snapshot = await prisma.$transaction(async (tx) => {
        // One project's snapshots are counted and taken one at a time, so the limit holds.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plan-snapshot:${context.project.id}`}))`;
        if ((await tx.planSnapshot.count({ where: { projectId: context.project.id } })) >= PLAN_SNAPSHOT_LIMITS.perProject) {
          throw new Refusal(409, `У проекта уже ${PLAN_SNAPSHOT_LIMITS.perProject} срезов: удалить старые может администратор`);
        }
        const items = await tx.wbsItem.findMany({ where: { projectId: context.project.id }, select: rowSelect, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
        if (items.length > PLAN_SNAPSHOT_LIMITS.rows) throw new Refusal(413, `В Структуре больше ${PLAN_SNAPSHOT_LIMITS.rows} строк`);
        const rows = snapshotRows(items);
        if (Buffer.byteLength(JSON.stringify(rows)) > PLAN_SNAPSHOT_LIMITS.bytes) throw new Refusal(413, 'Структура слишком велика для среза');
        return tx.planSnapshot.create({
          data: {
            projectId: context.project.id,
            name: body.data.name,
            createdById: context.demo ? null : context.user.id,
            createdByName: context.user.name ?? context.user.email ?? null,
            rowCount: rows.length,
            rows: rows as unknown as Prisma.InputJsonValue,
          },
          select: { id: true, name: true, takenAt: true, createdByName: true, rowCount: true },
        });
      });
      await recordAuditEvent({ req, actor: context.user, action: 'plan_snapshot.create', objectType: 'Project', objectId: context.project.id, projectId: context.project.id, metadata: { snapshotId: snapshot.id, rows: snapshot.rowCount } });
      res.status(201).json(snapshot);
    } catch (error) {
      if (error instanceof Refusal) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  });

  /** from and to are snapshot ids of this project or "current" for the plan today. */
  router.get('/projects/:projectId/plan-snapshots/compare', async (req, res) => {
    const project = await readableProject(req, String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const load = async (key: unknown): Promise<SnapshotRow[] | null> => {
      if (key === CURRENT) return snapshotRows(await prisma.wbsItem.findMany({ where: { projectId: project.id }, select: rowSelect }));
      if (typeof key !== 'string' || !key) return null;
      const snapshot = await prisma.planSnapshot.findFirst({ where: { id: key, projectId: project.id }, select: { rows: true } });
      return snapshot ? (snapshot.rows as unknown as SnapshotRow[]) : null;
    };
    const [before, after] = await Promise.all([load(req.query.from), load(req.query.to ?? CURRENT)]);
    if (!before || !after) {
      res.status(400).json({ error: 'Выберите срезы этого проекта для сравнения' });
      return;
    }
    res.json(comparePlans(before, after));
  });

  router.delete('/plan-snapshots/:snapshotId', async (req, res) => {
    const user = currentUser(req);
    if (!user || user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Удалить срез может только администратор' });
      return;
    }
    const snapshot = await prisma.planSnapshot.findUnique({ where: { id: String(req.params.snapshotId) }, select: { id: true, projectId: true, name: true } });
    if (!snapshot) {
      res.status(404).json({ error: 'Срез не найден' });
      return;
    }
    await prisma.planSnapshot.delete({ where: { id: snapshot.id } });
    await recordAuditEvent({ req, actor: user, action: 'plan_snapshot.delete', objectType: 'Project', objectId: snapshot.projectId, projectId: snapshot.projectId, metadata: { snapshotId: snapshot.id, name: snapshot.name } });
    res.status(204).send();
  });

  return router;
}
