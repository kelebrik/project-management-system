import { jiraCriticalPriorities } from '@pms/shared';

import { prisma } from '../db.js';

const DEFAULT_JIRA_WORK_SECTION_COUNT = 3;

export function defaultJiraWorkSectionTitle(sortOrder: number) {
  return `Раздел ${sortOrder + 1}`;
}

export function jiraWorkSectionFilterToJql(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed, 'https://jira.local');
    const filterId = url.searchParams.get('filter')?.trim();
    if (filterId && /^\d+$/.test(filterId)) {
      return `filter = ${filterId}`;
    }

    const jql = url.searchParams.get('jql')?.trim();
    if (jql) {
      return jql;
    }
  } catch {
    // Non-URL input is treated as a direct Jira search expression below.
  }

  if (/^\d+$/.test(trimmed)) {
    return `filter = ${trimmed}`;
  }

  return trimmed;
}

export function resolveJiraWorkSectionJql(jql: string, filterUrl: string) {
  return jiraWorkSectionFilterToJql(jql.trim() || filterUrl);
}

function normalizedJiraProjectKeys(projectKeys: string | readonly string[]) {
  return [...new Set((Array.isArray(projectKeys) ? projectKeys : [projectKeys])
    .map((projectKey) => projectKey.trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .map((projectKey) => projectKey
      .replaceAll('\\', '\\\\')
      .replaceAll('"', '\\"'));
}

export function jiraProjectKeyFromIssueKey(issueKey: string) {
  return issueKey.trim().match(/^([A-Z][A-Z0-9_]*)-\d+$/i)?.[1]?.toUpperCase() ?? null;
}

export function jiraCriticalPriorityProjectKeys(
  configuredProjectKey: string,
  issueKeys: readonly string[],
) {
  const observedProjectKeys = issueKeys
    .map(jiraProjectKeyFromIssueKey)
    .filter((projectKey): projectKey is string => Boolean(projectKey));
  return normalizedJiraProjectKeys([configuredProjectKey, ...observedProjectKeys]);
}

export function jiraCriticalPriorityJql(projectKeys: string | readonly string[]) {
  const normalizedProjectKeys = normalizedJiraProjectKeys(projectKeys);
  if (normalizedProjectKeys.length === 0) return '';
  const priorities = jiraCriticalPriorities
    .map((priority) => `"${priority}"`)
    .join(', ');
  const projectClause = normalizedProjectKeys.length === 1
    ? `project = "${normalizedProjectKeys[0]}"`
    : `project IN (${normalizedProjectKeys.map((projectKey) => `"${projectKey}"`).join(', ')})`;
  return `${projectClause} AND priority WAS IN (${priorities}) ORDER BY created ASC, key ASC`;
}

export function jiraCriticalSlaSyncPlan(
  configuredProjectKey: string,
  issueKeys: readonly string[],
) {
  const projectKeys = jiraCriticalPriorityProjectKeys(configuredProjectKey, issueKeys);
  const jql = jiraCriticalPriorityJql(projectKeys);
  return { configured: Boolean(jql), projectKeys, jql };
}

export async function ensureDefaultJiraWorkSections(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return [];

  const existing = await prisma.jiraWorkSection.findMany({
    where: { projectId },
    select: { sortOrder: true },
  });
  const existingOrders = new Set(existing.map((section) => section.sortOrder));
  const missingSections = Array.from(
    { length: DEFAULT_JIRA_WORK_SECTION_COUNT },
    (_, index) => index,
  )
    .filter((sortOrder) => !existingOrders.has(sortOrder))
    .map((sortOrder) => ({
      projectId,
      sortOrder,
      title: defaultJiraWorkSectionTitle(sortOrder),
      jql: '',
    }));

  if (missingSections.length > 0) {
    await prisma.jiraWorkSection.createMany({
      data: missingSections,
      skipDuplicates: true,
    });
  }

  return prisma.jiraWorkSection.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
    include: {
      issues: {
        orderBy: { syncedAt: 'desc' },
        include: {
          snapshot: {
            include: {
              statusTransitions: { orderBy: { transitionedAt: 'asc' } },
              developmentActivities: { orderBy: { activityAt: 'desc' } },
            },
          },
        },
      },
    },
  });
}
