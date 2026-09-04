import type { JiraChangelogPage } from "./jira-model.js";

export function jiraChangelogPageComplete(
  changelog: JiraChangelogPage | undefined,
) {
  if (!changelog || (changelog.startAt ?? 0) !== 0) return false;
  if (changelog.total !== undefined) return changelog.histories.length >= changelog.total;
  if (changelog.maxResults !== undefined) {
    return changelog.histories.length < changelog.maxResults;
  }
  return true;
}
