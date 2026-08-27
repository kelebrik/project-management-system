import type {
  JiraAnalyticsEvaluationResult,
  JiraAnalyticsFilterField,
  JiraSemanticAggregatePublic,
} from "@pms/shared";

export const JIRA_RISK_AGGREGATE_KEY = "critical-blocker-risk";

export const JIRA_RISK_TICKET_FIELDS = [
  "issueKey",
  "summary",
  "status",
  "assignee",
  "priority",
] as const satisfies readonly JiraAnalyticsFilterField[];

export type JiraRiskTicket = {
  id: string;
  title: string;
  jiraTicketKey: string;
  jiraTicketUrl: string;
  status: string;
  priority: string;
  assignee: string;
};

type ProjectedRecord = {
  id: string;
  issueUrl: string;
  values: Partial<
    Record<JiraAnalyticsFilterField, string | number | boolean | null>
  >;
};

export type JiraRiskAggregateResult = Omit<
  JiraAnalyticsEvaluationResult,
  "records"
> & {
  records: ProjectedRecord[];
};

export type JiraRiskAggregateQueryResponse = {
  aggregate: { id: string; name: string; version: number };
  result: JiraRiskAggregateResult;
};

function textValue(record: ProjectedRecord, field: JiraAnalyticsFilterField) {
  const value = record.values[field];
  return typeof value === "string" ? value : "";
}

export function findPublishedRiskAggregate(
  definitions: readonly JiraSemanticAggregatePublic[],
) {
  return (
    definitions.find(
      (definition) =>
        definition.key === JIRA_RISK_AGGREGATE_KEY &&
        definition.published !== null &&
        definition.publishedVersion !== null,
    ) ?? null
  );
}

export function jiraRiskAggregateQuery(aggregateVersion: number) {
  return {
    aggregateVersion,
    selectedFields: [...JIRA_RISK_TICKET_FIELDS],
    metric: "count" as const,
    groupBy: "none" as const,
    filters: [],
    filterLogic: "and" as const,
    periodDays: null,
    dateField: null,
    assignee: "",
    sortBy: "durationHours" as const,
    sortDirection: "desc" as const,
    page: 1,
    pageSize: 100,
    asOf: null,
  };
}

export function jiraRiskTicketsFromResult(
  result: JiraRiskAggregateResult,
): JiraRiskTicket[] {
  return result.records.map((record) => ({
    id: record.id,
    title: textValue(record, "summary") || textValue(record, "issueKey"),
    jiraTicketKey: textValue(record, "issueKey"),
    jiraTicketUrl: record.issueUrl,
    status: textValue(record, "status"),
    priority: textValue(record, "priority"),
    assignee: textValue(record, "assignee"),
  }));
}
