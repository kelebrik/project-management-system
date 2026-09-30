import { PUBLIC_DEMO_USER_ID } from '@pms/shared';
import { Prisma } from '@prisma/client';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { currentApiToken, currentUser, isPublicDemoMode } from '../server/auth.js';
import { userCanWriteProject } from '../server/project-access.js';
import { normalizeWbsDraft, type WbsDraftItem } from '../services/ai/wbs-draft.js';
import { getProjectWbsSnapshot, recalculateProjectWbsHierarchyStatuses } from '../services/wbs.js';
import { recalculateProjectWbsSchedule } from '../services/wbs-schedule.js';
import { runWithWbsWriteQueue } from './wbs/write-queue.js';
import { shiftActor, trackScheduleShifts } from '../services/schedule-shifts.js';

const applySchema = z.object({
  items: z.array(z.unknown()).min(1).max(500),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value)
    .optional(),
  draftKey: z.string().trim().regex(/^[A-Za-z0-9_-]{8,64}$/),
});

const PREDECESSOR_FIELDS = ['predecessor1', 'predecessor2', 'predecessor3', 'predecessor4', 'predecessor5', 'predecessor6'] as const;

/** A draft ref ("2.1") placed after the rows the project already has ("7.1" when the last top row is 5). */
export function draftCode(ref: string, topOffset: number) {
  const [top, ...rest] = ref.split('.');
  return [String(Number(top) + topOffset), ...rest].join('.');
}

/**
 * Adds a reviewed draft structure to a project. The model is not called: the
 * page sends back the draft it showed, which is checked again the same way.
 * All rows and links are written in one transaction under the project's lock,
 * after the existing rows and numbered after the last top row, so nothing is
 * renumbered. The schedule is recalculated in the same write queue. Sending a
 * draft key again (a second click, or a retry after a failed recalculation)
 * adds nothing and returns the rows that key created, recalculated again.
 */
export function createWbsDraftRouter() {
  const router = Router();

  router.post('/projects/:projectId/wbs-draft/apply', async (req: Request, res) => {
    const user = currentUser(req);
    if (!user || currentApiToken(req)) {
      res.status(403).json({ error: 'Черновик добавляется только из сессии пользователя' });
      return;
    }
    const body = applySchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Некорректный черновик Структуры' });
      return;
    }
    const projectId = String(req.params.projectId);
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, status: true } });
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    if (project.status === 'CLOSED') {
      res.status(423).json({ error: 'Проект закрыт и доступен только для чтения' });
      return;
    }
    const demo = isPublicDemoMode() && user.id === PUBLIC_DEMO_USER_ID;
    if (!demo && user.role !== 'ADMIN' && !(await userCanWriteProject(user.id, project.id))) {
      res.status(403).json({ error: 'Нет доступа на изменение этого проекта' });
      return;
    }
    const { items } = normalizeWbsDraft({ items: body.data.items });
    if (items.length === 0) {
      res.status(400).json({ error: 'В черновике нет строк, которые можно добавить' });
      return;
    }
    const startDate = new Date(`${body.data.startDate ?? new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const draftKey = body.data.draftKey;

    const { createdIds, replayed, snapshot } = await runWithWbsWriteQueue(project.id, () =>
      trackScheduleShifts(project.id, { trigger: 'DRAFT', actor: shiftActor(demo ? null : user) }, async () => {
      const written = await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wbs:${project.id}`}))`;
          const applied = await tx.auditEvent.findFirst({
            where: { projectId: project.id, action: 'wbs_draft.apply', metadata: { path: ['draftKey'], equals: draftKey } },
            select: { metadata: true },
          });
          if (applied) {
            const ids = (applied.metadata as { createdIds?: unknown } | null)?.createdIds;
            return { createdIds: Array.isArray(ids) ? ids.map(String) : [], replayed: true };
          }
          const existing = await tx.wbsItem.findMany({ where: { projectId: project.id }, select: { code: true, sortOrder: true } });
          const topOffset = Math.max(0, ...existing.map((row) => Number(row.code.split('.')[0])).filter(Number.isFinite));
          let sortOrder = Math.max(0, ...existing.map((row) => row.sortOrder));
          const idByRef = new Map<string, string>();
          const codeOf = (ref: string) => draftCode(ref, topOffset);
          const parents = new Set(items.map((item) => item.ref.split('.').slice(0, -1).join('.')).filter(Boolean));
          for (const item of items as WbsDraftItem[]) {
            sortOrder += 10;
            const parentRef = item.ref.split('.').slice(0, -1).join('.');
            // A phase or package with rows under it takes its dates from them; an empty one is sized like a task.
            const aggregate = parents.has(item.ref);
            const created = await tx.wbsItem.create({
              data: {
                projectId: project.id,
                parentId: parentRef ? idByRef.get(parentRef) ?? null : null,
                code: codeOf(item.ref),
                title: item.title,
                type: item.type,
                status: 'NOT_STARTED',
                owner: item.owner,
                startDate,
                forecastStartDate: startDate,
                // The schedule fills the finish from the duration and the links.
                workDays: item.type === 'MILESTONE' ? 0 : aggregate ? null : Math.max(1, item.workDays),
                wbsLevel: item.ref.split('.').length,
                sortOrder,
                ...Object.fromEntries(PREDECESSOR_FIELDS.map((field, index) => [field, item.predecessors[index] ? codeOf(item.predecessors[index]) : null])),
              },
              select: { id: true },
            });
            idByRef.set(item.ref, created.id);
          }
          for (const item of items) {
            for (const predecessor of item.predecessors) {
              await tx.wbsDependency.create({
                data: { projectId: project.id, predecessorId: idByRef.get(predecessor)!, successorId: idByRef.get(item.ref)!, type: 'FS', lagDays: 0 },
              });
            }
          }
          const ids = [...idByRef.values()];
          // Written inside the transaction, so a second click waiting on the lock sees it. Ids only, no text.
          await tx.auditEvent.create({
            data: {
              actorId: demo ? null : user.id,
              actorEmail: user.email ?? null,
              actorName: user.name ?? null,
              action: 'wbs_draft.apply',
              objectType: 'Project',
              objectId: project.id,
              projectId: project.id,
              ipAddress: req.ip ?? null,
              userAgent: req.get('user-agent') ?? null,
              metadata: {
                draftKey,
                rows: items.length,
                links: items.reduce((sum, item) => sum + item.predecessors.length, 0),
                createdIds: ids,
              } as Prisma.InputJsonValue,
            },
          });
          return { createdIds: ids, replayed: false };
        },
        { timeout: 30_000 },
      );
      await recalculateProjectWbsSchedule(project.id);
      await recalculateProjectWbsHierarchyStatuses(project.id);
      return { ...written, snapshot: await getProjectWbsSnapshot(project.id) };
    }),
    );
    res.status(replayed ? 200 : 201).json({ createdIds, replayed, ...snapshot });
  });

  return router;
}
