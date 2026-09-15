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
