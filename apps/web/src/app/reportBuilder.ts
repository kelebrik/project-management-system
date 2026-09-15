import type { Issue, ProjectDetails, RaidItem, WbsItem } from "./domainTypes";
import { createDomainLabels } from "../i18n/domainLabels";
import { createTranslator } from "../i18n/translate";
import { createFormatters } from "../i18n/formatters";
import type { Locale, SimpleTranslationKey } from "../i18n/types";

export type ReportPeriodDays = 7 | 14;
export type ReportKind = "tasks" | "raid" | "issues";
export type ReportActivity = "opened" | "closed";
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

const REPORT_FIELD_DEFINITIONS = {
    tasks: [
    { key: "workPackage", labelKey: "report.field.workPackage" },
    { key: "task", labelKey: "report.field.task" },
    { key: "status", labelKey: "report.field.status" },
    { key: "startDate", labelKey: "report.field.startDate" },
    { key: "endDate", labelKey: "report.field.endDate" },
    { key: "owner", labelKey: "report.field.assignee" },
    ],
    raid: [
    { key: "type", labelKey: "report.field.type" },
    { key: "title", labelKey: "report.field.name" },
    { key: "status", labelKey: "report.field.status" },
    { key: "owner", labelKey: "report.field.owner" },
    { key: "riskScore", labelKey: "report.field.score" },
    { key: "dueDate", labelKey: "report.field.dueDate" },
    { key: "impact", labelKey: "report.field.impact" },
    ],
    issues: [
    { key: "title", labelKey: "report.field.issue" },
    { key: "status", labelKey: "report.field.status" },
    { key: "severity", labelKey: "report.field.severity" },
    { key: "owner", labelKey: "report.field.owner" },
    { key: "dueDate", labelKey: "report.field.dueDate" },
    { key: "impact", labelKey: "report.field.impact" },
    { key: "decisionRequired", labelKey: "report.field.decisionRequired" },
    ],
  } as const;

export const REPORT_FIELD_ORDER = Object.fromEntries(Object.entries(REPORT_FIELD_DEFINITIONS).map(([kind, fields]) => [kind, fields.map((field) => field.key)])) as Record<ReportKind, ReportFieldKey[]>;

export function localizedReportFields(locale: Locale): Record<ReportKind, ReportFieldDefinition[]> {
  const t = createTranslator(locale);
  return Object.fromEntries(Object.entries(REPORT_FIELD_DEFINITIONS).map(([kind, fields]) => [kind, fields.map((field: { key: ReportFieldKey; labelKey: SimpleTranslationKey }) => ({ key: field.key, label: t(field.labelKey) }))])) as Record<ReportKind, ReportFieldDefinition[]>;
}

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
  activityStart: Date;
  done: ReportTask[];
  inProgress: ReportTask[];
  upcoming: ReportTask[];
  raidItems: RaidItem[];
  openIssues: Issue[];
  recentRaidItems: RaidItem[];
  closedRaidItems: RaidItem[];
  recentOpenIssues: Issue[];
  closedIssues: Issue[];
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

function isClosedRaidItem(item: RaidItem) {
  return (
    (item.type === "RISK" || item.type === "DEPENDENCY") &&
    (item.status === "CLOSED" || item.status === "VALIDATED")
  );
}

function latestStatusDate(item: RaidItem | Issue) {
  return (item.statusUpdates ?? [])
    .map((update) => parseDate(update.statusAt))
    .filter((value): value is Date => value !== null)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
}

function createdDate(item: RaidItem | Issue) {
  return parseDate(item.createdAt ?? null) ?? latestStatusDate(item);
}

function closedDate(item: RaidItem | Issue) {
  if ("validationDate" in item) {
    return (
      parseDate(item.validationDate) ??
      parseDate(item.updatedAt ?? null) ??
      latestStatusDate(item)
    );
  }
  return parseDate(item.updatedAt ?? null) ?? latestStatusDate(item);
}

function dateInRange(value: Date | null, start: Date, end: Date) {
  return Boolean(value && value >= start && value <= end);
}

export function createProjectReport(
  project: ProjectDetails,
  periodDays: ReportPeriodDays,
  now = new Date(),
): ProjectReport {
  const generatedAt = startOfDay(now);
  const pastStart = new Date(generatedAt.getTime() - (periodDays - 1) * DAY_MS);
  const futureEnd = new Date(generatedAt.getTime() + periodDays * DAY_MS);
  const activityStart = new Date(generatedAt.getTime() - 13 * DAY_MS);
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
    activityStart,
    done,
    inProgress,
    upcoming,
    raidItems: project.raidItems.filter(isOpenRaidItem),
    openIssues: project.issues.filter(isOpenIssue),
    recentRaidItems: project.raidItems.filter(
      (item) => isOpenRaidItem(item) && dateInRange(createdDate(item), activityStart, generatedAt),
    ),
    closedRaidItems: project.raidItems.filter(
      (item) => isClosedRaidItem(item) && dateInRange(closedDate(item), activityStart, generatedAt),
    ),
    recentOpenIssues: project.issues.filter(
      (item) => isOpenIssue(item) && dateInRange(createdDate(item), activityStart, generatedAt),
    ),
    closedIssues: (project.closedIssues ?? []).filter((item) =>
      dateInRange(closedDate(item), activityStart, generatedAt),
    ),
  };
}

function textDate(value: Date | string | null, locale: Locale) {
  const t = createTranslator(locale);
  if (!value) return t("report.dateNotSet");
  return createFormatters(locale).date(value);
}

function fieldLabel(kind: ReportKind, field: ReportFieldKey, locale: Locale) {
  return localizedReportFields(locale)[kind].find((item) => item.key === field)?.label ?? field;
}

export function reportFieldText(
  kind: ReportKind,
  field: ReportFieldKey,
  item: ReportTask | RaidItem | Issue,
  locale: Locale,
) {
  const t = createTranslator(locale);
  const { issueSeverityLabel, issueStatusLabel, raidStatusLabel, raidTypeLabel, wbsStatusLabel } = createDomainLabels(locale);
  if (kind === "tasks") {
    const task = item as ReportTask;
    switch (field) {
      case "workPackage":
        return task.workPackage
          ? `${task.workPackage.code} ${task.workPackage.title}`
          : t("report.ownerNotSet");
      case "task":
        return `${task.code} ${task.title}`;
      case "status":
        return wbsStatusLabel(task.status);
      case "startDate":
        return textDate(task.reportStartDate, locale);
      case "endDate":
        return textDate(task.reportEndDate, locale);
      case "owner":
        return task.owner || t("report.ownerNotSet");
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
        return raid.owner || t("report.ownerNotSet");
      case "riskScore":
        return String(raid.riskScore);
      case "dueDate":
        return textDate(raid.dueDate, locale);
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
      return issue.owner || t("report.ownerNotSet");
    case "dueDate":
      return textDate(issue.dueDate, locale);
    case "impact":
      return issue.impact || t("report.valueNotSet");
    case "decisionRequired":
      return issue.decisionRequired ? t("report.yes") : t("report.no");
    default:
      return "—";
  }
}

function customLines(
  kind: ReportKind,
  fields: ReportFieldKey[],
  items: Array<ReportTask | RaidItem | Issue>,
  locale: Locale,
) {
  const t = createTranslator(locale);
  if (items.length === 0) return [t("report.emptyData")];
  return items.map((item) =>
    fields
      .map((field) => {
        const value = reportFieldText(kind, field, item, locale);
        return `${fieldLabel(kind, field, locale)}: ${value}`;
      })
      .join("; "),
  ).map((line) => `- ${line}`);
}

export function projectReportText(
  project: ProjectDetails,
  report: ProjectReport,
  kind: ReportKind = "tasks",
  fields: ReportFieldKey[] = DEFAULT_REPORT_FIELDS.tasks,
  activity: ReportActivity = "opened",
  locale: Locale,
) {
  const t = createTranslator(locale);
  const lines = [
    t("report.textTitle", { code: project.code, name: project.name }),
  ];

  if (kind === "tasks") {
    lines.push(
      t("report.period", { start: textDate(report.pastStart, locale), end: textDate(report.generatedAt, locale) }),
      "",
      t("report.section.done"),
      ...customLines("tasks", fields, report.done, locale),
      "",
      t("report.section.active"),
      ...customLines("tasks", fields, report.inProgress, locale),
      "",
      t("report.section.upcoming"),
      ...customLines("tasks", fields, report.upcoming, locale),
    );
  } else if (kind === "raid") {
    const items = activity === "closed" ? report.closedRaidItems : report.recentRaidItems;
    lines.push(
      t("report.period", { start: textDate(report.activityStart, locale), end: textDate(report.generatedAt, locale) }),
      "",
      activity === "closed" ? t("report.section.closedRaid") : t("report.section.openRaid"),
      ...customLines("raid", fields, items, locale),
    );
  } else {
    const items = activity === "closed" ? report.closedIssues : report.recentOpenIssues;
    lines.push(
      t("report.period", { start: textDate(report.activityStart, locale), end: textDate(report.generatedAt, locale) }),
      "",
      activity === "closed" ? t("report.section.closedIssues") : t("report.section.openIssues"),
      ...customLines("issues", fields, items, locale),
    );
  }

  return lines.join("\n");
}
