import type { PageDatasetRow, PageSourceKey } from '@pms/shared';
import { prisma } from '../../db.js';
import { loadPortfolioReport } from '../portfolio-reports.js';

/**
 * Adapters of "My page": each loads the rows of one source for a set of
 * readable open projects, in one or two queries, with the fields named in
 * PAGE_SOURCES. The words that mean something are computed here the way the
 * portfolio reports compute them: overdue work is a task, deliverable or work
 * package without children, not done or cancelled, due before today; a red
 * risk is an open risk scored 15 or more; a waiting decision was sent to an
 * approver and not answered. Days are UTC calendar days, as in the reports.
 */

export type PageProjectRef = { id: string; code: string; name: string; portfolio: string };
export type PageSourceContext = { projects: PageProjectRef[]; now: Date; today: string };
export type PageSourceAdapter = (context: PageSourceContext) => Promise<PageDatasetRow[]>;

/** No source answers with more rows than this: a widget asks for a narrower scope instead of a partial total. */
export const PAGE_SOURCE_ROW_LIMIT = 50_000;
const WBS_LOAD_LIMIT = 100_000;
const DAY_MS = 86_400_000;
const WORK_TYPES = new Set(['TASK', 'DELIVERABLE', 'WORK_PACKAGE']);
const CLOSED_WORK = new Set(['DONE', 'CANCELLED']);
const CLOSED_RAID = ['CLOSED', 'VALIDATED'];
export const PAGE_RED_RISK_SCORE = 15;
export const PAGE_AMBER_RISK_SCORE = 8;

/** Too many rows: numbers and groups are refused, a table may show the first rows it got (`partial`). */
export class PageSourceLimitError extends Error {
  constructor(readonly source: PageSourceKey, readonly partial: PageDatasetRow[] | null = null) {
    super(`В охвате страницы больше ${(partial?.length ?? PAGE_SOURCE_ROW_LIMIT).toLocaleString('ru-RU')} строк источника — сузьте охват`);
  }
}

export const pageDay = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

function projectValues(project: PageProjectRef) {
  return { project: project.code, projectName: project.name, portfolio: project.portfolio };
}

function lookup(context: PageSourceContext) {
  const byId = new Map(context.projects.map((project) => [project.id, project]));
  return (projectId: string) => byId.get(projectId)!;
}

const href = (code: string, section: string) => `/${encodeURIComponent(code)}/${section}`;

function limited<T>(rows: T[], source: PageSourceKey, limit = PAGE_SOURCE_ROW_LIMIT) {
  if (rows.length > limit) throw new PageSourceLimitError(source);
  return rows;
}

/** One row per open project, with the line of the portfolio report and a few counts more. */
const projects: PageSourceAdapter = async (context) => {
  const ids = context.projects.map((project) => project.id);
  if (ids.length === 0) return [];
  const [report, details, openRisks, waiting] = await Promise.all([
    loadPortfolioReport({ id: { in: ids } }, { now: context.now, horizonDays: 28, periodDays: 30 }),
    prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, progress: true, startDate: true } }),
    prisma.raidItem.groupBy({ by: ['projectId'], where: { projectId: { in: ids }, type: 'RISK', status: { notIn: CLOSED_RAID as never } }, _count: { _all: true } }),
    prisma.decision.groupBy({ by: ['projectId'], where: { projectId: { in: ids }, status: 'PENDING_APPROVAL' }, _count: { _all: true } }),
  ]);
  const detailById = new Map(details.map((row) => [row.id, row]));
  const openById = new Map(openRisks.map((row) => [row.projectId, row._count._all]));
  const waitingById = new Map(waiting.map((row) => [row.projectId, row._count._all]));
  const project = lookup(context);
  return report.summary.map((line) => {
    const detail = detailById.get(line.projectId);
    const next = line.nextCheckpoint;
    return {
      id: line.projectId,
      projectId: line.projectId,
      href: href(line.projectCode, 'overview'),
      values: {
        ...projectValues(project(line.projectId)),
        businessUnit: line.businessUnit,
        projectManager: line.projectManager,
        status: line.status,
        rag: line.rag,
        progress: detail?.progress ?? 0,
        startDate: pageDay(detail?.startDate),
        targetDate: line.targetDate,
        startTargetDate: line.startTargetDate,
        targetShiftDays: line.targetShiftDays,
        nextCheckpoint: next?.title ?? null,
        nextCheckpointDate: next?.forecastDate ?? null,
        nextCheckpointSlipDays: next?.plannedDate && next.forecastDate ? daysBetween(next.plannedDate, next.forecastDate) : null,
        overdueWork: line.overdueWork,
        redRisks: line.redRisks,
        openRisks: openById.get(line.projectId) ?? 0,
        waitingDecisions: waitingById.get(line.projectId) ?? 0,
        lastShiftDays: line.lastShift?.deltaDays ?? null,
        lastShiftReason: line.lastShift?.reasonCategory ?? null,
      },
    };
  });
};

type WbsRow = {
  id: string; projectId: string; parentId: string | null; code: string; title: string; type: string; status: string; owner: string;
  startDate: Date | null; dueDate: Date | null; baselineDueDate: Date | null; forecastDueDate: Date | null; closedAt: Date | null; progress: number;
};

async function loadWbs(context: PageSourceContext, source: PageSourceKey, types?: string[]) {
  const rows = await prisma.wbsItem.findMany({
    where: { projectId: { in: context.projects.map((project) => project.id) }, ...(types ? { type: { in: types as never } } : {}) },
    select: { id: true, projectId: true, parentId: true, code: true, title: true, type: true, status: true, owner: true, startDate: true, dueDate: true, baselineDueDate: true, forecastDueDate: true, closedAt: true, progress: true },
    orderBy: [{ projectId: 'asc' }, { sortOrder: 'asc' }],
    take: WBS_LOAD_LIMIT + 1,
  });
  return limited(rows as WbsRow[], source, WBS_LOAD_LIMIT);
}

/** Work without child rows, with the phase it sits in. */
const work: PageSourceAdapter = async (context) => {
  if (context.projects.length === 0) return [];
  const items = await loadWbs(context, 'work');
  const byId = new Map(items.map((item) => [item.id, item]));
  const parents = new Set(items.map((item) => item.parentId).filter(Boolean));
  const phaseOf = (item: WbsRow) => {
    let current = item.parentId ? byId.get(item.parentId) : undefined;
    for (let depth = 0; current && depth < 50; depth += 1) {
      if (current.type === 'PHASE') return current.title;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return null;
  };
  const project = lookup(context);
  const rows = items.filter((item) => WORK_TYPES.has(item.type) && !parents.has(item.id)).map((item) => {
    const due = pageDay(item.dueDate);
    const open = !CLOSED_WORK.has(item.status);
    const overdue = open && due !== null && due < context.today;
    const ref = project(item.projectId);
    return {
      id: item.id,
      projectId: item.projectId,
      href: href(ref.code, 'wbs'),
      values: {
        ...projectValues(ref),
        code: item.code, title: item.title, type: item.type, status: item.status, phase: phaseOf(item), owner: item.owner || null,
        startDate: pageDay(item.startDate), dueDate: due, closedAt: pageDay(item.closedAt), progress: item.progress,
        open, overdue,
        dueInDays: due ? daysBetween(context.today, due) : null,
        overdueDays: overdue ? daysBetween(due!, context.today) : null,
      },
    };
  });
  return rows;
};

/** Every milestone and goal, reached ones too, with plan, forecast and the journal's count of shifts. */
const checkpoints: PageSourceAdapter = async (context) => {
  if (context.projects.length === 0) return [];
  const ids = context.projects.map((project) => project.id);
  const [items, shifts] = await Promise.all([
    loadWbs(context, 'checkpoints', ['MILESTONE', 'GOAL']),
    prisma.scheduleShift.groupBy({ by: ['checkpointId'], where: { projectId: { in: ids }, kind: 'SHIFT', checkpointId: { not: null } }, _count: { _all: true } }),
  ]);
  const shiftCount = new Map(shifts.map((row) => [row.checkpointId, row._count._all]));
  const project = lookup(context);
  return items.map((item) => {
    const planned = pageDay(item.baselineDueDate ?? item.dueDate);
    const forecast = pageDay(item.forecastDueDate ?? item.dueDate);
    const ref = project(item.projectId);
    return {
      id: item.id,
      projectId: item.projectId,
      href: href(ref.code, 'schedule'),
      values: {
        ...projectValues(ref),
        code: item.code, title: item.title, type: item.type, status: item.status, owner: item.owner || null,
        plannedDate: planned, forecastDate: forecast,
        slipDays: planned && forecast ? daysBetween(planned, forecast) : null,
        inDays: forecast ? daysBetween(context.today, forecast) : null,
        open: !CLOSED_WORK.has(item.status),
        shiftCount: shiftCount.get(item.id) ?? 0,
      },
    };
  });
};

export function pageRiskLevel(score: number) {
  return score >= PAGE_RED_RISK_SCORE ? 'RED' : score >= PAGE_AMBER_RISK_SCORE ? 'AMBER' : 'GREEN';
}

const risks: PageSourceAdapter = async (context) => {
  if (context.projects.length === 0) return [];
  const items = await prisma.raidItem.findMany({
    where: { projectId: { in: context.projects.map((project) => project.id) } },
    select: { id: true, projectId: true, type: true, title: true, status: true, owner: true, riskScore: true, decisionRequired: true, scheduleImpactDays: true, dueDate: true, createdAt: true },
    orderBy: { id: 'asc' },
    take: PAGE_SOURCE_ROW_LIMIT + 1,
  });
  const project = lookup(context);
  return items.map((item) => {
    const ref = project(item.projectId);
    return {
      id: item.id,
      projectId: item.projectId,
      href: href(ref.code, 'risks'),
      values: {
        ...projectValues(ref),
        title: item.title, type: item.type, status: item.status, owner: item.owner || null, riskScore: item.riskScore, level: pageRiskLevel(item.riskScore),
        open: !CLOSED_RAID.includes(item.status), decisionRequired: item.decisionRequired, scheduleImpactDays: item.scheduleImpactDays,
        dueDate: pageDay(item.dueDate), createdAt: pageDay(item.createdAt),
      },
    };
  });
};

const decisions: PageSourceAdapter = async (context) => {
  if (context.projects.length === 0) return [];
  const items = await prisma.decision.findMany({
    where: { projectId: { in: context.projects.map((project) => project.id) } },
    select: { id: true, projectId: true, title: true, status: true, approverName: true, requestedAt: true, decidedAt: true, createdAt: true },
    orderBy: { id: 'asc' },
    take: PAGE_SOURCE_ROW_LIMIT + 1,
  });
  const project = lookup(context);
  return items.map((item) => {
    const ref = project(item.projectId);
    const waiting = item.status === 'PENDING_APPROVAL';
    const since = pageDay(item.requestedAt ?? item.createdAt)!;
    return {
      id: item.id,
      projectId: item.projectId,
      href: href(ref.code, 'decisions'),
      values: {
        ...projectValues(ref),
        title: item.title, status: item.status, approverName: item.approverName, waiting,
        waitingDays: waiting ? Math.max(0, daysBetween(since, context.today)) : null,
        requestedAt: pageDay(item.requestedAt), decidedAt: pageDay(item.decidedAt), createdAt: pageDay(item.createdAt),
      },
    };
  });
};

/** Moves of milestones and goals from the journal (not the notes that a baseline was set). */
const shifts: PageSourceAdapter = async (context) => {
  if (context.projects.length === 0) return [];
  const items = await prisma.scheduleShift.findMany({
    where: { projectId: { in: context.projects.map((project) => project.id) }, kind: 'SHIFT' },
    select: { id: true, projectId: true, checkpointTitle: true, checkpointType: true, deltaDays: true, reasonCategory: true, reasonText: true, actorName: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SOURCE_ROW_LIMIT + 1,
  });
  const project = lookup(context);
  return items.map((item) => {
    const ref = project(item.projectId);
    return {
      id: item.id,
      projectId: item.projectId,
      href: href(ref.code, 'schedule'),
      values: {
        ...projectValues(ref),
        checkpointTitle: item.checkpointTitle, checkpointType: item.checkpointType, deltaDays: item.deltaDays, later: (item.deltaDays ?? 0) > 0,
        reasonCategory: item.reasonCategory, reasonText: item.reasonText, actorName: item.actorName, createdAt: pageDay(item.createdAt),
      },
    };
  });
};

export const PAGE_CORE_SOURCE_ADAPTERS = { projects, work, checkpoints, risks, decisions, shifts } satisfies Partial<Record<PageSourceKey, PageSourceAdapter>>;
