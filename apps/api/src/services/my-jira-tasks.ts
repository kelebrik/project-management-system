import { jiraAnalyticsLabels } from '@pms/shared';
import type { JiraIssue } from '../jira-model.js';

/**
 * "My tasks in Jira": open issues assigned to the user and carrying the label
 * of a project they may read. One search per Jira, read-only; the answer is
 * kept for a few minutes per login and set of labels.
 */

export const MY_JIRA_TASKS_LIMIT = 100;
export const MY_JIRA_TASKS_TTL_MS = 5 * 60_000;
/** Jira logins are user names or e-mails: no quotes, spaces or backslashes reach the query. */
export const jiraLoginPattern = /^[A-Za-z0-9._@+-]{1,100}$/;

export type LabelledProject = { id: string; code: string; name: string; labels: string[] };
export type MyJiraTask = { key: string; url: string; summary: string; status: string; statusCategory: string | null; priority: string; issueType: string; updatedAt: string };

/** The projects scoped by labels, with their labels; a scope that no longer parses is left out. */
export function labelledProjects(projects: Array<{ id: string; code: string; name: string; scopeType: string; scopeValue: string }>): LabelledProject[] {
  return projects.flatMap((project) => {
    if (project.scopeType !== 'LABEL') return [];
    try {
      return [{ id: project.id, code: project.code, name: project.name, labels: jiraAnalyticsLabels(project.scopeValue) }];
    } catch {
      return [];
    }
  });
}

/** The one search: any of the labels, assigned to the login, not done, the latest first. */
export function myJiraTasksJql(labels: string[], login: string) {
  if (!jiraLoginPattern.test(login)) throw new Error('Некорректный логин Jira');
  const list = [...new Set(labels)].sort();
  return `labels IN (${list.map((label) => `"${label}"`).join(', ')}) AND assignee = "${login}" AND statusCategory != Done ORDER BY updated DESC`;
}

/** Issues under each project whose label they carry; an issue with labels of two projects shows under both. */
export function groupTasksByProject(projects: LabelledProject[], issues: JiraIssue[]) {
  return projects
    .map((project) => {
      const labels = new Set(project.labels);
      const tasks: MyJiraTask[] = issues
        .filter((issue) => issue.labels.some((label) => labels.has(label)))
        .map((issue) => ({
          key: issue.key,
          url: issue.url,
          summary: issue.summary,
          status: issue.status,
          statusCategory: issue.statusCategory ?? null,
          priority: issue.priority,
          issueType: issue.issueType,
          updatedAt: issue.updatedAt.toISOString(),
        }));
      return { project: { id: project.id, code: project.code, name: project.name }, tasks };
    })
    .filter((group) => group.tasks.length > 0);
}

type CacheEntry = { at: number; issues: JiraIssue[]; truncated: boolean };
const cache = new Map<string, CacheEntry>();

/** The search answer from the cache while fresh, otherwise from `search`; failures are not kept. */
export async function cachedSearch(key: string, now: number, search: () => Promise<{ issues: JiraIssue[]; total: number }>) {
  const hit = cache.get(key);
  if (hit && now - hit.at < MY_JIRA_TASKS_TTL_MS) return { ...hit, cached: true };
  const { issues, total } = await search();
  const entry = { at: now, issues: issues.slice(0, MY_JIRA_TASKS_LIMIT), truncated: Math.max(total, issues.length) > MY_JIRA_TASKS_LIMIT };
  cache.set(key, entry);
  // Old answers go when the cache grows: a login seldom changes, the labels do now and then.
  if (cache.size > 500) for (const [stale, value] of cache) if (now - value.at >= MY_JIRA_TASKS_TTL_MS) cache.delete(stale);
  return { ...entry, cached: false };
}

export function forgetCachedSearches(login: string) {
  for (const key of cache.keys()) if (key.includes(`|${login}|`)) cache.delete(key);
}
