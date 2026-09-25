import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { readableProjectWhere } from '../server/business-units.js';

type WorkloadContext = {
  requireAuth: RequestHandler;
};

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const time = Date.parse(`${value}T00:00:00.000Z`);
    return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
  });

/** Work that someone does: leaf items of these types. Phases, goals and milestones are not work. */
const WORK_TYPES = ['TASK', 'WORK_PACKAGE', 'DELIVERABLE'] as const;
/** The client keeps at most five years loaded; six leave room for rounding to whole weeks. */
const MAX_RANGE_MONTHS = 72;

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateText(value: Date) {
  return value.toISOString().slice(0, 10);
}

/** The last allowed day: the same date six years on, or the month's last day (29 February). */
function rangeLimit(from: string) {
  const start = toDate(from);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + MAX_RANGE_MONTHS;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay)));
}

function period(req: Request) {
  const from = isoDate.safeParse(req.query.from);
  const to = isoDate.safeParse(req.query.to);
  if (!from.success || !to.success || from.data > to.data || toDate(to.data) > rangeLimit(from.data)) return null;
  return { from: from.data, to: to.data };
}

export function createWorkloadRouter({ requireAuth }: WorkloadContext) {
  const router = Router();

  /** The people directory kept on the leave schedule, for pickers in other modules. */
  router.get('/employees', requireAuth, async (_req, res) => {
    const employees = await prisma.leaveEmployee.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }],
      select: { id: true, name: true, department: true },
    });
    res.json(employees);
  });

  router.get('/workload', requireAuth, async (req, res) => {
    const range = period(req);
    if (!range) {
      res.status(400).json({ error: 'Укажите период from и to в формате ГГГГ-ММ-ДД, не длиннее шести лет' });
      return;
    }
    const projectScope = { status: { not: 'CLOSED' as const }, ...(await readableProjectWhere(req)) };
    const [items, employees, leaves, calendarDays] = await Promise.all([
      prisma.wbsItem.findMany({
        where: {
          project: projectScope,
          type: { in: [...WORK_TYPES] },
          status: { not: 'CANCELLED' },
          owner: { not: '' },
          // Leaf work only: a package with its own tasks is covered by them.
          children: { none: {} },
          startDate: { not: null, lte: toDate(range.to) },
          dueDate: { not: null, gte: toDate(range.from) },
        },
        select: {
          id: true,
          projectId: true,
          code: true,
          title: true,
          owner: true,
          type: true,
          status: true,
          startDate: true,
          dueDate: true,
          project: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ startDate: 'asc' }],
      }),
      prisma.leaveEmployee.findMany({
        where: { isActive: true },
        select: { id: true, name: true, department: true },
      }),
      prisma.leave.findMany({
        where: { startDate: { lte: toDate(range.to) }, endDate: { gte: toDate(range.from) } },
        select: { id: true, employeeId: true, typeId: true, startDate: true, endDate: true },
      }),
      prisma.leaveCalendarDay.findMany({ orderBy: { date: 'asc' } }),
    ]);
    const projects = new Map<string, { id: string; code: string; name: string }>();
    const work = items
      // A blank owner names nobody.
      .filter((item) => item.owner.trim() && item.startDate && item.dueDate && item.startDate <= item.dueDate)
      .map((item) => {
        projects.set(item.project.id, item.project);
        return {
          id: item.id,
          projectId: item.projectId,
          code: item.code,
          title: item.title,
          owner: item.owner.trim(),
          type: item.type,
          status: item.status,
          startDate: dateText(item.startDate!),
          dueDate: dateText(item.dueDate!),
        };
      });
    res.json({
      projects: [...projects.values()].sort((left, right) => left.code.localeCompare(right.code, 'ru')),
      items: work,
      employees,
      leaves: leaves.map((leave) => ({
        ...leave,
        startDate: dateText(leave.startDate),
        endDate: dateText(leave.endDate),
      })),
      calendarDays: calendarDays.map((day) => ({
        date: dateText(day.date),
        isWorkingDay: day.isWorkingDay,
        description: day.description,
      })),
    });
  });

  return router;
}
