import {
  JIRA_SLICE_FIELDS,
  jiraIssueSliceValues,
  readJiraIssueAttributes,
  type JiraSliceField,
  type JiraSliceIssue,
} from '@pms/shared';
import type { PrismaClient } from '@prisma/client';
import { loadJiraAnalyticsFacets } from './jira-aggregates-core.js';

export const JIRA_FACET_MAX_VALUES = 500;
const JIRA_FACET_MAX_ISSUES = 5_001;

export type JiraFacetValues = { values: Array<{ value: string; count: number }>; truncated: boolean };

/** Values of each slice field over the issues, the most frequent first; "" counts issues without one. */
export function jiraSliceFacetValues(issues: JiraSliceIssue[]) {
  const counts = Object.fromEntries(JIRA_SLICE_FIELDS.map((field) => [field, new Map<string, number>()])) as Record<JiraSliceField, Map<string, number>>;
  for (const issue of issues) {
    for (const field of JIRA_SLICE_FIELDS) {
      for (const value of new Set(jiraIssueSliceValues(issue, field))) counts[field].set(value, (counts[field].get(value) ?? 0) + 1);
    }
  }
  return Object.fromEntries(
    JIRA_SLICE_FIELDS.map((field) => {
      const sorted = [...counts[field].entries()].map(([value, count]) => ({ value, count })).sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, 'ru'));
      return [field, { values: sorted.slice(0, JIRA_FACET_MAX_VALUES), truncated: sorted.length > JIRA_FACET_MAX_VALUES }];
    }),
  ) as Record<JiraSliceField, JiraFacetValues>;
}

/** What the slice bar offers for a project, with the coverage counters of the existing facets. */
export async function loadJiraSliceFacets(database: Pick<PrismaClient, 'jiraIssueSnapshot'>, projectId: string) {
  const coverage = await loadJiraAnalyticsFacets(database, projectId);
  const rows = await database.jiraIssueSnapshot.findMany({
    where: { projectId, retiredAt: null },
    select: { assignee: true, status: true, issueType: true, priority: true, sprint: true, labels: true, attributes: true },
    take: JIRA_FACET_MAX_ISSUES,
  });
  return { ...coverage, values: jiraSliceFacetValues(rows.map((row) => ({ ...row, attributes: readJiraIssueAttributes(row.attributes) }))) };
}
