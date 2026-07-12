import type { Issue, ProjectDetails, RaidItem, WbsItem } from "./domainTypes";

export type ReportPeriodDays = 7 | 14 | 30;

export type ReportOptions = {
  risks: boolean;
  problems: boolean;
  issues: boolean;
};

export type ReportTask = Pick<WbsItem, "id" | "code" | "title" | "owner" | "status"> & {
  reportStartDate: string | null;
  reportEndDate: string | null;
  workPackage: {
    code: string;
    title: string;
  } | null;
};

export type ProjectReport = {
  generatedAt: Date;
  periodDays: ReportPeriodDays;
  pastStart: Date;
  futureEnd: Date;
  done: ReportTask[];
  inProgress: ReportTask[];
  upcoming: ReportTask[];
  risks: RaidItem[];
  problems: RaidItem[];
  issues: Issue[];
};

const DAY_MS = 86_400_000;
const ACTIVE_WBS_STATUSES = new Set(["IN_PROGRESS", "IN_REVIEW", "AT_RISK", "BLOCKED"]);
const REPORTABLE_WBS_TYPES = new Set(["TASK", "DELIVERABLE", "MILESTONE", "GOAL"]);

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function parseDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function inRange(value: string | null, start: Date, end: Date) {
  const parsed = parseDate(value);
  return Boolean(parsed && parsed >= start && parsed <= end);
}

function taskDate(item: WbsItem, preference: "start" | "due") {
  if (preference === "start") return item.forecastStartDate ?? item.startDate;
  return item.forecastDueDate ?? item.dueDate;
}

function taskOverlapsPeriod(item: WbsItem, periodStart: Date, periodEnd: Date) {
  const taskStart = parseDate(taskDate(item, "start"));
  const taskEnd = parseDate(taskDate(item, "due"));
  if (!taskStart && !taskEnd) return true;
  if (taskStart && taskStart > periodEnd) return false;
  if (taskEnd && taskEnd < periodStart) return false;
  return true;
}

function workPackageFor(item: WbsItem, itemsById: Map<string, WbsItem>) {
  let current: WbsItem | undefined = item;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.type === "WORK_PACKAGE") {
      return { code: current.code, title: current.title };
    }
    current = current.parentId ? itemsById.get(current.parentId) : undefined;
  }
  return null;
}

function toReportTask(item: WbsItem, itemsById: Map<string, WbsItem>): ReportTask {
  const reportStartDate = item.forecastStartDate ?? item.startDate;
  const reportEndDate =
    (item.status === "DONE" ? item.closedAt : null) ??
    item.forecastDueDate ??
    item.dueDate;
  return {
    id: item.id,
    code: item.code,
    title: item.title,
    owner: item.owner,
    status: item.status,
    reportStartDate,
    reportEndDate,
    workPackage: workPackageFor(item, itemsById),
  };
}

function reportableWbsItems(items: WbsItem[]) {
  const parentIds = new Set(items.map((item) => item.parentId).filter(Boolean));
  return items.filter(
    (item) =>
      item.status !== "CANCELLED" &&
      REPORTABLE_WBS_TYPES.has(item.type) &&
      !parentIds.has(item.id),
  );
}

function byDueDate(left: ReportTask, right: ReportTask) {
  const leftTime = parseDate(left.reportEndDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightTime = parseDate(right.reportEndDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  return leftTime - rightTime || left.code.localeCompare(right.code, "ru");
}

function activeRaid(item: RaidItem) {
  return item.status !== "CLOSED" && item.status !== "VALIDATED";
}

function openIssue(item: Issue) {
  return item.status !== "Closed" && item.status !== "Resolved";
}

export function createProjectReport(
  project: ProjectDetails,
  periodDays: ReportPeriodDays,
  options: ReportOptions,
  now = new Date(),
): ProjectReport {
  const generatedAt = startOfDay(now);
  const pastStart = new Date(generatedAt.getTime() - (periodDays - 1) * DAY_MS);
  const futureEnd = new Date(generatedAt.getTime() + periodDays * DAY_MS);
  const tasks = reportableWbsItems(project.wbsItems);
  const itemsById = new Map(project.wbsItems.map((item) => [item.id, item]));

  const done = tasks
    .filter(
      (item) =>
        item.status === "DONE" &&
        inRange(item.closedAt, pastStart, generatedAt),
    )
    .map((item) => toReportTask(item, itemsById))
    .sort(byDueDate);
  const inProgress = tasks
    .filter(
      (item) =>
        ACTIVE_WBS_STATUSES.has(item.status) &&
        taskOverlapsPeriod(item, pastStart, generatedAt),
    )
    .map((item) => toReportTask(item, itemsById))
    .sort(byDueDate);
  const upcoming = tasks
    .filter(
      (item) =>
        item.status === "NOT_STARTED" &&
        (inRange(taskDate(item, "start"), generatedAt, futureEnd) ||
          (!taskDate(item, "start") && inRange(taskDate(item, "due"), generatedAt, futureEnd))),
    )
    .map((item) => toReportTask(item, itemsById))
    .sort(byDueDate);

  return {
    generatedAt,
    periodDays,
    pastStart,
    futureEnd,
    done,
    inProgress,
    upcoming,
    risks: options.risks
      ? project.raidItems.filter((item) => item.type === "RISK" && activeRaid(item))
      : [],
    problems: options.problems
      ? project.raidItems.filter((item) => item.type === "DEPENDENCY" && activeRaid(item))
      : [],
    issues: options.issues ? project.issues.filter(openIssue) : [],
  };
}

function textDate(value: Date | string | null) {
  if (!value) return "срок не задан";
  return new Intl.DateTimeFormat("ru-RU").format(new Date(value));
}

function taskLines(items: ReportTask[]) {
  if (items.length === 0) return ["- Нет данных"];
  return items.map(
    (item) =>
      `- ${item.code} ${item.title}; пакет: ${item.workPackage ? `${item.workPackage.code} ${item.workPackage.title}` : "не задан"}; начало: ${textDate(item.reportStartDate)}; завершение: ${textDate(item.reportEndDate)}; исполнитель: ${item.owner || "не задан"}`,
  );
}

export function projectReportText(project: ProjectDetails, report: ProjectReport) {
  const lines = [
    `Статус-отчёт: ${project.code} ${project.name}`,
    `Период: ${textDate(report.pastStart)} - ${textDate(report.generatedAt)}`,
    "",
    "Что сделано",
    ...taskLines(report.done),
    "",
    "Что в работе",
    ...taskLines(report.inProgress),
    "",
    "Что предстоит сделать",
    ...taskLines(report.upcoming),
  ];

  if (report.risks.length > 0) {
    lines.push("", "Риски", ...report.risks.map((item) => `- ${item.title} (риск ${item.riskScore})`));
  }
  if (report.problems.length > 0) {
    lines.push("", "Проблемы", ...report.problems.map((item) => `- ${item.title}`));
  }
  if (report.issues.length > 0) {
    lines.push("", "Вопросы", ...report.issues.map((item) => `- ${item.title} (${item.status})`));
  }
  return lines.join("\n");
}
