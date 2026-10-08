import type { Issue } from "./domainTypes";

/**
 * Issues without a section come first and carry no heading; a section heading
 * appears only once an issue is given a section.
 */
export function issueSectionGroups(issues: Issue[]): Array<[string | null, Issue[]]> {
  const unsectioned: Issue[] = [];
  const sections = new Map<string, Issue[]>();
  for (const issue of issues) {
    const category = issue.category.trim();
    if (!category || category === "Без раздела") {
      unsectioned.push(issue);
      continue;
    }
    sections.set(category, [...(sections.get(category) ?? []), issue]);
  }
  return [
    ...(unsectioned.length > 0 ? [[null, unsectioned] as [null, Issue[]]] : []),
    ...sections.entries(),
  ];
}
