import { normalizePersonName } from '@pms/shared';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { currentUser } from '../server/auth.js';
import { readableProjectWhere } from '../server/business-units.js';
import { recordAuditEvent } from '../services/audit.js';
import { CHECK_IN_CONFIDENCE, MY_WORK_WEEKS_AHEAD, missingCheckIns, selectMyWork, weekStartOf } from '../services/my-work.js';
import { readableProject } from './project-writer.js';

const DAY_MS = 86_400_000;
const WORK_TYPES = ['TASK', 'WORK_PACKAGE', 'DELIVERABLE'] as const;
const checkInSchema = z.object({
  wbsItemId: z.string().trim().min(1),
  confidence: z.enum(CHECK_IN_CONFIDENCE),
  done: z.string().trim().max(1000).default(''),
  blocker: z.string().trim().max(1000).default(''),
});
const isoDay = (value: Date) => value.toISOString().slice(0, 10);

/** The person of the directory linked to the signed-in user, if any. */
async function linkedPerson(userId: string) {
  return prisma.leaveEmployee.findFirst({ where: { userId, isActive: true }, select: { id: true, name: true } });
}

/**
 * "My work" and weekly check-ins. The signed-in user is the person of the
 * people directory linked to them; their work is the unfinished leaf rows of
 * readable open projects whose owner is that person. A check-in is written
 * only on one's own work, once per row and week; a project's page shows the
 * week's check-ins and who has not checked in.
 */
export function createMyWorkRouter() {
  const router = Router();

  router.get('/my-work', async (req, res) => {
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Требуется вход в систему' });
      return;
    }
    const weekStart = weekStartOf(new Date());
    const person = await linkedPerson(user.id);
    if (!person) {
      res.json({ person: null, reason: 'NOT_LINKED', weekStart: isoDay(weekStart), items: [] });
      return;
    }
    const horizon = new Date(weekStart.getTime() + (MY_WORK_WEEKS_AHEAD * 7 + 7) * DAY_MS);
    const candidates = await prisma.wbsItem.findMany({
      where: {
        project: { status: { not: 'CLOSED' }, ...(await readableProjectWhere(req)) },
        type: { in: [...WORK_TYPES] },
        status: { notIn: ['DONE', 'CANCELLED'] },
        owner: { not: '' },
        children: { none: {} },
        OR: [{ startDate: { lte: horizon } }, { dueDate: { lte: horizon } }],
      },
      select: { id: true, projectId: true, code: true, title: true, owner: true, status: true, startDate: true, dueDate: true, project: { select: { code: true, name: true } } },
      take: 5000,
    });
    const items = selectMyWork(candidates, person.name, new Date());
    const checkIns = await prisma.workCheckIn.findMany({
      where: { userId: user.id, weekStart, wbsItemId: { in: items.map((item) => item.id) } },
      select: { wbsItemId: true, confidence: true, done: true, blocker: true, updatedAt: true },
    });
    const byItem = new Map(checkIns.map((row) => [row.wbsItemId, row]));
    res.json({ person: person.name, weekStart: isoDay(weekStart), items: items.map((item) => ({ ...item, checkIn: byItem.get(item.id) ?? null })) });
  });

  router.put('/my-work/check-ins', async (req, res) => {
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Требуется вход в систему' });
      return;
    }
    const body = checkInSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Укажите работу и уверенность: в срок, под вопросом или не успеваю' });
      return;
    }
    const person = await linkedPerson(user.id);
    if (!person) {
      res.status(403).json({ error: 'Ваш аккаунт не связан с сотрудником в графике отпусков' });
      return;
    }
    const item = await prisma.wbsItem.findFirst({
      where: { id: body.data.wbsItemId, project: { status: { not: 'CLOSED' }, ...(await readableProjectWhere(req)) } },
      select: { id: true, projectId: true, owner: true, code: true },
    });
    // Only one's own work: the row's owner is this person however it is written.
    if (!item || normalizePersonName(item.owner) !== normalizePersonName(person.name)) {
      res.status(403).json({ error: 'Отметку можно оставить только на своей работе' });
      return;
    }
    const weekStart = weekStartOf(new Date());
    const saved = await prisma.workCheckIn.upsert({
      where: { wbsItemId_userId_weekStart: { wbsItemId: item.id, userId: user.id, weekStart } },
      create: { projectId: item.projectId, wbsItemId: item.id, userId: user.id, personName: person.name, weekStart, confidence: body.data.confidence, done: body.data.done, blocker: body.data.blocker },
      update: { confidence: body.data.confidence, done: body.data.done, blocker: body.data.blocker, personName: person.name },
    });
    await recordAuditEvent({ req, actor: user, action: 'check_in.save', objectType: 'WbsItem', objectId: item.id, projectId: item.projectId, metadata: { confidence: body.data.confidence, weekStart: isoDay(weekStart) } });
    res.json(saved);
  });

  /** The week's check-ins of a project and the people with open work there who have not checked in. */
  router.get('/projects/:projectId/check-ins', async (req, res) => {
    const project = await readableProject(req, String(req.params.projectId));
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const week = typeof req.query.week === 'string' ? req.query.week : undefined;
    const requested = week === undefined ? new Date() : new Date(`${week}T12:00:00Z`);
    if (week !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(week) || Number.isNaN(requested.getTime()) || requested.toISOString().slice(0, 10) !== week)) {
      res.status(400).json({ error: 'Неделя указывается датой ГГГГ-ММ-ДД' });
      return;
    }
    const weekStart = weekStartOf(requested);
    const weekEnd = new Date(weekStart.getTime() + 6 * DAY_MS);
    const [checkIns, openWork] = await Promise.all([
      prisma.workCheckIn.findMany({
        where: { projectId: project.id, weekStart },
        select: { wbsItemId: true, personName: true, confidence: true, done: true, blocker: true, updatedAt: true, wbsItem: { select: { code: true, title: true } } },
        orderBy: [{ confidence: 'desc' }, { personName: 'asc' }],
      }),
      // Unfinished work started by the week's end, overdue work included: its owners owe a word too.
      prisma.wbsItem.findMany({
        where: {
          projectId: project.id,
          type: { in: [...WORK_TYPES] },
          status: { notIn: ['DONE', 'CANCELLED'] },
          owner: { not: '' },
          children: { none: {} },
          startDate: { lte: weekEnd },
        },
        select: { owner: true },
      }),
    ]);
    res.json({
      weekStart: isoDay(weekStart),
      checkIns,
      notCheckedIn: missingCheckIns(openWork.map((row) => row.owner.trim()), checkIns.map((row) => row.personName)),
    });
  });

  return router;
}
