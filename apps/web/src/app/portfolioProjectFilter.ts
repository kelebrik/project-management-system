import type { ProjectListItem } from "./domainTypes";
import { getActiveProjects } from "./portfolioModels";

export type PortfolioProjectFilterOption = Pick<
  ProjectListItem,
  "id" | "code" | "name" | "portfolio"
>;

export function createPortfolioProjectFilterOptions(
  projects: ProjectListItem[],
): PortfolioProjectFilterOption[] {
  return getActiveProjects(projects)
    .map(({ id, code, name, portfolio }) => ({ id, code, name, portfolio }))
    .sort(
      (left, right) =>
        left.portfolio.localeCompare(right.portfolio, "ru") ||
        left.name.localeCompare(right.name, "ru") ||
        left.code.localeCompare(right.code, "ru") ||
        left.id.localeCompare(right.id, "ru"),
    );
}

export function selectedPortfolioProjectIds(
  options: PortfolioProjectFilterOption[],
  excludedProjectIds: ReadonlySet<string>,
) {
  return new Set(
    options
      .filter((project) => !excludedProjectIds.has(project.id))
      .map((project) => project.id),
  );
}

export function filterPortfolioRowsByProject<T extends { projectId: string }>(
  rows: T[],
  selectedProjectIds: ReadonlySet<string>,
) {
  return rows.filter((row) => selectedProjectIds.has(row.projectId));
}
