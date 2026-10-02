import type { ProjectCalendarCode } from '@prisma/client';
import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { currentUser } from '../../server/auth.js';
import { recordAuditEvent } from '../../services/audit.js';
import { planAppend, type AppendPlan, type AppendProblem } from '../../services/wbs-append.js';
import { recordWbsCommand } from '../../services/wbs-audit.js';
import { buildCalendarOverrides, isWorkingDay } from '../../services/wbs-schedule/calendar.js';
import { recalculateProjectWbsSchedule } from '../../services/wbs-schedule.js';
import { getProjectWbsSnapshot, recalculateProjectWbsHierarchyStatuses } from '../../services/wbs.js';
import { emitWebhookEvent } from '../../services/webhooks.js';

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

const appendSchema = z.object({
  parentId: z.string().min(1).max(64).nullable(),
  title: z.string().trim().min(1).max(500),
  owner: z.string().trim().max(200).default(''),
  startDate: isoDay,
  dueDate: isoDay,
  type: z.enum(['TASK', 'WORK_PACKAGE', 'DELIVERABLE']).default('TASK'),
});

const PROBLEM_TEXT: Record<AppendProblem | 'ISSUE_MANAGED' | 'NO_WORKING_DAY', string> = {
  PARENT_NOT_FOUND: 'Родитель не найден в этом проекте',
  PARENT_NOT_A_GROUP: 'Работу можно добавить только в фазу или пакет работ',
  NOT_CANONICAL: 'Коды Структуры не соответствуют ее порядку: перенумеруйте Структуру и повторите',
  ISSUE_MANAGED: 'Этим пакетом работ управляет открытый вопрос; добавьте работу в другой пакет',
  NO_WORKING_DAY: 'В выбранных датах нет рабочего дня по календарю проекта',
};

class AppendRefused extends Error {
  constructor(readonly status: number, readonly reason: keyof typeof PROBLEM_TEXT) {
    super(PROBLEM_TEXT[reason]);
  }
}

const DAY_MS = 86_400_000;
const dayDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

/**
 * The dates moved onto working days of the work's calendar, as the schedule
 * counts them: the start forward, the finish back, never before the start.
 */
export function snapToCalendar(startDate: string, dueDate: string, calendarCode: ProjectCalendarCode, overrides: Map<string, boolean>) {
  let start = dayDate(startDate);
  for (let guard = 0; !isWorkingDay(start, calendarCode, overrides) && guard < 3660; guard += 1) start = new Date(start.getTime() + DAY_MS);
  let due = dayDate(dueDate);
  for (let guard = 0; !isWorkingDay(due, calendarCode, overrides) && due > start && guard < 3660; guard += 1) due = new Date(due.getTime() - DAY_MS);
  if (due < start || !isWorkingDay(due, calendarCode, overrides)) return null;
  return { start, due };
}

/**
 * Adds a piece of work to a project's Structure from the Workload page: under a
 * phase or work package (or at the top level), after its last row, with a
 * title, an owner and dates. Registered on the Structure router, so the write
 * queue holds other edits of the project until the schedule is recalculated
 * and the shift journal records the operation. The placement is checked and
 * written under the project's lock in one transaction; no other row changes
 * its code.
 */
export function registerWbsAppendRoutes(router: Router) {
  router.post('/projects/:projectId/wbs-items/append', async (req, res) => {
    const body = appendSchema.safeParse(req.body ?? {});
    if (!body.success || body.data.startDate > body.data.dueDate) {
      res.status(400).json({ error: 'Некорректная работа: название, даты (начало не позже окончания) и тип' });
      return;
    }
    const projectId = String(req.params.projectId);
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const input = body.data;
    try {
      const created = await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wbs:${project.id}`}))`;
          const rows = await tx.wbsItem.findMany({
            where: { projectId: project.id },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true, code: true, parentId: true, wbsLevel: true, type: true, calendarCode: true, sortOrder: true },
          });
          const plan = planAppend(rows, input.parentId);
          if ('problem' in plan) throw new AppendRefused(plan.problem === 'PARENT_NOT_FOUND' ? 404 : 409, plan.problem);
          if (input.parentId) {
            const managing = await tx.issue.findFirst({
              where: { projectId: project.id, workPackageId: input.parentId, status: { notIn: ['Done', 'Closed', 'Resolved'] } },
              select: { id: true },
            });
            if (managing) throw new AppendRefused(409, 'ISSUE_MANAGED');
          }
          const calendarCode = plan.calendarCode as ProjectCalendarCode;
          const overrides = buildCalendarOverrides(
            await tx.projectCalendarOverride.findMany({ where: { projectId: project.id }, select: { calendarCode: true, date: true, isWorkingDay: true } }),
          );
          const dates = snapToCalendar(input.startDate, input.dueDate, calendarCode, overrides);
          if (!dates) throw new AppendRefused(400, 'NO_WORKING_DAY');
          const sortOrder = await sortPositionAt(tx, rows, plan);
          return tx.wbsItem.create({
            data: {
              projectId: project.id,
              parentId: plan.parentId,
              code: plan.code,
              title: input.title,
              type: input.type,
              status: 'NOT_STARTED',
              owner: input.owner,
              startDate: dates.start,
              dueDate: dates.due,
              baselineStartDate: dates.start,
              baselineDueDate: dates.due,
              forecastStartDate: dates.start,
              forecastDueDate: dates.due,
              excelStartDate: dates.start,
              excelEndDate: dates.due,
              wbsLevel: plan.level,
              calendarCode,
              sortOrder,
            },
          });
        },
        { timeout: 30_000 },
      );
      await recordWbsCommand({ projectId: project.id, userId: currentUser(req)?.id, type: 'CREATE', payload: { itemId: created.id, item: created, source: 'workload' } });
      await recalculateProjectWbsSchedule(project.id);
      await recalculateProjectWbsHierarchyStatuses(project.id);
      const snapshot = await getProjectWbsSnapshot(project.id);
      const item = snapshot.wbsItems.find((row) => row.id === created.id) ?? created;
      await recordAuditEvent({ req, actor: currentUser(req), action: 'wbs_item.create', objectType: 'WbsItem', objectId: created.id, projectId: project.id, afterValue: item, metadata: { source: 'workload' } });
      await emitWebhookEvent({ eventType: 'wbs.item.created', projectId: project.id, payload: { item, snapshot } }).catch(() => undefined);
      res.status(201).json({ item, ...snapshot });
    } catch (error) {
      if (error instanceof AppendRefused) {
        res.status(error.status).json({ error: error.message, reason: error.reason });
        return;
      }
      throw error;
    }
  });
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * The sort position of the new row. It takes a free number between its
 * neighbours when there is one, so no other row is written (their versions
 * stay, and nobody editing them meets a conflict). Otherwise only the rows
 * after it that are in the way move along, each by as little as needed; rows
 * before it never change.
 */
export async function sortPositionAt(tx: Tx, rows: Array<{ id: string; sortOrder: number }>, plan: AppendPlan) {
  const before = rows[plan.insertIndex - 1];
  const after = rows[plan.insertIndex];
  if (!after) return (before?.sortOrder ?? 0) + 10;
  const low = before ? before.sortOrder : after.sortOrder - 20;
  if (after.sortOrder - low >= 2) return Math.floor((low + after.sortOrder) / 2);
  const position = low + 1;
  let previous = position;
  for (const row of rows.slice(plan.insertIndex)) {
    if (row.sortOrder > previous) break;
    previous += 1;
    await tx.wbsItem.update({ where: { id: row.id }, data: { sortOrder: previous } });
  }
  return position;
}
