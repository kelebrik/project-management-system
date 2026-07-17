import type { JiraWorkSection } from "./domainTypes";
import type { JiraWorkSectionDraft } from "./formState";

export const DEFAULT_JIRA_WORK_SECTION_COUNT = 3;

export function defaultJiraWorkSectionTitle(sortOrder: number) {
  return `Раздел ${sortOrder + 1}`;
}

export function normalizeJiraWorkSectionDrafts(
  sections: JiraWorkSection[] = [],
): JiraWorkSectionDraft[] {
  const byOrder = new Map(sections.map((section) => [section.sortOrder, section]));
  const maxSortOrder = Math.max(
    DEFAULT_JIRA_WORK_SECTION_COUNT - 1,
    ...sections.map((section) => section.sortOrder),
  );

  return Array.from({ length: maxSortOrder + 1 }, (_, sortOrder) => {
    const section = byOrder.get(sortOrder);
    return {
      id: section?.id ?? null,
      sortOrder,
      title: section?.title || defaultJiraWorkSectionTitle(sortOrder),
      jql: section?.jql ?? "",
      filterUrl: section?.filterUrl ?? "",
    };
  }).sort((left, right) => left.sortOrder - right.sortOrder);
}
