import {
  JIRA_SEMANTIC_MAX_AS_OF_SLICES,
  JiraAnalyticsEvaluationLimitError,
  jiraAnalyticsFilterSchema,
  jiraAnalyticsGroupings,
  jiraAnalyticsMetrics,
  jiraAnalyticsPeriodDays,
  jiraAnalyticsSortDirections,
  jiraAnalyticsSortFields,
  jiraSemanticAggregateDefinitionSchema,
  jiraSemanticDashboardSchema,
  jiraSemanticWidgetSchema,
} from "@pms/shared";
import type { Response } from "express";
import { z } from "zod";

import {
  JiraAggregateAsOfSliceLimitError,
  JiraAggregateEventLimitError,
  JiraAggregateExportLimitError,
  JiraAggregatePopulationLimitError,
} from "../services/jira-aggregates.js";
import { GitlabBranchAnalyticsError } from "../services/gitlab-branch-analytics.js";

export const previewSchema = z.object({
  definition: jiraSemanticAggregateDefinitionSchema,
  asOf: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();

export const querySchema = z.object({
  aggregateVersion: z.number().int().min(1),
  selectedFields: jiraSemanticWidgetSchema.shape.selectedFields,
  metric: z.enum(jiraAnalyticsMetrics),
  groupBy: z.enum(jiraAnalyticsGroupings),
  filters: z.array(jiraAnalyticsFilterSchema).max(30),
  filterLogic: z.enum(["and", "or"]),
  periodDays: z.union(jiraAnalyticsPeriodDays.map((value) => z.literal(value)) as [
    z.ZodLiteral<30>, z.ZodLiteral<90>, z.ZodLiteral<180>, z.ZodLiteral<365>,
  ]).nullable(),
  dateField: jiraSemanticWidgetSchema.shape.dateField,
  assignee: z.string().max(200),
  sortBy: z.enum(jiraAnalyticsSortFields),
  sortDirection: z.enum(jiraAnalyticsSortDirections),
  page: z.number().int().min(1).max(100_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  groupKey: z.string().max(500).optional(),
  asOf: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();

export const batchQuerySchema = z.object({
  queries: z.array(z.object({
    widgetId: z.string().min(1).max(200),
    aggregateId: z.string().min(1).max(200),
    query: querySchema,
  }).strict()).min(1).max(100),
}).strict().superRefine((value, context) => {
  const ids = value.queries.map((query) => query.widgetId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["queries"], message: "Идентификаторы виджетов не должны повторяться" });
  }
  const asOfSlices = new Set(value.queries.flatMap((query) => query.query.asOf ? [query.query.asOf] : []));
  if (asOfSlices.size > JIRA_SEMANTIC_MAX_AS_OF_SLICES) {
    context.addIssue({
      code: "custom",
      path: ["queries"],
      message: `Допускается не более ${JIRA_SEMANTIC_MAX_AS_OF_SLICES} исторических срезов за один запрос`,
    });
  }
});

export const publishSchema = z.object({ expectedVersion: z.number().int().min(1) }).strict();
export const gitlabSyncSchema = z.object({ aggregateVersion: z.number().int().min(1) }).strict();
export const goalLabelsSchema = z.object({
  goals: z.array(z.object({
    goalId: z.string().min(1).max(200),
    labels: z.array(z.string().trim().min(1).max(100)).max(20),
  }).strict()).max(500),
}).strict();
export const deleteSchema = z.object({ expectedVersion: z.coerce.number().int().min(1) }).strict();
export const dashboardSaveSchema = z.object({
  config: jiraSemanticDashboardSchema,
  expectedConfigHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict().refine((value) => JSON.stringify(value.config).length <= 100_000, {
  message: "Конфигурация виджетов превышает лимит 100 КБ",
  path: ["config"],
});

export function respondEvaluationLimit(res: Response, error: unknown, action: string) {
  if (
    !(error instanceof JiraAggregateExportLimitError)
    && !(error instanceof JiraAggregatePopulationLimitError)
    && !(error instanceof JiraAggregateEventLimitError)
    && !(error instanceof JiraAggregateAsOfSliceLimitError)
    && !(error instanceof JiraAnalyticsEvaluationLimitError)
  ) return false;
  res.status(409).json({
    error: `${action} превышает безопасный лимит ${error.limit.toLocaleString("ru-RU")} строк или событий`,
    limit: error.limit,
  });
  return true;
}

export function evaluationErrorMessage(error: Error) {
  if (error instanceof GitlabBranchAnalyticsError) return error.message;
  if (
    error instanceof JiraAggregateExportLimitError
    || error instanceof JiraAggregatePopulationLimitError
    || error instanceof JiraAggregateEventLimitError
    || error instanceof JiraAggregateAsOfSliceLimitError
    || error instanceof JiraAnalyticsEvaluationLimitError
  ) {
    return `Расчёт превышает безопасный лимит ${error.limit.toLocaleString("ru-RU")} строк, событий или срезов`;
  }
  return "Не удалось рассчитать этот виджет";
}
