import { isJiraUnresolvedResolution, type JiraAnalyticsFilterField, type JiraAnalyticsGroupBy, type JiraAnalyticsTimeZone } from "./jira-analytics-core.js";
import type { JiraAnalyticsResultRecord } from "./jira-analytics-evaluation-types.js";

/**
 * Where a result record goes when widgets group it: one group for most
 * groupings, several for components and fix versions (a record counts in each
 * of its values), and the values of the fields kept in issue attributes.
 */

const DAY_MS = 86_400_000;

export type JiraGroupIdentity = { key: string; label: string };

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function zonedDateParts(date: Date, timeZone: JiraAnalyticsTimeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

export function isoWeek(date: Date, timeZone: JiraAnalyticsTimeZone) {
  const parts = zonedDateParts(date, timeZone);
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const weekday = localDate.getUTCDay() || 7;
  localDate.setUTCDate(localDate.getUTCDate() + 4 - weekday);
  const weekYear = localDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((localDate.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  const monday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  monday.setUTCDate(monday.getUTCDate() - weekday + 1);
  const label = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(monday);
  return { key: `${weekYear}-W${String(week).padStart(2, "0")}`, label };
}

export function isoMonth(date: Date, timeZone: JiraAnalyticsTimeZone) {
  const parts = zonedDateParts(date, timeZone);
  const label = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(parts.year, parts.month - 1, 1)));
  return { key: `${parts.year}-${String(parts.month).padStart(2, "0")}`, label };
}

/** Days from creation to resolution, or to now while open; null without a creation date. */
export function jiraIssueAgeDays(issue: { issueCreatedAt: string | null; resolutionAt: string | null }, now: Date) {
  const created = validDate(issue.issueCreatedAt);
  if (!created) return null;
  const end = validDate(issue.resolutionAt) ?? now;
  return Math.max(0, Math.floor((end.getTime() - created.getTime()) / DAY_MS));
}

export const JIRA_AGE_BUCKETS = [
  { key: "age:0-7", label: "0–7 дней", max: 7 },
  { key: "age:8-30", label: "8–30 дней", max: 30 },
  { key: "age:31-90", label: "31–90 дней", max: 90 },
  { key: "age:91+", label: "Больше 90 дней", max: Number.POSITIVE_INFINITY },
] as const;

const CATEGORY_LABELS: Record<string, string> = { new: "К выполнению", indeterminate: "В работе", done: "Готово" };

/** The values of the fields kept in issue attributes, or undefined for any other field. */
export function jiraAttributeFieldValue(record: JiraAnalyticsResultRecord, field: JiraAnalyticsFilterField) {
  const attributes = record.issue.attributes ?? null;
  if (field === "statusCategory") return attributes?.statusCategoryKey ?? null;
  if (field === "epic") return attributes?.epicKey ?? null;
  if (field === "components") return attributes?.components ?? [];
  if (field === "fixVersions") return attributes?.fixVersions ?? [];
  if (field === "storyPoints") return attributes?.storyPoints ?? null;
  if (field === "dueDate") return attributes?.dueDate ?? null;
  if (field === "ageDays") return record.ageDays ?? null;
  return undefined;
}

/** The groups a record belongs to under one grouping; an empty value has its own group. */
export function jiraGroupIdentities(record: JiraAnalyticsResultRecord, groupBy: JiraAnalyticsGroupBy, timeZone: JiraAnalyticsTimeZone, timeAt?: string | null): JiraGroupIdentity[] {
  const value = (raw: string | null | undefined, emptyLabel: string) => (raw ? { key: `value:${raw}`, label: raw } : { key: "__empty__", label: emptyLabel });
  const many = (list: string[] | undefined, emptyLabel: string) => {
    const unique = [...new Set((list ?? []).filter(Boolean))];
    return unique.length > 0 ? unique.map((entry) => ({ key: `value:${entry}`, label: entry })) : [{ key: "__empty__", label: emptyLabel }];
  };
  const attributes = record.issue.attributes ?? null;
  switch (groupBy) {
    case "goal":
      return [value(record.goal?.name, "Без цели")];
    case "project":
      return [value(record.issue.issueKey.trim().toUpperCase().match(/^([A-Z][A-Z0-9_]*)-\d+$/)?.[1], "Без проекта")];
    case "status":
      return [value(record.issue.status, "Без статуса")];
    case "assignee":
      return [value(record.issue.assignee, "Не назначен")];
    case "reporter":
      return [value(record.issue.reporter, "Без автора")];
    case "priority":
      return [value(record.issue.priority, "Без приоритета")];
    case "sprint":
      return [value(record.sprint, "Без Sprint")];
    case "issueType":
      return [value(record.issue.issueType, "Без типа")];
    case "resolution":
      return [isJiraUnresolvedResolution(record.issue.resolution) ? { key: "__empty__", label: "Без Resolution" } : value(record.issue.resolution, "Без Resolution")];
    case "fromStatus":
      return [value(record.fromStatus, "Без статуса")];
    case "toStatus":
      return [value(record.toStatus, "Без статуса")];
    case "week":
    case "month": {
      // Weeks and months follow the widget's period field (creation, resolution...), else the event time.
      const eventAt = validDate(timeAt === undefined ? record.eventAt : timeAt);
      if (!eventAt) return [{ key: "__empty__", label: "Без даты" }];
      return [groupBy === "week" ? isoWeek(eventAt, timeZone) : isoMonth(eventAt, timeZone)];
    }
    case "statusCategory": {
      const category = attributes?.statusCategoryKey;
      return [category ? { key: `value:${category}`, label: CATEGORY_LABELS[category] ?? category } : { key: "__empty__", label: "Без категории" }];
    }
    case "epic":
      return [value(attributes?.epicKey, "Без эпика")];
    case "component":
      return many(attributes?.components, "Без компонента");
    case "fixVersion":
      return many(attributes?.fixVersions, "Без версии");
    case "ageBucket": {
      const age = record.ageDays;
      if (age === null || age === undefined) return [{ key: "__empty__", label: "Без даты создания" }];
      const bucket = JIRA_AGE_BUCKETS.find((entry) => age <= entry.max)!;
      return [{ key: bucket.key, label: bucket.label }];
    }
    default:
      return [{ key: "__all__", label: "Все" }];
  }
}

/** Groupings under which one record may sit in several groups. */
export function jiraGroupingIsMultiValued(groupBy: JiraAnalyticsGroupBy) {
  return groupBy === "component" || groupBy === "fixVersion";
}

/** Groupings along time: their groups are every step of the period, empty ones too, in time order. */
export function jiraGroupingIsTime(groupBy: JiraAnalyticsGroupBy) {
  return groupBy === "week" || groupBy === "month";
}

/** Every week or month from the start of the period to now, as groups. */
export function jiraTimeSteps(groupBy: "week" | "month", from: Date, to: Date, timeZone: JiraAnalyticsTimeZone): JiraGroupIdentity[] {
  const steps = new Map<string, JiraGroupIdentity>();
  for (let at = from.getTime(); at <= to.getTime() + DAY_MS; at += DAY_MS) {
    const day = new Date(Math.min(at, to.getTime()));
    const step = groupBy === "week" ? isoWeek(day, timeZone) : isoMonth(day, timeZone);
    if (!steps.has(step.key)) steps.set(step.key, step);
  }
  return [...steps.values()];
}
