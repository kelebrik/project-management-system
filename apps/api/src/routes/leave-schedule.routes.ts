import { Prisma } from '@prisma/client';
import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { recordAuditEvent } from '../services/audit.js';

type LeaveScheduleContext = {
  currentUser: (req: Request) => any;
  requireAdmin: RequestHandler;
};

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата должна быть в формате ГГГГ-ММ-ДД')
  // Date.parse would roll 2026-02-31 over to 3 March, so the day must survive a round trip.
  .refine((value) => {
    const time = Date.parse(`${value}T00:00:00.000Z`);
    return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
  }, 'Некорректная дата');

const employeeSchema = z.object({
  name: z.string().trim().min(1, 'Укажите имя сотрудника').max(200),
  department: z.string().trim().max(200).default(''),
  userId: z.string().trim().min(1).nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

const typeSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название типа').max(100),
  nameEn: z.string().trim().max(100).default(''),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Цвет должен быть в формате #RRGGBB'),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

const leaveSchema = z
  .object({
    employeeId: z.string().trim().min(1),
    typeId: z.string().trim().min(1),
    startDate: isoDate,
    endDate: isoDate,
    comment: z.string().trim().max(2000).default(''),
  })
  .refine((value) => value.startDate <= value.endDate, {
    message: 'Дата окончания раньше даты начала',
    path: ['endDate'],
  });

const calendarDaySchema = z.object({
  isWorkingDay: z.boolean(),
  description: z.string().trim().max(200).default(''),
});

const bulkDeleteSchema = z.object({ ids: z.array(z.string().trim().min(1)).min(1).max(1000) });

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateText(value: Date) {
  return value.toISOString().slice(0, 10);
}

function leaveResponse(leave: {
  id: string;
  employeeId: string;
  typeId: string;
  startDate: Date;
  endDate: Date;
  comment: string;
}) {
  return {
    id: leave.id,
    employeeId: leave.employeeId,
    typeId: leave.typeId,
    startDate: dateText(leave.startDate),
    endDate: dateText(leave.endDate),
    comment: leave.comment,
  };
}

function param(req: Request, name: string) {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Another leave of the same person that shares at least one day with the range. */
async function overlappingLeave(
  client: Prisma.TransactionClient,
  employeeId: string,
  startDate: string,
  endDate: string,
  excludeId?: string,
) {
  return client.leave.findFirst({
    where: {
      employeeId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startDate: { lte: toDate(endDate) },
      endDate: { gte: toDate(startDate) },
    },
  });
}

async function leaveProblem(
  client: Prisma.TransactionClient,
  input: z.infer<typeof leaveSchema>,
  existing?: { id: string; employeeId: string },
) {
  const [employee, type] = await Promise.all([
    client.leaveEmployee.findUnique({ where: { id: input.employeeId } }),
    client.leaveType.findUnique({ where: { id: input.typeId } }),
  ]);
  if (!employee) return { status: 400, error: 'Сотрудник не найден' };
  // An archived person keeps their history but gets no new leaves.
  if (!employee.isActive && existing?.employeeId !== input.employeeId) {
    return { status: 400, error: 'Сотрудник в архиве' };
  }
  if (!type || !type.isActive) return { status: 400, error: 'Тип отсутствия не найден или отключен' };
  const overlap = await overlappingLeave(client, input.employeeId, input.startDate, input.endDate, existing?.id);
  if (overlap) {
    return {
      status: 409,
      error: `Пересекается с отсутствием ${dateText(overlap.startDate)} – ${dateText(overlap.endDate)}`,
    };
  }
  return null;
}

/** Why a person cannot be linked to this system user, if they cannot. */
async function userLinkProblem(userId: string | null | undefined, employeeId: string | null, currentUserId: string | null) {
  // Keeping an existing link is always fine, even if the user was switched off since.
  if (!userId || userId === currentUserId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
  if (!user) return { status: 400, error: 'Пользователь не найден' };
  if (!user.isActive) return { status: 400, error: 'Пользователь отключён' };
  return linkedElsewhere(userId, employeeId);
}

async function linkedElsewhere(userId: string, employeeId: string | null) {
  const holder = await prisma.leaveEmployee.findFirst({
    where: { userId, ...(employeeId ? { id: { not: employeeId } } : {}) },
    select: { name: true },
  });
  return holder ? { status: 409, error: `Пользователь уже связан с сотрудником ${holder.name}` } : null;
}

/** The same answer as the pre-check when a concurrent request took the user first. */
async function userLinkClashError(userId: string | null | undefined, employeeId: string | null) {
  const problem = userId ? await linkedElsewhere(userId, employeeId) : null;
  return problem?.error ?? 'Пользователь уже связан с другим сотрудником';
}

function isUserLinkClash(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

class LeaveConflict extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Runs the overlap check and the write under a per-person advisory lock, so two
 * requests at once cannot both pass the check and store overlapping leaves.
 */
async function withEmployeeLock<T>(employeeIds: string[], action: (client: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async (client) => {
    for (const employeeId of [...new Set(employeeIds)].sort()) {
      await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`leave:${employeeId}`}))`;
    }
    return action(client);
  });
}

export function createLeaveScheduleRouter({ currentUser, requireAdmin }: LeaveScheduleContext) {
  const router = Router();

  router.get('/leave-schedule', requireAdmin, async (req, res) => {
    const from = isoDate.safeParse(req.query.from);
    const to = isoDate.safeParse(req.query.to);
    if (!from.success || !to.success || from.data > to.data) {
      res.status(400).json({ error: 'Укажите период from и to в формате ГГГГ-ММ-ДД' });
      return;
    }
    const [employees, types, leaves, calendarDays] = await Promise.all([
      prisma.leaveEmployee.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      prisma.leaveType.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      prisma.leave.findMany({
        where: { startDate: { lte: toDate(to.data) }, endDate: { gte: toDate(from.data) } },
        orderBy: [{ startDate: 'asc' }],
      }),
      // All deviations are returned (a few dozen a year): leaves that run past the
      // period and dates typed into the editor are counted with the right holidays.
      prisma.leaveCalendarDay.findMany({ orderBy: { date: 'asc' } }),
    ]);
    res.json({
      employees: employees.map(({ id, name, department, userId, isActive, sortOrder }) => ({
        id,
        name,
        department,
        userId,
        isActive,
        sortOrder,
      })),
      types: types.map(({ id, name, nameEn, color, isActive, sortOrder }) => ({
        id,
        name,
        nameEn,
        color,
        isActive,
        sortOrder,
      })),
      leaves: leaves.map(leaveResponse),
      calendarDays: calendarDays.map((day) => ({
        date: dateText(day.date),
        isWorkingDay: day.isWorkingDay,
        description: day.description,
      })),
    });
  });

  router.post('/leave-schedule/employees', requireAdmin, async (req, res) => {
    const parsed = employeeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const linkProblem = await userLinkProblem(parsed.data.userId, null, null);
    if (linkProblem) {
      res.status(linkProblem.status).json({ error: linkProblem.error });
      return;
    }
    let employee;
    try {
      employee = await prisma.leaveEmployee.create({ data: parsed.data });
    } catch (error) {
      if (!isUserLinkClash(error)) throw error;
      res.status(409).json({ error: await userLinkClashError(parsed.data.userId, null) });
      return;
    }
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'leave_schedule.employee.create',
      objectType: 'LeaveEmployee',
      objectId: employee.id,
      afterValue: employee,
    });
    res.status(201).json(employee);
  });

  router.patch('/leave-schedule/employees/:employeeId', requireAdmin, async (req, res) => {
    const parsed = employeeSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const employeeId = param(req, 'employeeId');
    // Archiving shares the leave lock, so it cannot interleave with a leave being added.
    let outcome;
    try {
      outcome = await withEmployeeLock([employeeId], async (client) => {
        const existing = await client.leaveEmployee.findUnique({ where: { id: employeeId } });
        if (!existing) return null;
        if (parsed.data.userId !== undefined) {
          const linkProblem = await userLinkProblem(parsed.data.userId, employeeId, existing.userId);
          if (linkProblem) throw new LeaveConflict(linkProblem.status, linkProblem.error);
        }
        const employee = await client.leaveEmployee.update({ where: { id: employeeId }, data: parsed.data });
        return { existing, employee };
      });
    } catch (error) {
      if (error instanceof LeaveConflict) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if (!isUserLinkClash(error)) throw error;
      res.status(409).json({ error: await userLinkClashError(parsed.data.userId, employeeId) });
      return;
    }
    if (!outcome) {
      res.status(404).json({ error: 'Сотрудник не найден' });
      return;
    }
    const { existing, employee } = outcome;
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'leave_schedule.employee.update',
      objectType: 'LeaveEmployee',
      objectId: employee.id,
      beforeValue: existing,
      afterValue: employee,
    });
    res.json(employee);
  });

  router.delete('/leave-schedule/employees/:employeeId', requireAdmin, async (req, res) => {
    const employeeId = param(req, 'employeeId');
    // Counting and deleting under the leave lock keeps a leave added at the same
    // moment from being removed by the cascade.
    const outcome = await withEmployeeLock([employeeId], async (client) => {
      const existing = await client.leaveEmployee.findUnique({
        where: { id: employeeId },
        include: { _count: { select: { leaves: true } } },
      });
      if (!existing) return null;
      // A person with recorded leaves is archived, so the history stays intact.
      const archived = existing._count.leaves > 0;
      if (archived) {
        await client.leaveEmployee.update({ where: { id: employeeId }, data: { isActive: false } });
      } else {
        await client.leaveEmployee.delete({ where: { id: employeeId } });
      }
      return { existing, archived };
    });
    if (!outcome) {
      res.status(404).json({ error: 'Сотрудник не найден' });
      return;
    }
    const { existing, archived } = outcome;
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: archived ? 'leave_schedule.employee.archive' : 'leave_schedule.employee.delete',
      objectType: 'LeaveEmployee',
      objectId: employeeId,
      beforeValue: existing,
    });
    res.json({ archived });
  });

  router.post('/leave-schedule/types', requireAdmin, async (req, res) => {
    const parsed = typeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const type = await prisma.leaveType.create({ data: parsed.data });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'leave_schedule.type.create',
      objectType: 'LeaveType',
      objectId: type.id,
      afterValue: type,
    });
    res.status(201).json(type);
  });

  router.patch('/leave-schedule/types/:typeId', requireAdmin, async (req, res) => {
    const parsed = typeSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const typeId = param(req, 'typeId');
    const existing = await prisma.leaveType.findUnique({ where: { id: typeId } });
    if (!existing) {
      res.status(404).json({ error: 'Тип отсутствия не найден' });
      return;
    }
    const type = await prisma.leaveType.update({ where: { id: typeId }, data: parsed.data });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'leave_schedule.type.update',
      objectType: 'LeaveType',
      objectId: type.id,
      beforeValue: existing,
      afterValue: type,
    });
    res.json(type);
  });

  router.post('/leave-schedule/leaves', requireAdmin, async (req, res) => {
    const parsed = leaveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    let leave;
    try {
      leave = await withEmployeeLock([parsed.data.employeeId], async (client) => {
        const problem = await leaveProblem(client, parsed.data);
        if (problem) throw new LeaveConflict(problem.status, problem.error);
        return client.leave.create({
          data: {
            ...parsed.data,
            startDate: toDate(parsed.data.startDate),
            endDate: toDate(parsed.data.endDate),
            createdById: currentUser(req)?.id ?? null,
          },
        });
      });
    } catch (error) {
      if (!(error instanceof LeaveConflict)) throw error;
      res.status(error.status).json({ error: error.message });
      return;
    }
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'leave_schedule.leave.create',
      objectType: 'Leave',
      objectId: leave.id,
      afterValue: leaveResponse(leave),
    });
    res.status(201).json(leaveResponse(leave));
  });

  router.patch('/leave-schedule/leaves/:leaveId', requireAdmin, async (req, res) => {
    const leaveId = param(req, 'leaveId');
    const existing = await prisma.leave.findUnique({ where: { id: leaveId } });
    if (!existing) {
      res.status(404).json({ error: 'Отсутствие не найдено' });
      return;
    }
    const parsed = leaveSchema.safeParse({ ...leaveResponse(existing), ...req.body });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    let leave;
    try {
      leave = await withEmployeeLock([existing.employeeId, parsed.data.employeeId], async (client) => {
        // Re-read under the lock: the leave may have been deleted or moved meanwhile.
        const current = await client.leave.findUnique({ where: { id: leaveId } });
        if (!current) throw new LeaveConflict(404, 'Отсутствие не найдено');
        if (current.employeeId !== existing.employeeId) {
          throw new LeaveConflict(409, 'Отсутствие изменено другим пользователем, обновите страницу');
        }
        const problem = await leaveProblem(client, parsed.data, existing);
        if (problem) throw new LeaveConflict(problem.status, problem.error);
        return client.leave.update({
          where: { id: leaveId },
          data: {
            ...parsed.data,
            startDate: toDate(parsed.data.startDate),
            endDate: toDate(parsed.data.endDate),
          },
        });
      });
    } catch (error) {
      if (!(error instanceof LeaveConflict)) throw error;
      res.status(error.status).json({ error: error.message });
      return;
    }
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'leave_schedule.leave.update',
      objectType: 'Leave',
      objectId: leave.id,
      beforeValue: leaveResponse(existing),
      afterValue: leaveResponse(leave),
    });
    res.json(leaveResponse(leave));
  });

  router.delete('/leave-schedule/leaves/:leaveId', requireAdmin, async (req, res) => {
    const leaveId = param(req, 'leaveId');
    const existing = await prisma.leave.findUnique({ where: { id: leaveId } });
    if (!existing) {
      res.status(404).json({ error: 'Отсутствие не найдено' });
      return;
    }
    await prisma.leave.delete({ where: { id: leaveId } });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'leave_schedule.leave.delete',
      objectType: 'Leave',
      objectId: leaveId,
      beforeValue: leaveResponse(existing),
    });
    res.status(204).end();
  });

  router.post('/leave-schedule/leaves/bulk-delete', requireAdmin, async (req, res) => {
    const parsed = bulkDeleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const result = await prisma.leave.deleteMany({ where: { id: { in: parsed.data.ids } } });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'leave_schedule.leave.bulk_delete',
      objectType: 'Leave',
      metadata: { ids: parsed.data.ids, deleted: result.count },
    });
    res.json({ deleted: result.count });
  });

  router.put('/leave-schedule/calendar-days/:date', requireAdmin, async (req, res) => {
    const date = isoDate.safeParse(param(req, 'date'));
    const parsed = calendarDaySchema.safeParse(req.body);
    if (!date.success || !parsed.success) {
      res.status(400).json({ error: 'Некорректный день календаря' });
      return;
    }
    const day = await prisma.leaveCalendarDay.upsert({
      where: { date: toDate(date.data) },
      create: { date: toDate(date.data), ...parsed.data },
      update: parsed.data,
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'leave_schedule.calendar_day.update',
      objectType: 'LeaveCalendarDay',
      objectId: date.data,
      afterValue: parsed.data,
    });
    res.json({ date: dateText(day.date), isWorkingDay: day.isWorkingDay, description: day.description });
  });

  router.delete('/leave-schedule/calendar-days/:date', requireAdmin, async (req, res) => {
    const date = isoDate.safeParse(param(req, 'date'));
    if (!date.success) {
      res.status(400).json({ error: 'Некорректный день календаря' });
      return;
    }
    await prisma.leaveCalendarDay.deleteMany({ where: { date: toDate(date.data) } });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'leave_schedule.calendar_day.reset',
      objectType: 'LeaveCalendarDay',
      objectId: date.data,
    });
    res.status(204).end();
  });

  return router;
}
