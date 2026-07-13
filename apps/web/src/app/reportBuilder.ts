import type { Issue, ProjectDetails, RaidItem, WbsItem } from "./domainTypes";
import {
  issueSeverityLabel,
  issueStatusLabel,
  raidStatusLabel,
  raidTypeLabel,
  wbsStatusLabel,
} from "./labels";

export type ReportPeriodDays = 7 | 14;
export type ReportKind = "tasks" | "raid" | "issues";
export type ReportFieldKey =
  | "workPackage"
  | "task"
  | "status"
  | "startDate"
  | "endDate"
  | "owner"
  | "type"
  | "title"
  | "riskScore"
  | "dueDate"
  | "impact"
  | "severity"
  | "decisionRequired";

export type ReportFieldDefinition = {
  key: ReportFieldKey;
  label: string;
};

export const REPORT_FIELDS: Record<ReportKind, ReportFieldDefinition[]> = {
  tasks: [
    { key: "workPackage", label: "Пакет работ" },
    { key: "task", label: "Задача" },
    { key: "status", label: "Статус" },
    { key: "startDate", label: "Дата начала" },
    { key: "endDate", label: "Дата завершения" },
    { key: "owner", label: "Исполнитель" },
  ],
  raid: [
    { key: "type", label: "Тип" },
    { key: "title", label: "Наименование" },
    { key: "status", label: "Статус" },
    { key: "owner", label: "Ответственный" },
    { key: "riskScore", label: "Оценка" },
    { key: "dueDate", label: "Срок" },
    { key: "impact", label: "Влияние" },
  ],
  issues: [
    { key: "title", label: "Вопрос" },
    { key: "status", label: "Статус" },
    { key: "severity", label: "Критичность" },
    { key: "owner", label: "Ответственный" },
    { key: "dueDate", label: "Срок" },
    { key: "impact", label: "Влияние" },
    { key: "decisionRequired", label: "Требуется решение" },
  ],
};

export const DEFAULT_REPORT_FIELDS: Record<ReportKind, ReportFieldKey[]> = {
  tasks: ["workPackage", "task", "status", "startDate", "endDate", "owner"],
  raid: ["type", "title", "status", "owner", "riskScore", "dueDate"],
  issues: ["title", "status", "severity", "owner", "dueDate"],
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
  raidItems: RaidItem[];
  openIssues: Issue[];
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

function isOpenRaidItem(item: RaidItem) {
  return (
    (item.type === "RISK" || item.type === "DEPENDENCY") &&
    item.status !== "CLOSED" &&
    item.status !== "VALIDATED"
  );
}

function isOpenIssue(item: Issue) {
  const status = item.status.trim().toLowerCase();
  return status !== "closed" && status !== "resolved";
}

export function createProjectReport(
  project: ProjectDetails,
  periodDays: ReportPeriodDays,
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
    raidItems: project.raidItems.filter(isOpenRaidItem),
    openIssues: project.issues.filter(isOpenIssue),
  };
}

function textDate(value: Date | string | null) {
  if (!value) return "срок не задан";
  return new Intl.DateTimeFormat("ru-RU").format(new Date(value));
}

function fieldLabel(kind: ReportKind, field: ReportFieldKey) {
  return REPORT_FIELDS[kind].find((item) => item.key === field)?.label ?? field;
}

export function reportFieldText(
  kind: ReportKind,
  field: ReportFieldKey,
  item: ReportTask | RaidItem | Issue,
) {
  if (kind === "tasks") {
    const task = item as ReportTask;
    switch (field) {
      case "workPackage":
        return task.workPackage
          ? `${task.workPackage.code} ${task.workPackage.title}`
          : "не задан";
      case "task":
        return `${task.code} ${task.title}`;
      case "status":
        return wbsStatusLabel(task.status);
      case "startDate":
        return textDate(task.reportStartDate);
      case "endDate":
        return textDate(task.reportEndDate);
      case "owner":
        return task.owner || "не задан";
      default:
        return "—";
    }
  }

  if (kind === "raid") {
    const raid = item as RaidItem;
    switch (field) {
      case "type":
        return raidTypeLabel(raid.type);
      case "title":
        return raid.title;
      case "status":
        return raidStatusLabel(raid.status);
      case "owner":
        return raid.owner || "не задан";
      case "riskScore":
        return String(raid.riskScore);
      case "dueDate":
        return textDate(raid.dueDate);
      case "impact":
        return String(raid.impact);
      default:
        return "—";
    }
  }

  const issue = item as Issue;
  switch (field) {
    case "title":
      return issue.title;
    case "status":
      return issueStatusLabel(issue.status);
    case "severity":
      return issueSeverityLabel(issue.severity);
    case "owner":
      return issue.owner || "не задан";
    case "dueDate":
      return textDate(issue.dueDate);
    case "impact":
      return issue.impact || "не задано";
    case "decisionRequired":
      return issue.decisionRequired ? "Да" : "Нет";
    default:
      return "—";
  }
}

function customLines(
  kind: ReportKind,
  fields: ReportFieldKey[],
  items: Array<ReportTask | RaidItem | Issue>,
) {
  if (items.length === 0) return ["- Нет данных"];
  return items.map((item) =>
    fields
      .map((field) => {
        const value = reportFieldText(kind, field, item);
        return `${fieldLabel(kind, field)}: ${value}`;
      })
      .join("; "),
  ).map((line) => `- ${line}`);
}

export function projectReportText(
  project: ProjectDetails,
  report: ProjectReport,
  kind: ReportKind = "tasks",
  fields: ReportFieldKey[] = DEFAULT_REPORT_FIELDS.tasks,
) {
  const lines = [
    `Статус-отчёт: ${project.code} ${project.name}`,
  ];

  if (kind === "tasks") {
    lines.push(
      `Период: ${textDate(report.pastStart)} - ${textDate(report.generatedAt)}`,
      "",
      "Что сделано",
      ...customLines("tasks", fields, report.done),
      "",
      "Что в работе",
      ...customLines("tasks", fields, report.inProgress),
      "",
      "Что предстоит сделать",
      ...customLines("tasks", fields, report.upcoming),
    );
  } else if (kind === "raid") {
    lines.push(
      `Срез на: ${textDate(report.generatedAt)}`,
      "",
      "Риски и проблемы",
      ...customLines("raid", fields, report.raidItems),
    );
  } else {
    lines.push(
      `Срез на: ${textDate(report.generatedAt)}`,
      "",
      "Открытые вопросы",
      ...customLines("issues", fields, report.openIssues),
    );
  }

  return lines.join("\n");
}
