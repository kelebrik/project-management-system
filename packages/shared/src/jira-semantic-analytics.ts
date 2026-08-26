import { z } from "zod";

import {
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  jiraAnalyticsFilterFields,
  jiraAnalyticsFilterSchema,
  jiraAnalyticsGroupings,
  jiraAnalyticsMetrics,
  jiraAnalyticsPeriodDays,
  jiraAnalyticsSortDirections,
  jiraAnalyticsSortFields,
  jiraAnalyticsTimeZones,
  isJiraBugIssueType,
  type JiraAnalyticsFilterField,
} from "./jira-analytics.js";

export const JIRA_SEMANTIC_MAX_AS_OF_SLICES = 5;

export const jiraSemanticAggregateGrains = [
  "issue",
  "transitionEvent",
  "developmentEvent",
  "interval",
] as const;

export const jiraSemanticAggregateRevisionStatuses = [
  "draft",
  "published",
  "archived",
] as const;

export const jiraSemanticAggregateAsOfSupport = ["none", "supported"] as const;
export const jiraSemanticAggregateIncompletePolicies = ["exclude", "includeWithWarning"] as const;
export const jiraSemanticAggregateFieldTypes = ["text", "number", "boolean", "date", "url"] as const;

export const jiraSystemAggregateKeys = [
  "issues",
  "status-transitions",
  "development-activity",
  "status-intervals",
  "critical-blocker-sla",
] as const;

export type JiraSystemAggregateKey = (typeof jiraSystemAggregateKeys)[number];
export type JiraSemanticAggregateGrain = (typeof jiraSemanticAggregateGrains)[number];

const statusReferenceSchema = z.object({
  id: z.null(),
  name: z.string().trim().min(1).max(200),
}).strict();

const statusReferencesSchema = z.array(statusReferenceSchema).min(1).max(20).superRefine((items, context) => {
  const identities = items.map((item) => item.id ? `id:${item.id}` : `name:${item.name.toLocaleLowerCase("ru-RU")}`);
  if (new Set(identities).size !== identities.length) {
    context.addIssue({ code: "custom", message: "Статусы в одной контрольной точке не должны повторяться" });
  }
});

const occurrenceSchema = z.enum(["first", "last", "all"]);

export const jiraSemanticIntervalAnchorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("issueCreated"), occurrence: z.literal("first") }).strict(),
  z.object({
    type: z.enum(["statusEntry", "statusExit"]),
    statuses: statusReferencesSchema,
    occurrence: occurrenceSchema,
  }).strict(),
  z.object({
    type: z.literal("priorityEntry"),
    priorities: z.array(z.string().trim().min(1).max(100)).min(1).max(10),
    occurrence: occurrenceSchema,
  }).strict(),
  z.object({ type: z.literal("resolution"), occurrence: occurrenceSchema }).strict(),
]);

const issueRowsSchema = z.object({ kind: z.literal("issue") }).strict();
const transitionRowsSchema = z.object({ kind: z.literal("transitionEvent") }).strict();
const developmentRowsSchema = z.object({ kind: z.literal("developmentEvent") }).strict();
const intervalRowsSchema = z.object({
  kind: z.literal("interval"),
  start: jiraSemanticIntervalAnchorSchema,
  end: jiraSemanticIntervalAnchorSchema,
  pairing: z.literal("nextAfterStart"),
  openIntervals: z.enum(["exclude", "include"]),
}).strict();
const criticalSlaRowsSchema = z.object({
  kind: z.literal("criticalSla"),
  issueTypes: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
  priorities: z.array(z.string().trim().min(1).max(100)).min(1).max(10),
  startPolicy: z.literal("createdOrFirstPriorityEntry"),
  endAnchor: z.literal("resolution"),
  requirePriorityAtResolution: z.boolean(),
  openIntervals: z.enum(["exclude", "include"]),
}).strict();

export const jiraSemanticAggregateRowConfigSchema = z.discriminatedUnion("kind", [
  issueRowsSchema,
  transitionRowsSchema,
  developmentRowsSchema,
  intervalRowsSchema,
  criticalSlaRowsSchema,
]);

export const jiraSemanticOutputFieldSchema = z.object({
  key: z.enum(jiraAnalyticsFilterFields),
  label: z.string().trim().min(1).max(200),
  type: z.enum(jiraSemanticAggregateFieldTypes),
  nullable: z.boolean(),
}).strict();

export const jiraSemanticAggregateDefinitionSchema = z.object({
  schemaVersion: z.literal(5),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000),
  grain: z.enum(jiraSemanticAggregateGrains),
  basePopulation: z.object({
    logic: z.enum(["and", "or"]),
    filters: z.array(jiraAnalyticsFilterSchema).max(30),
  }).strict(),
  rowConfig: jiraSemanticAggregateRowConfigSchema,
  rowIdentity: z.array(z.union([z.literal("rowId"), z.enum(jiraAnalyticsFilterFields)])).min(1).max(10),
  outputFields: z.array(jiraSemanticOutputFieldSchema).min(1).max(jiraAnalyticsFilterFields.length),
  incompleteDataPolicy: z.enum(jiraSemanticAggregateIncompletePolicies),
  qualityRules: z.object({
    minimumCoveragePercent: z.number().min(0).max(100),
    maximumRows: z.number().int().min(1).max(1_000_000),
    maximumRowsPerIssue: z.number().int().min(1).max(10_000),
  }).strict(),
  timeZone: z.enum(jiraAnalyticsTimeZones),
  asOfSupport: z.enum(jiraSemanticAggregateAsOfSupport),
}).strict().superRefine((definition, context) => {
  const expectedGrain: JiraSemanticAggregateGrain = definition.rowConfig.kind === "issue"
    ? "issue"
    : definition.rowConfig.kind === "transitionEvent"
      ? "transitionEvent"
      : definition.rowConfig.kind === "developmentEvent"
        ? "developmentEvent"
        : "interval";
  if (definition.grain !== expectedGrain) {
    context.addIssue({ code: "custom", path: ["grain"], message: "Гранулярность не соответствует правилу формирования строк" });
  }
  const keys = definition.outputFields.map((field) => field.key);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: "custom", path: ["outputFields"], message: "Выходные поля не должны повторяться" });
  }
  const source = definition.rowConfig.kind === "issue"
    ? "issues"
    : definition.rowConfig.kind === "transitionEvent"
      ? "transitions"
      : definition.rowConfig.kind === "developmentEvent"
        ? "development"
        : definition.rowConfig.kind === "criticalSla"
          ? "criticalBugs"
          : "statusIntervals";
  const availableFields = new Set<JiraAnalyticsFilterField>(JIRA_ANALYTICS_FIELDS_BY_SOURCE[source]);
  definition.outputFields.forEach((field, index) => {
    if (!availableFields.has(field.key)) {
      context.addIssue({ code: "custom", path: ["outputFields", index, "key"], message: "Поле недоступно для выбранного правила строк" });
    }
    const expected = jiraSemanticDefaultOutputField(field.key);
    if (field.type !== expected.type || field.nullable !== expected.nullable) {
      context.addIssue({
        code: "custom",
        path: ["outputFields", index],
        message: "Тип и обязательность выходного поля определяются схемой даталейка",
      });
    }
  });
  definition.basePopulation.filters.forEach((filter, index) => {
    if (!availableFields.has(filter.field)) {
      context.addIssue({ code: "custom", path: ["basePopulation", "filters", index, "field"], message: "Условие использует недоступное поле" });
    }
  });
  const outputKeys = new Set(keys);
  if (new Set(definition.rowIdentity).size !== definition.rowIdentity.length) {
    context.addIssue({ code: "custom", path: ["rowIdentity"], message: "Поля ключа строки не должны повторяться" });
  }
  definition.rowIdentity.forEach((key, index) => {
    if (key !== "rowId" && !outputKeys.has(key)) {
      context.addIssue({ code: "custom", path: ["rowIdentity", index], message: "Ключ строки должен входить в выходные поля" });
    }
  });
  if (definition.rowConfig.kind === "criticalSla") {
    const priorities = new Set(definition.rowConfig.priorities.map((priority) => priority.toLocaleLowerCase("ru-RU")));
    if (priorities.size !== 2 || !priorities.has("critical") || !priorities.has("blocker")) {
      context.addIssue({ code: "custom", path: ["rowConfig", "priorities"], message: "Текущий даталейк поддерживает SLA только для Critical и Blocker" });
    }
    definition.rowConfig.issueTypes.forEach((issueType, index) => {
      if (!isJiraBugIssueType(issueType)) {
        context.addIssue({
          code: "custom",
          path: ["rowConfig", "issueTypes", index],
          message: "Текущий даталейк рассчитывает SLA только для типов багов",
        });
      }
    });
  }
  if (definition.rowConfig.kind === "interval") {
    if (definition.rowConfig.end.occurrence === "all") {
      context.addIssue({
        code: "custom",
        path: ["rowConfig", "end", "occurrence"],
        message: "Для каждой начальной точки выберите ближайшую или последнюю конечную точку",
      });
    }
    [definition.rowConfig.start, definition.rowConfig.end].forEach((anchor, index) => {
      if (anchor.type !== "priorityEntry") return;
      const priorities = new Set(anchor.priorities.map((priority) => priority.toLocaleLowerCase("ru-RU")));
      if (priorities.size !== 2 || !priorities.has("critical") || !priorities.has("blocker")) {
        context.addIssue({
          code: "custom",
          path: ["rowConfig", index === 0 ? "start" : "end", "priorities"],
          message: "Даталейк хранит достоверную дату повышения только до Critical/Blocker",
        });
      }
      if (anchor.occurrence !== "first") {
        context.addIssue({
          code: "custom",
          path: ["rowConfig", index === 0 ? "start" : "end", "occurrence"],
          message: "Для повышения до Critical/Blocker доступно только первое событие",
        });
      }
    });
  }
  if (definition.rowConfig.kind === "issue" && definition.incompleteDataPolicy !== "includeWithWarning") {
    context.addIssue({
      code: "custom",
      path: ["incompleteDataPolicy"],
      message: "Снимки тикетов включаются с предупреждением о неполной истории",
    });
  }
  if (definition.rowConfig.kind !== "issue" && definition.incompleteDataPolicy !== "exclude") {
    context.addIssue({
      code: "custom",
      path: ["incompleteDataPolicy"],
      message: "Событийные строки с неполной историей должны исключаться",
    });
  }
  if (
    definition.asOfSupport === "supported"
    && definition.rowConfig.kind !== "issue"
    && definition.rowConfig.kind !== "criticalSla"
  ) {
    context.addIssue({
      code: "custom",
      path: ["asOfSupport"],
      message: "Состояние на дату доступно только для снимков тикетов и SLA",
    });
  }
});

export const jiraSemanticAggregateSaveSchema = z.object({
  definition: jiraSemanticAggregateDefinitionSchema,
  expectedVersion: z.number().int().min(1),
}).strict();

export const jiraSemanticAggregateCreateSchema = z.object({
  key: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  definition: jiraSemanticAggregateDefinitionSchema,
}).strict();

export const jiraSemanticWidgetSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  aggregateId: z.string().min(1).max(200),
  aggregateVersion: z.number().int().min(1),
  placement: z.enum(["active", "retro"]),
  selectedFields: z.array(z.enum(jiraAnalyticsFilterFields)).min(1).max(jiraAnalyticsFilterFields.length),
  filterLogic: z.enum(["and", "or"]),
  filters: z.array(jiraAnalyticsFilterSchema).max(30),
  dateField: z.enum(jiraAnalyticsFilterFields).nullable(),
  asOf: z.string().datetime({ offset: true }).nullable(),
  metric: z.enum(jiraAnalyticsMetrics),
  groupBy: z.enum(jiraAnalyticsGroupings),
  sortBy: z.enum(jiraAnalyticsSortFields),
  sortDirection: z.enum(jiraAnalyticsSortDirections),
  visualization: z.enum(["number", "bar", "table"]),
  width: z.enum(["half", "full"]),
}).strict().superRefine((widget, context) => {
  const selected = new Set(widget.selectedFields);
  if (selected.size !== widget.selectedFields.length) {
    context.addIssue({ code: "custom", path: ["selectedFields"], message: "Поля виджета не должны повторяться" });
  }
  widget.filters.forEach((filter, index) => {
    if (!selected.has(filter.field)) {
      context.addIssue({ code: "custom", path: ["filters", index, "field"], message: "Поле условия должно быть выбрано в виджете" });
    }
  });
  if (widget.dateField && !selected.has(widget.dateField)) {
    context.addIssue({ code: "custom", path: ["dateField"], message: "Поле периода должно быть выбрано в виджете" });
  }
});

export const jiraSemanticDashboardSchema = z.object({
  version: z.literal(5),
  periodDays: z.union(jiraAnalyticsPeriodDays.map((value) => z.literal(value)) as [
    z.ZodLiteral<30>,
    z.ZodLiteral<90>,
    z.ZodLiteral<180>,
    z.ZodLiteral<365>,
  ]),
  assignee: z.string().max(200),
  widgets: z.array(jiraSemanticWidgetSchema).max(100),
}).strict().superRefine((dashboard, context) => {
  const ids = dashboard.widgets.map((widget) => widget.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["widgets"], message: "Идентификаторы виджетов не должны повторяться" });
  }
  const asOfSlices = new Set(dashboard.widgets.flatMap((widget) => widget.asOf ? [widget.asOf] : []));
  if (asOfSlices.size > JIRA_SEMANTIC_MAX_AS_OF_SLICES) {
    context.addIssue({
      code: "custom",
      path: ["widgets"],
      message: `В одном дашборде допускается не более ${JIRA_SEMANTIC_MAX_AS_OF_SLICES} исторических срезов`,
    });
  }
});

export type JiraSemanticIntervalAnchor = z.infer<typeof jiraSemanticIntervalAnchorSchema>;
export type JiraSemanticAggregateDefinition = z.infer<typeof jiraSemanticAggregateDefinitionSchema>;
export type JiraSemanticAggregateRowConfig = z.infer<typeof jiraSemanticAggregateRowConfigSchema>;
export type JiraSemanticOutputField = z.infer<typeof jiraSemanticOutputFieldSchema>;
export type JiraSemanticWidget = z.infer<typeof jiraSemanticWidgetSchema>;
export type JiraSemanticDashboard = z.infer<typeof jiraSemanticDashboardSchema>;

export type JiraSemanticAggregateRevisionStatus = (typeof jiraSemanticAggregateRevisionStatuses)[number];

export type JiraSemanticAggregatePublic = {
  id: string;
  projectId: string;
  key: string;
  system: boolean;
  version: number;
  publishedVersion: number | null;
  archivedAt: string | null;
  draft: JiraSemanticAggregateDefinition;
  published: JiraSemanticAggregateDefinition | null;
  revisions: Array<{
    version: number;
    status: JiraSemanticAggregateRevisionStatus;
    changeKind: "compatible" | "breaking";
    createdAt: string;
    publishedAt: string | null;
  }>;
};

export const JIRA_SEMANTIC_EMPTY_DASHBOARD: JiraSemanticDashboard = {
  version: 5,
  periodDays: 180,
  assignee: "",
  widgets: [],
};

export const JIRA_SEMANTIC_FIELD_LABELS: Record<(typeof jiraAnalyticsFilterFields)[number], string> = {
  issueKey: "Ключ тикета",
  project: "Проект Jira",
  summary: "Название",
  status: "Текущий статус",
  assignee: "Исполнитель",
  reporter: "Автор",
  priority: "Приоритет",
  sprint: "Sprint",
  issueType: "Тип тикета",
  resolution: "Resolution",
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

const dateFields = new Set(["issueCreatedAt", "criticalPriorityAt", "resolutionAt", "updatedAt", "eventAt", "intervalStartAt", "intervalEndAt"]);
const numberFields = new Set(["durationHours", "commitCount", "mergeRequestCount"]);

export function jiraSemanticDefaultOutputField(key: (typeof jiraAnalyticsFilterFields)[number]): JiraSemanticOutputField {
  return {
    key,
    label: JIRA_SEMANTIC_FIELD_LABELS[key],
    type: dateFields.has(key) ? "date" : numberFields.has(key) ? "number" : key === "hasDevelopment" ? "boolean" : "text",
    nullable: !["issueKey", "summary", "status", "priority", "issueType"].includes(key),
  };
}

export function jiraSemanticCompatibleChange(
  before: JiraSemanticAggregateDefinition,
  after: JiraSemanticAggregateDefinition,
) {
  if (before.grain !== after.grain) return false;
  if (JSON.stringify(before.basePopulation) !== JSON.stringify(after.basePopulation)) return false;
  if (JSON.stringify(before.rowConfig) !== JSON.stringify(after.rowConfig)) return false;
  if (JSON.stringify(before.rowIdentity) !== JSON.stringify(after.rowIdentity)) return false;
  if (before.incompleteDataPolicy !== after.incompleteDataPolicy) return false;
  if (before.timeZone !== after.timeZone) return false;
  if (before.asOfSupport !== after.asOfSupport) return false;
  if (JSON.stringify(before.qualityRules) !== JSON.stringify(after.qualityRules)) return false;
  const beforeFields = new Map(before.outputFields.map((field) => [field.key, field]));
  return before.outputFields.every((field) => {
    const next = after.outputFields.find((candidate) => candidate.key === field.key);
    return next?.type === field.type && next.nullable === field.nullable;
  }) && beforeFields.size <= after.outputFields.length;
}
