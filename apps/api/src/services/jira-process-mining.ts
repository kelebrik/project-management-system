import { isJiraCancelledStatus, jiraIssueMatchesSlice, readJiraIssueAttributes, type JiraAnalyticsSlice } from '@pms/shared';
import type { PrismaClient } from '@prisma/client';
import { JIRA_AGGREGATE_MAX_EVENTS, JIRA_AGGREGATE_MAX_ISSUES, JiraAggregateEventLimitError, JiraAggregatePopulationLimitError } from './jira-aggregates-core.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A status needs this many finished stays before a longer one counts as stuck. */
export const PROCESS_STUCK_MIN_SAMPLES = 5;
const VARIANT_LIMIT = 10;
const STUCK_LIMIT = 50;
const LOOP_LIMIT = 10;

export type ProcessIssue = {
  issueKey: string;
  issueUrl: string;
  status: string;
  assignee: string | null;
  issueCreatedAt: Date | null;
  resolutionAt: Date | null;
  transitionHistoryComplete: boolean;
  transitions: Array<{ fromStatus: string | null; toStatus: string; at: Date }>;
};

type Stay = { status: string; start: number; end: number | null };

export type JiraProcessResult = {
  periodDays: number;
  /** Statuses in the order work usually goes through them. */
  statuses: string[];
  statusStats: Array<{
    status: string;
    /** Finished stays that ended in the period; medians and p85 come from them. */
    samples: number;
    medianHours: number | null;
    p85Hours: number | null;
    /** Hours spent in the status inside the period, open stays included. */
    totalHours: number;
    share: number;
    current: number;
  }>;
  edges: Array<{ from: string; to: string; count: number; medianHoursBefore: number | null }>;
  rework: { issues: number; ofIssues: number; rate: number | null; loops: Array<{ from: string; to: string; count: number }> };
  variants: Array<{ path: string[]; count: number; medianLeadDays: number | null }>;
  stuck: Array<{ issueKey: string; issueUrl: string; status: string; days: number; p85Days: number; assignee: string | null }>;
  kpi: { issues: number; resolved: number; medianLeadDays: number | null; bottleneck: string | null };
  quality: { issues: number; incompleteHistory: number; unknownStart: number; statusesWithoutBaseline: string[] };
};

function quantile(values: number[], q: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

const round = (value: number | null, digits = 1) => (value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits);

/**
 * The stays of an issue, oldest first. It starts in the status it left first
 * (or its current one, if it never moved) when it was created; a move to the
 * same status is no move. Without a (sane) creation date the first stay is
 * unknown and the stays start at the first move. The last stay is open unless the issue is resolved.
 */
export function issueStays(issue: ProcessIssue): { stays: Stay[]; unknownStart: boolean } {
  const moves = issue.transitions
    .filter((move) => move.fromStatus !== move.toStatus)
    .sort((left, right) => left.at.getTime() - right.at.getTime());
  const stays: Stay[] = [];
  let unknownStart = false;
  const firstStatus = moves[0]?.fromStatus ?? (moves.length === 0 ? issue.status : null);
  // A creation date after the first move is wrong data: the first stay is unknown then.
  const createdAt = issue.issueCreatedAt && (!moves[0] || issue.issueCreatedAt <= moves[0].at) ? issue.issueCreatedAt : null;
  if (createdAt && firstStatus) {
    stays.push({ status: firstStatus, start: createdAt.getTime(), end: moves[0]?.at.getTime() ?? null });
  } else {
    unknownStart = true;
  }
  moves.forEach((move, index) => {
    stays.push({ status: move.toStatus, start: move.at.getTime(), end: moves[index + 1]?.at.getTime() ?? null });
  });
  // A resolved issue's last stay is the end of the work, not waiting.
  if (issue.resolutionAt && stays.length > 0 && stays.at(-1)!.end === null) stays.pop();
  return { stays, unknownStart };
}

/**
 * Where work goes and where it waits, from the issues' status moves in the
 * last `periodDays` days up to `now`: time in each status, the moves between
 * statuses, returns to a status left before, the usual paths of finished
 * issues, and open issues waiting longer than 85 % of stays in their status.
 */
export function jiraProcessMining(issues: ProcessIssue[], options: { now: Date; periodDays: number }): JiraProcessResult {
  const end = options.now.getTime();
  const start = end - options.periodDays * DAY;
  const durations = new Map<string, number[]>();
  const totals = new Map<string, number>();
  const current = new Map<string, number>();
  const edges = new Map<string, { from: string; to: string; count: number; hours: number[] }>();
  const loops = new Map<string, { from: string; to: string; count: number }>();
  const positions = new Map<string, number[]>();
  const variants = new Map<string, { path: string[]; leads: number[] }>();
  const leads: number[] = [];
  let unknownStart = 0;
  let activeIssues = 0;
  let reworkIssues = 0;
  let movingIssues = 0;
  const openStays: Array<{ issue: ProcessIssue; status: string; since: number }> = [];

  for (const issue of issues) {
    const { stays, unknownStart: unknown } = issueStays(issue);
    if (unknown) unknownStart += 1;
    let active = false;
    stays.forEach((stay, index) => {
      positions.set(stay.status, [...(positions.get(stay.status) ?? []), index]);
      const stayEnd = stay.end ?? end;
      const overlap = Math.max(0, Math.min(stayEnd, end) - Math.max(stay.start, start));
      if (overlap > 0) {
        active = true;
        totals.set(stay.status, (totals.get(stay.status) ?? 0) + overlap);
      }
      if (stay.end !== null && stay.end > start && stay.end <= end) {
        durations.set(stay.status, [...(durations.get(stay.status) ?? []), (stay.end - stay.start) / HOUR]);
      }
      if (stay.end === null) {
        current.set(stay.status, (current.get(stay.status) ?? 0) + 1);
        if (!issue.resolutionAt) openStays.push({ issue, status: stay.status, since: stay.start });
      }
    });

    const moves = issue.transitions
      .filter((move) => move.fromStatus !== move.toStatus)
      .sort((left, right) => left.at.getTime() - right.at.getTime());
    // A creation date after the first move is wrong data; it measures nothing.
    const createdAt = issue.issueCreatedAt && (!moves[0] || issue.issueCreatedAt <= moves[0].at) ? issue.issueCreatedAt.getTime() : null;
    const visited = new Set<string>(moves[0]?.fromStatus ? [moves[0].fromStatus] : []);
    let reworked = false;
    let movedInPeriod = false;
    moves.forEach((move, index) => {
      const at = move.at.getTime();
      const inPeriod = at > start && at <= end;
      const from = move.fromStatus ?? '?';
      if (inPeriod) {
        movedInPeriod = true;
        const key = `${from}\u0000${move.toStatus}`;
        const edge = edges.get(key) ?? { from, to: move.toStatus, count: 0, hours: [] };
        edge.count += 1;
        const enteredFrom = index === 0 ? createdAt : moves[index - 1]!.at.getTime();
        if (enteredFrom !== null) edge.hours.push((at - enteredFrom) / HOUR);
        edges.set(key, edge);
        // Coming back to a status it had already left.
        if (visited.has(move.toStatus)) {
          reworked = true;
          const loop = loops.get(key) ?? { from, to: move.toStatus, count: 0 };
          loop.count += 1;
          loops.set(key, loop);
        }
      }
      if (move.fromStatus) visited.add(move.fromStatus);
      visited.add(move.toStatus);
    });
    if (movedInPeriod) {
      movingIssues += 1;
      if (reworked) reworkIssues += 1;
    }
    if (active || movedInPeriod) activeIssues += 1;

    const resolvedAt = issue.resolutionAt?.getTime() ?? null;
    if (resolvedAt !== null && resolvedAt > start && resolvedAt <= end && createdAt !== null && resolvedAt >= createdAt) {
      const lead = (resolvedAt - createdAt) / DAY;
      leads.push(lead);
      if (issue.transitionHistoryComplete && !unknown) {
        const path = [moves[0]?.fromStatus ?? issue.status, ...moves.map((move) => move.toStatus)]
          .filter((status, index, all) => index === 0 || status !== all[index - 1]);
        const key = path.join('\u0000');
        const variant = variants.get(key) ?? { path, leads: [] };
        variant.leads.push(lead);
        variants.set(key, variant);
      }
    }
  }

  const statuses = [...new Set([...positions.keys(), ...totals.keys()])].sort((left, right) => {
    const average = (status: string) => {
      const list = positions.get(status) ?? [0];
      return list.reduce((sum, value) => sum + value, 0) / list.length;
    };
    return average(left) - average(right) || left.localeCompare(right);
  });
  const totalHours = [...totals.values()].reduce((sum, value) => sum + value, 0) / HOUR;
  const statusStats = statuses.map((status) => {
    const samples = durations.get(status) ?? [];
    const hours = (totals.get(status) ?? 0) / HOUR;
    return {
      status,
      samples: samples.length,
      medianHours: round(quantile(samples, 0.5)),
      p85Hours: round(quantile(samples, 0.85)),
      totalHours: round(hours) ?? 0,
      share: totalHours > 0 ? round(hours / totalHours, 3) ?? 0 : 0,
      current: current.get(status) ?? 0,
    };
  });
  const p85ByStatus = new Map(statusStats.filter((stat) => stat.samples >= PROCESS_STUCK_MIN_SAMPLES && stat.p85Hours !== null).map((stat) => [stat.status, stat.p85Hours!]));
  const stuck = openStays
    .flatMap(({ issue, status, since }) => {
      const p85 = p85ByStatus.get(status);
      const hours = (end - since) / HOUR;
      return p85 !== undefined && hours > p85
        ? [{ issueKey: issue.issueKey, issueUrl: issue.issueUrl, status, days: round(hours / 24) ?? 0, p85Days: round(p85 / 24) ?? 0, assignee: issue.assignee, excess: hours / Math.max(p85, 1) }]
        : [];
    })
    .sort((left, right) => right.excess - left.excess)
    .slice(0, STUCK_LIMIT)
    .map(({ excess: _excess, ...item }) => item);
  const bottleneck = statusStats.filter((stat) => stat.totalHours > 0).sort((left, right) => right.totalHours - left.totalHours)[0]?.status ?? null;

  return {
    periodDays: options.periodDays,
    statuses,
    statusStats,
    edges: [...edges.values()]
      .map((edge) => ({ from: edge.from, to: edge.to, count: edge.count, medianHoursBefore: round(quantile(edge.hours, 0.5)) }))
      .sort((left, right) => right.count - left.count),
    rework: {
      issues: reworkIssues,
      ofIssues: movingIssues,
      rate: movingIssues > 0 ? round(reworkIssues / movingIssues, 3) : null,
      loops: [...loops.values()].sort((left, right) => right.count - left.count).slice(0, LOOP_LIMIT),
    },
    variants: [...variants.values()]
      .map((variant) => ({ path: variant.path, count: variant.leads.length, medianLeadDays: round(quantile(variant.leads, 0.5)) }))
      .sort((left, right) => right.count - left.count || left.path.length - right.path.length)
      .slice(0, VARIANT_LIMIT),
    stuck,
    kpi: { issues: activeIssues, resolved: leads.length, medianLeadDays: round(quantile(leads, 0.5)), bottleneck },
    quality: {
      issues: issues.length,
      incompleteHistory: issues.filter((issue) => !issue.transitionHistoryComplete).length,
      unknownStart,
      // Statuses with too few finished stays to call anything in them stuck.
      statusesWithoutBaseline: statuses.filter((status) => !p85ByStatus.has(status)),
    },
  };
}

/** The process of a project's Jira work from its stored snapshots; Jira is not asked. */
export async function loadJiraProcessMining(
  database: Pick<PrismaClient, 'jiraIssueSnapshot' | 'jiraIssueStatusTransition'>,
  projectId: string,
  options: { now?: Date; periodDays: number; slice: JiraAnalyticsSlice | null },
) {
  const events = await database.jiraIssueStatusTransition.count({ where: { snapshot: { projectId, retiredAt: null } } });
  if (events > JIRA_AGGREGATE_MAX_EVENTS) throw new JiraAggregateEventLimitError(JIRA_AGGREGATE_MAX_EVENTS);
  const rows = await database.jiraIssueSnapshot.findMany({
    where: { projectId, retiredAt: null },
    select: {
      issueKey: true, issueUrl: true, status: true, assignee: true, issueType: true, priority: true, sprint: true, labels: true, attributes: true,
      resolutionAt: true, issueCreatedAt: true, transitionHistoryComplete: true,
      statusTransitions: { select: { fromStatus: true, toStatus: true, transitionedAt: true }, orderBy: [{ transitionedAt: 'asc' }, { id: 'asc' }] },
    },
    take: JIRA_AGGREGATE_MAX_ISSUES + 1,
  });
  if (rows.length > JIRA_AGGREGATE_MAX_ISSUES) throw new JiraAggregatePopulationLimitError(JIRA_AGGREGATE_MAX_ISSUES);
  const issues: ProcessIssue[] = rows.flatMap((row) => {
    const attributes = readJiraIssueAttributes(row.attributes);
    // Cancelled work never was flow, as on the flow charts.
    if (isJiraCancelledStatus(row.status) || !jiraIssueMatchesSlice({ ...row, attributes }, options.slice)) return [];
    return [{
      issueKey: row.issueKey,
      issueUrl: row.issueUrl,
      status: row.status,
      assignee: row.assignee,
      issueCreatedAt: row.issueCreatedAt,
      resolutionAt: row.resolutionAt,
      transitionHistoryComplete: row.transitionHistoryComplete,
      transitions: row.statusTransitions.map((move) => ({ fromStatus: move.fromStatus, toStatus: move.toStatus, at: move.transitionedAt })),
    }];
  });
  return jiraProcessMining(issues, { now: options.now ?? new Date(), periodDays: options.periodDays });
}
