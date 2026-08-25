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
};

export const JIRA_ANALYTICS_OPERATOR_LABELS: Record<JiraAnalyticsFilterOperator, string> = {
  equals: "равно",
  notEquals: "не равно",
  contains: "содержит",
  empty: "пусто",
  notEmpty: "не пусто",
  greaterThan: "больше",
  atLeast: "не меньше",
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
