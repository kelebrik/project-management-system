export const jiraCriticalPriorities = ["Critical", "Blocker"] as const;
export const jiraBugIssueTypes = [
  "Bug",
  "Bug Report",
  "Defect",
  "Баг",
  "Ошибка",
  "Дефект",
] as const;
export const jiraCancelledStatuses = [
  "Cancelled",
  "Canceled",
  "Отменён",
  "Отменен",
  "Отменено",
  "Отменена",
] as const;
export const jiraUnresolvedResolutions = [
  "",
  "Unresolved",
  "Не решен",
  "Не решён",
  "Не решено",
  "Не решена",
] as const;
export const jiraCriticalBugSlaHours = 30 * 24;
export const jiraAnalyticsScopeTypes = ["LABEL", "EPIC"] as const;
export const jiraAnalyticsLabelLimit = 20;
export const jiraAnalyticsScopeValueMaxLength = 2_000;

export type JiraAnalyticsScopeType = (typeof jiraAnalyticsScopeTypes)[number];

export const jiraCurrentFreshnessStates = [
  "FRESH",
  "REFRESHING",
  "STALE",
  "ERROR",
  "NOT_CONFIGURED",
] as const;

export type JiraCurrentFreshnessState = (typeof jiraCurrentFreshnessStates)[number];

export type JiraCurrentFreshness = {
  state: JiraCurrentFreshnessState;
  refreshedAt: string | null;
  ageSeconds: number | null;
  staleAfterSeconds: number;
  pollAfterMs: number | null;
  runId: string | null;
  refreshAllowed: boolean;
};

const jiraAnalyticsLabelPattern = /^[^\s"'\\,]+$/u;
const jiraAnalyticsEpicPattern = /^[A-Z][A-Z0-9_]*-\d+$/u;

export function jiraAnalyticsLabels(value: string) {
  const parts = value.normalize("NFKC").split(",");
  if (parts.some((part) => part.trim() === "")) {
    throw new Error("Укажите лейблы через запятую без пустых значений");
  }
  const labels = [...new Set(parts.map((part) => part.trim()))].sort();
  if (labels.length > jiraAnalyticsLabelLimit) {
    throw new Error(`Можно указать не более ${jiraAnalyticsLabelLimit} лейблов`);
  }
  const invalid = labels.find((label) =>
    label.length > 100 || !jiraAnalyticsLabelPattern.test(label)
  );
  if (invalid) {
    throw new Error("Лейбл не должен содержать пробелы, запятые, кавычки или обратный слеш");
  }
  return labels;
}

export function normalizeJiraAnalyticsScopeValue(
  type: JiraAnalyticsScopeType,
  value: string,
) {
  const normalized = value.normalize("NFKC").trim();
  if (normalized === "") {
    throw new Error(type === "LABEL" ? "Укажите лейбл Jira" : "Укажите код эпика Jira");
  }
  if (normalized.length > jiraAnalyticsScopeValueMaxLength) {
    throw new Error("Значение области Jira слишком длинное");
  }
  if (type === "LABEL") return jiraAnalyticsLabels(normalized).join(", ");
  const epic = normalized.toUpperCase();
  if (!jiraAnalyticsEpicPattern.test(epic)) {
    throw new Error("Укажите корректный код эпика Jira, например CVTE-123");
  }
  return epic;
}

export function jiraAnalyticsScopeValueIsValid(
  type: JiraAnalyticsScopeType,
  value: string,
) {
  try {
    normalizeJiraAnalyticsScopeValue(type, value);
    return true;
  } catch {
    return false;
  }
}

export const jiraAnalyticsSources = [
  "issues",
  "goalIssues",
  "transitions",
  "development",
  "criticalBugs",
  "statusIntervals",
  "gitlabCommits",
] as const;
export const jiraAnalyticsMetrics = [
  "count",
  "averageDuration",
  "p50Duration",
  "p85Duration",
  "p95Duration",
  "commits",
  "mergeRequests",
] as const;
export const jiraAnalyticsGroupings = [
  "none",
  "goal",
  "project",
  "status",
  "assignee",
  "reporter",
  "priority",
  "sprint",
  "issueType",
  "resolution",
  "fromStatus",
  "toStatus",
  "week",
] as const;
export const jiraAnalyticsFilterFields = [
  "goalId",
  "goalName",
  "goalStatus",
  "goalDate",
  "goalLabels",
  "matchedLabels",
  "issueKey",
  "project",
  "summary",
  "status",
  "assignee",
  "reporter",
  "priority",
  "sprint",
  "sprintCount",
  "labels",
  "issueType",
  "resolution",
  "fromStatus",
  "toStatus",
  "durationHours",
  "commitCount",
  "mergeRequestCount",
  "hasDevelopment",
  "issueCreatedAt",
  "criticalPriorityAt",
  "resolutionAt",
  "updatedAt",
  "eventAt",
  "intervalStartAt",
  "intervalEndAt",
  "gitlabProjectPath",
  "gitlabTargetBranch",
  "commitSha",
  "commitShortSha",
  "commitTitle",
  "commitAuthor",
  "commitAuthorEmail",
  "committedAt",
  "commitUrl",
  "sourceBranch",
  "mergeRequestIid",
  "mergeRequestTitle",
  "mergeRequestUrl",
  "jiraKeys",
  "jiraLinkState",
] as const;
export const jiraAnalyticsFilterOperators = [
  "equals",
  "notEquals",
  "oneOf",
  "noneOf",
  "contains",
  "empty",
  "notEmpty",
  "greaterThan",
  "atLeast",
  "lessThan",
  "atMost",
  "before",
  "after",
] as const;
export const jiraAnalyticsScopes = ["active", "retro"] as const;
export const jiraAnalyticsPeriodModes = ["NONE", "FIXED", "DASHBOARD"] as const;
export const jiraAnalyticsTimeZones = ["Europe/Moscow", "UTC"] as const;
export const jiraAnalyticsPeriodDays = [30, 90, 180, 365] as const;
export const jiraAnalyticsSortFields = [
  "default",
  "goalDate",
  "issueKey",
  "eventAt",
  "durationHours",
  "commitCount",
  "mergeRequestCount",
  "sprintCount",
  "committedAt",
  "commitSha",
] as const;
export const jiraAnalyticsSortDirections = ["asc", "desc"] as const;

export type JiraAnalyticsSource = (typeof jiraAnalyticsSources)[number];
export type JiraAnalyticsMetric = (typeof jiraAnalyticsMetrics)[number];
export type JiraAnalyticsGroupBy = (typeof jiraAnalyticsGroupings)[number];
export type JiraAnalyticsFilterField = (typeof jiraAnalyticsFilterFields)[number];
export type JiraAnalyticsFilterOperator = (typeof jiraAnalyticsFilterOperators)[number];
export type JiraAnalyticsScope = (typeof jiraAnalyticsScopes)[number];
export type JiraAnalyticsPeriodMode = (typeof jiraAnalyticsPeriodModes)[number];
export type JiraAnalyticsTimeZone = (typeof jiraAnalyticsTimeZones)[number];
export type JiraAnalyticsPeriodDays = (typeof jiraAnalyticsPeriodDays)[number];
export type JiraAnalyticsSortField = (typeof jiraAnalyticsSortFields)[number];
export type JiraAnalyticsSortDirection = (typeof jiraAnalyticsSortDirections)[number];
export type JiraAnalyticsVisualization = "number" | "bar" | "table";

export const JIRA_ANALYTICS_METRICS_BY_SOURCE: Record<
  JiraAnalyticsSource,
  readonly JiraAnalyticsMetric[]
> = {
  issues: ["count", "commits", "mergeRequests"],
  goalIssues: ["count", "commits", "mergeRequests"],
  transitions: [
    "count",
    "averageDuration",
    "p50Duration",
    "p85Duration",
    "p95Duration",
  ],
  development: ["count", "commits", "mergeRequests"],
  criticalBugs: [
    "count",
    "averageDuration",
    "p50Duration",
    "p85Duration",
    "p95Duration",
  ],
  statusIntervals: [
    "count",
    "averageDuration",
    "p50Duration",
    "p85Duration",
    "p95Duration",
  ],
  gitlabCommits: ["count"],
};

export const JIRA_ANALYTICS_GROUPS_BY_SOURCE: Record<
  JiraAnalyticsSource,
  readonly JiraAnalyticsGroupBy[]
> = {
  issues: ["none", "project", "status", "assignee", "reporter", "priority", "sprint", "issueType"],
  goalIssues: ["none", "goal", "project", "status", "assignee", "reporter", "priority", "sprint", "issueType"],
  transitions: ["none", "project", "status", "assignee", "reporter", "fromStatus", "toStatus", "week"],
  development: ["none", "project", "status", "assignee", "reporter", "sprint", "week"],
  criticalBugs: ["none", "project", "priority", "assignee", "reporter", "status", "issueType", "resolution"],
  statusIntervals: ["none", "project", "status", "assignee", "reporter", "issueType", "priority", "fromStatus", "week"],
  gitlabCommits: ["none"],
};

export const JIRA_ANALYTICS_FIELDS_BY_SOURCE: Record<
  JiraAnalyticsSource,
  readonly JiraAnalyticsFilterField[]
> = {
  issues: [
    "issueKey",
    "project",
    "summary",
    "status",
    "assignee",
    "reporter",
    "priority",
    "sprint",
    "sprintCount",
    "labels",
    "issueType",
    "resolution",
    "hasDevelopment",
    "commitCount",
    "mergeRequestCount",
    "issueCreatedAt",
    "criticalPriorityAt",
    "resolutionAt",
    "updatedAt",
  ],
  goalIssues: [
    "goalId", "goalName", "goalStatus", "goalDate", "goalLabels", "matchedLabels",
    "issueKey", "project", "summary", "status", "assignee", "reporter", "priority",
    "sprint", "sprintCount", "labels", "issueType", "resolution", "hasDevelopment",
    "commitCount", "mergeRequestCount", "issueCreatedAt", "criticalPriorityAt", "resolutionAt", "updatedAt",
  ],
  transitions: ["issueKey", "project", "summary", "status", "assignee", "reporter", "labels", "fromStatus", "toStatus", "eventAt", "durationHours"],
  development: ["issueKey", "project", "summary", "status", "assignee", "reporter", "labels", "sprint", "eventAt", "commitCount", "mergeRequestCount"],
  criticalBugs: ["issueKey", "project", "summary", "status", "assignee", "reporter", "labels", "priority", "issueType", "resolution", "issueCreatedAt", "criticalPriorityAt", "resolutionAt", "durationHours"],
  statusIntervals: [
    "issueKey", "project", "summary", "status", "assignee", "reporter",
    "issueType", "priority", "labels", "resolution", "issueCreatedAt", "fromStatus",
    "criticalPriorityAt", "resolutionAt", "eventAt", "intervalStartAt", "intervalEndAt", "durationHours",
  ],
  gitlabCommits: [
    "gitlabProjectPath", "gitlabTargetBranch", "commitSha", "commitShortSha",
    "commitTitle", "commitAuthor", "commitAuthorEmail", "committedAt", "commitUrl",
    "sourceBranch", "mergeRequestIid", "mergeRequestTitle", "mergeRequestUrl",
    "jiraKeys", "jiraLinkState",
  ],
};

export const numericFields = new Set<JiraAnalyticsFilterField>([
  "durationHours",
  "commitCount",
  "mergeRequestCount",
  "sprintCount",
  "mergeRequestIid",
]);

export const dateFields = new Set<JiraAnalyticsFilterField>([
  "goalDate",
  "issueCreatedAt",
  "criticalPriorityAt",
  "resolutionAt",
  "updatedAt",
  "eventAt",
  "intervalStartAt",
  "intervalEndAt",
  "committedAt",
]);

export type JiraAnalyticsFieldKind = "text" | "number" | "boolean" | "date";

export function jiraAnalyticsFieldKind(field: JiraAnalyticsFilterField): JiraAnalyticsFieldKind {
  if (numericFields.has(field)) return "number";
  if (field === "hasDevelopment") return "boolean";
  if (dateFields.has(field)) return "date";
  return "text";
}

export function jiraAnalyticsOperatorsFor(
  field: JiraAnalyticsFilterField,
): readonly JiraAnalyticsFilterOperator[] {
  if (numericFields.has(field)) return ["greaterThan", "atLeast", "lessThan", "atMost", "equals"];
  if (field === "hasDevelopment") return ["equals"];
  if (dateFields.has(field)) return ["before", "after", "empty", "notEmpty"];
  return ["equals", "notEquals", "oneOf", "noneOf", "contains", "empty", "notEmpty"];
}

export function jiraAnalyticsSourceUsesPeriod(source: JiraAnalyticsSource) {
  return jiraAnalyticsSourcePeriodSupport(source) !== "none";
}

export type JiraAnalyticsPeriodSupport = "none" | "optional" | "required";

export function jiraAnalyticsSourcePeriodSupport(source: JiraAnalyticsSource): JiraAnalyticsPeriodSupport {
  if (source === "transitions" || source === "development") return "required";
  if (source === "statusIntervals") return "optional";
  if (source === "gitlabCommits") return "none";
  return "none";
}

export function jiraAnalyticsSourceSupportsAsOf(source: JiraAnalyticsSource) {
  return source === "issues" || source === "goalIssues" || source === "criticalBugs";
}

export function normalizedJiraValue(value: string | null | undefined) {
  return value?.normalize("NFKC").trim().toLocaleLowerCase("ru-RU") ?? "";
}

export function isJiraCriticalPriority(value: string | null | undefined) {
  const normalized = normalizedJiraValue(value);
  return jiraCriticalPriorities.some(
    (priority) => normalizedJiraValue(priority) === normalized,
  );
}

export function isJiraBugIssueType(value: string | null | undefined) {
  const normalized = normalizedJiraValue(value);
  if (jiraBugIssueTypes.some(
    (issueType) => normalizedJiraValue(issueType) === normalized,
  )) return true;
  return /^(bug|defect)(\s*[-:/(]|\s+report\b)/u.test(normalized) ||
    /^(баг|ошибка|дефект)(\s*[-:/(]|$)/u.test(normalized);
}

export function isJiraCriticalBugSlaCandidate(issue: {
  issueType: string | null | undefined;
  criticalPriorityAt: string | Date | null | undefined;
  criticalEndPriority: string | null | undefined;
}) {
  return isJiraBugIssueType(issue.issueType) &&
    issue.criticalPriorityAt !== null &&
    issue.criticalPriorityAt !== undefined &&
    isJiraCriticalPriority(issue.criticalEndPriority);
}

export function isJiraCancelledStatus(value: string | null | undefined) {
  const normalized = normalizedJiraValue(value);
  return jiraCancelledStatuses.some(
    (status) => normalizedJiraValue(status) === normalized,
  );
}

export function isJiraUnresolvedResolution(value: string | null | undefined) {
  const normalized = normalizedJiraValue(value);
  return jiraUnresolvedResolutions.some(
    (resolution) => normalizedJiraValue(resolution) === normalized,
  );
}


export function codePointCompare(left: string, right: string) {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}
