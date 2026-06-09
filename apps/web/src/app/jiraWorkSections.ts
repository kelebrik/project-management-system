import type { JiraWorkSection } from "./domainTypes";
import type { JiraWorkSectionDraft } from "./formState";

export const JIRA_WORK_SECTION_COUNT = 5;

export function defaultJiraWorkSectionTitle(sortOrder: number) {
  return `Раздел ${sortOrder + 1}`;
}

export function normalizeJiraWorkSectionDrafts(
  sections: JiraWorkSection[] = [],
): JiraWorkSectionDraft[] {
  const byOrder = new Map(sections.map((section) => [section.sortOrder, section]));
  return Array.from({ length: JIRA_WORK_SECTION_COUNT }, (_, sortOrder) => {
    const section = byOrder.get(sortOrder);
    return {
      id: section?.id ?? null,
      sortOrder,
      title: section?.title || defaultJiraWorkSectionTitle(sortOrder),
      jql: section?.jql ?? "",
    };
  });
}
