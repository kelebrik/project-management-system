import type { ProjectListItem, WbsItem } from "./domainTypes";
import { startOfDay } from "./dateUtils";

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

export type PortfolioGoalTimelineItem = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  goalTitle: string;
  status: WbsItem["status"];
  dueDate: string;
  baselineDueDate: string | null;
  offset: number;
};

export type PortfolioGoalTimelineModel = {
  items: PortfolioGoalTimelineItem[];
  startDate: Date | null;
  endDate: Date | null;
  monthTicks: Array<{
    key: string;
    label: string;
    offset: number;
  }>;
};

function validDay(value: string | null | undefined) {
  if (!value) return null;
  const parsed = startOfDay(new Date(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function monthTickLabel(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "short",
    year: "2-digit",
  }).format(value);
}

function addTimelinePadding(startDate: Date, endDate: Date) {
  if (startDate.getTime() === endDate.getTime()) {
    return {
      startDate: new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate() - 14,
      ),
      endDate: new Date(
        endDate.getFullYear(),
        endDate.getMonth(),
        endDate.getDate() + 14,
      ),
    };
  }

  return { startDate, endDate };
}

export function createPortfolioGoalTimeline(projects: ProjectListItem[]) {
  const childProjects = projects.filter(
    (project) => project.status !== "CLOSED" && Boolean(project.parentId),
  );
  const rawItems = childProjects.flatMap((project) =>
    (project.wbsItems ?? [])
      .filter((item) => item.type === "GOAL" && item.status !== "CANCELLED")
      .map((item) => {
        const dueDate = validDay(item.dueDate ?? item.forecastDueDate);
        if (!dueDate) return null;
        return {
          id: item.id,
          projectId: project.id,
          projectCode: project.code,
          projectName: project.name,
          goalTitle: item.title,
          status: item.status,
          dueDate,
          dueDateSource: item.dueDate ?? item.forecastDueDate ?? "",
          baselineDueDate: item.baselineDueDate,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  );

  if (rawItems.length === 0) {
    return {
      items: [],
      startDate: null,
      endDate: null,
      monthTicks: [],
    } satisfies PortfolioGoalTimelineModel;
  }

  const minDate = rawItems.reduce(
    (min, item) => item.dueDate.getTime() < min.getTime() ? item.dueDate : min,
    rawItems[0].dueDate,
  );
  const maxDate = rawItems.reduce(
    (max, item) => item.dueDate.getTime() > max.getTime() ? item.dueDate : max,
    rawItems[0].dueDate,
  );
  const padded = addTimelinePadding(minDate, maxDate);
  const totalMs = Math.max(
    1,
    padded.endDate.getTime() - padded.startDate.getTime(),
  );
  const offsetForDate = (value: Date) =>
    Math.min(
      100,
      Math.max(
        0,
        ((value.getTime() - padded.startDate.getTime()) / totalMs) * 100,
      ),
    );

  const monthTicks: PortfolioGoalTimelineModel["monthTicks"] = [];
  for (
    let cursor = new Date(
      padded.startDate.getFullYear(),
      padded.startDate.getMonth(),
      1,
    );
    cursor <= padded.endDate;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    monthTicks.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      label: monthTickLabel(cursor),
      offset: offsetForDate(cursor),
    });
  }

  return {
    startDate: padded.startDate,
    endDate: padded.endDate,
    monthTicks,
    items: rawItems
      .sort(
        (left, right) =>
          left.dueDate.getTime() - right.dueDate.getTime() ||
          left.projectCode.localeCompare(right.projectCode, "ru") ||
          left.goalTitle.localeCompare(right.goalTitle, "ru"),
      )
      .map((item) => ({
        id: item.id,
        projectId: item.projectId,
        projectCode: item.projectCode,
        projectName: item.projectName,
        goalTitle: item.goalTitle,
        status: item.status,
        dueDate: item.dueDateSource,
        baselineDueDate: item.baselineDueDate,
        offset: offsetForDate(item.dueDate),
      })),
  } satisfies PortfolioGoalTimelineModel;
}
