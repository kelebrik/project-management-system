import { z } from "zod";

import {
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  JIRA_ANALYTICS_GROUPS_BY_SOURCE,
  JIRA_ANALYTICS_METRICS_BY_SOURCE,
  codePointCompare,
  jiraAnalyticsFilterFields,
  jiraAnalyticsGroupings,
  jiraAnalyticsMetrics,
  jiraAnalyticsPeriodDays,
  jiraAnalyticsPeriodModes,
  jiraAnalyticsScopes,
  jiraAnalyticsSortDirections,
  jiraAnalyticsSortFields,
  jiraAnalyticsSourcePeriodSupport,
  jiraAnalyticsSourceUsesPeriod,
  jiraAnalyticsSources,
  jiraCriticalBugSlaHours,
  numericFields,
  type JiraAnalyticsFilterField,
  type JiraAnalyticsFilterOperator,
  type JiraAnalyticsGroupBy,
  type JiraAnalyticsMetric,
  type JiraAnalyticsScope,
  type JiraAnalyticsSource,
} from "./jira-analytics-core.js";
import {
  jiraAnalyticsFilterSchema,
  type JiraAnalyticsAggregateDraft,
  type JiraAnalyticsDatasetDraft,
  type JiraAnalyticsFilter,
  type JiraAnalyticsLegacyDatasetContract,
} from "./jira-analytics-datasets.js";

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
