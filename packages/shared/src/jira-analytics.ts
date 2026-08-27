import { z } from "zod";

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
  "transitions",
  "development",
  "criticalBugs",
  "statusIntervals",
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
  "issueKey",
  "project",
  "summary",
  "status",
  "assignee",
  "reporter",
  "priority",
  "sprint",
  "sprintCount",
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
] as const;
export const jiraAnalyticsFilterOperators = [
  "equals",
  "notEquals",
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
  "issueKey",
  "eventAt",
  "durationHours",
  "commitCount",
  "mergeRequestCount",
  "sprintCount",
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
};

export const JIRA_ANALYTICS_GROUPS_BY_SOURCE: Record<
  JiraAnalyticsSource,
  readonly JiraAnalyticsGroupBy[]
> = {
  issues: ["none", "project", "status", "assignee", "reporter", "priority", "sprint", "issueType"],
  transitions: ["none", "project", "status", "assignee", "reporter", "fromStatus", "toStatus", "week"],
  development: ["none", "project", "status", "assignee", "reporter", "sprint", "week"],
  criticalBugs: ["none", "project", "priority", "assignee", "reporter", "status", "issueType", "resolution"],
  statusIntervals: ["none", "project", "status", "assignee", "reporter", "issueType", "priority", "fromStatus", "week"],
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
  transitions: ["issueKey", "project", "summary", "status", "assignee", "reporter", "fromStatus", "toStatus", "eventAt", "durationHours"],
  development: ["issueKey", "project", "summary", "status", "assignee", "reporter", "sprint", "eventAt", "commitCount", "mergeRequestCount"],
  criticalBugs: ["issueKey", "project", "summary", "status", "assignee", "reporter", "priority", "issueType", "resolution", "issueCreatedAt", "criticalPriorityAt", "resolutionAt", "durationHours"],
  statusIntervals: [
    "issueKey", "project", "summary", "status", "assignee", "reporter",
    "issueType", "priority", "resolution", "issueCreatedAt", "fromStatus",
    "criticalPriorityAt", "resolutionAt", "eventAt", "intervalStartAt", "intervalEndAt", "durationHours",
  ],
};

const numericFields = new Set<JiraAnalyticsFilterField>([
  "durationHours",
  "commitCount",
  "mergeRequestCount",
  "sprintCount",
]);

const dateFields = new Set<JiraAnalyticsFilterField>([
  "issueCreatedAt",
  "criticalPriorityAt",
  "resolutionAt",
  "updatedAt",
  "eventAt",
  "intervalStartAt",
  "intervalEndAt",
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
  return ["equals", "notEquals", "contains", "empty", "notEmpty"];
}

export function jiraAnalyticsSourceUsesPeriod(source: JiraAnalyticsSource) {
  return jiraAnalyticsSourcePeriodSupport(source) !== "none";
}

export type JiraAnalyticsPeriodSupport = "none" | "optional" | "required";

export function jiraAnalyticsSourcePeriodSupport(source: JiraAnalyticsSource): JiraAnalyticsPeriodSupport {
  if (source === "transitions" || source === "development") return "required";
  if (source === "statusIntervals") return "optional";
  return "none";
}

export function jiraAnalyticsSourceSupportsAsOf(source: JiraAnalyticsSource) {
  return source === "issues" || source === "criticalBugs";
}

function normalizedJiraValue(value: string | null | undefined) {
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

export const jiraAnalyticsFilterSchema = z.object({
  id: z.string().min(1).max(200),
  field: z.enum(jiraAnalyticsFilterFields),
  operator: z.enum(jiraAnalyticsFilterOperators),
  value: z.string().max(1000),
}).strict().superRefine((filter, context) => {
  const operators = jiraAnalyticsOperatorsFor(filter.field);
  if (!operators.includes(filter.operator)) {
    context.addIssue({
      code: "custom",
      path: ["operator"],
      message: "Оператор недоступен для выбранного поля",
    });
  }
  if (filter.operator === "empty" || filter.operator === "notEmpty") {
    if (filter.value !== "") {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Для проверки пустого значения параметр должен быть пустым",
      });
    }
    return;
  }
  if (numericFields.has(filter.field)) {
    if (filter.value.trim() === "" || !Number.isFinite(Number(filter.value))) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Числовой фильтр требует конечное число",
      });
    }
  }
  if (dateFields.has(filter.field) && !["empty", "notEmpty"].includes(filter.operator)) {
    if (filter.value.trim() === "" || Number.isNaN(new Date(filter.value).getTime())) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Фильтр по дате требует корректную дату и время",
      });
    }
  }
  if (filter.field === "hasDevelopment" && !["true", "false"].includes(filter.value)) {
    context.addIssue({
      code: "custom",
      path: ["value"],
      message: "Признак активности должен быть true или false",
    });
  }
});

export const jiraAnalyticsAggregateDraftSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).default(""),
  source: z.enum(jiraAnalyticsSources),
  metric: z.enum(jiraAnalyticsMetrics),
  groupBy: z.enum(jiraAnalyticsGroupings),
  scope: z.enum(jiraAnalyticsScopes),
  filterLogic: z.enum(["and", "or"]),
  filters: z.array(jiraAnalyticsFilterSchema).max(20),
  periodMode: z.enum(jiraAnalyticsPeriodModes),
  periodDays: z.union(jiraAnalyticsPeriodDays.map((value) => z.literal(value)) as [
    z.ZodLiteral<30>,
    z.ZodLiteral<90>,
    z.ZodLiteral<180>,
    z.ZodLiteral<365>,
  ]).nullable(),
  timeZone: z.enum(jiraAnalyticsTimeZones),
  sortOrder: z.number().int().min(0).max(10_000),
}).strict().superRefine((definition, context) => {
  if (definition.source === "statusIntervals") {
    context.addIssue({
      code: "custom",
      path: ["source"],
      message: "Интервалы статусов доступны только в управляемых агрегатах",
    });
  }
  if (!JIRA_ANALYTICS_METRICS_BY_SOURCE[definition.source].includes(definition.metric)) {
    context.addIssue({ code: "custom", path: ["metric"], message: "Метрика недоступна для типа агрегата" });
  }
  if (!JIRA_ANALYTICS_GROUPS_BY_SOURCE[definition.source].includes(definition.groupBy)) {
    context.addIssue({ code: "custom", path: ["groupBy"], message: "Группировка недоступна для типа агрегата" });
  }
  definition.filters.forEach((filter, index) => {
    if (!JIRA_ANALYTICS_FIELDS_BY_SOURCE[definition.source].includes(filter.field)) {
      context.addIssue({ code: "custom", path: ["filters", index, "field"], message: "Поле недоступно для типа агрегата" });
    }
  });
  const periodSupport = jiraAnalyticsSourcePeriodSupport(definition.source);
  if (periodSupport === "none" && (definition.periodMode !== "NONE" || definition.periodDays !== null)) {
    context.addIssue({ code: "custom", path: ["periodMode"], message: "Этот тип агрегата не использует период" });
  }
  if (periodSupport === "required" && definition.periodMode === "NONE") {
    context.addIssue({ code: "custom", path: ["periodMode"], message: "Для событийного типа агрегата нужен период" });
  }
  if ((definition.periodMode === "FIXED") !== (definition.periodDays !== null)) {
    context.addIssue({ code: "custom", path: ["periodDays"], message: "Фиксированный период требует количества дней" });
  }
});

export type JiraAnalyticsFilter = z.infer<typeof jiraAnalyticsFilterSchema>;
export type JiraAnalyticsAggregateDraft = z.infer<typeof jiraAnalyticsAggregateDraftSchema>;

const jiraAnalyticsStatusNamesSchema = z.array(
  z.string().trim().min(1).max(200),
).min(1).max(10).superRefine((statuses, context) => {
  const normalized = statuses.map(normalizedJiraValue);
  if (new Set(normalized).size !== normalized.length) {
    context.addIssue({ code: "custom", message: "Названия статусов не должны повторяться" });
  }
});

const jiraAnalyticsOptionalTransitionStatusNamesSchema = z.array(
  z.string().trim().min(1).max(200),
).max(10).superRefine((statuses, context) => {
  const normalized = statuses.map(normalizedJiraValue);
  if (new Set(normalized).size !== normalized.length) {
    context.addIssue({ code: "custom", message: "Названия статусов не должны повторяться" });
  }
});

const jiraAnalyticsStatusTransitionEndpointSchema = z.object({
  anchor: z.literal("statusTransition"),
  fromStatuses: jiraAnalyticsOptionalTransitionStatusNamesSchema,
  toStatuses: jiraAnalyticsOptionalTransitionStatusNamesSchema,
  occurrence: z.enum(["first", "last", "all"]).optional(),
}).strict().superRefine((endpoint, context) => {
  if (endpoint.fromStatuses.length === 0 && endpoint.toStatuses.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["toStatuses"],
      message: "Укажите хотя бы один статус до или после перехода",
    });
  }
});

export const jiraAnalyticsStatusIntervalEndpointSchema = z.discriminatedUnion("anchor", [
  z.object({ anchor: z.literal("issueCreated"), occurrence: z.literal("first").optional() }).strict(),
  z.object({
    anchor: z.literal("firstStatusEntry"),
    statuses: jiraAnalyticsStatusNamesSchema,
    occurrence: z.enum(["first", "last", "all"]).optional(),
  }).strict(),
  jiraAnalyticsStatusTransitionEndpointSchema,
  z.object({ anchor: z.literal("criticalPriority"), occurrence: z.literal("first").optional() }).strict(),
  z.object({ anchor: z.literal("resolution"), occurrence: z.enum(["first", "last", "all"]).optional() }).strict(),
]);

export const jiraAnalyticsStatusIntervalEndEndpointSchema = z.discriminatedUnion("anchor", [
  z.object({
    anchor: z.literal("firstStatusEntry"),
    statuses: jiraAnalyticsStatusNamesSchema,
    occurrence: z.enum(["first", "last", "all"]).optional(),
  }).strict(),
  jiraAnalyticsStatusTransitionEndpointSchema,
  z.object({ anchor: z.literal("criticalPriority"), occurrence: z.literal("first").optional() }).strict(),
  z.object({ anchor: z.literal("resolution"), occurrence: z.enum(["first", "last", "all"]).optional() }).strict(),
]);

export const jiraAnalyticsStatusIntervalRowConfigSchema = z.object({
  kind: z.literal("statusInterval"),
  start: jiraAnalyticsStatusIntervalEndpointSchema,
  end: jiraAnalyticsStatusIntervalEndEndpointSchema,
  openIntervals: z.enum(["exclude", "include"]),
  periodAnchor: z.enum(["start", "end"]),
  pairing: z.literal("nextAfterStart").optional(),
}).strict().superRefine((config, context) => {
  if (config.openIntervals === "include" && config.periodAnchor !== "start") {
    context.addIssue({
      code: "custom",
      path: ["periodAnchor"],
      message: "Открытые интервалы можно фильтровать по периоду только от даты начала",
    });
  }
  if (config.start.anchor === "firstStatusEntry" && config.end.anchor === "firstStatusEntry") {
    const startStatuses = new Set(config.start.statuses.map(normalizedJiraValue));
    if (config.end.statuses.some((status) => startStatuses.has(normalizedJiraValue(status)))) {
      context.addIssue({
        code: "custom",
        path: ["end", "statuses"],
        message: "Начальный и конечный статусы интервала не должны пересекаться",
      });
    }
  }
});

export const jiraAnalyticsRowConfigSchema = jiraAnalyticsStatusIntervalRowConfigSchema;
export type JiraAnalyticsStatusIntervalEndpoint = z.infer<typeof jiraAnalyticsStatusIntervalEndpointSchema>;
export type JiraAnalyticsStatusIntervalEndEndpoint = z.infer<typeof jiraAnalyticsStatusIntervalEndEndpointSchema>;
export type JiraAnalyticsStatusIntervalRowConfig = z.infer<typeof jiraAnalyticsStatusIntervalRowConfigSchema>;
export type JiraAnalyticsRowConfig = z.infer<typeof jiraAnalyticsRowConfigSchema>;

/**
 * A managed aggregate is a semantic row set over the Jira data lake. Metrics,
 * grouping, page placement and visualization belong to widgets, not here.
 */
export const jiraAnalyticsLegacyDatasetDraftSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).default(""),
  source: z.enum(jiraAnalyticsSources),
  exposedFields: z.array(z.enum(jiraAnalyticsFilterFields)).min(1).max(jiraAnalyticsFilterFields.length),
  baseFilterLogic: z.enum(["and", "or"]),
  baseFilters: z.array(jiraAnalyticsFilterSchema).max(20),
  rowConfig: jiraAnalyticsRowConfigSchema.nullable().default(null),
  timeZone: z.enum(jiraAnalyticsTimeZones),
  sortOrder: z.number().int().min(0).max(10_000),
}).strict().superRefine((definition, context) => {
  if ((definition.source === "statusIntervals") !== (definition.rowConfig !== null)) {
    context.addIssue({
      code: "custom",
      path: ["rowConfig"],
      message: definition.source === "statusIntervals"
        ? "Для интервалов статусов нужна конфигурация контрольных точек"
        : "Конфигурация интервала доступна только для типа «Интервалы статусов»",
    });
  }
  const available = JIRA_ANALYTICS_FIELDS_BY_SOURCE[definition.source];
  const uniqueFields = new Set(definition.exposedFields);
  if (uniqueFields.size !== definition.exposedFields.length) {
    context.addIssue({ code: "custom", path: ["exposedFields"], message: "Поля агрегата не должны повторяться" });
  }
  definition.exposedFields.forEach((field, index) => {
    if (!available.includes(field)) {
      context.addIssue({ code: "custom", path: ["exposedFields", index], message: "Поле недоступно для типа агрегата" });
    }
  });
  definition.baseFilters.forEach((filter, index) => {
    if (!available.includes(filter.field)) {
      context.addIssue({ code: "custom", path: ["baseFilters", index, "field"], message: "Поле недоступно для типа агрегата" });
    }
  });
});

/**
 * A v4 aggregate is only a semantic row builder. Query, projection and
 * presentation settings belong to dashboard widgets.
 */
export const jiraAnalyticsDatasetDraftSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).default(""),
  source: z.enum(jiraAnalyticsSources),
  rowConfig: jiraAnalyticsRowConfigSchema.nullable().default(null),
  timeZone: z.enum(jiraAnalyticsTimeZones),
  sortOrder: z.number().int().min(0).max(10_000),
}).strict().superRefine((definition, context) => {
  if ((definition.source === "statusIntervals") !== (definition.rowConfig !== null)) {
    context.addIssue({
      code: "custom",
      path: ["rowConfig"],
      message: definition.source === "statusIntervals"
        ? "Для интервалов статусов нужна конфигурация контрольных точек"
        : "Конфигурация интервала доступна только для агрегата «Интервалы статусов»",
    });
  }
});

export const jiraAnalyticsDatasetRevisionV2Schema = jiraAnalyticsLegacyDatasetDraftSchema.extend({
  schemaVersion: z.literal(2),
}).strict().superRefine((definition, context) => {
  if (definition.rowConfig !== null || definition.source === "statusIntervals") {
    context.addIssue({ code: "custom", path: ["rowConfig"], message: "Ревизия v2 не поддерживает конфигурацию строк" });
  }
});

export const jiraAnalyticsDatasetRevisionV3Schema = jiraAnalyticsLegacyDatasetDraftSchema.extend({
  schemaVersion: z.literal(3),
}).strict().superRefine((definition, context) => {
  if (definition.rowConfig === null || definition.source !== "statusIntervals") {
    context.addIssue({ code: "custom", path: ["rowConfig"], message: "Ревизия v3 требует конфигурацию интервала" });
  }
});

export const jiraAnalyticsDatasetRevisionV4Schema = jiraAnalyticsDatasetDraftSchema.extend({
  schemaVersion: z.literal(4),
}).strict();

export const jiraAnalyticsDatasetRevisionSchema = z.union([
  jiraAnalyticsDatasetRevisionV4Schema,
  jiraAnalyticsDatasetRevisionV3Schema,
  jiraAnalyticsDatasetRevisionV2Schema,
  jiraAnalyticsAggregateDraftSchema,
]);

export type JiraAnalyticsDatasetDraft = z.infer<typeof jiraAnalyticsDatasetDraftSchema>;
export type JiraAnalyticsLegacyDatasetDraft = z.infer<typeof jiraAnalyticsLegacyDatasetDraftSchema>;
export type JiraAnalyticsDatasetRevision = z.infer<typeof jiraAnalyticsDatasetRevisionSchema>;
export type JiraAnalyticsLegacyDatasetContract = Pick<
  JiraAnalyticsLegacyDatasetDraft,
  "exposedFields" | "baseFilterLogic" | "baseFilters"
>;

export function jiraAnalyticsDatasetFromLegacy(
  definition: JiraAnalyticsAggregateDraft,
): JiraAnalyticsDatasetDraft {
  return jiraAnalyticsDatasetDraftSchema.parse({
    name: definition.name,
    description: definition.description,
    source: definition.source,
    rowConfig: null,
    timeZone: definition.timeZone,
    sortOrder: definition.sortOrder,
  });
}

export function normalizeJiraAnalyticsDatasetRevision(value: unknown): {
  dataset: JiraAnalyticsDatasetDraft;
  legacyQuery: JiraAnalyticsAggregateDraft | null;
  legacyContract: JiraAnalyticsLegacyDatasetContract | null;
} | null {
  const latest = jiraAnalyticsDatasetRevisionV4Schema.safeParse(value);
  if (latest.success) {
    const { schemaVersion: _schemaVersion, ...dataset } = latest.data;
    return { dataset, legacyQuery: null, legacyContract: null };
  }
  const current = jiraAnalyticsDatasetRevisionV3Schema.safeParse(value);
  if (current.success) {
    const {
      schemaVersion: _schemaVersion,
      exposedFields,
      baseFilterLogic,
      baseFilters,
      ...dataset
    } = current.data;
    const parsedDataset = jiraAnalyticsDatasetDraftSchema.safeParse(dataset);
    if (!parsedDataset.success) return null;
    return {
      dataset: parsedDataset.data,
      legacyQuery: null,
      legacyContract: { exposedFields, baseFilterLogic, baseFilters },
    };
  }
  const previous = jiraAnalyticsDatasetRevisionV2Schema.safeParse(value);
  if (previous.success) {
    const {
      schemaVersion: _schemaVersion,
      exposedFields,
      baseFilterLogic,
      baseFilters,
      ...dataset
    } = previous.data;
    const parsedDataset = jiraAnalyticsDatasetDraftSchema.safeParse(dataset);
    if (!parsedDataset.success) return null;
    return {
      dataset: parsedDataset.data,
      legacyQuery: null,
      legacyContract: { exposedFields, baseFilterLogic, baseFilters },
    };
  }
  const legacy = jiraAnalyticsAggregateDraftSchema.safeParse(value);
  if (!legacy.success) return null;
  return {
    dataset: jiraAnalyticsDatasetFromLegacy(legacy.data),
    legacyQuery: legacy.data,
    legacyContract: {
      exposedFields: [...JIRA_ANALYTICS_FIELDS_BY_SOURCE[legacy.data.source]],
      baseFilterLogic: legacy.data.filterLogic,
      baseFilters: legacy.data.filters,
    },
  };
}

export function jiraAnalyticsDatasetSemanticDocument(definition: JiraAnalyticsDatasetDraft) {
  const normalizeEndpoint = (
    endpoint: JiraAnalyticsStatusIntervalEndpoint | JiraAnalyticsStatusIntervalEndEndpoint,
  ) => {
    if (endpoint.anchor === "issueCreated") return { anchor: endpoint.anchor } as const;
    if (endpoint.anchor === "firstStatusEntry") {
      return {
        anchor: endpoint.anchor,
        statuses: endpoint.statuses.map(normalizedJiraValue).sort(codePointCompare),
      } as const;
    }
    if (endpoint.anchor === "resolution") {
      return { anchor: endpoint.anchor, occurrence: endpoint.occurrence } as const;
    }
    if (endpoint.anchor === "criticalPriority") {
      return { anchor: endpoint.anchor, occurrence: "first" } as const;
    }
    return {
      anchor: endpoint.anchor,
      fromStatuses: endpoint.fromStatuses.map(normalizedJiraValue).sort(codePointCompare),
      toStatuses: endpoint.toStatuses.map(normalizedJiraValue).sort(codePointCompare),
    } as const;
  };
  const rowConfig = definition.rowConfig
    ? {
        ...definition.rowConfig,
        start: normalizeEndpoint(definition.rowConfig.start),
        end: normalizeEndpoint(definition.rowConfig.end),
      }
    : null;
  return {
    source: definition.source,
    ...(rowConfig ? { rowConfig } : {}),
    timeZone: definition.timeZone,
  } as const;
}

export function jiraAnalyticsDatasetSemanticKey(definition: JiraAnalyticsDatasetDraft) {
  return JSON.stringify(jiraAnalyticsDatasetSemanticDocument(definition));
}

const visualizationSchema = z.enum(["number", "bar", "table"]);
const widthSchema = z.enum(["half", "full"]);

const jiraAnalyticsInlineWidgetShape = {
  id: z.string().min(1).max(200),
  title: z.string().max(200),
  source: z.enum(jiraAnalyticsSources),
  metric: z.enum(jiraAnalyticsMetrics),
  groupBy: z.enum(jiraAnalyticsGroupings),
  visualization: visualizationSchema,
  filterLogic: z.enum(["and", "or"]),
  filters: z.array(jiraAnalyticsFilterSchema).max(20),
  width: widthSchema,
};

function validateInlineWidget(
  widget: z.infer<z.ZodObject<typeof jiraAnalyticsInlineWidgetShape>>,
  context: z.RefinementCtx,
) {
  if (!JIRA_ANALYTICS_METRICS_BY_SOURCE[widget.source].includes(widget.metric)) {
    context.addIssue({ code: "custom", path: ["metric"], message: "Метрика недоступна для типа агрегата" });
  }
  if (!JIRA_ANALYTICS_GROUPS_BY_SOURCE[widget.source].includes(widget.groupBy)) {
    context.addIssue({ code: "custom", path: ["groupBy"], message: "Группировка недоступна для типа агрегата" });
  }
  widget.filters.forEach((filter, index) => {
    if (!JIRA_ANALYTICS_FIELDS_BY_SOURCE[widget.source].includes(filter.field)) {
      context.addIssue({ code: "custom", path: ["filters", index, "field"], message: "Поле недоступно для типа агрегата" });
    }
  });
}

export const jiraAnalyticsInlineWidgetSchema = z.object({
  ...jiraAnalyticsInlineWidgetShape,
  section: z.enum(jiraAnalyticsScopes),
}).strict().superRefine(validateInlineWidget);

export const jiraAnalyticsInlineWidgetReadSchema = z.object({
  ...jiraAnalyticsInlineWidgetShape,
  section: z.enum(jiraAnalyticsScopes).optional(),
}).superRefine(validateInlineWidget);

export const jiraAnalyticsReferencedWidgetSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().max(200),
  aggregateId: z.string().min(1).max(200),
  aggregateVersion: z.number().int().min(1).nullable().optional(),
  visualization: visualizationSchema,
  width: widthSchema,
  placement: z.enum(jiraAnalyticsScopes),
}).strict();

export const jiraAnalyticsManagedWidgetSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().max(200),
  aggregateId: z.string().min(1).max(200),
  aggregateVersion: z.number().int().min(1).nullable().optional(),
  // Placement also selects the active/retro data scope; it is not only UI layout.
  placement: z.enum(jiraAnalyticsScopes),
  metric: z.enum(jiraAnalyticsMetrics),
  groupBy: z.enum(jiraAnalyticsGroupings),
  filterLogic: z.enum(["and", "or"]),
  filters: z.array(jiraAnalyticsFilterSchema).max(20),
  periodMode: z.enum(jiraAnalyticsPeriodModes),
  periodDays: z.union(jiraAnalyticsPeriodDays.map((value) => z.literal(value)) as [
    z.ZodLiteral<30>,
    z.ZodLiteral<90>,
    z.ZodLiteral<180>,
    z.ZodLiteral<365>,
  ]).nullable(),
  sortBy: z.enum(jiraAnalyticsSortFields),
  sortDirection: z.enum(jiraAnalyticsSortDirections),
  visualization: visualizationSchema,
  width: widthSchema,
}).strict().superRefine((widget, context) => {
  if (widget.placement === "active" && widget.aggregateVersion != null) {
    context.addIssue({ code: "custom", path: ["aggregateVersion"], message: "В работе всегда использует текущую ревизию агрегата" });
  }
  if (widget.placement === "retro" && widget.aggregateVersion == null) {
    context.addIssue({ code: "custom", path: ["aggregateVersion"], message: "Ретро должно быть закреплено за ревизией агрегата" });
  }
  if ((widget.periodMode === "FIXED") !== (widget.periodDays !== null)) {
    context.addIssue({ code: "custom", path: ["periodDays"], message: "Фиксированный период требует количества дней" });
  }
});

const jiraAnalyticsSelectedFieldsSchema = z.array(
  z.enum(jiraAnalyticsFilterFields),
).min(1).max(jiraAnalyticsFilterFields.length).superRefine((fields, context) => {
  if (new Set(fields).size !== fields.length) {
    context.addIssue({ code: "custom", message: "Поля виджета не должны повторяться" });
  }
});

export const jiraAnalyticsManagedWidgetV4Schema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().max(200),
  aggregateId: z.string().min(1).max(200),
  aggregateVersion: z.number().int().min(1).nullable().optional(),
  placement: z.enum(jiraAnalyticsScopes),
  selectedFields: jiraAnalyticsSelectedFieldsSchema,
  baseFilterLogic: z.enum(["and", "or"]),
  baseFilters: z.array(jiraAnalyticsFilterSchema).max(20),
  metric: z.enum(jiraAnalyticsMetrics),
  groupBy: z.enum(jiraAnalyticsGroupings),
  filterLogic: z.enum(["and", "or"]),
  filters: z.array(jiraAnalyticsFilterSchema).max(20),
  periodMode: z.enum(jiraAnalyticsPeriodModes),
  periodDays: z.union(jiraAnalyticsPeriodDays.map((value) => z.literal(value)) as [
    z.ZodLiteral<30>,
    z.ZodLiteral<90>,
    z.ZodLiteral<180>,
    z.ZodLiteral<365>,
  ]).nullable(),
  sortBy: z.enum(jiraAnalyticsSortFields),
  sortDirection: z.enum(jiraAnalyticsSortDirections),
  visualization: visualizationSchema,
  width: widthSchema,
}).strict().superRefine((widget, context) => {
  if (widget.placement === "active" && widget.aggregateVersion != null) {
    context.addIssue({ code: "custom", path: ["aggregateVersion"], message: "В работе всегда использует текущую ревизию агрегата" });
  }
  if (widget.placement === "retro" && widget.aggregateVersion == null) {
    context.addIssue({ code: "custom", path: ["aggregateVersion"], message: "Ретро должно быть закреплено за ревизией агрегата" });
  }
  if ((widget.periodMode === "FIXED") !== (widget.periodDays !== null)) {
    context.addIssue({ code: "custom", path: ["periodDays"], message: "Фиксированный период требует количества дней" });
  }
});

export const jiraAnalyticsDashboardV1Schema = z.object({
  version: z.literal(1),
  periodDays: z.union(jiraAnalyticsPeriodDays.map((value) => z.literal(value)) as [
    z.ZodLiteral<30>,
    z.ZodLiteral<90>,
    z.ZodLiteral<180>,
    z.ZodLiteral<365>,
  ]),
  assignee: z.string().max(200),
  widgets: z.array(jiraAnalyticsInlineWidgetSchema).min(1).max(100),
}).strict();

export const jiraAnalyticsDashboardV1ReadSchema = z.object({
  version: z.literal(1),
  periodDays: z.union(jiraAnalyticsPeriodDays.map((value) => z.literal(value)) as [
    z.ZodLiteral<30>,
    z.ZodLiteral<90>,
    z.ZodLiteral<180>,
    z.ZodLiteral<365>,
  ]),
  assignee: z.string().max(200),
  widgets: z.array(jiraAnalyticsInlineWidgetReadSchema).min(1).max(100),
});

export const jiraAnalyticsDashboardV2Schema = z.object({
  version: z.literal(2),
  periodDays: z.union(jiraAnalyticsPeriodDays.map((value) => z.literal(value)) as [
    z.ZodLiteral<30>,
    z.ZodLiteral<90>,
    z.ZodLiteral<180>,
    z.ZodLiteral<365>,
  ]),
  assignee: z.string().max(200),
  widgets: z.array(jiraAnalyticsReferencedWidgetSchema).min(1).max(100),
}).strict();

export const jiraAnalyticsDashboardV3Schema = z.object({
  version: z.literal(3),
  periodDays: z.union(jiraAnalyticsPeriodDays.map((value) => z.literal(value)) as [
    z.ZodLiteral<30>,
    z.ZodLiteral<90>,
    z.ZodLiteral<180>,
    z.ZodLiteral<365>,
  ]),
  assignee: z.string().max(200),
  widgets: z.array(jiraAnalyticsManagedWidgetSchema).max(100),
}).strict();

export const jiraAnalyticsDashboardV4Schema = z.object({
  version: z.literal(4),
  periodDays: z.union(jiraAnalyticsPeriodDays.map((value) => z.literal(value)) as [
    z.ZodLiteral<30>,
    z.ZodLiteral<90>,
    z.ZodLiteral<180>,
    z.ZodLiteral<365>,
  ]),
  assignee: z.string().max(200),
  widgets: z.array(jiraAnalyticsManagedWidgetV4Schema).max(100),
}).strict();

export const jiraAnalyticsDashboardConfigSchema = z.discriminatedUnion("version", [
  jiraAnalyticsDashboardV1Schema,
  jiraAnalyticsDashboardV2Schema,
  jiraAnalyticsDashboardV3Schema,
  jiraAnalyticsDashboardV4Schema,
]);

export type JiraAnalyticsDashboardV1 = z.infer<typeof jiraAnalyticsDashboardV1Schema>;
export type JiraAnalyticsDashboardV2 = z.infer<typeof jiraAnalyticsDashboardV2Schema>;
export type JiraAnalyticsDashboardV3 = z.infer<typeof jiraAnalyticsDashboardV3Schema>;
export type JiraAnalyticsDashboardV4 = z.infer<typeof jiraAnalyticsDashboardV4Schema>;
export type JiraAnalyticsDashboardConfig = z.infer<typeof jiraAnalyticsDashboardConfigSchema>;
export type JiraAnalyticsInlineWidget = JiraAnalyticsDashboardV1["widgets"][number];
export type JiraAnalyticsReferencedWidget = JiraAnalyticsDashboardV2["widgets"][number];
export type JiraAnalyticsManagedWidgetV3 = JiraAnalyticsDashboardV3["widgets"][number];
export type JiraAnalyticsManagedWidget = JiraAnalyticsDashboardV4["widgets"][number];

export function jiraAnalyticsLegacyWidgetSection(
  source: JiraAnalyticsSource,
  metric: JiraAnalyticsMetric,
): JiraAnalyticsScope {
  return source === "criticalBugs" || (
    source === "transitions" &&
    ["averageDuration", "p50Duration", "p85Duration", "p95Duration"].includes(metric)
  ) ? "retro" : "active";
}

export function normalizeJiraAnalyticsInlineWidget(
  widget: z.infer<typeof jiraAnalyticsInlineWidgetReadSchema>,
): JiraAnalyticsInlineWidget {
  return jiraAnalyticsInlineWidgetSchema.parse({
    ...widget,
    section: widget.section ?? jiraAnalyticsLegacyWidgetSection(widget.source, widget.metric),
  });
}

export function normalizeJiraAnalyticsDashboardV1(
  value: unknown,
): JiraAnalyticsDashboardV1 | null {
  const parsed = jiraAnalyticsDashboardV1ReadSchema.safeParse(value);
  if (!parsed.success) return null;
  return jiraAnalyticsDashboardV1Schema.parse({
    ...parsed.data,
    widgets: parsed.data.widgets.map(normalizeJiraAnalyticsInlineWidget),
  });
}

const jiraAnalyticsGroupingField: Partial<Record<JiraAnalyticsGroupBy, JiraAnalyticsFilterField>> = {
  project: "project",
  status: "status",
  assignee: "assignee",
  reporter: "reporter",
  priority: "priority",
  sprint: "sprint",
  issueType: "issueType",
  resolution: "resolution",
  fromStatus: "fromStatus",
  toStatus: "toStatus",
  week: "eventAt",
};

export function jiraAnalyticsWidgetDatasetError(
  widget: JiraAnalyticsManagedWidget | JiraAnalyticsManagedWidgetV3,
  dataset: JiraAnalyticsDatasetDraft,
  legacyContract: JiraAnalyticsLegacyDatasetContract | null = null,
) {
  if (dataset.source === "statusIntervals" && dataset.rowConfig === null) {
    return "Для интервала статусов не настроены контрольные точки";
  }
  if (!JIRA_ANALYTICS_METRICS_BY_SOURCE[dataset.source].includes(widget.metric)) {
    return "Метрика недоступна для типа агрегата";
  }
  if (!JIRA_ANALYTICS_GROUPS_BY_SOURCE[dataset.source].includes(widget.groupBy)) {
    return "Группировка недоступна для типа агрегата";
  }
  const availableFields = JIRA_ANALYTICS_FIELDS_BY_SOURCE[dataset.source];
  const exposed = new Set(
    "selectedFields" in widget
      ? widget.selectedFields
      : legacyContract?.exposedFields ?? availableFields,
  );
  if ("selectedFields" in widget) {
    const unavailableSelectedField = widget.selectedFields.find((field) => !availableFields.includes(field));
    if (unavailableSelectedField) return `Поле ${unavailableSelectedField} недоступно для агрегата`;
    const unavailableBaseFilter = widget.baseFilters.find((filter) => !availableFields.includes(filter.field));
    if (unavailableBaseFilter) return `Поле ${unavailableBaseFilter.field} недоступно для агрегата`;
    const unselectedBaseFilter = widget.baseFilters.find((filter) => !exposed.has(filter.field));
    if (unselectedBaseFilter) return `Поле ${unselectedBaseFilter.field} не выбрано в виджете`;
  }
  const groupingField = jiraAnalyticsGroupingField[widget.groupBy];
  if (groupingField && !exposed.has(groupingField)) {
    return "selectedFields" in widget
      ? "Поле группировки не выбрано в виджете"
      : "Поле группировки не опубликовано агрегатом";
  }
  const unavailableFilter = widget.filters.find((filter) => !exposed.has(filter.field));
  if (unavailableFilter) {
    return "selectedFields" in widget
      ? `Поле ${unavailableFilter.field} не выбрано в виджете`
      : `Поле ${unavailableFilter.field} не опубликовано агрегатом`;
  }
  const sortField = widget.sortBy === "default" ? null : widget.sortBy;
  if (sortField && !exposed.has(sortField)) {
    return "selectedFields" in widget
      ? "Поле сортировки не выбрано в виджете"
      : "Поле сортировки не опубликовано агрегатом";
  }
  const periodSupport = jiraAnalyticsSourcePeriodSupport(dataset.source);
  if (periodSupport === "none" && widget.periodMode !== "NONE") return "Этот тип агрегата не использует период";
  if (periodSupport === "required" && widget.periodMode === "NONE") return "Для событийного типа агрегата нужен период";
  return null;
}

function defaultInlineWidget(
  id: string,
  title: string,
  source: JiraAnalyticsSource,
  options: Partial<Omit<JiraAnalyticsInlineWidget, "id" | "title" | "source">> = {},
): JiraAnalyticsInlineWidget {
  return {
    id,
    title,
    source,
    metric: source === "transitions" ? "p50Duration" : "count",
    groupBy: "none",
    visualization: "number",
    filterLogic: "and",
    filters: [],
    width: "half",
    section: source === "transitions" || source === "criticalBugs" ? "retro" : "active",
    ...options,
  };
}

const defaultFilter = (
  id: string,
  field: JiraAnalyticsFilterField,
  operator: JiraAnalyticsFilterOperator,
  value = "",
): JiraAnalyticsFilter => ({ id, field, operator, value });

export const JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1: JiraAnalyticsDashboardV1 = {
  version: 1,
  periodDays: 90,
  assignee: "",
  widgets: [
    defaultInlineWidget("unplanned-count", "Вне Sprint с кодом", "issues", {
      filters: [
        defaultFilter("unplanned-count-sprint", "sprint", "empty"),
        defaultFilter("unplanned-count-development", "hasDevelopment", "equals", "true"),
      ],
    }),
    defaultInlineWidget("unplanned-commits", "Коммиты у тикетов без Sprint", "issues", {
      metric: "commits",
      filters: [defaultFilter("unplanned-commits-sprint", "sprint", "empty")],
    }),
    defaultInlineWidget("unplanned-assignees", "Ситуации по исполнителям", "issues", {
      groupBy: "assignee",
      visualization: "bar",
      width: "full",
      filters: [
        defaultFilter("unplanned-assignees-sprint", "sprint", "empty"),
        defaultFilter("unplanned-assignees-development", "hasDevelopment", "equals", "true"),
      ],
    }),
    defaultInlineWidget("unplanned-table", "Тикеты, требующие внимания", "issues", {
      visualization: "table",
      width: "full",
      filters: [
        defaultFilter("unplanned-table-sprint", "sprint", "empty"),
        defaultFilter("unplanned-table-development", "hasDevelopment", "equals", "true"),
      ],
    }),
    defaultInlineWidget("flow-p50", "Медианное время в статусе", "transitions"),
    defaultInlineWidget("flow-p85", "Время в статусе, P85", "transitions", {
      metric: "p85Duration",
    }),
    defaultInlineWidget("flow-status", "Тикеты по статусам", "issues", {
      groupBy: "status",
      visualization: "bar",
      width: "full",
    }),
    defaultInlineWidget("flow-longest", "Самые долгие этапы", "transitions", {
      metric: "averageDuration",
      visualization: "table",
      width: "full",
    }),
    defaultInlineWidget("critical-bugs-sla-count", "Нарушили SLA 30 дней", "criticalBugs", {
      filters: [defaultFilter("critical-count-duration", "durationHours", "greaterThan", String(jiraCriticalBugSlaHours))],
    }),
    defaultInlineWidget("critical-bugs-sla-project", "Нарушения по проектам", "criticalBugs", {
      groupBy: "project",
      visualization: "bar",
      width: "full",
      filters: [defaultFilter("critical-project-duration", "durationHours", "greaterThan", String(jiraCriticalBugSlaHours))],
    }),
    defaultInlineWidget("critical-bugs-sla-table", "Тикеты с нарушенным SLA", "criticalBugs", {
      visualization: "table",
      width: "full",
      filters: [defaultFilter("critical-table-duration", "durationHours", "greaterThan", String(jiraCriticalBugSlaHours))],
    }),
  ],
};

export function normalizeJiraAnalyticsName(value: string) {
  return value.normalize("NFKC").trim().replaceAll(/\s+/gu, " ").toLocaleLowerCase("ru-RU");
}

function codePointCompare(left: string, right: string) {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function normalizedFilterValue(filter: JiraAnalyticsFilter) {
  if (filter.operator === "empty" || filter.operator === "notEmpty") return "";
  if (numericFields.has(filter.field)) return String(Number(filter.value));
  return filter.value.normalize("NFKC").trim().toLocaleLowerCase("ru-RU");
}

export function jiraAnalyticsSemanticDocument(definition: JiraAnalyticsAggregateDraft) {
  const usesPeriod = jiraAnalyticsSourceUsesPeriod(definition.source);
  const filters = definition.filters
    .map((filter) => ({
      field: filter.field,
      operator: filter.operator,
      value: normalizedFilterValue(filter),
    }))
    .sort((left, right) => codePointCompare(JSON.stringify(left), JSON.stringify(right)));
  return {
    source: definition.source,
    metric: definition.metric,
    groupBy: definition.groupBy,
    scope: definition.scope,
    filterLogic: definition.filterLogic,
    filters,
    periodMode: usesPeriod ? definition.periodMode : "NONE",
    periodDays: usesPeriod && definition.periodMode === "FIXED" ? definition.periodDays : null,
    timeZone: definition.timeZone,
  } as const;
}

export function jiraAnalyticsSemanticKey(definition: JiraAnalyticsAggregateDraft) {
  return JSON.stringify(jiraAnalyticsSemanticDocument(definition));
}

export type JiraAnalyticsTransitionData = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  transitionedAt: string;
};

export type JiraAnalyticsDevelopmentData = {
  id: string;
  activityAt: string;
  commitCount: number;
  mergeRequestCount: number;
  sprintAtObservation: string | null;
  isBaseline: boolean;
};

export type JiraAnalyticsIssueData = {
  id: string;
  issueKey: string;
  issueUrl: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string | null;
  reporter: string | null;
  issueType: string;
  resolution: string | null;
  sprint: string | null;
  sprintCount: number;
  issueCreatedAt: string | null;
  criticalPriorityAt: string | null;
  criticalEndPriority?: string | null;
  resolutionAt: string | null;
  criticalSlaTracked: boolean;
  commitCount: number;
  mergeRequestCount: number;
  developmentDataAvailable: boolean;
  transitionHistoryComplete: boolean;
  dataObservedAt?: string | null;
  updatedAt: string;
  statusTransitions: JiraAnalyticsTransitionData[];
  developmentActivities: JiraAnalyticsDevelopmentData[];
};

export type JiraAnalyticsResultRecord = {
  id: string;
  source: JiraAnalyticsSource;
  issue: Omit<
    JiraAnalyticsIssueData,
    "statusTransitions" | "developmentActivities" | "criticalEndPriority" | "dataObservedAt"
  >;
  eventAt: string | null;
  intervalStartAt: string | null;
  intervalEndAt: string | null;
  intervalStartFromStatus: string | null;
  intervalStartToStatus: string | null;
  intervalEndFromStatus: string | null;
  intervalEndToStatus: string | null;
  durationHours: number | null;
  commitCount: number;
  mergeRequestCount: number;
  fromStatus: string | null;
  toStatus: string | null;
  sprint: string | null;
  occurrenceIndex?: number;
  occurrenceCount?: number;
};

export type JiraAnalyticsDataQualityStatus =
  | "COMPLETE"
  | "PARTIAL"
  | "NO_DATA"
  | "UNAVAILABLE";

export type JiraAnalyticsDataQualityWarning = {
  code:
    | "NO_SOURCE_POPULATION"
    | "INCOMPLETE_TRANSITION_HISTORY"
    | "MISSING_ISSUE_CREATED_AT"
    | "INCOMPLETE_DEVELOPMENT_DATA"
    | "INCOMPLETE_CRITICAL_SLA"
    | "MISSING_HISTORICAL_OBSERVATION"
    | "BEFORE_HISTORY_START"
    | "HISTORY_WRITE_GAP";
  count: number;
};

export type JiraAnalyticsDataQuality = {
  status: JiraAnalyticsDataQualityStatus;
  basis: "CURRENT_PROJECTION" | "OBSERVED_VERSIONS";
  source: JiraAnalyticsSource;
  population: number;
  complete: number;
  incomplete: number;
  coveragePercent: number | null;
  oldestObservedAt: string | null;
  latestObservedAt: string | null;
  warnings: JiraAnalyticsDataQualityWarning[];
};

export type JiraAnalyticsEvaluationOptions = {
  now: string;
  periodDays?: JiraAnalyticsPeriodDays;
  assignee: string;
  page: number;
  pageSize: number;
  groupKey?: string;
};

export type JiraAnalyticsExecutableDefinition = JiraAnalyticsAggregateDraft & {
  baseFilterLogic?: "and" | "or";
  baseFilters?: JiraAnalyticsFilter[];
  rowConfig?: JiraAnalyticsRowConfig | null;
  sortBy?: JiraAnalyticsSortField;
  sortDirection?: JiraAnalyticsSortDirection;
  dateField?: JiraAnalyticsFilterField | null;
  criticalSlaConfig?: {
    issueTypes: string[];
    priorities: string[];
    requirePriorityAtResolution: boolean;
    openIntervals: "exclude" | "include";
  };
  criticalRiskConfig?: {
    priorities: string[];
    bugIssueTypes: string[];
    bugSlaHours: number;
    bugWarningHours: number;
    taskIssueTypes: string[];
    taskRiskHours: number;
  };
  rowIdentity?: Array<JiraAnalyticsFilterField | "rowId">;
  maximumRows?: number;
  maximumRowsPerIssue?: number;
};

export type JiraAnalyticsEvaluationResult = {
  evaluatedAt: string;
  effective: {
    periodDays: JiraAnalyticsPeriodDays | null;
    periodSource: JiraAnalyticsPeriodMode;
    timeZone: JiraAnalyticsTimeZone;
    assignee: string;
  };
  value: number;
  groups: Array<{ key: string; label: string; value: number; recordCount: number }>;
  records: JiraAnalyticsResultRecord[];
  totalRecords: number;
  page: number;
  pageSize: number;
  quality: JiraAnalyticsDataQuality;
};

export type JiraAnalyticsEvaluationLimits = {
  maxGroups?: number;
  maxPageWindow?: number;
  maxPageSize?: number;
};

export class JiraAnalyticsEvaluationLimitError extends Error {
  constructor(
    public readonly kind: "groups" | "pageWindow" | "rows" | "rowsPerIssue",
    public readonly limit: number,
  ) {
    super(`JIRA_ANALYTICS_${kind.replaceAll(/([A-Z])/g, "_$1").toUpperCase()}_LIMIT`);
  }
}

export type JiraAnalyticsEvaluationAccumulator = {
  addIssues: (issues: readonly JiraAnalyticsIssueData[]) => void;
  finish: () => JiraAnalyticsEvaluationResult;
};

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function publicIssue(issue: JiraAnalyticsIssueData) {
  const {
    statusTransitions: _transitions,
    developmentActivities: _development,
    criticalEndPriority: _criticalEndPriority,
    dataObservedAt: _dataObservedAt,
    ...result
  } = issue;
  return result;
}

function issueRecord(issue: JiraAnalyticsIssueData): JiraAnalyticsResultRecord {
  return {
    id: `issue:${issue.id}`,
    source: "issues",
    issue: publicIssue(issue),
    eventAt: validDate(issue.updatedAt)?.toISOString() ?? null,
    intervalStartAt: null,
    intervalEndAt: null,
    intervalStartFromStatus: null,
    intervalStartToStatus: null,
    intervalEndFromStatus: null,
    intervalEndToStatus: null,
    durationHours: null,
    commitCount: issue.commitCount,
    mergeRequestCount: issue.mergeRequestCount,
    fromStatus: null,
    toStatus: null,
    sprint: issue.sprint,
  };
}

function transitionRecords(issue: JiraAnalyticsIssueData): JiraAnalyticsResultRecord[] {
  if (!issue.transitionHistoryComplete) return [];
  const transitions = issue.statusTransitions
    .map((transition) => ({ ...transition, date: validDate(transition.transitionedAt) }))
    .filter((transition): transition is typeof transition & { date: Date } => transition.date !== null)
    .sort((left, right) => left.date.getTime() - right.date.getTime() || codePointCompare(left.id, right.id));
  let enteredAt = validDate(issue.issueCreatedAt);
  return transitions.map((transition) => {
    const durationHours = enteredAt
      ? Math.max(0, (transition.date.getTime() - enteredAt.getTime()) / 3_600_000)
      : null;
    enteredAt = transition.date;
    return {
      id: `transition:${transition.id}`,
      source: "transitions",
      issue: publicIssue(issue),
      eventAt: transition.date.toISOString(),
      intervalStartAt: null,
      intervalEndAt: null,
      intervalStartFromStatus: null,
      intervalStartToStatus: null,
      intervalEndFromStatus: null,
      intervalEndToStatus: null,
      durationHours,
      commitCount: 0,
      mergeRequestCount: 0,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      sprint: issue.sprint,
    };
  });
}

function developmentRecords(issue: JiraAnalyticsIssueData): JiraAnalyticsResultRecord[] {
  return issue.developmentActivities
    .filter((activity) => !activity.isBaseline)
    .flatMap((activity) => {
      const eventAt = validDate(activity.activityAt);
      if (!eventAt) return [];
      return [{
        id: `development:${activity.id}`,
        source: "development" as const,
        issue: publicIssue(issue),
        eventAt: eventAt.toISOString(),
        intervalStartAt: null,
        intervalEndAt: null,
        intervalStartFromStatus: null,
        intervalStartToStatus: null,
        intervalEndFromStatus: null,
        intervalEndToStatus: null,
        durationHours: null,
        commitCount: activity.commitCount,
        mergeRequestCount: activity.mergeRequestCount,
        fromStatus: null,
        toStatus: null,
        sprint: activity.sprintAtObservation,
      }];
    });
}

function matchesConfiguredValue(actual: string | null | undefined, expected: readonly string[]) {
  const normalized = normalizedJiraValue(actual);
  return normalized !== "" && expected.some((value) => normalizedJiraValue(value) === normalized);
}

function matchesConfiguredIssueType(actual: string | null | undefined, expected: readonly string[]) {
  const normalized = normalizedJiraValue(actual);
  if (normalized === "") return false;
  return expected.some((value) => {
    const configured = normalizedJiraValue(value);
    return configured !== "" && (
      normalized === configured
      || normalized.startsWith(`${configured}:`)
      || normalized.startsWith(`${configured}-`)
      || normalized.startsWith(`${configured} -`)
      || normalized.startsWith(`${configured} (`)
      || normalized.startsWith(`${configured}/`)
    );
  });
}

function criticalBugRecord(
  issue: JiraAnalyticsIssueData,
  now: Date,
  config?: JiraAnalyticsExecutableDefinition["criticalSlaConfig"],
): JiraAnalyticsResultRecord | null {
  if (config && !matchesConfiguredIssueType(issue.issueType, config.issueTypes)) return null;
  if (config && !issue.resolutionAt && !matchesConfiguredValue(issue.priority, config.priorities)) return null;
  if (config?.requirePriorityAtResolution && issue.resolutionAt && !matchesConfiguredValue(issue.criticalEndPriority, config.priorities)) return null;
  if (config?.openIntervals === "exclude" && !issue.resolutionAt) return null;
  const startedAt = validDate(issue.criticalPriorityAt);
  if ((!config && !issue.criticalSlaTracked) || !startedAt) return null;
  const finishedAt = validDate(issue.resolutionAt) ?? now;
  return {
    id: `critical-bug:${issue.id}`,
    source: "criticalBugs",
    issue: publicIssue(issue),
    eventAt: startedAt.toISOString(),
    intervalStartAt: startedAt.toISOString(),
    intervalEndAt: validDate(issue.resolutionAt)?.toISOString() ?? null,
    intervalStartFromStatus: null,
    intervalStartToStatus: null,
    intervalEndFromStatus: null,
    intervalEndToStatus: null,
    durationHours: Math.max(0, (finishedAt.getTime() - startedAt.getTime()) / 3_600_000),
    commitCount: issue.commitCount,
    mergeRequestCount: issue.mergeRequestCount,
    fromStatus: null,
    toStatus: null,
    sprint: issue.sprint,
  };
}

function criticalRiskRecord(
  issue: JiraAnalyticsIssueData,
  now: Date,
  config: NonNullable<JiraAnalyticsExecutableDefinition["criticalRiskConfig"]>,
): JiraAnalyticsResultRecord | null {
  if (!jiraIssueIsInWorkScope(issue) || issue.resolutionAt || !matchesConfiguredValue(issue.priority, config.priorities)) return null;
  const startedAt = validDate(issue.criticalPriorityAt);
  if (!startedAt) return null;
  const durationHours = Math.max(0, (now.getTime() - startedAt.getTime()) / 3_600_000);
  const bugAtRisk = matchesConfiguredIssueType(issue.issueType, config.bugIssueTypes)
    && durationHours > config.bugSlaHours - config.bugWarningHours
    && durationHours < config.bugSlaHours;
  const taskAtRisk = matchesConfiguredIssueType(issue.issueType, config.taskIssueTypes)
    && durationHours >= config.taskRiskHours;
  if (!bugAtRisk && !taskAtRisk) return null;
  return {
    id: `critical-risk:${issue.id}`,
    source: "criticalBugs",
    issue: publicIssue(issue),
    eventAt: startedAt.toISOString(),
    intervalStartAt: startedAt.toISOString(),
    intervalEndAt: null,
    intervalStartFromStatus: null,
    intervalStartToStatus: null,
    intervalEndFromStatus: null,
    intervalEndToStatus: null,
    durationHours,
    commitCount: issue.commitCount,
    mergeRequestCount: issue.mergeRequestCount,
    fromStatus: null,
    toStatus: null,
    sprint: issue.sprint,
  };
}

type JiraStatusEntryEvent = {
  at: Date;
  identity: string;
  fromStatus: string | null;
  toStatus: string | null;
  isCreation: boolean;
};

function statusMatches(status: string | null, expected: readonly string[]) {
  const normalized = normalizedJiraValue(status);
  return normalized !== "" && expected.some((value) => normalizedJiraValue(value) === normalized);
}

function statusIntervalNeedsCreatedAt(config: JiraAnalyticsStatusIntervalRowConfig) {
  return config.start.anchor === "issueCreated" || config.start.anchor === "firstStatusEntry";
}

function statusEndpointMatches(
  event: JiraStatusEntryEvent,
  endpoint: JiraAnalyticsStatusIntervalEndpoint | JiraAnalyticsStatusIntervalEndEndpoint,
) {
  if (endpoint.anchor === "issueCreated") return event.isCreation;
  if (endpoint.anchor === "criticalPriority") return event.identity === "critical-priority";
  if (endpoint.anchor === "resolution") return event.identity === "resolution";
  if (endpoint.anchor === "firstStatusEntry") return statusMatches(event.toStatus, endpoint.statuses);
  return !event.isCreation &&
    (endpoint.fromStatuses.length === 0 || statusMatches(event.fromStatus, endpoint.fromStatuses)) &&
    (endpoint.toStatuses.length === 0 || statusMatches(event.toStatus, endpoint.toStatuses));
}

function statusIntervalRecords(
  issue: JiraAnalyticsIssueData,
  config: JiraAnalyticsStatusIntervalRowConfig,
  now: Date,
): JiraAnalyticsResultRecord[] {
  if (!issue.transitionHistoryComplete) return [];
  const createdAt = validDate(issue.issueCreatedAt);
  if (statusIntervalNeedsCreatedAt(config) && !createdAt) return [];
  const transitions = issue.statusTransitions
    .map((transition) => ({ ...transition, date: validDate(transition.transitionedAt) }))
    .filter((transition): transition is typeof transition & { date: Date } => transition.date !== null)
    .sort((left, right) => left.date.getTime() - right.date.getTime() || codePointCompare(left.id, right.id));
  const entries: JiraStatusEntryEvent[] = [
    ...(createdAt ? [{
      at: createdAt,
      identity: "created",
      fromStatus: null,
      toStatus: transitions.length > 0 ? transitions[0]?.fromStatus ?? null : issue.status ?? null,
      isCreation: true,
    }] : []),
    ...transitions.map((transition) => ({
      at: transition.date,
      identity: transition.id,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      isCreation: false,
    })),
    ...(validDate(issue.criticalPriorityAt) ? [{
      at: validDate(issue.criticalPriorityAt)!,
      identity: "critical-priority",
      fromStatus: null,
      toStatus: null,
      isCreation: false,
    }] : []),
    ...(validDate(issue.resolutionAt) ? [{
      at: validDate(issue.resolutionAt)!,
      identity: "resolution",
      fromStatus: null,
      toStatus: null,
      isCreation: false,
    }] : []),
  ].sort((left, right) => left.at.getTime() - right.at.getTime() || codePointCompare(left.identity, right.identity));
  const matchingStarts = entries.filter((entry) => statusEndpointMatches(entry, config.start));
  const startOccurrence = config.start.occurrence ?? "first";
  const starts = startOccurrence === "all"
    ? matchingStarts
    : startOccurrence === "last"
      ? matchingStarts.slice(-1)
      : matchingStarts.slice(0, 1);
  const records: JiraAnalyticsResultRecord[] = [];
  let consumedThrough = Number.NEGATIVE_INFINITY;
  for (const start of starts) {
    if (start.at.getTime() <= consumedThrough) continue;
    const matchingEnds = entries.filter((entry) =>
      entry.at.getTime() >= start.at.getTime() &&
      (entry.at.getTime() > start.at.getTime() || entry.identity !== start.identity || config.start.anchor === "issueCreated") &&
      statusEndpointMatches(entry, config.end)
    );
    const endOccurrence = config.end.occurrence ?? "first";
    const end = endOccurrence === "last" ? matchingEnds.at(-1) ?? null : matchingEnds[0] ?? null;
    if (!end && config.openIntervals === "exclude") continue;
    const finishedAt = end?.at ?? now;
    const intervalStartAt = start.at.toISOString();
    const intervalEndAt = end?.at.toISOString() ?? null;
    records.push({
      id: `status-interval:${issue.id}:${start.identity}:${end?.identity ?? "open"}`,
      source: "statusIntervals" as const,
      issue: publicIssue(issue),
      eventAt: config.periodAnchor === "start" ? intervalStartAt : intervalEndAt,
      intervalStartAt,
      intervalEndAt,
      intervalStartFromStatus: start.fromStatus,
      intervalStartToStatus: start.toStatus,
      intervalEndFromStatus: end?.fromStatus ?? null,
      intervalEndToStatus: end?.toStatus ?? null,
      durationHours: Math.max(0, (finishedAt.getTime() - start.at.getTime()) / 3_600_000),
      commitCount: issue.commitCount,
      mergeRequestCount: issue.mergeRequestCount,
      fromStatus: start.toStatus,
      toStatus: end?.toStatus ?? null,
      sprint: issue.sprint,
    });
    consumedThrough = end?.at.getTime() ?? Number.POSITIVE_INFINITY;
  }
  return records.map((record, index) => ({
    ...record,
    occurrenceIndex: index + 1,
    occurrenceCount: records.length,
  }));
}

function jiraIssueIsInWorkScope(
  issue: Pick<JiraAnalyticsIssueData, "resolution" | "status">,
) {
  return isJiraUnresolvedResolution(issue.resolution) && !isJiraCancelledStatus(issue.status);
}

function recordValue(record: JiraAnalyticsResultRecord, field: JiraAnalyticsFilterField | "rowId") {
  if (field === "rowId") return record.id;
  if (field === "issueKey") return record.issue.issueKey;
  if (field === "project") {
    return record.issue.issueKey.trim().toUpperCase().match(/^([A-Z][A-Z0-9_]*)-\d+$/)?.[1] ?? null;
  }
  if (field === "summary") return record.issue.summary;
  if (field === "fromStatus") return record.fromStatus;
  if (field === "toStatus") return record.toStatus;
  if (field === "durationHours") return record.durationHours;
  if (field === "commitCount") return record.commitCount;
  if (field === "mergeRequestCount") return record.mergeRequestCount;
  if (field === "sprintCount") return record.issue.sprintCount;
  if (field === "hasDevelopment") return record.issue.commitCount > 0 || record.issue.mergeRequestCount > 0;
  if (field === "eventAt") return record.eventAt;
  if (field === "intervalStartAt") return record.intervalStartAt;
  if (field === "intervalEndAt") return record.intervalEndAt;
  if (field === "sprint") return record.sprint;
  if (field === "resolution") return isJiraUnresolvedResolution(record.issue.resolution) ? null : record.issue.resolution;
  return record.issue[field];
}

function filterMatches(record: JiraAnalyticsResultRecord, filter: JiraAnalyticsFilter) {
  const actual = recordValue(record, filter.field);
  const actualText = actual === null || actual === undefined ? "" : String(actual).trim();
  const expected = filter.field === "resolution" &&
    (filter.operator === "equals" || filter.operator === "notEquals") &&
    isJiraUnresolvedResolution(filter.value)
    ? ""
    : filter.value.trim();
  if (filter.operator === "empty") return actualText === "";
  if (filter.operator === "notEmpty") return actualText !== "";
  const foldedActual = actualText.toLocaleLowerCase("ru-RU");
  const foldedExpected = expected.toLocaleLowerCase("ru-RU");
  if (filter.operator === "equals") return foldedActual === foldedExpected;
  if (filter.operator === "notEquals") return foldedActual !== foldedExpected;
  if (filter.operator === "contains") return foldedActual.includes(foldedExpected);
  if (filter.operator === "before" || filter.operator === "after") {
    const actualDate = new Date(actualText);
    const expectedDate = new Date(expected);
    if (Number.isNaN(actualDate.getTime()) || Number.isNaN(expectedDate.getTime())) return false;
    return filter.operator === "before" ? actualDate < expectedDate : actualDate > expectedDate;
  }
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;
  if (filter.operator === "greaterThan") return actualNumber > expectedNumber;
  if (filter.operator === "atLeast") return actualNumber >= expectedNumber;
  if (filter.operator === "lessThan") return actualNumber < expectedNumber;
  if (filter.operator === "atMost") return actualNumber <= expectedNumber;
  return actualNumber === expectedNumber;
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

type MetricState = {
  recordCount: number;
  commitCount: number;
  mergeRequestCount: number;
  durationSum: number;
  durations: number[];
};

function emptyMetricState(): MetricState {
  return {
    recordCount: 0,
    commitCount: 0,
    mergeRequestCount: 0,
    durationSum: 0,
    durations: [],
  };
}

function addRecordToMetricState(state: MetricState, record: JiraAnalyticsResultRecord) {
  state.recordCount += 1;
  state.commitCount += record.commitCount;
  state.mergeRequestCount += record.mergeRequestCount;
  if (record.durationHours !== null && Number.isFinite(record.durationHours)) {
    state.durationSum += record.durationHours;
    state.durations.push(record.durationHours);
  }
}

function metricValue(metric: JiraAnalyticsMetric, state: MetricState) {
  if (metric === "count") return state.recordCount;
  if (metric === "commits") return state.commitCount;
  if (metric === "mergeRequests") return state.mergeRequestCount;
  if (state.durations.length === 0) return 0;
  if (metric === "averageDuration") return state.durationSum / state.durations.length;
  if (metric === "p50Duration") return percentile(state.durations, 0.5);
  if (metric === "p85Duration") return percentile(state.durations, 0.85);
  return percentile(state.durations, 0.95);
}

function zonedDateParts(date: Date, timeZone: JiraAnalyticsTimeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function isoWeek(date: Date, timeZone: JiraAnalyticsTimeZone) {
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

function groupIdentity(
  record: JiraAnalyticsResultRecord,
  groupBy: JiraAnalyticsGroupBy,
  timeZone: JiraAnalyticsTimeZone,
) {
  const value = (raw: string | null | undefined, emptyLabel: string) => raw
    ? { key: `value:${raw}`, label: raw }
    : { key: "__empty__", label: emptyLabel };
  if (groupBy === "project") {
    const project = record.issue.issueKey.trim().toUpperCase().match(/^([A-Z][A-Z0-9_]*)-\d+$/)?.[1];
    return value(project, "Без проекта");
  }
  if (groupBy === "status") return value(record.issue.status, "Без статуса");
  if (groupBy === "assignee") return value(record.issue.assignee, "Не назначен");
  if (groupBy === "reporter") return value(record.issue.reporter, "Без автора");
  if (groupBy === "priority") return value(record.issue.priority, "Без приоритета");
  if (groupBy === "sprint") return value(record.sprint, "Без Sprint");
  if (groupBy === "issueType") return value(record.issue.issueType, "Без типа");
  if (groupBy === "resolution") {
    return isJiraUnresolvedResolution(record.issue.resolution)
      ? { key: "__empty__", label: "Без Resolution" }
      : value(record.issue.resolution, "Без Resolution");
  }
  if (groupBy === "fromStatus") return value(record.fromStatus, "Без статуса");
  if (groupBy === "toStatus") return value(record.toStatus, "Без статуса");
  if (groupBy === "week") {
    const eventAt = validDate(record.eventAt);
    return eventAt ? isoWeek(eventAt, timeZone) : { key: "__empty__", label: "Без даты" };
  }
  return { key: "__all__", label: "Все" };
}

function effectivePeriod(
  definition: JiraAnalyticsExecutableDefinition,
  options: JiraAnalyticsEvaluationOptions,
) {
  if (definition.periodMode === "NONE") return null;
  if (definition.periodMode === "FIXED") return definition.periodDays;
  if (!options.periodDays) throw new Error("DASHBOARD_PERIOD_REQUIRED");
  return options.periodDays;
}

export function evaluateJiraAnalyticsAggregate(
  definition: JiraAnalyticsExecutableDefinition,
  issues: JiraAnalyticsIssueData[],
  options: JiraAnalyticsEvaluationOptions,
): JiraAnalyticsEvaluationResult {
  const accumulator = createJiraAnalyticsEvaluationAccumulator(definition, options);
  accumulator.addIssues(issues);
  return accumulator.finish();
}

function sourceRecords(
  definition: JiraAnalyticsExecutableDefinition,
  issue: JiraAnalyticsIssueData,
  now: Date,
) {
  if (definition.source === "issues") return [issueRecord(issue)];
  if (definition.source === "transitions") return transitionRecords(issue);
  if (definition.source === "development") return developmentRecords(issue);
  if (definition.source === "statusIntervals") {
    const config = definition.rowConfig;
    if (!config || config.kind !== "statusInterval") return [];
    return statusIntervalRecords(issue, config, now);
  }
  const record = definition.criticalRiskConfig
    ? criticalRiskRecord(issue, now, definition.criticalRiskConfig)
    : criticalBugRecord(issue, now, definition.criticalSlaConfig);
  return record ? [record] : [];
}

function compareResultRecords(
  left: JiraAnalyticsResultRecord,
  right: JiraAnalyticsResultRecord,
  sortBy: JiraAnalyticsSortField = "default",
  direction: JiraAnalyticsSortDirection = "desc",
) {
  const sign = direction === "asc" ? 1 : -1;
  if (sortBy === "issueKey") {
    return sign * codePointCompare(left.issue.issueKey, right.issue.issueKey) || codePointCompare(left.id, right.id);
  }
  if (sortBy === "eventAt") {
    return sign * ((validDate(left.eventAt)?.getTime() ?? 0) - (validDate(right.eventAt)?.getTime() ?? 0)) || codePointCompare(left.id, right.id);
  }
  if (sortBy === "durationHours" || sortBy === "commitCount" || sortBy === "mergeRequestCount") {
    const leftValue = sortBy === "durationHours" ? left.durationHours ?? -1 : left[sortBy];
    const rightValue = sortBy === "durationHours" ? right.durationHours ?? -1 : right[sortBy];
    return sign * (leftValue - rightValue) || codePointCompare(left.id, right.id);
  }
  if (sortBy === "sprintCount") {
    return sign * (left.issue.sprintCount - right.issue.sprintCount) || codePointCompare(left.id, right.id);
  }
  return (right.durationHours ?? -1) - (left.durationHours ?? -1) ||
    (validDate(right.eventAt)?.getTime() ?? 0) - (validDate(left.eventAt)?.getTime() ?? 0) ||
    codePointCompare(left.id, right.id);
}

export function createJiraAnalyticsEvaluationAccumulator(
  definition: JiraAnalyticsExecutableDefinition,
  options: JiraAnalyticsEvaluationOptions,
  limits: JiraAnalyticsEvaluationLimits = {},
): JiraAnalyticsEvaluationAccumulator {
  const now = validDate(options.now);
  if (!now) throw new Error("INVALID_EVALUATED_AT");
  const periodDays = effectivePeriod(definition, options);
  const periodStart = periodDays === null ? null : new Date(now.getTime() - periodDays * 86_400_000);
  const page = Math.max(1, options.page);
  const pageSize = Math.min(limits.maxPageSize ?? 100, Math.max(1, options.pageSize));
  const offset = (page - 1) * pageSize;
  const pageWindow = offset + pageSize;
  if (limits.maxPageWindow !== undefined && pageWindow > limits.maxPageWindow) {
    throw new JiraAnalyticsEvaluationLimitError("pageWindow", limits.maxPageWindow);
  }

  const allState = emptyMetricState();
  const selectedState = options.groupKey ? emptyMetricState() : allState;
  const grouped = new Map<string, { label: string; state: MetricState }>();
  const selectedRecords: JiraAnalyticsResultRecord[] = [];
  let qualityPopulation = 0;
  let qualityComplete = 0;
  let incompleteTransitionHistory = 0;
  let missingIssueCreatedAt = 0;
  let oldestObservedAt: Date | null = null;
  let latestObservedAt: Date | null = null;
  let matchedRows = 0;

  const issueMatchesQualityScope = (issue: JiraAnalyticsIssueData) =>
    (definition.scope !== "active" || jiraIssueIsInWorkScope(issue)) &&
    (!options.assignee || issue.assignee === options.assignee);

  const criticalQualityCandidate = (issue: JiraAnalyticsIssueData) => {
    const riskConfig = definition.criticalRiskConfig;
    if (riskConfig) {
      return jiraIssueIsInWorkScope(issue)
        && !issue.resolutionAt
        && (
          matchesConfiguredIssueType(issue.issueType, riskConfig.bugIssueTypes)
          || matchesConfiguredIssueType(issue.issueType, riskConfig.taskIssueTypes)
        )
        && matchesConfiguredValue(issue.priority, riskConfig.priorities);
    }
    const config = definition.criticalSlaConfig;
    const issueTypeMatches = config
      ? matchesConfiguredIssueType(issue.issueType, config.issueTypes)
      : isJiraBugIssueType(issue.issueType);
    const priority = issue.resolutionAt ? issue.criticalEndPriority : issue.priority;
    return issueTypeMatches && (config
      ? matchesConfiguredValue(priority, config.priorities)
      : isJiraCriticalPriority(priority));
  };

  const issueIsInQualityPopulation = (issue: JiraAnalyticsIssueData) =>
    issueMatchesQualityScope(issue) &&
    (definition.source !== "criticalBugs" || criticalQualityCandidate(issue));

  const issueHasCompleteSourceData = (issue: JiraAnalyticsIssueData) => {
    if (definition.source === "transitions") return issue.transitionHistoryComplete;
    if (definition.source === "statusIntervals") {
      const config = definition.rowConfig;
      return issue.transitionHistoryComplete && config?.kind === "statusInterval" && (
        !statusIntervalNeedsCreatedAt(config) || validDate(issue.issueCreatedAt) !== null
      );
    }
    if (definition.source === "development") return issue.developmentDataAvailable;
    if (definition.source === "criticalBugs") {
      return (definition.criticalSlaConfig || definition.criticalRiskConfig)
        ? validDate(issue.criticalPriorityAt) !== null
        : issue.criticalSlaTracked && validDate(issue.criticalPriorityAt) !== null;
    }
    return true;
  };

  const observeQuality = (issue: JiraAnalyticsIssueData) => {
    if (!issueIsInQualityPopulation(issue)) return;
    qualityPopulation += 1;
    if (
      (definition.source === "transitions" || definition.source === "statusIntervals") &&
      !issue.transitionHistoryComplete
    ) {
      incompleteTransitionHistory += 1;
    }
    if (
      definition.source === "statusIntervals" &&
      definition.rowConfig?.kind === "statusInterval" &&
      statusIntervalNeedsCreatedAt(definition.rowConfig) &&
      validDate(issue.issueCreatedAt) === null
    ) {
      missingIssueCreatedAt += 1;
    }
    if (issueHasCompleteSourceData(issue)) qualityComplete += 1;
    const observedAt = validDate(issue.dataObservedAt);
    if (!observedAt) return;
    if (!oldestObservedAt || observedAt < oldestObservedAt) oldestObservedAt = observedAt;
    if (!latestObservedAt || observedAt > latestObservedAt) latestObservedAt = observedAt;
  };

  const finishQuality = (): JiraAnalyticsDataQuality => {
    const incomplete = Math.max(0, qualityPopulation - qualityComplete);
    const warningCode = definition.source === "transitions"
      ? "INCOMPLETE_TRANSITION_HISTORY" as const
      : definition.source === "development"
        ? "INCOMPLETE_DEVELOPMENT_DATA" as const
        : "INCOMPLETE_CRITICAL_SLA" as const;
    const warnings: JiraAnalyticsDataQualityWarning[] = qualityPopulation === 0
      ? [{ code: "NO_SOURCE_POPULATION", count: 0 }]
      : definition.source === "statusIntervals"
        ? [
            ...(incompleteTransitionHistory > 0
              ? [{ code: "INCOMPLETE_TRANSITION_HISTORY" as const, count: incompleteTransitionHistory }]
              : []),
            ...(missingIssueCreatedAt > 0
              ? [{ code: "MISSING_ISSUE_CREATED_AT" as const, count: missingIssueCreatedAt }]
              : []),
          ]
        : incomplete > 0 && definition.source !== "issues"
          ? [{ code: warningCode, count: incomplete }]
          : [];
    return {
      status: qualityPopulation === 0
        ? "NO_DATA"
        : incomplete === 0
          ? "COMPLETE"
          : "PARTIAL",
      basis: "CURRENT_PROJECTION",
      source: definition.source,
      population: qualityPopulation,
      complete: qualityComplete,
      incomplete,
      coveragePercent: qualityPopulation === 0
        ? null
        : Math.round((qualityComplete / qualityPopulation) * 10_000) / 100,
      oldestObservedAt: oldestObservedAt?.toISOString() ?? null,
      latestObservedAt: latestObservedAt?.toISOString() ?? null,
      warnings,
    };
  };

  const recordMatches = (record: JiraAnalyticsResultRecord) => {
    if (periodStart) {
      const eventAt = validDate(String(recordValue(record, definition.dateField ?? "eventAt") ?? ""));
      if (eventAt === null || eventAt < periodStart || eventAt > now) return false;
    }
    if (definition.scope === "active" && !jiraIssueIsInWorkScope(record.issue)) return false;
    if (options.assignee && record.issue.assignee !== options.assignee) return false;
    const baseFilters = definition.baseFilters ?? [];
    const baseMatches = baseFilters.length === 0 || (definition.baseFilterLogic === "or"
      ? baseFilters.some((filter) => filterMatches(record, filter))
      : baseFilters.every((filter) => filterMatches(record, filter)));
    if (!baseMatches) return false;
    if (definition.filters.length === 0) return true;
    return definition.filterLogic === "or"
      ? definition.filters.some((filter) => filterMatches(record, filter))
      : definition.filters.every((filter) => filterMatches(record, filter));
  };

  return {
    addIssues(issues) {
      for (const issue of issues) {
        observeQuality(issue);
        const seenRowIdentities = new Set<string>();
        const uniqueRows = sourceRecords(definition, issue, now).filter((record) => {
          const identity = definition.rowIdentity?.length
            ? JSON.stringify(definition.rowIdentity.map((field) => recordValue(record, field)))
            : record.id;
          if (seenRowIdentities.has(identity)) return false;
          seenRowIdentities.add(identity);
          return true;
        });
        if (definition.maximumRowsPerIssue !== undefined && uniqueRows.length > definition.maximumRowsPerIssue) {
          throw new JiraAnalyticsEvaluationLimitError("rowsPerIssue", definition.maximumRowsPerIssue);
        }
        for (const record of uniqueRows) {
          if (!recordMatches(record)) continue;
          matchedRows += 1;
          if (definition.maximumRows !== undefined && matchedRows > definition.maximumRows) {
            throw new JiraAnalyticsEvaluationLimitError("rows", definition.maximumRows);
          }
          addRecordToMetricState(allState, record);

          const identity = definition.groupBy !== "none" || options.groupKey
            ? groupIdentity(record, definition.groupBy, definition.timeZone)
            : null;
          if (definition.groupBy !== "none" && identity) {
            let group = grouped.get(identity.key);
            if (!group) {
              if (limits.maxGroups !== undefined && grouped.size >= limits.maxGroups) {
                throw new JiraAnalyticsEvaluationLimitError("groups", limits.maxGroups);
              }
              group = { label: identity.label, state: emptyMetricState() };
              grouped.set(identity.key, group);
            }
            addRecordToMetricState(group.state, record);
          }

          if (!options.groupKey || identity?.key === options.groupKey) {
            if (selectedState !== allState) addRecordToMetricState(selectedState, record);
            selectedRecords.push(record);
            if (selectedRecords.length > pageWindow * 2) {
              selectedRecords.sort((left, right) => compareResultRecords(
                left,
                right,
                definition.sortBy,
                definition.sortDirection,
              ));
              selectedRecords.splice(pageWindow);
            }
          }
        }
      }
      selectedRecords.sort((left, right) => compareResultRecords(
        left,
        right,
        definition.sortBy,
        definition.sortDirection,
      ));
      selectedRecords.splice(pageWindow);
    },
    finish() {
      const groups = [...grouped.entries()]
        .map(([key, group]) => ({
          key,
          label: group.label,
          value: metricValue(definition.metric, group.state),
          recordCount: group.state.recordCount,
        }))
        .sort((left, right) => right.value - left.value || codePointCompare(left.key, right.key));
      return {
        evaluatedAt: now.toISOString(),
        effective: {
          periodDays,
          periodSource: definition.periodMode,
          timeZone: definition.timeZone,
          assignee: options.assignee,
        },
        value: metricValue(definition.metric, selectedState),
        groups,
        records: selectedRecords.slice(offset, pageWindow),
        totalRecords: selectedState.recordCount,
        page,
        pageSize,
        quality: finishQuality(),
      };
    },
  };
}
