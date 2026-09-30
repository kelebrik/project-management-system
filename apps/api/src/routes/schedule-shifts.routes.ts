import { PUBLIC_DEMO_USER_ID } from '@pms/shared';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { currentUser, isPublicDemoMode } from '../server/auth.js';
import { readableProjectWhere } from '../server/business-units.js';
import { userCanWriteProject } from '../server/project-access.js';
import { recordAuditEvent } from '../services/audit.js';
import { operationShiftsNeedingReason, projectShiftLadders, SHIFT_REASON_CATEGORIES } from '../services/schedule-shifts.js';

const reasonSchema = z.object({
  shiftIds: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, 'Each move once'),
  category: z.enum(SHIFT_REASON_CATEGORIES),
  text: z.string().trim().max(500).default(''),
  raidItemId: z.string().trim().min(1).nullable().optional(),
});

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
    const shiftIds = body.data.shiftIds;
    const found = await prisma.scheduleShift.count({ where: { id: { in: shiftIds }, projectId: project.id, kind: 'SHIFT' } });
    if (found !== shiftIds.length) {
      res.status(400).json({ error: 'Сдвиги не относятся к этому проекту' });
      return;
    }
    const raidItemId = body.data.raidItemId ?? null;
    if (raidItemId && !(await prisma.raidItem.findFirst({ where: { id: raidItemId, projectId: project.id }, select: { id: true } }))) {
      res.status(400).json({ error: 'Риск или проблема должны быть из этого проекта' });
      return;
    }
    await prisma.scheduleShift.updateMany({
      where: { id: { in: shiftIds }, projectId: project.id },
      data: {
        reasonCategory: body.data.category,
        reasonText: body.data.text || null,
        reasonRaidItemId: raidItemId,
        reasonSetById: demo ? null : user.id,
        reasonSetAt: new Date(),
      },
    });
    await recordAuditEvent({
      req,
      actor: user,
      action: 'schedule_shift.reason',
      objectType: 'Project',
      objectId: project.id,
      projectId: project.id,
      metadata: { shifts: shiftIds.length, category: body.data.category, raidItemId },
    });
    res.json({ updated: shiftIds.length });
  });

  return router;
}
