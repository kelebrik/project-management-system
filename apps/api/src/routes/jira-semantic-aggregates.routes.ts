import {
  JIRA_SEMANTIC_EMPTY_DASHBOARD,
  JIRA_SEMANTIC_MAX_AS_OF_SLICES,
  JiraAnalyticsEvaluationLimitError,
  jiraAnalyticsFilterSchema,
  jiraAnalyticsLabels,
  jiraAnalyticsGroupings,
  jiraAnalyticsMetrics,
  jiraAnalyticsPeriodDays,
  jiraAnalyticsSortDirections,
  jiraAnalyticsSortFields,
  jiraSemanticAggregateCreateSchema,
  jiraSemanticAggregateDefinitionSchema,
  jiraSemanticAggregateSaveSchema,
  jiraSemanticDashboardSchema,
  jiraSemanticWidgetSchema,
} from "@pms/shared";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Response, Router } from "express";
import { z } from "zod";

import { prisma as defaultPrisma } from "../db.js";
import { currentUser } from "../server/auth.js";
import { userCanReadProject } from "../server/business-units.js";
import { recordAuditEvent } from "../services/audit.js";
import {
  JiraAggregateEventLimitError,
  JiraAggregateExportLimitError,
  JiraAggregatePopulationLimitError,
  JiraAggregateAsOfSliceLimitError,
  evaluateJiraAggregateFromDatabase,
  evaluateJiraAggregatesFromDatabase,
  jiraDashboardConfigHash,
  jiraAggregateExportLimits,
  jiraAggregateExportOptions,
  jiraAggregateResultCsv,
  jiraAggregateResultProjection,
  lockJiraAggregateProject,
} from "../services/jira-aggregates.js";
import {
  JIRA_SEMANTIC_DEFAULT_WIDGETS_VERSION,
  JIRA_SYSTEM_SEMANTIC_AGGREGATES,
  ensureMissingJiraSystemSemanticAggregates,
  ensureJiraSystemSemanticAggregates,
  jiraSemanticAggregateCost,
  jiraSemanticCreateData,
  jiraSemanticDefinitionUpdateData,
  jiraSemanticExecutableDefinition,
  jiraSemanticRevisionChangeKind,
  jiraSemanticRevisionCreateData,
  jiraSemanticPopulationStats,
  listJiraSemanticAggregates,
  loadPublishedJiraSemanticAggregate,
} from "../services/jira-semantic-aggregates.js";
import {
  GitlabBranchAnalyticsError,
  evaluateGitlabBranchCommitAggregateFromDatabase,
  syncGitlabBranchCommitAggregate,
} from "../services/gitlab-branch-analytics.js";

const previewSchema = z.object({
  definition: jiraSemanticAggregateDefinitionSchema,
  asOf: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();

const querySchema = z.object({
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

const batchQuerySchema = z.object({
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

const publishSchema = z.object({ expectedVersion: z.number().int().min(1) }).strict();
const gitlabSyncSchema = z.object({ aggregateVersion: z.number().int().min(1) }).strict();
const goalLabelsSchema = z.object({
  goals: z.array(z.object({
    goalId: z.string().min(1).max(200),
    labels: z.array(z.string().trim().min(1).max(100)).max(20),
  }).strict()).max(500),
}).strict();
const deleteSchema = z.object({ expectedVersion: z.coerce.number().int().min(1) }).strict();
const dashboardSaveSchema = z.object({
  config: jiraSemanticDashboardSchema,
  expectedConfigHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict().refine((value) => JSON.stringify(value.config).length <= 100_000, {
  message: "Конфигурация виджетов превышает лимит 100 КБ",
  path: ["config"],
});

function respondEvaluationLimit(res: Response, error: unknown, action: string) {
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

function evaluationErrorMessage(error: Error) {
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

function isGitlabBranchAggregate(definition: z.infer<typeof jiraSemanticAggregateDefinitionSchema>) {
  return definition.rowConfig.kind === "gitlabBranchCommit";
}

async function evaluatePublishedDefinition(
  client: PrismaClient,
  projectId: string,
  definition: z.infer<typeof jiraSemanticAggregateDefinitionSchema>,
  query: z.infer<typeof querySchema>,
) {
  const options = {
    now: jiraSemanticEvaluationNow(query.asOf),
    periodDays: query.periodDays ?? undefined,
    assignee: query.assignee,
    page: query.page,
    pageSize: query.pageSize,
    groupKey: query.groupKey,
  };
  if (isGitlabBranchAggregate(definition)) {
    return evaluateGitlabBranchCommitAggregateFromDatabase(client, projectId, definition, query, options);
  }
  return evaluateJiraAggregateFromDatabase(
    client,
    projectId,
    jiraSemanticExecutableDefinition(definition, query),
    options,
    query.asOf ? new Date(query.asOf) : undefined,
  );
}

export function jiraSemanticEvaluationNow(asOf: string | null | undefined) {
  return asOf ?? new Date().toISOString();
}

const groupField: Record<string, string | null> = {
  none: null, goal: "goalName", project: "project", status: "status", assignee: "assignee", reporter: "reporter",
  priority: "priority", sprint: "sprint", issueType: "issueType", resolution: "resolution",
  fromStatus: "fromStatus", toStatus: "toStatus", week: "eventAt",
};

function widgetContractError(
  widget: z.infer<typeof jiraSemanticWidgetSchema>,
  definition: z.infer<typeof jiraSemanticAggregateDefinitionSchema>,
) {
  const fields = new Map(definition.outputFields.map((field) => [field.key, field]));
  const unavailable = widget.selectedFields.find((field) => !fields.has(field));
  if (unavailable) return `Поле ${unavailable} не опубликовано агрегатом`;
  const filter = widget.filters.find((item) => !fields.has(item.field));
  if (filter) return `Поле условия ${filter.field} не опубликовано агрегатом`;
  if (widget.dateField && fields.get(widget.dateField)?.type !== "date") return "Поле периода должно иметь тип «дата»";
  const grouping = groupField[widget.groupBy];
  if (grouping && !fields.has(grouping as never)) return "Поле группировки не опубликовано агрегатом";
  if (widget.metric.endsWith("Duration") && !fields.has("durationHours")) return "Метрика длительности требует поле durationHours";
  if (widget.metric === "commits" && !fields.has("commitCount")) return "Метрика коммитов требует поле commitCount";
  if (widget.metric === "mergeRequests" && !fields.has("mergeRequestCount")) return "Метрика merge requests требует поле mergeRequestCount";
  if (widget.asOf && definition.asOfSupport !== "supported") return "Этот агрегат не поддерживает состояние на дату";
  return null;
}

function queryContractError(
  aggregateId: string,
  query: z.infer<typeof querySchema>,
  definition: z.infer<typeof jiraSemanticAggregateDefinitionSchema>,
) {
  const contract = jiraSemanticWidgetSchema.safeParse({
    id: "query",
    title: "query",
    aggregateId,
    aggregateVersion: query.aggregateVersion,
    placement: "retro",
    selectedFields: query.selectedFields,
    filterLogic: query.filterLogic,
    filters: query.filters,
    dateField: query.dateField,
    asOf: query.asOf ?? null,
    metric: query.metric,
    groupBy: query.groupBy,
    sortBy: query.sortBy,
    sortDirection: query.sortDirection,
    visualization: query.groupBy === "none" ? "number" : "bar",
    width: "half",
  });
  return contract.success
    ? widgetContractError(contract.data, definition)
    : "Запрос не соответствует контракту виджета";
}

function admin(req: Parameters<typeof currentUser>[0]) {
  return currentUser(req)?.role === "ADMIN";
}

async function readable(projectId: string, req: Parameters<typeof currentUser>[0], canRead: typeof userCanReadProject) {
  return currentUser(req) && await canRead(req, projectId);
}

async function editableProject(client: PrismaClient, projectId: string, res: Response) {
  const project = await client.project.findUnique({ where: { id: projectId }, select: { id: true, status: true } });
  if (!project) {
    res.status(404).json({ error: "Проект не найден" });
    return null;
  }
  if (project.status === "CLOSED") {
    res.status(423).json({ error: "Проект закрыт и доступен только для чтения" });
    return null;
  }
  return project;
}

export function registerJiraSemanticAggregateRoutes(
  router: Router,
  prisma: PrismaClient = defaultPrisma,
  canRead: typeof userCanReadProject = userCanReadProject,
) {
  router.get("/projects/:projectId/jira/semantic-aggregates", async (req, res) => {
    if (!await readable(req.params.projectId, req, canRead)) {
      res.status(currentUser(req) ? 404 : 401).json({ error: currentUser(req) ? "Проект не найден" : "Требуется вход в систему" });
      return;
    }
    const [definitions, settings, goals] = await Promise.all([
      listJiraSemanticAggregates(prisma, req.params.projectId),
      prisma.jiraAnalyticsSettings.findUnique({
        where: { projectId: req.params.projectId },
        select: { dashboardConfig: true, semanticDefaultWidgetsVersion: true },
      }),
      prisma.wbsItem.findMany({
        where: { projectId: req.params.projectId, type: "GOAL" },
        select: { id: true, title: true, status: true, dueDate: true, jiraGoalLabels: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      }),
    ]);
    const dashboard = jiraSemanticDashboardSchema.safeParse(settings?.dashboardConfig);
    const dashboardConfig = dashboard.success ? dashboard.data : JIRA_SEMANTIC_EMPTY_DASHBOARD;
    const isAdmin = admin(req);
    res.json({
      definitions: (isAdmin ? definitions : definitions.filter((definition) => definition.published)).map((definition) => isAdmin
        ? definition
        : {
            ...definition,
            draft: definition.published!,
            version: definition.publishedVersion!,
            revisions: definition.revisions.filter((revision) => revision.status === "published"),
          }),
      dashboard: dashboardConfig,
      dashboardConfigHash: jiraDashboardConfigHash(settings?.dashboardConfig ?? null),
      dashboardSeedRequired: (settings?.semanticDefaultWidgetsVersion ?? 0) < JIRA_SEMANTIC_DEFAULT_WIDGETS_VERSION,
      systemAggregatesSeedRequired: JIRA_SYSTEM_SEMANTIC_AGGREGATES.some(
        (systemAggregate) => !definitions.some(
          (definition) => definition.system && definition.key === systemAggregate.key,
        ),
      ),
      goals: goals.map((goal) => ({
        ...goal,
        dueDate: goal.dueDate?.toISOString() ?? null,
      })),
    });
  });

  router.patch("/projects/:projectId/jira/goal-labels", async (req, res) => {
    const user = currentUser(req);
    if (!user || !admin(req)) {
      res.status(user ? 403 : 401).json({ error: user ? "Настраивать связи целей с Jira может только системный администратор" : "Требуется вход в систему" });
      return;
    }
    const parsed = goalLabelsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректные лейблы целей", details: parsed.error.flatten() });
      return;
    }
    const project = await editableProject(prisma, req.params.projectId, res);
    if (!project) return;
    let normalized: Array<{ goalId: string; labels: string[] }>;
    try {
      normalized = parsed.data.goals.map((goal) => ({
        goalId: goal.goalId,
        labels: goal.labels.length === 0 ? [] : jiraAnalyticsLabels(goal.labels.join(",")),
      }));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Некорректные лейблы целей" });
      return;
    }
    const ids = normalized.map((goal) => goal.goalId);
    if (new Set(ids).size !== ids.length) {
      res.status(400).json({ error: "Одна цель указана несколько раз" });
      return;
    }
    const outcome = await prisma.$transaction(async (transaction) => {
      const before = await transaction.wbsItem.findMany({
        where: { projectId: project.id, type: "GOAL", id: { in: ids } },
        select: { id: true, title: true, jiraGoalLabels: true },
      });
      if (before.length !== ids.length) return null;
      await Promise.all(normalized.map((goal) => transaction.wbsItem.update({
        where: { id: goal.goalId },
        data: { jiraGoalLabels: goal.labels },
      })));
      const after = await transaction.wbsItem.findMany({
        where: { projectId: project.id, type: "GOAL" },
        select: { id: true, title: true, status: true, dueDate: true, jiraGoalLabels: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      });
      return { before, after };
    });
    if (!outcome) {
      res.status(400).json({ error: "Список содержит цель другого проекта или элемент, который не является целью" });
      return;
    }
    await recordAuditEvent({
      req, actor: user, action: "jira.goal_labels.update", objectType: "Project",
      objectId: project.id, projectId: project.id, beforeValue: outcome.before, afterValue: outcome.after,
    });
    res.json({ goals: outcome.after.map((goal) => ({ ...goal, dueDate: goal.dueDate?.toISOString() ?? null })) });
  });

  router.post("/projects/:projectId/jira/semantic-aggregates/bootstrap", async (req, res) => {
    const user = currentUser(req);
    if (!user || !admin(req)) {
      res.status(user ? 403 : 401).json({ error: user ? "Создавать системные агрегаты может только системный администратор" : "Требуется вход в систему" });
      return;
    }
    const project = await editableProject(prisma, req.params.projectId, res);
    if (!project) return;
    try {
      await ensureJiraSystemSemanticAggregates(prisma, project.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        res.status(409).json({ error: "Название системного агрегата уже занято пользовательским агрегатом" });
        return;
      }
      throw error;
    }
    await recordAuditEvent({
      req, actor: user, action: "jira.semantic_aggregates.bootstrap", objectType: "Project",
      objectId: project.id, projectId: project.id,
    });
    res.status(204).send();
  });

  router.post("/projects/:projectId/jira/semantic-aggregates/bootstrap-missing", async (req, res) => {
    const user = currentUser(req);
    if (!user || !admin(req)) {
      res.status(user ? 403 : 401).json({ error: user ? "Создавать системные агрегаты может только системный администратор" : "Требуется вход в систему" });
      return;
    }
    const project = await editableProject(prisma, req.params.projectId, res);
    if (!project) return;
    let created: string[];
    try {
      created = await ensureMissingJiraSystemSemanticAggregates(prisma, project.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        res.status(409).json({ error: "Название системного агрегата уже занято пользовательским агрегатом" });
        return;
      }
      throw error;
    }
    await recordAuditEvent({
      req, actor: user, action: "jira.semantic_aggregates.bootstrap_missing", objectType: "Project",
      objectId: project.id, projectId: project.id, metadata: { created },
    });
    res.status(204).send();
  });

  router.patch("/projects/:projectId/jira/semantic-dashboard", async (req, res) => {
    const user = currentUser(req);
    if (!user || !admin(req)) {
      res.status(user ? 403 : 401).json({ error: user ? "Настраивать виджеты может только системный администратор" : "Требуется вход в систему" });
      return;
    }
    const parsed = dashboardSaveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректная конфигурация виджетов", details: parsed.error.flatten() });
      return;
    }
    const project = await editableProject(prisma, req.params.projectId, res);
    if (!project) return;
    const outcome = await prisma.$transaction(async (transaction) => {
      await lockJiraAggregateProject(transaction, project.id);
      const references = parsed.data.config.widgets.map((widget) => ({
        aggregateId: widget.aggregateId,
        version: widget.aggregateVersion,
      }));
      const definitions = references.length === 0 ? [] : await transaction.jiraAggregateDefinition.findMany({
        where: { projectId: project.id, id: { in: [...new Set(references.map((reference) => reference.aggregateId))] }, archivedAt: null },
        include: { revisions: true },
      });
      const invalid = references.flatMap((reference, index) => {
        const definition = definitions.find((item) => item.id === reference.aggregateId);
        const revision = definition?.revisions.find((item) => item.version === reference.version && item.status === "published");
        if (!revision) return [{ ...reference, error: "Опубликованная ревизия не найдена" }];
        const contract = jiraSemanticAggregateDefinitionSchema.safeParse(revision.definition);
        if (!contract.success) return [{ ...reference, error: "Контракт ревизии повреждён" }];
        const error = widgetContractError(parsed.data.config.widgets[index]!, contract.data);
        return error ? [{ ...reference, error }] : [];
      });
      if (invalid.length > 0) return { status: "INVALID" as const, invalid };
      const before = await transaction.jiraAnalyticsSettings.findUnique({ where: { projectId: project.id } });
      if (jiraDashboardConfigHash(before?.dashboardConfig ?? null) !== parsed.data.expectedConfigHash) {
        return { status: "CONFLICT" as const };
      }
      const settings = await transaction.jiraAnalyticsSettings.upsert({
        where: { projectId: project.id },
        create: { projectId: project.id, jiraScopeType: "LABEL", jiraScopeValue: "", dashboardConfig: parsed.data.config as unknown as Prisma.InputJsonObject },
        update: { dashboardConfig: parsed.data.config as unknown as Prisma.InputJsonObject },
      });
      return { status: "SAVED" as const, before, settings };
    });
    if (outcome.status === "INVALID") {
      res.status(409).json({ error: "Виджет ссылается на неопубликованную ревизию агрегата", invalid: outcome.invalid });
      return;
    }
    if (outcome.status === "CONFLICT") {
      res.status(409).json({ error: "Виджеты уже изменены другим администратором; обновите страницу" });
      return;
    }
    await recordAuditEvent({
      req, actor: user, action: "jira.semantic_dashboard.update", objectType: "JiraAnalyticsSettings",
      objectId: outcome.settings.id, projectId: project.id, beforeValue: outcome.before, afterValue: outcome.settings,
    });
    res.json({ config: parsed.data.config, configHash: jiraDashboardConfigHash(outcome.settings.dashboardConfig) });
  });

  router.post("/projects/:projectId/jira/semantic-aggregates", async (req, res) => {
    const user = currentUser(req);
    if (!user || !admin(req)) {
      res.status(user ? 403 : 401).json({ error: user ? "Настраивать агрегаты может только системный администратор" : "Требуется вход в систему" });
      return;
    }
    const parsed = jiraSemanticAggregateCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректное определение агрегата", details: parsed.error.flatten() });
      return;
    }
    if (!await editableProject(prisma, req.params.projectId, res)) return;
    try {
      await ensureJiraSystemSemanticAggregates(prisma, req.params.projectId);
      const created = await prisma.$transaction(async (transaction) => {
        await lockJiraAggregateProject(transaction, req.params.projectId);
        const row = await transaction.jiraAggregateDefinition.create({
          data: jiraSemanticCreateData(req.params.projectId, parsed.data.key, parsed.data.definition),
        });
        await transaction.jiraAggregateDefinitionRevision.create({
          data: jiraSemanticRevisionCreateData(req.params.projectId, row.id, 1, parsed.data.definition, "compatible"),
        });
        return row;
      });
      await recordAuditEvent({
        req, actor: user, action: "jira.semantic_aggregate.create", objectType: "JiraAggregateDefinition",
        objectId: created.id, projectId: req.params.projectId, afterValue: created,
      });
      res.status(201).json({ id: created.id });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        res.status(409).json({ error: "Агрегат с таким кодом или названием уже существует" });
        return;
      }
      throw error;
    }
  });

  router.patch("/projects/:projectId/jira/semantic-aggregates/:aggregateId", async (req, res) => {
    const user = currentUser(req);
    if (!user || !admin(req)) {
      res.status(user ? 403 : 401).json({ error: user ? "Настраивать агрегаты может только системный администратор" : "Требуется вход в систему" });
      return;
    }
    const parsed = jiraSemanticAggregateSaveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректное определение агрегата", details: parsed.error.flatten() });
      return;
    }
    if (!await editableProject(prisma, req.params.projectId, res)) return;
    try {
      const outcome = await prisma.$transaction(async (transaction) => {
        await lockJiraAggregateProject(transaction, req.params.projectId);
        const before = await transaction.jiraAggregateDefinition.findFirst({
          where: { id: req.params.aggregateId, projectId: req.params.projectId, archivedAt: null },
          include: { revisions: true },
        });
        if (!before) return null;
        if (before.version !== parsed.data.expectedVersion) throw new Error("VERSION_CONFLICT");
        const publishedRevision = before.publishedVersion == null
          ? null
          : before.revisions.find((revision) => revision.version === before.publishedVersion) ?? null;
        const published = publishedRevision
          ? jiraSemanticAggregateDefinitionSchema.safeParse(publishedRevision.definition)
          : null;
        if (published?.success && published.data.grain !== parsed.data.definition.grain) {
          throw new Error("GRAIN_LOCKED");
        }
        if (published?.success && published.data.rowConfig.kind !== parsed.data.definition.rowConfig.kind) {
          throw new Error("ROW_KIND_LOCKED");
        }
        const previousDraft = jiraSemanticAggregateDefinitionSchema.safeParse(before.draftDefinition);
        const nextVersion = before.version + 1;
        const changeKind = jiraSemanticRevisionChangeKind(
          published?.success ? published.data : previousDraft.success ? previousDraft.data : null,
          parsed.data.definition,
        );
        await transaction.jiraAggregateDefinitionRevision.updateMany({
          where: { aggregateId: before.id, status: "draft" },
          data: { status: "archived" },
        });
        const updated = await transaction.jiraAggregateDefinition.update({
          where: { id: before.id },
          data: jiraSemanticDefinitionUpdateData(parsed.data.definition, nextVersion),
        });
        await transaction.jiraAggregateDefinitionRevision.create({
          data: jiraSemanticRevisionCreateData(req.params.projectId, before.id, nextVersion, parsed.data.definition, changeKind),
        });
        return { before, updated, changeKind };
      });
      if (!outcome) {
        res.status(404).json({ error: "Агрегат не найден" });
        return;
      }
      await recordAuditEvent({
        req, actor: user, action: "jira.semantic_aggregate.draft.save", objectType: "JiraAggregateDefinition",
        objectId: outcome.updated.id, projectId: req.params.projectId, beforeValue: outcome.before,
        afterValue: outcome.updated, metadata: { changeKind: outcome.changeKind },
      });
      res.json({ version: outcome.updated.version, changeKind: outcome.changeKind });
    } catch (error) {
      if (error instanceof Error && error.message === "VERSION_CONFLICT") {
        res.status(409).json({ error: "Агрегат уже изменён другим администратором; обновите страницу" });
        return;
      }
      if (error instanceof Error && error.message === "GRAIN_LOCKED") {
        res.status(409).json({ error: "Гранулярность опубликованного агрегата менять нельзя; создайте новый агрегат" });
        return;
      }
      if (error instanceof Error && error.message === "ROW_KIND_LOCKED") {
        res.status(409).json({ error: "Правило строк опубликованного агрегата менять нельзя; создайте новый агрегат" });
        return;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        res.status(409).json({ error: "Агрегат с таким названием уже существует" });
        return;
      }
      throw error;
    }
  });

  router.post("/projects/:projectId/jira/semantic-aggregates/:aggregateId/publish", async (req, res) => {
    const user = currentUser(req);
    if (!user || !admin(req)) {
      res.status(user ? 403 : 401).json({ error: user ? "Публиковать агрегаты может только системный администратор" : "Требуется вход в систему" });
      return;
    }
    const parsed = publishSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Укажите актуальную версию черновика" });
      return;
    }
    if (!await editableProject(prisma, req.params.projectId, res)) return;
    const row = await prisma.jiraAggregateDefinition.findFirst({
      where: { id: req.params.aggregateId, projectId: req.params.projectId, archivedAt: null },
    });
    if (!row) {
      res.status(404).json({ error: "Агрегат не найден" });
      return;
    }
    if (row.version !== parsed.data.expectedVersion) {
      res.status(409).json({ error: "Агрегат уже изменён; обновите страницу" });
      return;
    }
    const definition = jiraSemanticAggregateDefinitionSchema.safeParse(row.draftDefinition);
    if (!definition.success) {
      res.status(409).json({ error: "Черновик агрегата повреждён" });
      return;
    }
    const population = await jiraSemanticPopulationStats(prisma, req.params.projectId);
    const cost = jiraSemanticAggregateCost(definition.data, population);
    if (cost.blocked) {
      res.status(409).json({ error: "Оценка количества строк превышает опубликованный лимит", cost });
      return;
    }
    let result;
    if (isGitlabBranchAggregate(definition.data)) {
      result = {
        totalRecords: 0,
        quality: { coveragePercent: 100, status: "NO_DATA", warnings: [] },
      };
    } else {
      const executable = jiraSemanticExecutableDefinition(definition.data, {
        metric: "count", groupBy: "none", filters: [], filterLogic: "and", periodDays: null,
        dateField: null, sortBy: "default", sortDirection: "desc",
      });
      try {
        result = await evaluateJiraAggregateFromDatabase(prisma, req.params.projectId, executable, {
          now: new Date().toISOString(), assignee: "", page: 1, pageSize: 1,
        });
      } catch (error) {
        if (respondEvaluationLimit(res, error, "Публикация агрегата")) return;
        throw error;
      }
    }
    if (result.totalRecords > definition.data.qualityRules.maximumRows) {
      res.status(409).json({ error: "Фактическое количество строк превышает лимит агрегата", cost, actualRows: result.totalRecords });
      return;
    }
    if ((result.quality.coveragePercent ?? 100) < definition.data.qualityRules.minimumCoveragePercent) {
      res.status(409).json({ error: "Полнота данных ниже минимального порога агрегата", quality: result.quality });
      return;
    }
    const published = await prisma.$transaction(async (transaction) => {
      await lockJiraAggregateProject(transaction, req.params.projectId);
      const current = await transaction.jiraAggregateDefinition.findFirst({
        where: { id: row.id, projectId: req.params.projectId, archivedAt: null },
      });
      if (!current || current.version !== row.version) return false;
      const revision = await transaction.jiraAggregateDefinitionRevision.updateMany({
        where: { aggregateId: row.id, version: row.version, status: "draft" },
        data: { status: "published", publishedAt: new Date() },
      });
      if (revision.count !== 1) return false;
      await transaction.jiraAggregateDefinition.update({
        where: { id: row.id }, data: { publishedVersion: row.version },
      });
      return true;
    });
    if (!published) {
      res.status(409).json({ error: "Черновик уже изменён или опубликован; обновите страницу" });
      return;
    }
    await recordAuditEvent({
      req, actor: user, action: "jira.semantic_aggregate.publish", objectType: "JiraAggregateDefinition",
      objectId: row.id, projectId: req.params.projectId,
      metadata: { version: row.version, cost, quality: result.quality },
    });
    res.json({ version: row.version, cost, quality: result.quality });
  });

  router.post("/projects/:projectId/jira/semantic-aggregates/:aggregateId/sync-gitlab", async (req, res) => {
    const user = currentUser(req);
    if (!user || !admin(req)) {
      res.status(user ? 403 : 401).json({ error: user ? "Синхронизировать GitLab может только системный администратор" : "Требуется вход в систему" });
      return;
    }
    const parsed = gitlabSyncSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Укажите опубликованную версию агрегата" });
      return;
    }
    if (!await editableProject(prisma, req.params.projectId, res)) return;
    const aggregate = await loadPublishedJiraSemanticAggregate(
      prisma,
      req.params.projectId,
      req.params.aggregateId,
      parsed.data.aggregateVersion,
    );
    if (!aggregate) {
      res.status(404).json({ error: "Опубликованная ревизия агрегата не найдена" });
      return;
    }
    if (!isGitlabBranchAggregate(aggregate.definition)) {
      res.status(409).json({ error: "Синхронизация GitLab доступна только агрегату коммитов ветки" });
      return;
    }
    try {
      const outcome = await syncGitlabBranchCommitAggregate(prisma, {
        projectId: req.params.projectId,
        aggregateId: aggregate.row.id,
        aggregateVersion: aggregate.revision.version,
        definition: aggregate.definition,
        createdById: user.id,
      });
      await recordAuditEvent({
        req,
        actor: user,
        action: "gitlab.branch_commits.sync",
        objectType: "JiraAggregateDefinition",
        objectId: aggregate.row.id,
        projectId: req.params.projectId,
        metadata: outcome,
      });
      res.json(outcome);
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Не удалось синхронизировать GitLab" });
    }
  });

  router.delete("/projects/:projectId/jira/semantic-aggregates/:aggregateId", async (req, res) => {
    const user = currentUser(req);
    if (!user || !admin(req)) {
      res.status(user ? 403 : 401).json({ error: user ? "Архивировать агрегаты может только системный администратор" : "Требуется вход в систему" });
      return;
    }
    const parsed = deleteSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Укажите актуальную версию агрегата" });
      return;
    }
    if (!await editableProject(prisma, req.params.projectId, res)) return;
    const outcome = await prisma.$transaction(async (transaction) => {
      await lockJiraAggregateProject(transaction, req.params.projectId);
      const row = await transaction.jiraAggregateDefinition.findFirst({
        where: { id: req.params.aggregateId, projectId: req.params.projectId, archivedAt: null },
      });
      if (!row) return { status: "MISSING" as const };
      if (row.system) return { status: "SYSTEM" as const, row };
      if (row.version !== parsed.data.expectedVersion) return { status: "CONFLICT" as const, row };
      const settings = await transaction.jiraAnalyticsSettings.findUnique({
        where: { projectId: req.params.projectId }, select: { dashboardConfig: true },
      });
      const dashboard = jiraSemanticDashboardSchema.safeParse(settings?.dashboardConfig);
      if (dashboard.success && dashboard.data.widgets.some((widget) => widget.aggregateId === row.id)) {
        return { status: "IN_USE" as const, row };
      }
      await transaction.jiraAggregateDefinition.update({ where: { id: row.id }, data: { archivedAt: new Date() } });
      return { status: "ARCHIVED" as const, row };
    });
    if (outcome.status === "MISSING") {
      res.status(404).json({ error: "Агрегат не найден" });
      return;
    }
    if (outcome.status === "SYSTEM") {
      res.status(409).json({ error: "Системный агрегат нельзя удалить; можно опубликовать новую ревизию" });
      return;
    }
    if (outcome.status === "CONFLICT") {
      res.status(409).json({ error: "Агрегат уже изменён; обновите страницу" });
      return;
    }
    if (outcome.status === "IN_USE") {
      res.status(409).json({ error: "Сначала удалите виджеты, использующие этот агрегат" });
      return;
    }
    await recordAuditEvent({
      req, actor: user, action: "jira.semantic_aggregate.archive", objectType: "JiraAggregateDefinition",
      objectId: outcome.row.id, projectId: req.params.projectId, beforeValue: outcome.row,
    });
    res.status(204).send();
  });

  router.post("/projects/:projectId/jira/semantic-aggregates/query-batch", async (req, res) => {
    if (!await readable(req.params.projectId, req, canRead)) {
      res.status(currentUser(req) ? 404 : 401).json({ error: currentUser(req) ? "Проект не найден" : "Требуется вход в систему" });
      return;
    }
    const parsed = batchQuerySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректный пакет запросов виджетов", details: parsed.error.flatten() });
      return;
    }
    const loaded = await Promise.all(parsed.data.queries.map(async (item) => ({
      item,
      aggregate: await loadPublishedJiraSemanticAggregate(
        prisma, req.params.projectId, item.aggregateId, item.query.aggregateVersion,
      ),
    })));
    const prepared = loaded.map(({ item, aggregate }) => {
      if (!aggregate) return { item, aggregate, error: "Опубликованная ревизия агрегата не найдена" };
      const contractError = queryContractError(item.aggregateId, item.query, aggregate.definition);
      if (contractError) return { item, aggregate, error: contractError };
      if (item.query.asOf && aggregate.definition.asOfSupport !== "supported") {
        return { item, aggregate, error: "Этот агрегат не поддерживает состояние на дату" };
      }
      return { item, aggregate, error: null };
    });
    const valid = prepared.filter((entry) => entry.error === null && entry.aggregate !== null);
    try {
      const jiraEntries = valid.filter(({ aggregate }) => !isGitlabBranchAggregate(aggregate!.definition));
      const gitlabEntries = valid.filter(({ aggregate }) => isGitlabBranchAggregate(aggregate!.definition));
      const jiraEvaluated = jiraEntries.length === 0 ? [] : await evaluateJiraAggregatesFromDatabase(
        prisma, req.params.projectId, jiraEntries.map(({ item, aggregate }) => ({
          key: item.widgetId,
          definition: jiraSemanticExecutableDefinition(aggregate!.definition, item.query),
          options: {
            now: jiraSemanticEvaluationNow(item.query.asOf),
            periodDays: item.query.periodDays ?? undefined,
            assignee: item.query.assignee,
            page: item.query.page,
            pageSize: item.query.pageSize,
            groupKey: item.query.groupKey,
          },
          asOf: item.query.asOf ? new Date(item.query.asOf) : undefined,
        })),
      );
      const gitlabEvaluated = await Promise.all(gitlabEntries.map(async ({ item, aggregate }) => {
        try {
          return {
            key: item.widgetId,
            result: await evaluateGitlabBranchCommitAggregateFromDatabase(
              prisma,
              req.params.projectId,
              aggregate!.definition,
              item.query,
              {
                now: jiraSemanticEvaluationNow(item.query.asOf),
                periodDays: item.query.periodDays ?? undefined,
                assignee: item.query.assignee,
                page: item.query.page,
                pageSize: item.query.pageSize,
                groupKey: item.query.groupKey,
              },
            ),
          };
        } catch (error) {
          return { key: item.widgetId, error: error instanceof Error ? error : new Error("GITLAB_EVALUATION_FAILED") };
        }
      }));
      const evaluated = [...jiraEvaluated, ...gitlabEvaluated];
      const evaluatedByWidget = new Map(evaluated.map((entry) => [entry.key, entry]));
      res.json({
        results: prepared.map(({ item, aggregate, error }) => {
          if (error || !aggregate) return { widgetId: item.widgetId, error: error ?? "Агрегат недоступен" };
          const outcome = evaluatedByWidget.get(item.widgetId);
          if (!outcome || outcome.error || !outcome.result) {
            return { widgetId: item.widgetId, error: evaluationErrorMessage(outcome?.error ?? new Error("MISSING_RESULT")) };
          }
          return {
            widgetId: item.widgetId,
            aggregate: { id: aggregate.row.id, name: aggregate.definition.name, version: aggregate.revision.version },
            result: jiraAggregateResultProjection(outcome.result, item.query.selectedFields),
          };
        }),
      });
    } catch (error) {
      if (respondEvaluationLimit(res, error, "Расчёт виджетов")) return;
      throw error;
    }
  });

  router.post("/projects/:projectId/jira/semantic-aggregates/preview", async (req, res) => {
    if (!admin(req)) {
      res.status(currentUser(req) ? 403 : 401).json({
        error: currentUser(req) ? "Предпросмотр черновика доступен только системному администратору" : "Требуется вход в систему",
      });
      return;
    }
    const parsed = previewSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректный черновик агрегата", details: parsed.error.flatten() });
      return;
    }
    if (!await editableProject(prisma, req.params.projectId, res)) return;
    if (parsed.data.asOf && parsed.data.definition.asOfSupport !== "supported") {
      res.status(409).json({ error: "Этот агрегат не поддерживает состояние на дату" });
      return;
    }
    const population = await jiraSemanticPopulationStats(prisma, req.params.projectId);
    const cost = jiraSemanticAggregateCost(parsed.data.definition, population);
    if (cost.blocked) {
      res.status(409).json({ error: "Оценка количества строк превышает лимит агрегата", cost });
      return;
    }
    let rawResult;
    try {
      if (isGitlabBranchAggregate(parsed.data.definition)) {
        rawResult = await evaluateGitlabBranchCommitAggregateFromDatabase(
          prisma,
          req.params.projectId,
          parsed.data.definition,
          { filters: [], filterLogic: "and", sortBy: "default", sortDirection: "desc" },
          { now: jiraSemanticEvaluationNow(parsed.data.asOf), assignee: "", page: 1, pageSize: 20 },
        );
      } else {
        const executable = jiraSemanticExecutableDefinition(parsed.data.definition, {
          metric: "count", groupBy: "none", filters: [], filterLogic: "and", periodDays: null,
          dateField: null, sortBy: "default", sortDirection: "desc",
        });
        rawResult = await evaluateJiraAggregateFromDatabase(
          prisma,
          req.params.projectId,
          executable,
          { now: jiraSemanticEvaluationNow(parsed.data.asOf), assignee: "", page: 1, pageSize: 20 },
          parsed.data.asOf ? new Date(parsed.data.asOf) : undefined,
        );
      }
    } catch (error) {
      if (respondEvaluationLimit(res, error, "Предпросмотр агрегата")) return;
      if (error instanceof GitlabBranchAnalyticsError) {
        res.status(409).json({ error: error.message });
        return;
      }
      throw error;
    }
    if (rawResult.totalRecords > parsed.data.definition.qualityRules.maximumRows) {
      res.status(409).json({
        error: "Фактическое количество строк превышает лимит агрегата",
        actualRows: rawResult.totalRecords,
        maximumRows: parsed.data.definition.qualityRules.maximumRows,
      });
      return;
    }
    res.json({
      result: jiraAggregateResultProjection(rawResult, parsed.data.definition.outputFields.map((field) => field.key)),
      cost,
    });
  });

  router.post("/projects/:projectId/jira/semantic-aggregates/:aggregateId/query", async (req, res) => {
    if (!await readable(req.params.projectId, req, canRead)) {
      res.status(currentUser(req) ? 404 : 401).json({ error: currentUser(req) ? "Проект не найден" : "Требуется вход в систему" });
      return;
    }
    const parsed = querySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректный запрос виджета", details: parsed.error.flatten() });
      return;
    }
    const aggregate = await loadPublishedJiraSemanticAggregate(
      prisma, req.params.projectId, req.params.aggregateId, parsed.data.aggregateVersion,
    );
    if (!aggregate) {
      res.status(404).json({ error: "Опубликованная ревизия агрегата не найдена" });
      return;
    }
    const contractError = queryContractError(req.params.aggregateId, parsed.data, aggregate.definition);
    if (contractError) {
      res.status(409).json({ error: contractError });
      return;
    }
    if (parsed.data.asOf && aggregate.definition.asOfSupport !== "supported") {
      res.status(409).json({ error: "Этот агрегат не поддерживает состояние на дату" });
      return;
    }
    let rawResult;
    try {
      rawResult = await evaluatePublishedDefinition(prisma, req.params.projectId, aggregate.definition, parsed.data);
    } catch (error) {
      if (respondEvaluationLimit(res, error, "Расчёт виджета")) return;
      if (error instanceof GitlabBranchAnalyticsError) {
        res.status(409).json({ error: error.message });
        return;
      }
      throw error;
    }
    if (rawResult.totalRecords > aggregate.definition.qualityRules.maximumRows) {
      res.status(409).json({
        error: "Фактическое количество строк превышает лимит агрегата",
        actualRows: rawResult.totalRecords,
        maximumRows: aggregate.definition.qualityRules.maximumRows,
      });
      return;
    }
    res.json({
      aggregate: { id: aggregate.row.id, name: aggregate.definition.name, version: aggregate.revision.version },
      result: jiraAggregateResultProjection(rawResult, parsed.data.selectedFields),
    });
  });

  router.post("/projects/:projectId/jira/semantic-aggregates/:aggregateId/query.csv", async (req, res) => {
    if (!await readable(req.params.projectId, req, canRead)) {
      res.status(currentUser(req) ? 404 : 401).json({ error: currentUser(req) ? "Проект не найден" : "Требуется вход в систему" });
      return;
    }
    const parsed = querySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректный запрос экспорта", details: parsed.error.flatten() });
      return;
    }
    const aggregate = await loadPublishedJiraSemanticAggregate(
      prisma, req.params.projectId, req.params.aggregateId, parsed.data.aggregateVersion,
    );
    if (!aggregate) {
      res.status(404).json({ error: "Опубликованная ревизия агрегата не найдена" });
      return;
    }
    const contractError = queryContractError(req.params.aggregateId, parsed.data, aggregate.definition);
    if (contractError) {
      res.status(409).json({ error: contractError });
      return;
    }
    if (parsed.data.asOf && aggregate.definition.asOfSupport !== "supported") {
      res.status(409).json({ error: "Этот агрегат не поддерживает состояние на дату" });
      return;
    }
    try {
      const exportOptions = jiraAggregateExportOptions({
        now: jiraSemanticEvaluationNow(parsed.data.asOf),
        periodDays: parsed.data.periodDays ?? undefined,
        assignee: parsed.data.assignee,
        groupKey: parsed.data.groupKey,
      });
      const rawResult = isGitlabBranchAggregate(aggregate.definition)
        ? await evaluateGitlabBranchCommitAggregateFromDatabase(
            prisma,
            req.params.projectId,
            aggregate.definition,
            parsed.data,
            exportOptions,
          )
        : await evaluateJiraAggregateFromDatabase(
            prisma,
            req.params.projectId,
            jiraSemanticExecutableDefinition(aggregate.definition, parsed.data),
            exportOptions,
            parsed.data.asOf ? new Date(parsed.data.asOf) : undefined,
            jiraAggregateExportLimits(),
          );
      const result = rawResult;
      if (result.totalRecords > aggregate.definition.qualityRules.maximumRows) {
        res.status(409).json({
          error: "Фактическое количество строк превышает лимит агрегата",
          actualRows: result.totalRecords,
          maximumRows: aggregate.definition.qualityRules.maximumRows,
        });
        return;
      }
      const filePart = aggregate.definition.name.normalize("NFKC").replaceAll(/[^\p{L}\p{N}]+/gu, "-").replaceAll(/^-|-$/gu, "") || "aggregate";
      const encodedFilename = encodeURIComponent(`jira-${filePart}.csv`);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="jira-aggregate.csv"; filename*=UTF-8''${encodedFilename}`);
      res.setHeader("X-PMS-Analytics-Quality", result.quality.status);
      const labels = Object.fromEntries(aggregate.definition.outputFields.map((field) => [field.key, field.label]));
      res.send(`\uFEFF${jiraAggregateResultCsv(result, parsed.data.selectedFields, labels)}`);
    } catch (error) {
      if (respondEvaluationLimit(res, error, "Экспорт")) return;
      if (error instanceof GitlabBranchAnalyticsError) {
        res.status(409).json({ error: error.message });
        return;
      }
      throw error;
    }
  });
}
