import { z } from "zod";

import {
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  JIRA_ANALYTICS_GROUPS_BY_SOURCE,
  JIRA_ANALYTICS_METRICS_BY_SOURCE,
  codePointCompare,
  dateFields,
  jiraAnalyticsFilterFields,
  jiraAnalyticsFilterOperators,
  jiraAnalyticsGroupings,
  jiraAnalyticsMetrics,
  jiraAnalyticsOperatorsFor,
  jiraAnalyticsPeriodDays,
  jiraAnalyticsPeriodModes,
  jiraAnalyticsScopes,
  jiraAnalyticsSourcePeriodSupport,
  jiraAnalyticsSources,
  jiraAnalyticsTimeZones,
  normalizedJiraValue,
  numericFields,
} from "./jira-analytics-core.js";

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
  if ((filter.operator === "oneOf" || filter.operator === "noneOf")
    && filter.value.split(",").every((value) => value.trim() === "")) {
    context.addIssue({
      code: "custom",
      path: ["value"],
      message: "Укажите хотя бы одно значение",
    });
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
