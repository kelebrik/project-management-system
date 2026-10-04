import {
  isJiraCancelledStatus,
  isJiraUnresolvedResolution,
  jiraIssueMatchesSlice,
  readJiraIssueAttributes,
  type JiraAnalyticsSlice,
} from '@pms/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

/**
 * Jira work across the open projects a person may read, one line per project,
 * from the projects' own snapshots (Jira is not asked). The words mean what
 * they mean in the widgets: an issue is open while it has no resolution and
 * is not cancelled; cancelled issues count nowhere. "Created" and "resolved"
 * in the period read today's snapshots, so a reopened issue no longer counts
 * as resolved. The total adds the project lines: an issue labelled for two
 * projects counts in each.
 */

export const JIRA_PORTFOLIO_MAX_ISSUES = 50_000;
const DAY_MS = 86_400_000;
const MOSCOW_OFFSET_MS = 3 * 3_600_000;
const ASSIGNEE_HINTS = 200;

export class JiraPortfolioLimitError extends Error {
  constructor() {
    super(`В доступных проектах больше ${JIRA_PORTFOLIO_MAX_ISSUES} задач Jira — сузьте срез`);
  }
}

export type JiraPortfolioIssue = {
  projectId: string;
  status: string;
  resolution: string | null;
  resolutionAt: Date | null;
  issueCreatedAt: Date | null;
  assignee: string | null;
  issueType: string;
  priority: string;
  sprint: string | null;
  labels: string[];
  attributes: unknown;
};

export type JiraPortfolioLine = {
  openIssues: number;
  inProgress: number;
  overdue: number;
  unassigned: number;
  openStoryPoints: number;
  createdInPeriod: number;
  resolvedInPeriod: number;
  oldestOpenDays: number | null;
  withoutAttributes: number;
};

const emptyLine = (): JiraPortfolioLine => ({ openIssues: 0, inProgress: 0, overdue: 0, unassigned: 0, openStoryPoints: 0, createdInPeriod: 0, resolvedInPeriod: 0, oldestOpenDays: null, withoutAttributes: 0 });

/** The start of today in Moscow, where the teams are; due dates are calendar days. */
export function moscowToday(now: Date) {
  const local = new Date(now.getTime() + MOSCOW_OFFSET_MS);
  return local.toISOString().slice(0, 10);
}

/** Lines per project and the total, from issues already narrowed to readable projects. */
export function jiraPortfolioLines(issues: JiraPortfolioIssue[], options: { now: Date; periodDays: number; slice: JiraAnalyticsSlice | null }) {
  const today = moscowToday(options.now);
  const periodStart = options.now.getTime() - options.periodDays * DAY_MS;
  const lines = new Map<string, JiraPortfolioLine>();
  const assignees = new Map<string, number>();
  for (const issue of issues) {
    if (isJiraCancelledStatus(issue.status)) continue;
    const attributes = readJiraIssueAttributes(issue.attributes);
    if (!jiraIssueMatchesSlice({ ...issue, attributes }, options.slice)) continue;
    const line = lines.get(issue.projectId) ?? emptyLine();
    lines.set(issue.projectId, line);
    if (!attributes) line.withoutAttributes += 1;
    const created = issue.issueCreatedAt?.getTime() ?? null;
    if (created !== null && created >= periodStart && created <= options.now.getTime()) line.createdInPeriod += 1;
    const open = isJiraUnresolvedResolution(issue.resolution);
    const resolved = issue.resolutionAt?.getTime() ?? null;
    if (!open && resolved !== null && resolved >= periodStart && resolved <= options.now.getTime()) line.resolvedInPeriod += 1;
    if (!open) continue;
    line.openIssues += 1;
    if (attributes?.statusCategoryKey === 'indeterminate') line.inProgress += 1;
    if (attributes?.dueDate && attributes.dueDate < today) line.overdue += 1;
    if (!issue.assignee?.trim()) line.unassigned += 1;
    else assignees.set(issue.assignee, (assignees.get(issue.assignee) ?? 0) + 1);
    line.openStoryPoints += attributes?.storyPoints ?? 0;
    if (created !== null) {
      const age = Math.floor((options.now.getTime() - created) / DAY_MS);
      line.oldestOpenDays = Math.max(line.oldestOpenDays ?? 0, age);
    }
  }
  const total = emptyLine();
  for (const line of lines.values()) {
    for (const key of ['openIssues', 'inProgress', 'overdue', 'unassigned', 'openStoryPoints', 'createdInPeriod', 'resolvedInPeriod', 'withoutAttributes'] as const) total[key] += line[key];
    if (line.oldestOpenDays !== null) total.oldestOpenDays = Math.max(total.oldestOpenDays ?? 0, line.oldestOpenDays);
  }
  const assigneeHints = [...assignees.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ru')).slice(0, ASSIGNEE_HINTS).map(([name]) => name);
  return { lines, total, assigneeHints };
}

export async function loadJiraPortfolio(projectWhere: Prisma.ProjectWhereInput, options: { now?: Date; periodDays: number; slice: JiraAnalyticsSlice | null }) {
  const now = options.now ?? new Date();
  const projects = await prisma.project.findMany({
    where: { ...projectWhere, status: { not: 'CLOSED' }, jiraAnalyticsSettings: { jiraScopeValue: { not: '' } } },
    select: { id: true, code: true, name: true, portfolio: true, jiraAnalyticsSettings: { select: { lastSyncedAt: true, currentProjectionRefreshedAt: true } } },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
  const projectIds = projects.map((project) => project.id);
  const issues = projectIds.length === 0 ? [] : await prisma.jiraIssueSnapshot.findMany({
    where: { projectId: { in: projectIds }, retiredAt: null },
    select: { projectId: true, status: true, resolution: true, resolutionAt: true, issueCreatedAt: true, assignee: true, issueType: true, priority: true, sprint: true, labels: true, attributes: true },
    take: JIRA_PORTFOLIO_MAX_ISSUES + 1,
  });
  // No partial totals: past the limit the person narrows the slice.
  if (issues.length > JIRA_PORTFOLIO_MAX_ISSUES) throw new JiraPortfolioLimitError();
  const { lines, total, assigneeHints } = jiraPortfolioLines(issues, { now, periodDays: options.periodDays, slice: options.slice });
  return {
    periodDays: options.periodDays,
    today: moscowToday(now),
    projects: projects.map((project) => ({
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      portfolio: project.portfolio,
      lastSyncedAt: project.jiraAnalyticsSettings?.lastSyncedAt?.toISOString() ?? null,
      refreshedAt: project.jiraAnalyticsSettings?.currentProjectionRefreshedAt?.toISOString() ?? null,
      ...(lines.get(project.id) ?? emptyLine()),
    })),
    total,
    assigneeHints,
  };
}
