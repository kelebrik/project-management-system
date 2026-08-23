import { prisma } from '../db.js';
import { jiraJqlWithIssueKeys, normalizedJiraIssueKey } from '../jira.js';

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
  return normalizedJiraIssueKey(issueKey)?.split('-', 1)[0] ?? null;
}

export function isJiraIssueKey(issueKey: string) {
  return jiraProjectKeyFromIssueKey(issueKey) !== null;
}

export function normalizedJiraIssueKeys(issueKeys: readonly string[]) {
  return [...new Set(issueKeys.map((issueKey) => {
    const normalized = issueKey.trim().toUpperCase();
    if (!isJiraIssueKey(normalized)) {
      throw new Error(`Jira вернула некорректный ключ тикета: ${issueKey}`);
    }
    return normalized;
  }))].sort();
}

export function jiraIssueKeyBatches(issueKeys: readonly string[], batchSize: number) {
  const normalized = normalizedJiraIssueKeys(issueKeys);
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  return Array.from(
    { length: Math.ceil(normalized.length / safeBatchSize) },
    (_, index) => normalized.slice(index * safeBatchSize, (index + 1) * safeBatchSize),
  );
}

export function jiraIssueKeyBatchJql(issueKeys: readonly string[]) {
  const normalized = normalizedJiraIssueKeys(issueKeys);
  if (normalized.length === 0) throw new Error('Пустая пачка ключей Jira');
  return `issuekey IN (${normalized.map((issueKey) => `"${issueKey}"`).join(', ')}) ORDER BY key ASC`;
}

export function jiraParentKeyBatchJql(parentIssueKeys: readonly string[]) {
  const normalized = normalizedJiraIssueKeys(parentIssueKeys);
  if (normalized.length === 0) throw new Error('Пустая пачка родительских ключей Jira');
  return `parent IN (${normalized.map((issueKey) => `"${issueKey}"`).join(', ')}) ORDER BY key ASC`;
}

export function jiraWorkSectionScopedJqls(
  sectionJql: string,
  synchronizedIssueKeys: readonly string[],
  batchSize: number,
) {
  return jiraIssueKeyBatches(synchronizedIssueKeys, batchSize)
    .map((issueKeys) => jiraJqlWithIssueKeys(sectionJql, issueKeys));
}

export function jiraIssueKeyBatchDifference(
  requestedIssueKeys: readonly string[],
  returnedIssueKeys: readonly string[],
) {
  const requested = new Set(normalizedJiraIssueKeys(requestedIssueKeys));
  const returned = new Set(normalizedJiraIssueKeys(returnedIssueKeys));
  return {
    missingKeys: [...requested].filter((issueKey) => !returned.has(issueKey)),
    unexpectedKeys: [...returned].filter((issueKey) => !requested.has(issueKey)),
  };
}

export function jiraIssueKeyBatchLossIsUnsafe(
  requestedCount: number,
  missingCount: number,
) {
  if (requestedCount <= 0) return missingCount > 0;
  return missingCount > Math.max(1, Math.floor(requestedCount * 0.2));
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
        where: { snapshot: { retiredAt: null } },
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
