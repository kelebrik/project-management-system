import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

const DAY_MS = 86_400_000;
const CHECKPOINT_TYPES = ['MILESTONE', 'GOAL'] as const;
const WORK_TYPES = ['TASK', 'DELIVERABLE', 'WORK_PACKAGE'] as const;
const CLOSED_WORK = ['DONE', 'CANCELLED'] as const;
const RED_RISK_SCORE = 15;
// Waiting for an answer: sent to an approver, not yet answered.
const OPEN_DECISION = ['PENDING_APPROVAL'] as const;
const LIST_LIMIT = 500;

export type PortfolioReportOptions = { now?: Date; horizonDays: number; periodDays: number };

const isoDay = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);
const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY_MS);
const startOfDay = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

/**
 * Reports across the open projects a person may read, in one answer: a line
 * per project, the milestone shifts of a period, the checkpoints due within a
 * horizon, open red risks and decisions waiting for an answer. What the words
 * mean here:
 * - starting target: the target date when the project was created
 *   (initialTargetDate), against today's target;
 * - next checkpoint: the earliest milestone or goal not done whose forecast
 *   (or due date) is today or later;
 * - overdue work: tasks, deliverables and work packages without children,
 *   not done or cancelled, due before today;
 * - red risk: an open risk scored 15 or more;
 * - last shift: the latest milestone shift of the journal, with its reason.
 */
export async function loadPortfolioReport(projectWhere: Prisma.ProjectWhereInput, options: PortfolioReportOptions) {
  const today = startOfDay(options.now ?? new Date());
  const horizonEnd = new Date(today.getTime() + options.horizonDays * DAY_MS);
  const periodStart = new Date(today.getTime() - options.periodDays * DAY_MS);

  const projects = await prisma.project.findMany({
    where: { ...projectWhere, status: { not: 'CLOSED' } },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: {
      id: true, code: true, name: true, portfolio: true, projectManager: true, status: true, rag: true,
      initialTargetDate: true, targetDate: true, businessUnit: { select: { id: true, name: true } },
    },
  });
  const ids = projects.map((project) => project.id);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const ref = (projectId: string) => {
    const project = projectById.get(projectId)!;
    return { projectId, projectCode: project.code, projectName: project.name };
  };
  if (ids.length === 0) return { generatedAt: today.toISOString(), summary: [], shifts: [], upcoming: [], risks: [], decisions: [] };

  const [checkpoints, overdue, redRisks, shifts, decisions] = await Promise.all([
    prisma.wbsItem.findMany({
      where: { projectId: { in: ids }, type: { in: [...CHECKPOINT_TYPES] }, status: { notIn: [...CLOSED_WORK] } },
      select: { id: true, projectId: true, code: true, title: true, type: true, dueDate: true, forecastDueDate: true, baselineDueDate: true },
    }),
    prisma.wbsItem.groupBy({
      by: ['projectId'],
      where: { projectId: { in: ids }, type: { in: [...WORK_TYPES] }, status: { notIn: [...CLOSED_WORK] }, dueDate: { lt: today }, children: { none: {} } },
      _count: { _all: true },
    }),
    prisma.raidItem.findMany({
      where: { projectId: { in: ids }, type: 'RISK', riskScore: { gte: RED_RISK_SCORE }, status: { notIn: ['CLOSED', 'VALIDATED'] } },
      orderBy: [{ riskScore: 'desc' }, { updatedAt: 'desc' }],
      take: LIST_LIMIT,
      select: { id: true, projectId: true, type: true, title: true, owner: true, riskScore: true, status: true, dueDate: true },
    }),
    prisma.scheduleShift.findMany({
      where: { projectId: { in: ids }, kind: 'SHIFT', createdAt: { gte: periodStart } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: LIST_LIMIT,
      select: {
        id: true, projectId: true, checkpointId: true, checkpointCode: true, checkpointTitle: true, checkpointType: true,
        previousDate: true, newDate: true, deltaDays: true, trigger: true, actorName: true, reasonCategory: true, reasonText: true, createdAt: true,
      },
    }),
    prisma.decision.findMany({
      where: { projectId: { in: ids }, status: { in: [...OPEN_DECISION] } },
      orderBy: [{ requestedAt: 'asc' }, { createdAt: 'asc' }],
      take: LIST_LIMIT,
      select: { id: true, projectId: true, title: true, status: true, approverName: true, requestedAt: true, createdAt: true },
    }),
  ]);
  // The last shift of each project, also before the period, for the summary line.
  const lastShifts = await prisma.scheduleShift.findMany({
    where: { projectId: { in: ids }, kind: 'SHIFT' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    distinct: ['projectId'],
    select: { projectId: true, checkpointTitle: true, deltaDays: true, reasonCategory: true, reasonText: true, createdAt: true },
  });

  const forecastOf = (item: (typeof checkpoints)[number]) => item.forecastDueDate ?? item.dueDate;
  const nextByProject = new Map<string, (typeof checkpoints)[number]>();
  for (const item of checkpoints) {
    const forecast = forecastOf(item);
    if (!forecast || forecast < today) continue;
    const current = nextByProject.get(item.projectId);
    if (!current || forecast < forecastOf(current)!) nextByProject.set(item.projectId, item);
  }
  const overdueByProject = new Map(overdue.map((row) => [row.projectId, row._count._all]));
  const redByProject = new Map<string, number>();
  for (const risk of redRisks) redByProject.set(risk.projectId, (redByProject.get(risk.projectId) ?? 0) + 1);
  const lastShiftByProject = new Map(lastShifts.map((shift) => [shift.projectId, shift]));

  const summary = projects.map((project) => {
    const next = nextByProject.get(project.id);
    const last = lastShiftByProject.get(project.id);
    const startTarget = project.initialTargetDate ?? project.targetDate;
    return {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      businessUnit: project.businessUnit.name,
      portfolio: project.portfolio,
      projectManager: project.projectManager,
      status: project.status,
      rag: project.rag,
      startTargetDate: isoDay(startTarget),
      targetDate: isoDay(project.targetDate),
      targetShiftDays: daysBetween(startTarget, project.targetDate),
      nextCheckpoint: next
        ? { code: next.code, title: next.title, type: next.type, plannedDate: isoDay(next.baselineDueDate ?? next.dueDate), forecastDate: isoDay(forecastOf(next)) }
        : null,
      redRisks: redByProject.get(project.id) ?? 0,
      overdueWork: overdueByProject.get(project.id) ?? 0,
      lastShift: last
        ? { checkpointTitle: last.checkpointTitle, deltaDays: last.deltaDays, reasonCategory: last.reasonCategory, reasonText: last.reasonText, at: last.createdAt.toISOString() }
        : null,
    };
  });

  const upcoming = checkpoints
    .flatMap((item) => {
      const forecast = forecastOf(item);
      if (!forecast || forecast < today || forecast > horizonEnd) return [];
      const planned = item.baselineDueDate ?? item.dueDate;
      return [{
        ...ref(item.projectId), id: item.id, code: item.code, title: item.title, type: item.type,
        plannedDate: isoDay(planned), forecastDate: isoDay(forecast), slipDays: planned ? daysBetween(planned, forecast) : null,
      }];
    })
    .sort((left, right) => left.forecastDate!.localeCompare(right.forecastDate!) || left.projectCode.localeCompare(right.projectCode));

  return {
    generatedAt: today.toISOString(),
    summary,
    shifts: shifts.map((shift) => ({
      ...ref(shift.projectId), id: shift.id, checkpointCode: shift.checkpointCode, checkpointTitle: shift.checkpointTitle, checkpointType: shift.checkpointType,
      previousDate: isoDay(shift.previousDate), newDate: isoDay(shift.newDate), deltaDays: shift.deltaDays, trigger: shift.trigger,
      actorName: shift.actorName, reasonCategory: shift.reasonCategory, reasonText: shift.reasonText, at: shift.createdAt.toISOString(),
    })),
    upcoming: upcoming.slice(0, LIST_LIMIT),
    risks: redRisks.map((risk) => ({ ...ref(risk.projectId), id: risk.id, type: risk.type, title: risk.title, owner: risk.owner, riskScore: risk.riskScore, status: risk.status, dueDate: isoDay(risk.dueDate) })),
    decisions: decisions.map((decision) => {
      const since = decision.requestedAt ?? decision.createdAt;
      return { ...ref(decision.projectId), id: decision.id, title: decision.title, status: decision.status, approverName: decision.approverName, since: since.toISOString(), waitingDays: daysBetween(startOfDay(since), today) };
    }),
  };
}
