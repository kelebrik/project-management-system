import { PUBLIC_DEMO_USER_ID } from '@pms/shared';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { currentUser, isPublicDemoMode } from '../server/auth.js';
import { readableProjectWhere } from '../server/business-units.js';
import { userCanWriteProject } from '../server/project-access.js';
import { recordAuditEvent } from '../services/audit.js';
import {
  closeShiftSession,
  operationShiftsNeedingReason,
  pendingShiftSessions,
  projectShiftLadders,
  REASON_SHIFT_LIMIT,
  reviewShiftSessions,
  SHIFT_REASON_CATEGORIES,
  withReasonRows,
} from '../services/schedule-shifts.js';

const uniqueIds = (limit: number) =>
  z
    .array(z.string().trim().min(1))
    .min(1)
    .max(limit)
    .refine((ids) => new Set(ids).size === ids.length, 'Each once');

const reasonFields = {
  category: z.enum(SHIFT_REASON_CATEGORIES),
  text: z.string().trim().max(500).default(''),
  raidItemId: z.string().trim().min(1).nullable().optional(),
};

// The moves are named by their journal rows, or as some checkpoints' moves in one closed editing session.
const reasonSchema = z.union([
  z.object({ shiftIds: uniqueIds(REASON_SHIFT_LIMIT), ...reasonFields }),
  z.object({ sessionId: z.string().trim().min(1), checkpointIds: uniqueIds(500), ...reasonFields }),
]);

const closeSchema = z.object({ mode: z.enum(['leave', 'idle', 'stale']), lastActivityAt: z.string().datetime().optional() });
const reviewSchema = z.object({ sessionIds: uniqueIds(100) });

/** Why checkpoints moved: the journal of milestone and goal dates and the reasons people give. */
export function createScheduleShiftsRouter() {
  const router = Router();

  router.get('/projects/:projectId/schedule-shifts', async (req, res) => {
    const project = await prisma.project.findFirst({
      where: { id: String(req.params.projectId), ...(await readableProjectWhere(req)) },
      select: { id: true },
    });
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    res.json({ checkpoints: await projectShiftLadders(project.id) });
  });

  /** The moves past the baseline an operation just made, so the page can ask why. */
  router.get('/schedule-shifts/operations/:operationId', async (req, res) => {
    const operation = await operationShiftsNeedingReason(String(req.params.operationId));
    const readable = operation.projectId
      ? await prisma.project.findFirst({ where: { id: operation.projectId, ...(await readableProjectWhere(req)) }, select: { id: true } })
      : null;
    if (!readable) {
      res.json({ projectId: null, shifts: [] });
      return;
    }
    res.json(operation);
  });

  /** The project a signed-in reader may see, or an answer saying why not. */
  const readableProject = async (req: Parameters<Parameters<typeof router.get>[1]>[0], res: Parameters<Parameters<typeof router.get>[1]>[1]) => {
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Требуется вход в систему' });
      return null;
    }
    const project = await prisma.project.findFirst({
      where: { id: String(req.params.projectId), ...(await readableProjectWhere(req)) },
      select: { id: true, status: true },
    });
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return null;
    }
    return { user, project };
  };

  /**
   * The person's finished editing sessions of the project whose moves past the
   * baseline still want a reason, with the project's open risks and problems to
   * name, and the person's open session, which a new tab may end as left.
   */
  router.get('/projects/:projectId/schedule-shifts/pending', async (req, res) => {
    const found = await readableProject(req, res);
    if (!found) return;
    const { sessions, ownOpen } = await pendingShiftSessions(found.project.id, found.user.id);
    const risks = sessions.length === 0
      ? []
      : await prisma.raidItem.findMany({
          where: { projectId: found.project.id, type: { in: ['RISK', 'DEPENDENCY'] }, status: { notIn: ['CLOSED', 'VALIDATED'] } },
          select: { id: true, title: true },
          orderBy: { createdAt: 'asc' },
        });
    res.json({ projectId: found.project.id, sessions, risks, ownOpen });
  });

  /** Ends one of the person's editing sessions: they left the editing pages ("leave"), paused ("idle"), or left it in a tab that is gone ("stale"). */
  router.post('/projects/:projectId/schedule-shifts/sessions/:sessionId/close', async (req, res) => {
    const found = await readableProject(req, res);
    if (!found) return;
    const body = closeSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Укажите, почему сессия закончилась' });
      return;
    }
    if (body.data.mode === 'stale' && !body.data.lastActivityAt) {
      res.status(400).json({ error: 'Укажите, какую активность видела страница' });
      return;
    }
    const result = await closeShiftSession(found.project.id, String(req.params.sessionId), found.user.id, body.data.mode, {
      lastActivityAt: body.data.lastActivityAt ? new Date(body.data.lastActivityAt) : undefined,
    });
    if (!result.found) {
      res.status(404).json({ error: 'Сессия правок не найдена' });
      return;
    }
    res.json({ closed: result.closed });
  });

  /** Marks the person's finished sessions looked at, with or without reasons given: they are not asked about again. */
  router.post('/projects/:projectId/schedule-shifts/sessions/review', async (req, res) => {
    const found = await readableProject(req, res);
    if (!found) return;
    const body = reviewSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Укажите сессии правок' });
      return;
    }
    res.json({ reviewed: await reviewShiftSessions(found.project.id, found.user.id, body.data.sessionIds) });
  });

  /**
   * Gives moves of this project a reason: a category, a note and optionally the
   * risk or problem behind it. Needs the right to change the project; a reason
   * can be changed later the same way.
   */
  router.patch('/projects/:projectId/schedule-shifts/reason', async (req, res) => {
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Требуется вход в систему' });
      return;
    }
    const body = reasonSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Укажите сдвиги и категорию причины' });
      return;
    }
    const project = await prisma.project.findUnique({ where: { id: String(req.params.projectId) }, select: { id: true, status: true } });
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
    const raidItemId = body.data.raidItemId ?? null;
    if (raidItemId && !(await prisma.raidItem.findFirst({ where: { id: raidItemId, projectId: project.id }, select: { id: true } }))) {
      res.status(400).json({ error: 'Риск или проблема должны быть из этого проекта' });
      return;
    }
    const target = 'shiftIds' in body.data ? { shiftIds: body.data.shiftIds } : { sessionId: body.data.sessionId, checkpointIds: body.data.checkpointIds };
    const assigned = await withReasonRows(project.id, target, async (db, shiftIds) => {
      await db.scheduleShift.updateMany({
        where: { id: { in: shiftIds }, projectId: project.id },
        data: {
          reasonCategory: body.data.category,
          reasonText: body.data.text || null,
          reasonRaidItemId: raidItemId,
          reasonSetById: demo ? null : user.id,
          reasonSetAt: new Date(),
        },
      });
      return shiftIds.length;
    });
    if (!assigned.ok) {
      res.status(400).json({ error: assigned.error });
      return;
    }
    await recordAuditEvent({
      req,
      actor: user,
      action: 'schedule_shift.reason',
      objectType: 'Project',
      objectId: project.id,
      projectId: project.id,
      metadata: { shifts: assigned.value, category: body.data.category, raidItemId, ...('sessionId' in body.data ? { sessionId: body.data.sessionId } : {}) },
    });
    res.json({ updated: assigned.value });
  });

  return router;
}
