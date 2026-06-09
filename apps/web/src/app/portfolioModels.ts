import type { ProjectListItem } from "./domainTypes";

export function getActiveProjects(projects: ProjectListItem[]) {
  return projects.filter((item) => item.status !== "CLOSED");
}

export function getClosedProjects(projects: ProjectListItem[]) {
  return projects.filter((item) => item.status === "CLOSED");
}

export function getRecentProjects(
  projects: ProjectListItem[],
  recentProjectIds: string[],
) {
  return recentProjectIds
    .map((projectId) => projects.find((item) => item.id === projectId))
    .filter((item): item is ProjectListItem => Boolean(item))
    .slice(0, 4);
}

export function filterProjectOptions(
  activeProjects: ProjectListItem[],
  projectSearch: string,
) {
  const query = projectSearch.trim().toLowerCase();
  if (!query) return activeProjects;
  return activeProjects.filter((item) =>
    [item.code, item.name, item.projectManager, item.portfolio, item.summary]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query)),
  );
}

export function createPortfolioStats(projects: ProjectListItem[]) {
  const activeProjects = projects.filter((item) => item.status === "ACTIVE").length;
  const redProjects = projects.filter((item) => item.rag === "RED").length;
  const amberProjects = projects.filter((item) => item.rag === "AMBER").length;
  const openIssues = projects.reduce((sum, item) => sum + item._count.issues, 0);
  const averageProgress =
    projects.length === 0
      ? 0
      : Math.round(
          projects.reduce((sum, item) => sum + item.progress, 0) /
            projects.length,
        );

  return {
    activeProjects,
    redProjects,
    amberProjects,
    openIssues,
    averageProgress,
  };
}
