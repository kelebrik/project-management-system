import { jiraCriticalBugSlaHours } from "@pms/shared";

import type { JiraIssueSnapshot } from "./domainTypes";

export type JiraAnalyticsSource =
  | "issues"
  | "transitions"
  | "development"
  | "criticalBugs";
export type JiraAnalyticsMetric =
  | "count"
  | "averageDuration"
  | "p50Duration"
  | "p85Duration"
  | "p95Duration"
  | "commits"
  | "mergeRequests";
export type JiraAnalyticsVisualization = "number" | "bar" | "table";
export type JiraAnalyticsGroupBy =
  | "none"
  | "project"
  | "status"
  | "assignee"
  | "priority"
  | "sprint"
  | "issueType"
  | "resolution"
  | "fromStatus"
  | "toStatus"
  | "week";
export type JiraAnalyticsFilterField =
  | "status"
  | "assignee"
  | "priority"
  | "sprint"
  | "issueType"
  | "resolution"
  | "fromStatus"
  | "toStatus"
  | "durationHours"
  | "commitCount"
  | "mergeRequestCount"
  | "hasDevelopment";
export type JiraAnalyticsFilterOperator =
  | "equals"
  | "notEquals"
  | "contains"
  | "empty"
  | "notEmpty"
  | "greaterThan"
  | "atLeast";

export type JiraAnalyticsFilter = {
  id: string;
  field: JiraAnalyticsFilterField;
  operator: JiraAnalyticsFilterOperator;
  value: string;
};

export type JiraAnalyticsWidget = {
  id: string;
  title: string;
  source: JiraAnalyticsSource;
  metric: JiraAnalyticsMetric;
  groupBy: JiraAnalyticsGroupBy;
  visualization: JiraAnalyticsVisualization;
  filterLogic: "and" | "or";
  filters: JiraAnalyticsFilter[];
  width: "half" | "full";
};

export type JiraAnalyticsDashboardConfig = {
  version: 1;
  periodDays: 30 | 90 | 180 | 365;
  assignee: string;
  widgets: JiraAnalyticsWidget[];
};

export type JiraAnalyticsRecord = {
  id: string;
  source: JiraAnalyticsSource;
  issue: JiraIssueSnapshot;
  eventAt: Date | null;
  durationHours: number | null;
  commitCount: number;
  mergeRequestCount: number;
  fromStatus: string | null;
  toStatus: string | null;
  sprint: string | null;
};

export type JiraAnalyticsGroup = {
  key: string;
  label: string;
  value: number;
  formattedValue: string;
  records: JiraAnalyticsRecord[];
};

export type JiraAnalyticsResult = {
  value: number;
  formattedValue: string;
  groups: JiraAnalyticsGroup[];
  records: JiraAnalyticsRecord[];
};

export const JIRA_ANALYTICS_SOURCE_LABELS: Record<JiraAnalyticsSource, string> = {
  issues: "Тикеты",
  transitions: "Переходы статусов",
  development: "Активность разработки",
  criticalBugs: "SLA Critical/Blocker",
};

export const JIRA_ANALYTICS_METRIC_LABELS: Record<JiraAnalyticsMetric, string> = {
  count: "Количество",
  averageDuration: "Средняя длительность",
  p50Duration: "Медиана времени",
  p85Duration: "85-й перцентиль времени",
  p95Duration: "95-й перцентиль времени",
  commits: "Коммиты",
  mergeRequests: "Merge requests",
};

export const JIRA_ANALYTICS_GROUP_LABELS: Record<JiraAnalyticsGroupBy, string> = {
  none: "Без группировки",
  project: "Проект Jira",
  status: "Текущий статус",
  assignee: "Исполнитель",
  priority: "Приоритет",
  sprint: "Sprint",
  issueType: "Тип тикета",
  resolution: "Решение",
  fromStatus: "Исходный статус",
  toStatus: "Новый статус",
  week: "Неделя",
};

export const JIRA_ANALYTICS_FILTER_LABELS: Record<JiraAnalyticsFilterField, string> = {
  status: "Текущий статус",
  assignee: "Исполнитель",
  priority: "Приоритет",
  sprint: "Sprint",
  issueType: "Тип тикета",
  resolution: "Решение",
  fromStatus: "Исходный статус",
  toStatus: "Новый статус",
  durationHours: "Длительность, часы",
  commitCount: "Коммиты",
  mergeRequestCount: "Merge requests",
  hasDevelopment: "Есть активность разработки",
};

export const JIRA_ANALYTICS_OPERATOR_LABELS: Record<
  JiraAnalyticsFilterOperator,
  string
> = {
  equals: "равно",
  notEquals: "не равно",
  contains: "содержит",
  empty: "пусто",
  notEmpty: "не пусто",
  greaterThan: "больше",
  atLeast: "не меньше",
};

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createJiraAnalyticsFilter(
  field: JiraAnalyticsFilterField = "status",
  operator: JiraAnalyticsFilterOperator = "equals",
  value = "",
): JiraAnalyticsFilter {
  return { id: uid("filter"), field, operator, value };
}

export function createJiraAnalyticsWidget(
  source: JiraAnalyticsSource = "issues",
): JiraAnalyticsWidget {
  return {
    id: uid("widget"),
    title: source === "issues" ? "Новый виджет" : JIRA_ANALYTICS_SOURCE_LABELS[source],
    source,
    metric: source === "transitions" ? "p50Duration" : "count",
    groupBy: "none",
    visualization: "number",
    filterLogic: "and",
    filters: [],
    width: "half",
  };
}

function filter(
  field: JiraAnalyticsFilterField,
  operator: JiraAnalyticsFilterOperator,
  value = "",
): JiraAnalyticsFilter {
  return createJiraAnalyticsFilter(field, operator, value);
}

export const JIRA_CRITICAL_BUG_SLA_HOURS = jiraCriticalBugSlaHours;

export const JIRA_ANALYTICS_TEMPLATES: Array<{
  id: "unplanned" | "flow" | "critical-bugs-sla";
  name: string;
  description: string;
  config: JiraAnalyticsDashboardConfig;
}> = [
  {
    id: "unplanned",
    name: "Работы вне плана",
    description: "Тикеты без Sprint с коммитами или merge requests",
    config: {
      version: 1,
      periodDays: 30,
      assignee: "",
      widgets: [
        {
          ...createJiraAnalyticsWidget("issues"),
          id: "unplanned-count",
          title: "Вне Sprint с кодом",
          filters: [
            filter("sprint", "empty"),
            filter("hasDevelopment", "equals", "true"),
          ],
        },
        {
          ...createJiraAnalyticsWidget("issues"),
          id: "unplanned-commits",
          title: "Коммиты у тикетов без Sprint",
          metric: "commits",
          filters: [filter("sprint", "empty")],
        },
        {
          ...createJiraAnalyticsWidget("issues"),
          id: "unplanned-assignees",
          title: "Ситуации по исполнителям",
          groupBy: "assignee",
          visualization: "bar",
          width: "full",
          filters: [
            filter("sprint", "empty"),
            filter("hasDevelopment", "equals", "true"),
          ],
        },
        {
          ...createJiraAnalyticsWidget("issues"),
          id: "unplanned-table",
          title: "Тикеты, требующие внимания",
          visualization: "table",
          width: "full",
          filters: [
            filter("sprint", "empty"),
            filter("hasDevelopment", "equals", "true"),
          ],
        },
      ],
    },
  },
  {
    id: "flow",
    name: "Поток разработки",
    description: "Скорость прохождения статусов и структура текущей очереди",
    config: {
      version: 1,
      periodDays: 90,
      assignee: "",
      widgets: [
        {
          ...createJiraAnalyticsWidget("transitions"),
          id: "flow-p50",
          title: "Медианное время в статусе",
          metric: "p50Duration",
        },
        {
          ...createJiraAnalyticsWidget("transitions"),
          id: "flow-p85",
          title: "Время в статусе, P85",
          metric: "p85Duration",
        },
        {
          ...createJiraAnalyticsWidget("issues"),
          id: "flow-status",
          title: "Тикеты по статусам",
          groupBy: "status",
          visualization: "bar",
          width: "full",
        },
        {
          ...createJiraAnalyticsWidget("transitions"),
          id: "flow-longest",
          title: "Самые долгие этапы",
          metric: "averageDuration",
          visualization: "table",
          width: "full",
        },
      ],
    },
  },
  {
    id: "critical-bugs-sla",
    name: "SLA багов Critical/Blocker",
    description: "Баги, не получившие Resolution за 30 календарных дней",
    config: {
      version: 1,
      periodDays: 30,
      assignee: "",
      widgets: [
        {
          ...createJiraAnalyticsWidget("criticalBugs"),
          id: "critical-bugs-sla-count",
          title: "Нарушили SLA 30 дней",
          filters: [filter("durationHours", "greaterThan", String(JIRA_CRITICAL_BUG_SLA_HOURS))],
        },
        {
          ...createJiraAnalyticsWidget("criticalBugs"),
          id: "critical-bugs-sla-project",
          title: "Нарушения по проектам",
          groupBy: "project",
          visualization: "bar",
          width: "full",
          filters: [filter("durationHours", "greaterThan", String(JIRA_CRITICAL_BUG_SLA_HOURS))],
        },
        {
          ...createJiraAnalyticsWidget("criticalBugs"),
          id: "critical-bugs-sla-table",
          title: "Тикеты с нарушенным SLA",
          visualization: "table",
          width: "full",
          filters: [filter("durationHours", "greaterThan", String(JIRA_CRITICAL_BUG_SLA_HOURS))],
        },
      ],
    },
  },
];

export const JIRA_ANALYTICS_DEFAULT_TEMPLATE = JIRA_ANALYTICS_TEMPLATES[0];

export const JIRA_ANALYTICS_DEFAULT_CONFIG: JiraAnalyticsDashboardConfig = {
  version: 1,
  periodDays: 90,
  assignee: "",
  widgets: JIRA_ANALYTICS_TEMPLATES.flatMap((template) =>
    structuredClone(template.config.widgets),
  ),
};

export function cloneJiraAnalyticsConfig(config: JiraAnalyticsDashboardConfig) {
  return structuredClone(config);
}

export function normalizeJiraAnalyticsConfig(
  value: unknown,
  fallback = JIRA_ANALYTICS_DEFAULT_CONFIG,
): JiraAnalyticsDashboardConfig {
  if (!value || typeof value !== "object") return cloneJiraAnalyticsConfig(fallback);
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.widgets)) return cloneJiraAnalyticsConfig(fallback);
  const periodDays = [30, 90, 180, 365].includes(Number(candidate.periodDays))
    ? (Number(candidate.periodDays) as JiraAnalyticsDashboardConfig["periodDays"])
    : fallback.periodDays;
  const widgets = candidate.widgets.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const raw = value as Record<string, unknown>;
    const source =
      typeof raw.source === "string" && raw.source in JIRA_ANALYTICS_SOURCE_LABELS
        ? (raw.source as JiraAnalyticsSource)
        : null;
    if (!source || typeof raw.id !== "string" || typeof raw.title !== "string") return [];
    const initial = createJiraAnalyticsWidget(source);
    const metric =
      typeof raw.metric === "string" && raw.metric in JIRA_ANALYTICS_METRIC_LABELS
        ? (raw.metric as JiraAnalyticsMetric)
        : initial.metric;
    const groupBy =
      typeof raw.groupBy === "string" && raw.groupBy in JIRA_ANALYTICS_GROUP_LABELS
        ? (raw.groupBy as JiraAnalyticsGroupBy)
        : "none";
    const visualization = ["number", "bar", "table"].includes(String(raw.visualization))
      ? (raw.visualization as JiraAnalyticsVisualization)
      : "number";
    const filters = Array.isArray(raw.filters)
      ? raw.filters.flatMap((value) => {
          if (!value || typeof value !== "object") return [];
          const condition = value as Record<string, unknown>;
          if (
            typeof condition.field !== "string" ||
            !(condition.field in JIRA_ANALYTICS_FILTER_LABELS) ||
            typeof condition.operator !== "string" ||
            !(condition.operator in JIRA_ANALYTICS_OPERATOR_LABELS)
          ) {
            return [];
          }
          return [{
            id: typeof condition.id === "string" ? condition.id : uid("filter"),
            field: condition.field as JiraAnalyticsFilterField,
            operator: condition.operator as JiraAnalyticsFilterOperator,
            value:
              typeof condition.value === "string" || typeof condition.value === "number"
                ? String(condition.value)
                : "",
          }];
        })
      : [];
    return [{
      ...initial,
      id: raw.id,
      title: raw.title,
      metric,
      groupBy,
      visualization,
      filterLogic: raw.filterLogic === "or" ? "or" as const : "and" as const,
      filters,
      width: raw.width === "full" ? "full" as const : "half" as const,
    }];
  });
  return {
    version: 1,
    periodDays,
    assignee: typeof candidate.assignee === "string" ? candidate.assignee : "",
    widgets:
      widgets.length > 0
        ? structuredClone(widgets)
        : cloneJiraAnalyticsConfig(fallback).widgets,
  };
}

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function issueRecord(issue: JiraIssueSnapshot): JiraAnalyticsRecord {
  return {
    id: `issue:${issue.id}`,
    source: "issues",
    issue,
    eventAt: validDate(issue.updatedAt),
    durationHours: null,
    commitCount: issue.commitCount,
    mergeRequestCount: issue.mergeRequestCount,
    fromStatus: null,
    toStatus: null,
    sprint: issue.sprint,
  };
}

function transitionRecords(issue: JiraIssueSnapshot): JiraAnalyticsRecord[] {
  if (!issue.transitionHistoryComplete) return [];
  const transitions = [...(issue.statusTransitions ?? [])]
    .map((transition) => ({ ...transition, date: validDate(transition.transitionedAt) }))
    .filter((transition): transition is typeof transition & { date: Date } => transition.date !== null)
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  let enteredAt = validDate(issue.issueCreatedAt);
  return transitions.map((transition) => {
    const durationHours = enteredAt
      ? Math.max(0, (transition.date.getTime() - enteredAt.getTime()) / 3_600_000)
      : null;
    enteredAt = transition.date;
    return {
      id: `transition:${transition.id}`,
      source: "transitions",
      issue,
      eventAt: transition.date,
      durationHours,
      commitCount: 0,
      mergeRequestCount: 0,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      sprint: issue.sprint,
    };
  });
}

function developmentRecords(issue: JiraIssueSnapshot): JiraAnalyticsRecord[] {
  return (issue.developmentActivities ?? [])
    .filter((activity) => !activity.isBaseline)
    .map((activity) => ({
      id: `development:${activity.id}`,
      source: "development",
      issue,
      eventAt: validDate(activity.activityAt),
      durationHours: null,
      commitCount: activity.commitCount,
      mergeRequestCount: activity.mergeRequestCount,
      fromStatus: null,
      toStatus: null,
      sprint: activity.sprintAtObservation,
    }));
}

function criticalBugRecord(
  issue: JiraIssueSnapshot,
  now: Date,
): JiraAnalyticsRecord | null {
  if (
    !issue.criticalSlaTracked ||
    !validDate(issue.criticalPriorityAt)
  ) {
    return null;
  }
  const startedAt = validDate(issue.criticalPriorityAt);
  if (!startedAt) return null;
  const resolutionAt = validDate(issue.resolutionAt);
  const finishedAt = resolutionAt ?? now;
  return {
    id: `critical-bug:${issue.id}`,
    source: "criticalBugs",
    issue,
    eventAt: startedAt,
    durationHours: Math.max(0, (finishedAt.getTime() - startedAt.getTime()) / 3_600_000),
    commitCount: issue.commitCount,
    mergeRequestCount: issue.mergeRequestCount,
    fromStatus: null,
    toStatus: null,
    sprint: issue.sprint,
  };
}

export function jiraAnalyticsRecords(
  source: JiraAnalyticsSource,
  issues: JiraIssueSnapshot[],
  periodDays: number,
  now = new Date(),
) {
  const periodStart = new Date(now.getTime() - periodDays * 86_400_000);
  if (source === "issues") return issues.map(issueRecord);
  if (source === "criticalBugs") {
    return issues.flatMap((issue) => {
      const record = criticalBugRecord(issue, now);
      return record ? [record] : [];
    });
  }
  const records = issues.flatMap((issue) =>
    source === "transitions" ? transitionRecords(issue) : developmentRecords(issue),
  );
  return records.filter((record) => record.eventAt && record.eventAt >= periodStart && record.eventAt <= now);
}

function recordValue(record: JiraAnalyticsRecord, field: JiraAnalyticsFilterField) {
  if (field === "fromStatus") return record.fromStatus;
  if (field === "toStatus") return record.toStatus;
  if (field === "durationHours") return record.durationHours;
  if (field === "commitCount") return record.commitCount;
  if (field === "mergeRequestCount") return record.mergeRequestCount;
  if (field === "hasDevelopment") {
    return record.issue.commitCount > 0 || record.issue.mergeRequestCount > 0;
  }
  if (field === "sprint") return record.sprint;
  return record.issue[field];
}

function filterMatches(record: JiraAnalyticsRecord, condition: JiraAnalyticsFilter) {
  const actual = recordValue(record, condition.field);
  const actualText = actual === null || actual === undefined ? "" : String(actual).trim();
  const expected = condition.value.trim();
  if (condition.operator === "empty") return actualText === "";
  if (condition.operator === "notEmpty") return actualText !== "";
  if (condition.operator === "equals") {
    return actualText.toLocaleLowerCase("ru") === expected.toLocaleLowerCase("ru");
  }
  if (condition.operator === "notEquals") {
    return actualText.toLocaleLowerCase("ru") !== expected.toLocaleLowerCase("ru");
  }
  if (condition.operator === "contains") {
    return actualText.toLocaleLowerCase("ru").includes(expected.toLocaleLowerCase("ru"));
  }
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;
  return condition.operator === "greaterThan"
    ? actualNumber > expectedNumber
    : actualNumber >= expectedNumber;
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const index = (ordered.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return ordered[lower] ?? 0;
  const weight = index - lower;
  return (ordered[lower] ?? 0) * (1 - weight) + (ordered[upper] ?? 0) * weight;
}

function metricValue(metric: JiraAnalyticsMetric, records: JiraAnalyticsRecord[]) {
  if (metric === "count") return records.length;
  if (metric === "commits") {
    return records.reduce((sum, record) => sum + record.commitCount, 0);
  }
  if (metric === "mergeRequests") {
    return records.reduce((sum, record) => sum + record.mergeRequestCount, 0);
  }
  const durations = records
    .map((record) => record.durationHours)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (durations.length === 0) return 0;
  if (metric === "averageDuration") {
    return durations.reduce((sum, value) => sum + value, 0) / durations.length;
  }
  if (metric === "p50Duration") return percentile(durations, 0.5);
  if (metric === "p85Duration") return percentile(durations, 0.85);
  return percentile(durations, 0.95);
}

export function formatJiraAnalyticsMetric(metric: JiraAnalyticsMetric, value: number) {
  if (metric.endsWith("Duration")) {
    if (value >= 24) return `${(value / 24).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} дн.`;
    return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч`;
  }
  return Math.round(value).toLocaleString("ru-RU");
}

function weekLabel(value: Date | null) {
  if (!value) return "Без даты";
  const monday = new Date(value);
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1);
  return monday.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

function groupLabel(record: JiraAnalyticsRecord, groupBy: JiraAnalyticsGroupBy) {
  if (groupBy === "project") {
    const issueKey = record.issue.issueKey.trim().toUpperCase();
    return issueKey.match(/^([A-Z][A-Z0-9_]*)-\d+$/)?.[1] ?? "Без проекта";
  }
  if (groupBy === "status") return record.issue.status || "Без статуса";
  if (groupBy === "assignee") return record.issue.assignee || "Не назначен";
  if (groupBy === "priority") return record.issue.priority || "Без приоритета";
  if (groupBy === "sprint") return record.sprint || "Без Sprint";
  if (groupBy === "issueType") return record.issue.issueType || "Без типа";
  if (groupBy === "resolution") return record.issue.resolution || "Без Resolution";
  if (groupBy === "fromStatus") return record.fromStatus || "Без статуса";
  if (groupBy === "toStatus") return record.toStatus || "Без статуса";
  if (groupBy === "week") return weekLabel(record.eventAt);
  return "Все";
}

export function evaluateJiraAnalyticsWidget(
  widget: JiraAnalyticsWidget,
  issues: JiraIssueSnapshot[],
  options: { periodDays: number; assignee?: string; now?: Date },
): JiraAnalyticsResult {
  const records = jiraAnalyticsRecords(
    widget.source,
    issues,
    options.periodDays,
    options.now,
  )
    .filter((record) => !options.assignee || record.issue.assignee === options.assignee)
    .filter((record) => {
      if (widget.filters.length === 0) return true;
      return widget.filterLogic === "or"
        ? widget.filters.some((condition) => filterMatches(record, condition))
        : widget.filters.every((condition) => filterMatches(record, condition));
    });
  const value = metricValue(widget.metric, records);
  const grouped = new Map<string, JiraAnalyticsRecord[]>();
  if (widget.groupBy !== "none") {
    for (const record of records) {
      const label = groupLabel(record, widget.groupBy);
      grouped.set(label, [...(grouped.get(label) ?? []), record]);
    }
  }
  const groups = [...grouped.entries()]
    .map(([label, groupRecords]) => {
      const groupValue = metricValue(widget.metric, groupRecords);
      return {
        key: label,
        label,
        value: groupValue,
        formattedValue: formatJiraAnalyticsMetric(widget.metric, groupValue),
        records: groupRecords,
      };
    })
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, "ru"));
  return {
    value,
    formattedValue: formatJiraAnalyticsMetric(widget.metric, value),
    groups,
    records,
  };
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function jiraAnalyticsCsv(records: JiraAnalyticsRecord[]) {
  const header = [
    "Key",
    "Summary",
    "Assignee",
    "Status",
    "Priority",
    "Issue type",
    "Resolution",
    "Resolution at",
    "Sprint",
    "From status",
    "To status",
    "Duration hours",
    "SLA deadline",
    "SLA overdue hours",
    "Commits",
    "Merge requests",
    "Event at",
    "Jira URL",
  ];
  const lines = records.map((record) =>
    [
      record.issue.issueKey,
      record.issue.summary,
      record.issue.assignee,
      record.issue.status,
      record.issue.priority,
      record.issue.issueType,
      record.issue.resolution,
      record.issue.resolutionAt,
      record.sprint,
      record.fromStatus,
      record.toStatus,
      record.durationHours === null ? "" : record.durationHours.toFixed(2),
      record.source === "criticalBugs" && record.eventAt
        ? new Date(
            record.eventAt.getTime() + JIRA_CRITICAL_BUG_SLA_HOURS * 3_600_000,
          ).toISOString()
        : "",
      record.source === "criticalBugs" && record.durationHours !== null
        ? Math.max(0, record.durationHours - JIRA_CRITICAL_BUG_SLA_HOURS).toFixed(2)
        : "",
      record.commitCount,
      record.mergeRequestCount,
      record.eventAt?.toISOString() ?? "",
      record.issue.issueUrl,
    ]
      .map(csvCell)
      .join(";"),
  );
  return [`sep=;`, header.map(csvCell).join(";"), ...lines].join("\n");
}
