import { PUBLIC_DEMO_USER_ID } from '@pms/shared';
import type { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { currentUser, requireAdmin } from '../server/auth.js';

/**
 * «Сообщить о проблеме»: what someone writes goes to the administrators. A
 * report is an audit event (action problem_report.create), so it needs no table
 * of its own; its id is the event id. Marking it done or open again adds
 * problem_report.resolve / problem_report.reopen events with the report id as
 * objectId, and the latest of them is its status.
 */
export const REPORTS_PER_HOUR = 5;
const LIST_LIMIT = 200;
const CREATE = 'problem_report.create';
const STATUS_ACTIONS = ['problem_report.resolve', 'problem_report.reopen'] as const;

const reportSchema = z.object({
  message: z.string().trim().min(10).max(4000),
  // Only the path: no query or hash, which may carry tokens or search text.
  page: z
    .string()
    .trim()
    .max(300)
    .regex(/^\/[^?#\s]*$/)
    .optional(),
  context: z
    .object({
      viewport: z.string().regex(/^\d{2,5}x\d{2,5}$/).optional(),
      locale: z.enum(['ru', 'en']).optional(),
    })
    .strict()
    .optional(),
});

const statusSchema = z.object({ status: z.enum(['OPEN', 'DONE']) });

type ReportStatus = 'OPEN' | 'DONE';

async function latestStatuses(reportIds: string[]) {
  const events = await prisma.auditEvent.findMany({
    where: { objectType: 'ProblemReport', objectId: { in: reportIds }, action: { in: [...STATUS_ACTIONS] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { objectId: true, action: true, createdAt: true, actorName: true },
  });
  const latest = new Map<string, { status: ReportStatus; at: Date; by: string | null }>();
  for (const event of events) {
    if (!event.objectId || latest.has(event.objectId)) continue;
    latest.set(event.objectId, { status: event.action === 'problem_report.resolve' ? 'DONE' : 'OPEN', at: event.createdAt, by: event.actorName });
  }
  return latest;
}

async function openCount() {
  const reports = await prisma.auditEvent.findMany({ where: { action: CREATE }, select: { id: true } });
  if (reports.length === 0) return 0;
  const statuses = await latestStatuses(reports.map((report) => report.id));
  return reports.filter((report) => statuses.get(report.id)?.status !== 'DONE').length;
}

/**
 * Reports name people and their browsers: only a real administrator reads them.
 * The shared requireAdmin lets the public demo identity read admin pages, so
 * it is refused here on top of that.
 */
function realAdminOnly(req: Request, res: Response, next: NextFunction) {
  const user = currentUser(req);
  if (!user || user.id === PUBLIC_DEMO_USER_ID || user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Обращения видят только администраторы' });
    return;
  }
  next();
}

export function registerProblemReportRoutes(router: Router) {
  router.post('/problem-reports', async (req: Request, res: Response) => {
    const user = currentUser(req);
    // The public demo identity is not a person who can be answered.
    if (!user || user.id === PUBLIC_DEMO_USER_ID) {
      res.status(403).json({ error: 'Сообщить о проблеме может только вошедший пользователь' });
      return;
    }
    const parsed = reportSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Опишите проблему: от 10 до 4000 символов' });
      return;
    }
    // Counted in the database under a per-person lock, so the limit holds across
    // instances and against requests sent at the same moment.
    const report = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`problem-report:${user.id}`}))`;
      const lastHour = await tx.auditEvent.count({
        where: { action: CREATE, actorId: user.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
      });
      if (lastHour >= REPORTS_PER_HOUR) return null;
      return tx.auditEvent.create({
        data: {
          actorId: user.id,
          actorEmail: user.email,
          actorName: user.name,
          action: CREATE,
          objectType: 'ProblemReport',
          ipAddress: req.ip ?? null,
          userAgent: req.get('user-agent')?.slice(0, 500) ?? null,
          afterValue: { message: parsed.data.message, page: parsed.data.page ?? null, context: parsed.data.context ?? {} },
        },
        select: { id: true, createdAt: true },
      });
    });
    if (!report) {
      res.status(429).json({ error: 'Слишком много обращений за час; попробуйте позже' });
      return;
    }
    res.status(201).json(report);
  });

  router.get('/problem-reports', requireAdmin, realAdminOnly, async (req: Request, res: Response) => {
    const onlyOpen = req.query.status !== 'all';
    const created = await prisma.auditEvent.findMany({
      where: { action: CREATE },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: LIST_LIMIT,
      select: { id: true, createdAt: true, actorName: true, actorEmail: true, userAgent: true, afterValue: true },
    });
    const statuses = await latestStatuses(created.map((report) => report.id));
    const items = created
      .map((report) => {
        const value = (report.afterValue ?? {}) as { message?: string; page?: string | null; context?: Record<string, string> };
        const status = statuses.get(report.id);
        return {
          id: report.id,
          createdAt: report.createdAt,
          author: report.actorName ?? report.actorEmail ?? '',
          email: report.actorEmail,
          message: value.message ?? '',
          page: value.page ?? null,
          context: value.context ?? {},
          userAgent: report.userAgent,
          status: status?.status ?? 'OPEN',
          statusChangedAt: status?.at ?? null,
          statusChangedBy: status?.by ?? null,
        };
      })
      .filter((report) => !onlyOpen || report.status === 'OPEN');
    res.json({ items, openCount: await openCount() });
  });

  router.patch('/problem-reports/:id', requireAdmin, realAdminOnly, async (req: Request, res: Response) => {
    const parsed = statusSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Статус: OPEN или DONE' });
      return;
    }
    const report = await prisma.auditEvent.findFirst({ where: { id: String(req.params.id), action: CREATE }, select: { id: true } });
    if (!report) {
      res.status(404).json({ error: 'Обращение не найдено' });
      return;
    }
    const user = currentUser(req);
    await prisma.auditEvent.create({
      data: {
        actorId: user?.id ?? null,
        actorEmail: user?.email ?? null,
        actorName: user?.name ?? null,
        action: parsed.data.status === 'DONE' ? 'problem_report.resolve' : 'problem_report.reopen',
        objectType: 'ProblemReport',
        objectId: report.id,
      },
    });
    res.json({ id: report.id, status: parsed.data.status, openCount: await openCount() });
  });
}
