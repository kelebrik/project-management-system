import {
  isJiraCancelledStatus,
  jiraIssueMatchesSlice,
  readJiraIssueAttributes,
  type JiraAnalyticsSlice,
} from '@pms/shared';
import type { PrismaClient } from '@prisma/client';
import { JiraAggregatePopulationLimitError, JIRA_AGGREGATE_MAX_ISSUES } from './jira-aggregates-core.js';

/**
 * Flow of a project's Jira work over time, from its own snapshots and status
 * transitions (Jira is not asked): per step how many issues were created and
 * resolved, how many were open at its end and in which status category, and
 * the running scope and done totals for a burnup. Story points weigh by each
 * issue's current points; the category of a past status is the category that
 * status has now, which the result reports as a reconstruction.
 */

export const JIRA_FLOW_STEPS = ['day', 'week', 'month'] as const;
export type JiraFlowStep = (typeof JIRA_FLOW_STEPS)[number];
export type JiraFlowMetric = 'count' | 'storyPoints';
export type JiraFlowCategory = 'new' | 'indeterminate' | 'done';
const DAY_MS = 86_400_000;
const MAX_BUCKETS = 400;
/** The zones the analytics support have fixed offsets: Moscow keeps +3 all year. */
const ZONE_OFFSET_MS: Record<string, number> = { 'Europe/Moscow': 3 * 3_600_000, UTC: 0 };

export type JiraFlowIssue = {
  issueKey: string;
  status: string;
  resolutionAt: Date | null;
  issueCreatedAt: Date | null;
  transitionHistoryComplete: boolean;
  weight: number;
  category: JiraFlowCategory | null;
  transitions: Array<{ fromStatus: string | null; toStatus: string; at: Date }>;
};

export type JiraFlowBucket = {
  start: string;
  end: string;
  created: number;
  resolved: number;
  open: number;
  byCategory: Record<JiraFlowCategory, number>;
  scope: number;
  done: number;
};

/** The local start of the step that holds a moment, as a UTC instant. */
function stepStart(at: number, step: JiraFlowStep, offset: number) {
  const local = new Date(at + offset);
  const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  if (step === 'day') return day - offset;
  if (step === 'week') return day - ((local.getUTCDay() + 6) % 7) * DAY_MS - offset;
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - offset;
}

function nextStep(start: number, step: JiraFlowStep, offset: number) {
  if (step === 'day') return start + DAY_MS;
  if (step === 'week') return start + 7 * DAY_MS;
  const local = new Date(start + offset);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - offset;
}

const projectOf = (issueKey: string) => issueKey.trim().toUpperCase().match(/^([A-Z][A-Z0-9_]*)-\d+$/)?.[1] ?? '';

/** Where a status name belongs now: by the issues that carry it, per Jira project, then across projects. */
export function jiraStatusCategoryMap(issues: Array<Pick<JiraFlowIssue, 'issueKey' | 'status' | 'category'>>) {
  const byProject = new Map<string, JiraFlowCategory>();
  const byName = new Map<string, JiraFlowCategory>();
  for (const issue of issues) {
    if (!issue.category) continue;
    byProject.set(`${projectOf(issue.issueKey)}|${issue.status}`, issue.category);
    if (!byName.has(issue.status)) byName.set(issue.status, issue.category);
  }
  const unknown = new Set<string>();
  const lookup = (issueKey: string, status: string): JiraFlowCategory => {
    const known = byProject.get(`${projectOf(issueKey)}|${status}`) ?? byName.get(status);
    if (known) return known;
    unknown.add(status);
    return 'indeterminate';
  };
  return { lookup, unknown };
}

/** The status of an issue at a moment: the last transition up to it, else the one it started in. */
function statusAt(issue: JiraFlowIssue, at: number) {
  let status: string | null = null;
  for (const transition of issue.transitions) {
    if (transition.at.getTime() > at) break;
    status = transition.toStatus;
  }
  return status ?? issue.transitions[0]?.fromStatus ?? issue.status;
}

export function jiraFlowSeries(
  issues: JiraFlowIssue[],
  options: { now: Date; periodDays: number; step: JiraFlowStep; timeZone: string; categorySource?: Array<Pick<JiraFlowIssue, 'issueKey' | 'status' | 'category'>> },
) {
  const offset = ZONE_OFFSET_MS[options.timeZone] ?? 0;
  const now = options.now.getTime();
  const starts: number[] = [];
  for (let start = stepStart(now - options.periodDays * DAY_MS, options.step, offset); start <= now; start = nextStep(start, options.step, offset)) {
    starts.push(start);
    if (starts.length > MAX_BUCKETS) throw new Error('JIRA_FLOW_TOO_MANY_STEPS');
  }
  // Categories come from all the project's issues, not only those in the slice.
  const categories = jiraStatusCategoryMap(options.categorySource ?? issues);
  const buckets: JiraFlowBucket[] = starts.map((start) => {
    const end = Math.min(nextStep(start, options.step, offset), now + 1);
    const bucket: JiraFlowBucket = { start: new Date(start).toISOString(), end: new Date(end).toISOString(), created: 0, resolved: 0, open: 0, byCategory: { new: 0, indeterminate: 0, done: 0 }, scope: 0, done: 0 };
    for (const issue of issues) {
      const created = issue.issueCreatedAt?.getTime() ?? null;
      const resolved = issue.resolutionAt?.getTime() ?? null;
      if (created === null || created >= end) continue;
      bucket.scope += issue.weight;
      if (created >= start) bucket.created += issue.weight;
      if (resolved !== null && resolved < end) {
        bucket.done += issue.weight;
        bucket.byCategory.done += issue.weight;
        if (resolved >= start) bucket.resolved += issue.weight;
        continue;
      }
      bucket.open += issue.weight;
      bucket.byCategory[categories.lookup(issue.issueKey, statusAt(issue, end - 1))] += issue.weight;
    }
    return bucket;
  });
  return { buckets, unknownStatuses: [...categories.unknown].sort() };
}

/** The flow of a project's issues in a slice, read from the database. */
export async function loadJiraFlowSeries(
  database: Pick<PrismaClient, 'jiraIssueSnapshot'>,
  projectId: string,
  options: { now?: Date; periodDays: number; step: JiraFlowStep; metric: JiraFlowMetric; slice: JiraAnalyticsSlice | null; timeZone: string },
) {
  const rows = await database.jiraIssueSnapshot.findMany({
    where: { projectId, retiredAt: null },
    select: {
      issueKey: true, status: true, assignee: true, issueType: true, priority: true, sprint: true, labels: true, attributes: true,
      resolutionAt: true, issueCreatedAt: true, transitionHistoryComplete: true,
      statusTransitions: { select: { fromStatus: true, toStatus: true, transitionedAt: true }, orderBy: [{ transitionedAt: 'asc' }, { id: 'asc' }] },
    },
    take: JIRA_AGGREGATE_MAX_ISSUES + 1,
  });
  if (rows.length > JIRA_AGGREGATE_MAX_ISSUES) throw new JiraAggregatePopulationLimitError(JIRA_AGGREGATE_MAX_ISSUES);
  let missingPoints = 0;
  const categorySource = rows.map((row) => ({ issueKey: row.issueKey, status: row.status, category: readJiraIssueAttributes(row.attributes)?.statusCategoryKey ?? null }));
  const issues: JiraFlowIssue[] = rows.flatMap((row) => {
    const attributes = readJiraIssueAttributes(row.attributes);
    // Cancelled work never was flow: it is left out, as it is from the work scope of the widgets.
    if (isJiraCancelledStatus(row.status) || !jiraIssueMatchesSlice({ ...row, attributes }, options.slice)) return [];
    if (options.metric === 'storyPoints' && attributes?.storyPoints == null) missingPoints += 1;
    return [{
      issueKey: row.issueKey,
      status: row.status,
      resolutionAt: row.resolutionAt,
      issueCreatedAt: row.issueCreatedAt,
      transitionHistoryComplete: row.transitionHistoryComplete,
      weight: options.metric === 'storyPoints' ? attributes?.storyPoints ?? 0 : 1,
      category: attributes?.statusCategoryKey ?? null,
      transitions: row.statusTransitions.map((transition) => ({ fromStatus: transition.fromStatus, toStatus: transition.toStatus, at: transition.transitionedAt })),
    }];
  });
  const series = jiraFlowSeries(issues, { now: options.now ?? new Date(), periodDays: options.periodDays, step: options.step, timeZone: options.timeZone, categorySource });
  return {
    step: options.step,
    metric: options.metric,
    periodDays: options.periodDays,
    buckets: series.buckets,
    quality: {
      issues: issues.length,
      incompleteHistory: issues.filter((issue) => !issue.transitionHistoryComplete).length,
      withoutCreationDate: issues.filter((issue) => !issue.issueCreatedAt).length,
      missingStoryPoints: missingPoints,
      // Categories of past statuses are taken from the statuses as they are now.
      reconstructedCategories: true,
      unknownStatuses: series.unknownStatuses,
    },
  };
}
