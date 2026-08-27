import {
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  JIRA_ANALYTICS_GROUPS_BY_SOURCE,
  JIRA_ANALYTICS_METRICS_BY_SOURCE,
  jiraAnalyticsFieldKind,
  jiraAnalyticsOperatorsFor as sharedOperatorsFor,
  jiraCriticalBugSlaHours,
  type JiraAnalyticsFilter,
  type JiraAnalyticsFilterField,
  type JiraAnalyticsFilterOperator,
  type JiraAnalyticsGroupBy,
  type JiraAnalyticsMetric,
  type JiraAnalyticsManagedWidget,
  type JiraAnalyticsScope,
  type JiraAnalyticsSource,
  type JiraAnalyticsVisualization,
} from "@pms/shared";

export {
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  JIRA_ANALYTICS_GROUPS_BY_SOURCE,
  JIRA_ANALYTICS_METRICS_BY_SOURCE,
};
export type {
  JiraAnalyticsFilter,
  JiraAnalyticsFilterField,
  JiraAnalyticsFilterOperator,
  JiraAnalyticsGroupBy,
  JiraAnalyticsMetric,
  JiraAnalyticsSource,
  JiraAnalyticsVisualization,
};

export type JiraAnalyticsSection = JiraAnalyticsScope;
export const JIRA_ANALYTICS_AGGREGATE_TYPE_LABELS: Record<JiraAnalyticsSource, string> = {
  issues: "Тикеты",
  transitions: "Переходы статусов",
  development: "Активность разработки",
  criticalBugs: "SLA Critical/Blocker",
  statusIntervals: "Интервалы статусов",
};

export const JIRA_ANALYTICS_LIST_RESULT = "list" as const;
export type JiraAnalyticsWidgetResultMode = JiraAnalyticsMetric | typeof JIRA_ANALYTICS_LIST_RESULT;

export function jiraAnalyticsWidgetResultMode(
  widget: Pick<JiraAnalyticsManagedWidget, "metric" | "groupBy" | "visualization">,
): JiraAnalyticsWidgetResultMode {
  return widget.metric === "count" && widget.groupBy === "none" && widget.visualization === "table"
    ? JIRA_ANALYTICS_LIST_RESULT
    : widget.metric;
}

export function jiraAnalyticsWidgetResultPatch(
  result: JiraAnalyticsWidgetResultMode,
  current: Pick<JiraAnalyticsManagedWidget, "groupBy" | "visualization">,
): Partial<Pick<JiraAnalyticsManagedWidget, "metric" | "groupBy" | "visualization">> {
  if (result === JIRA_ANALYTICS_LIST_RESULT) {
    return { metric: "count", groupBy: "none", visualization: "table" };
  }
  return {
    metric: result,
    visualization: current.groupBy === "none" ? "number" : "bar",
  };
}

export function jiraAnalyticsWidgetGroupingPatch(
  groupBy: JiraAnalyticsGroupBy,
): Pick<JiraAnalyticsManagedWidget, "groupBy" | "visualization"> {
  return {
    groupBy,
    visualization: groupBy === "none" ? "number" : "bar",
  };
}

export function jiraAnalyticsEffectiveVisualization(
  widget: Pick<JiraAnalyticsManagedWidget, "groupBy" | "visualization">,
): JiraAnalyticsVisualization {
  if (widget.visualization === "table") return "table";
  return widget.groupBy === "none" ? "number" : "bar";
}

export function jiraAnalyticsPinnedRevisionUpdate(
  placement: JiraAnalyticsSection,
  pinnedVersion: number | null | undefined,
  currentVersion: number | null | undefined,
) {
  return placement === "retro" && currentVersion != null && pinnedVersion !== currentVersion
    ? currentVersion
    : null;
}

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
  reporter: "Автор",
  priority: "Приоритет",
  sprint: "Sprint",
  issueType: "Тип тикета",
  resolution: "Решение",
  fromStatus: "Исходный статус",
  toStatus: "Новый статус",
  week: "Неделя",
};

export const JIRA_ANALYTICS_FILTER_LABELS: Record<JiraAnalyticsFilterField, string> = {
  issueKey: "Ключ тикета",
  project: "Проект Jira",
  summary: "Название",
  status: "Текущий статус",
  assignee: "Исполнитель",
  reporter: "Автор",
  priority: "Приоритет",
  sprint: "Sprint",
  sprintCount: "Количество записей Sprint",
  issueType: "Тип тикета",
  resolution: "Решение",
  fromStatus: "Исходный статус",
  toStatus: "Новый статус",
  durationHours: "Длительность, часы",
  commitCount: "Коммиты",
  mergeRequestCount: "Merge requests",
  hasDevelopment: "Есть активность разработки",
  issueCreatedAt: "Дата создания",
  criticalPriorityAt: "Начало SLA",
  resolutionAt: "Дата Resolution",
  updatedAt: "Последнее изменение",
  eventAt: "Дата события",
  intervalStartAt: "Начало интервала",
  intervalEndAt: "Конец интервала",
};

export const JIRA_ANALYTICS_OPERATOR_LABELS: Record<JiraAnalyticsFilterOperator, string> = {
  equals: "равно",
  notEquals: "не равно",
  contains: "содержит",
  empty: "пусто",
  notEmpty: "не пусто",
  greaterThan: "больше",
  atLeast: "не меньше",
  lessThan: "меньше",
  atMost: "не больше",
  before: "раньше",
  after: "позже",
};

export function jiraAnalyticsOperatorsFor(field: JiraAnalyticsFilterField) {
  return sharedOperatorsFor(field);
}

export function jiraAnalyticsFieldIsNumeric(field: JiraAnalyticsFilterField) {
  return jiraAnalyticsFieldKind(field) === "number";
}

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createJiraAnalyticsFilter(
  field: JiraAnalyticsFilterField = "status",
  operator: JiraAnalyticsFilterOperator = "equals",
  value = "",
): JiraAnalyticsFilter {
  return { id: uid("filter"), field, operator, value };
}

export const JIRA_CRITICAL_BUG_SLA_HOURS = jiraCriticalBugSlaHours;

export function formatJiraAnalyticsMetric(metric: JiraAnalyticsMetric, value: number) {
  if (metric.endsWith("Duration")) {
    if (value >= 24) {
      return `${(value / 24).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} дн.`;
    }
    return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч`;
  }
  return Math.round(value).toLocaleString("ru-RU");
}
