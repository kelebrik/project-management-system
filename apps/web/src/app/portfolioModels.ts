import type { ProjectListItem, RaidItem, WbsItem } from "./domainTypes";
import {
  addCalendarMonths,
  signedDaysBetween,
  signedDaysUntil,
  startOfDay,
} from "./dateUtils";

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

export type PortfolioRedRaidItem = Pick<
  RaidItem,
  | "id"
  | "type"
  | "title"
  | "owner"
  | "dueDate"
  | "riskScore"
  | "scheduleImpactDays"
  | "jiraTicketKey"
  | "jiraTicketUrl"
  | "status"
> & {
  projectId: string;
  projectName: string;
};

export type PortfolioBlockingProblemProject = {
  projectId: string;
  projectName: string;
  problems: PortfolioRedRaidItem[];
};

export type PortfolioBlockingProblemGroup = {
  portfolio: string;
  projectCount: number;
  projects: PortfolioBlockingProblemProject[];
};

export type PortfolioKeyRiskProject = {
  projectId: string;
  projectName: string;
  risks: PortfolioRedRaidItem[];
};

export type PortfolioKeyRiskGroup = {
  portfolio: string;
  projectCount: number;
  projects: PortfolioKeyRiskProject[];
};

export type PortfolioSummary = {
  projectCount: number;
  redRiskCount: number;
  blockerCount: number;
  delayedGoalCount: number;
};

export type PortfolioRedRaidProject = {
  projectId: string;
  projectName: string;
  items: PortfolioRedRaidItem[];
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

export function createPortfolioBlockingProblemGroups(projects: ProjectListItem[]) {
  const groupsByPortfolio = new Map<string, PortfolioBlockingProblemGroup>();

  const ensureGroup = (portfolio: string) => {
    const key = portfolio.trim() || "Без портфеля";
    const existing = groupsByPortfolio.get(key);
    if (existing) return existing;
    const nextGroup: PortfolioBlockingProblemGroup = {
      portfolio: key,
      projectCount: 0,
      projects: [],
    };
    groupsByPortfolio.set(key, nextGroup);
    return nextGroup;
  };

  projects
    .filter((project) => project.status !== "CLOSED")
    .forEach((project) => {
      const group = ensureGroup(project.portfolio);
      group.projectCount += 1;
      const redProblems = (project.raidItems ?? [])
        .filter(
          (item) =>
            item.type === "DEPENDENCY" &&
            item.riskScore >= 15 &&
            item.status !== "CLOSED" &&
            item.status !== "VALIDATED",
        )
        .map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          owner: item.owner,
          dueDate: item.dueDate,
          riskScore: item.riskScore,
          scheduleImpactDays: item.scheduleImpactDays,
          jiraTicketKey: item.jiraTicketKey,
          jiraTicketUrl: item.jiraTicketUrl,
          status: item.status,
          projectId: project.id,
          projectName: project.name,
        }));
      group.projects.push({
        projectId: project.id,
        projectName: project.name,
        problems: redProblems.sort(
          (left, right) =>
            right.riskScore - left.riskScore ||
            left.title.localeCompare(right.title, "ru"),
        ),
      });
    });

  return Array.from(groupsByPortfolio.values())
    .map((group) => ({
      ...group,
      projects: group.projects.sort(
        (left, right) =>
          left.projectName.localeCompare(right.projectName, "ru") ||
          left.projectId.localeCompare(right.projectId, "ru"),
      ),
    }))
    .sort((left, right) => left.portfolio.localeCompare(right.portfolio, "ru"));
}

export function createPortfolioKeyRiskGroups(projects: ProjectListItem[]) {
  const groupsByPortfolio = new Map<string, PortfolioKeyRiskGroup>();

  const ensureGroup = (portfolio: string) => {
    const key = portfolio.trim() || "Без портфеля";
    const existing = groupsByPortfolio.get(key);
    if (existing) return existing;
    const nextGroup: PortfolioKeyRiskGroup = {
      portfolio: key,
      projectCount: 0,
      projects: [],
    };
    groupsByPortfolio.set(key, nextGroup);
    return nextGroup;
  };

  projects
    .filter((project) => project.status !== "CLOSED")
    .forEach((project) => {
      const group = ensureGroup(project.portfolio);
      group.projectCount += 1;
      const redRisks = (project.raidItems ?? [])
        .filter(
          (item) =>
            item.type === "RISK" &&
            item.riskScore >= 15 &&
            item.status !== "CLOSED" &&
            item.status !== "VALIDATED",
        )
        .map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          owner: item.owner,
          dueDate: item.dueDate,
          riskScore: item.riskScore,
          scheduleImpactDays: item.scheduleImpactDays,
          jiraTicketKey: item.jiraTicketKey,
          jiraTicketUrl: item.jiraTicketUrl,
          status: item.status,
          projectId: project.id,
          projectName: project.name,
        }));
      group.projects.push({
        projectId: project.id,
        projectName: project.name,
        risks: redRisks.sort(
          (left, right) =>
            right.riskScore - left.riskScore ||
            left.title.localeCompare(right.title, "ru"),
        ),
      });
    });

  return Array.from(groupsByPortfolio.values())
    .map((group) => ({
      ...group,
      projects: group.projects.sort(
        (left, right) =>
          left.projectName.localeCompare(right.projectName, "ru") ||
          left.projectId.localeCompare(right.projectId, "ru"),
      ),
    }))
    .sort((left, right) => left.portfolio.localeCompare(right.portfolio, "ru"));
}

export function createPortfolioSummary(
  projects: ProjectListItem[],
  goalTimeline: PortfolioGoalTimelineModel,
) {
  const activeProjects = projects.filter((project) => project.status !== "CLOSED");
  const activeRaidItems = activeProjects.flatMap((project) => project.raidItems ?? []);
  return {
    projectCount: activeProjects.length,
    redRiskCount: activeRaidItems.filter(
      (item) =>
        item.type === "RISK" &&
        item.riskScore >= 15 &&
        item.status !== "CLOSED" &&
        item.status !== "VALIDATED",
    ).length,
    blockerCount: activeRaidItems.filter(
      (item) =>
        item.type === "DEPENDENCY" &&
        item.riskScore >= 15 &&
        item.status !== "CLOSED" &&
        item.status !== "VALIDATED",
    ).length,
    delayedGoalCount: goalTimeline.items.filter(
      (item) => item.delayDays !== null && item.delayDays > 0,
    ).length,
  } satisfies PortfolioSummary;
}

export function visiblePortfolioBlockingProblemProjects(
  groups: PortfolioBlockingProblemGroup[],
) {
  return groups.flatMap((group) =>
    group.projects
      .filter((project) => project.problems.length > 0)
      .map((project) => ({
        projectId: project.projectId,
        projectName: project.projectName,
        items: project.problems,
      })),
  );
}

export function visiblePortfolioKeyRiskProjects(
  groups: PortfolioKeyRiskGroup[],
) {
  return groups.flatMap((group) =>
    group.projects
      .filter((project) => project.risks.length > 0)
      .map((project) => ({
        projectId: project.projectId,
        projectName: project.projectName,
        items: project.risks,
      })),
  );
}

export function createPortfolioRedZoneProjectIds(
  problemProjects: PortfolioRedRaidProject[],
  riskProjects: PortfolioRedRaidProject[],
) {
  return new Set([
    ...problemProjects.map((project) => project.projectId),
    ...riskProjects.map((project) => project.projectId),
  ]);
}

export function sortPortfolioRedRaidItems(items: PortfolioRedRaidItem[]) {
  return [...items].sort((left, right) => {
    const leftDue = signedDaysUntil(left.dueDate);
    const rightDue = signedDaysUntil(right.dueDate);
    return (
      right.riskScore - left.riskScore ||
      (leftDue ?? Number.POSITIVE_INFINITY) -
        (rightDue ?? Number.POSITIVE_INFINITY) ||
      left.title.localeCompare(right.title, "ru")
    );
  });
}
