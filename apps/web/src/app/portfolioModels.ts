import type { ProjectListItem, WbsItem } from "./domainTypes";
import { addCalendarMonths, signedDaysBetween, startOfDay } from "./dateUtils";

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
  delayDays: number | null;
  offset: number;
};

export type PortfolioGoalTimelineModel = {
  items: PortfolioGoalTimelineItem[];
  startDate: Date;
  endDate: Date;
  todayOffset: number;
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

export function createPortfolioGoalTimeline(
  projects: ProjectListItem[],
  today = new Date(),
) {
  const todayDate = startOfDay(today);
  const startDate = addCalendarMonths(todayDate, -4);
  const endDate = addCalendarMonths(todayDate, 8);
  const totalMs = Math.max(1, endDate.getTime() - startDate.getTime());
  const offsetForDate = (value: Date) =>
    Math.min(
      100,
      Math.max(
        0,
        ((value.getTime() - startDate.getTime()) / totalMs) * 100,
      ),
    );
  const monthTicks: PortfolioGoalTimelineModel["monthTicks"] = [];
  for (
    let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    cursor <= endDate;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    monthTicks.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      label: monthTickLabel(cursor),
      offset: offsetForDate(cursor),
    });
  }

  const activeProjects = projects.filter((project) => project.status !== "CLOSED");
  const rawItems = activeProjects.flatMap((project) =>
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
          baselineDueDateValue: validDay(item.baselineDueDate),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  );
  const visibleItems = rawItems.filter(
    (item) =>
      item.dueDate.getTime() >= startDate.getTime() &&
      item.dueDate.getTime() <= endDate.getTime(),
  );

  return {
    startDate,
    endDate,
    todayOffset: offsetForDate(todayDate),
    monthTicks,
    items: visibleItems
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
        delayDays: item.baselineDueDateValue
          ? signedDaysBetween(item.baselineDueDateValue, item.dueDate)
          : null,
        offset: offsetForDate(item.dueDate),
      })),
  } satisfies PortfolioGoalTimelineModel;
}
