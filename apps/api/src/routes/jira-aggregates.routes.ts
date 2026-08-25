import {
  jiraAnalyticsDatasetDraftSchema,
  jiraAnalyticsDashboardConfigSchema,
  jiraAnalyticsDashboardV3Schema,
  jiraAnalyticsPeriodDays,
  jiraAnalyticsSourceUsesPeriod,
  jiraAnalyticsWidgetDatasetError,
  normalizeJiraAnalyticsDatasetRevision,
  JiraAnalyticsEvaluationLimitError,
  type JiraAnalyticsAggregateDraft,
  type JiraAnalyticsDatasetDraft,
  type JiraAnalyticsEvaluationOptions,
} from '@pms/shared';
import { Prisma, type JiraAggregateDefinition, type PrismaClient } from '@prisma/client';
import type { Response, Router } from 'express';
import { z } from 'zod';
import { prisma as defaultPrisma } from '../db.js';
import { currentUser } from '../server/auth.js';
import { userCanReadProject } from '../server/business-units.js';
import { logEvent } from '../server/logger.js';
import { buildAuditFieldChanges, recordAuditEvent } from '../services/audit.js';
import {
  buildJiraAggregateImportPlan,
  buildJiraDashboardSwitchPlan,
  convertJiraDashboardToV2,
  convertJiraDashboardV2ToV3,
  evaluateJiraAggregateFromDatabase,
  evaluateSavedDashboardFromDatabase,
  editableJiraDashboardV3,
  jiraAggregateCreateData,
  jiraAggregateDatasetCreateData,
  jiraAggregateDatasetRevisionCreateData,
  jiraAggregateDatasetUpdateData,
  jiraAggregateDraftFromRow,
  jiraAggregateExportLimits,
  jiraAggregateExportOptions,
  jiraAggregateFingerprint,
  jiraAggregatePublicDefinition,
  jiraAggregatePublicDefinitionFromDataset,
  jiraAggregateRevisionCreateData,
  jiraAggregateResultCsv,
  jiraDashboardReconciliationConfigs,
  jiraDashboardConfigHash,
  inspectJiraDashboardDefinitionUse,
  JiraAggregateEventLimitError,
  JiraAggregateExportLimitError,
  JiraAggregatePopulationLimitError,
  loadJiraAnalyticsFacets,
  lockJiraAggregateProject,
  reconcileJiraDashboardFromDatabase,
  safeJiraAggregateDraftFromRow,
  safeJiraAggregateDatasetFromRow,
} from '../services/jira-aggregates.js';
import { JiraAsOfVersionLimitError } from '../services/jira-history-asof.js';

const definitionBodySchema = z.object({
  definition: jiraAnalyticsDatasetDraftSchema,
}).strict();

const updateDefinitionBodySchema = definitionBodySchema.extend({
  expectedVersion: z.number().int().min(1),
});

const expectedVersionQuerySchema = z.object({
  expectedVersion: z.coerce.number().int().min(1),
}).strict();

const periodDaysValueSchema = z.union(jiraAnalyticsPeriodDays.map((value) => z.literal(value)) as [
  z.ZodLiteral<30>,
  z.ZodLiteral<90>,
  z.ZodLiteral<180>,
  z.ZodLiteral<365>,
]);
const periodDaysSchema = z.coerce.number().pipe(periodDaysValueSchema);

const evaluationSchema = z.object({
  periodDays: periodDaysSchema.optional(),
  assignee: z.string().max(200),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
  groupKey: z.string().max(500).optional(),
  evaluatedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

const asOfEvaluationSchema = evaluationSchema.extend({
  asOf: z.string().datetime({ offset: true }).optional(),
});

const exportEvaluationSchema = asOfEvaluationSchema.omit({ page: true, pageSize: true });

const dashboardEvaluationSchema = evaluationSchema.extend({
  widgetId: z.string().min(1).max(200).optional(),
});

const previewBodySchema = asOfEvaluationSchema.extend({
  definition: jiraAnalyticsDatasetDraftSchema,
});

const migrationBodySchema = z.object({
  dryRun: z.boolean(),
  expectedConfigHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

const switchBodySchema = migrationBodySchema.extend({
  periodDays: periodDaysValueSchema,
  assignee: z.string().max(200),
});

const rollbackBodySchema = migrationBodySchema.extend({
  attempt: z.number().int().min(1),
});

const reconciliationBodySchema = z.object({
  expectedConfigHash: z.string().regex(/^[0-9a-f]{64}$/),
  periodDays: periodDaysValueSchema,
  assignee: z.string().max(200),
}).strict();

const aggregateAuditFields = [
  'name',
  'description',
  'source',
  'definitionSchemaVersion',
  'exposedFields',
  'baseFilterLogic',
  'baseFilters',
  'timeZone',
  'sortOrder',
  'version',
];

class AggregateConflictError extends Error {
  constructor(
    public readonly code: 'VERSION' | 'IN_USE' | 'CONFIG_CHANGED' | 'MISSING_DEFINITION' | 'SERIALIZATION',
    public readonly details?: unknown,
    public readonly auditDefinition?: JiraAggregateDefinition,
    public readonly userMessage?: string,
  ) {
    super(code);
  }
}

const SERIALIZABLE_RETRY_LIMIT = 3;

function isSerializationConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

async function runSerializable<T>(
  prisma: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  for (let retry = 0; retry < SERIALIZABLE_RETRY_LIMIT; retry += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isSerializationConflict(error)) throw error;
      if (retry === SERIALIZABLE_RETRY_LIMIT - 1) {
        throw new AggregateConflictError('SERIALIZATION', 'Конкурирующее изменение не завершилось');
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * (2 ** retry)));
    }
  }
  throw new AggregateConflictError('SERIALIZATION');
}

class AggregateNotFoundError extends Error {}

function isPrismaUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function runtimeHasRequiredIcu() {
  return Intl.DateTimeFormat.supportedLocalesOf(['ru-RU']).length === 1;
}

function ensureRuntimeIcu(res: Response) {
  if (runtimeHasRequiredIcu()) return true;
  res.status(500).json({ error: 'API запущен без полной поддержки локали ru-RU' });
  return false;
}

async function ensureWritableProject(projectId: string, res: Response, prisma: PrismaClient) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return false;
  }
  if (project.status === 'CLOSED') {
    res.status(423).json({ error: 'Проект закрыт и доступен только для чтения' });
    return false;
  }
  return true;
}

async function ensureProjectReadAccess(
  projectId: string,
  req: Parameters<typeof currentUser>[0],
  canReadProject: typeof userCanReadProject,
) {
  const user = currentUser(req);
  if (!user) return { ok: false as const, status: 401, error: 'Требуется вход в систему' };
  if (await canReadProject(req, projectId)) return { ok: true as const, user };
  return { ok: false as const, status: 404, error: 'Проект не найден' };
}

function requireSystemAdmin(
  req: Parameters<typeof currentUser>[0],
  res: Response,
  forbiddenError: string,
) {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Требуется вход в систему' });
    return null;
  }
  if (user.role !== 'ADMIN') {
    res.status(403).json({ error: forbiddenError });
    return null;
  }
  return user;
}

function respondToAggregateLimit(error: unknown, res: Response) {
  if (error instanceof JiraAggregatePopulationLimitError) {
    res.status(413).json({
      error: `Для одного расчёта доступно не более ${error.limit.toLocaleString('ru-RU')} активных тикетов`,
      kind: 'issues',
      limit: error.limit,
    });
    return true;
  }
  if (error instanceof JiraAggregateEventLimitError) {
    res.status(413).json({
      error: `Для одного расчёта доступно не более ${error.limit.toLocaleString('ru-RU')} событий Jira`,
      kind: 'events',
      limit: error.limit,
    });
    return true;
  }
  if (error instanceof JiraAggregateExportLimitError) {
    res.status(413).json({
      error: `Один CSV-экспорт не должен превышать ${error.limit.toLocaleString('ru-RU')} записей`,
      kind: 'exportRows',
      limit: error.limit,
    });
    return true;
  }
  if (error instanceof JiraAsOfVersionLimitError) {
    res.status(413).json({
      error: `Для одного исторического расчёта доступно не более ${error.limit.toLocaleString('ru-RU')} наблюдённых версий`,
      kind: 'versions',
      limit: error.limit,
    });
    return true;
  }
  if (error instanceof JiraAnalyticsEvaluationLimitError) {
    res.status(413).json({
      error: error.kind === 'groups'
        ? `Для одного расчёта доступно не более ${error.limit.toLocaleString('ru-RU')} групп`
        : `Окно выдачи не должно превышать ${error.limit.toLocaleString('ru-RU')} записей`,
      kind: error.kind,
      limit: error.limit,
    });
    return true;
  }
  return false;
}

function evaluationOptions(
  input: z.infer<typeof asOfEvaluationSchema>,
  definition: JiraAnalyticsAggregateDraft,
): JiraAnalyticsEvaluationOptions {
  if (definition.periodMode === 'DASHBOARD' && input.periodDays === undefined) {
    throw new AggregateConflictError('CONFIG_CHANGED', 'Для агрегата нужен явный период дашборда');
  }
  if (definition.periodMode === 'FIXED' && input.periodDays !== undefined) {
    throw new AggregateConflictError('CONFIG_CHANGED', 'Фиксированный период нельзя переопределять');
  }
  return {
    now: input.asOf ?? input.evaluatedAt ?? new Date().toISOString(),
    periodDays: input.periodDays,
    assignee: input.assignee,
    page: input.page,
    pageSize: input.pageSize,
    groupKey: input.groupKey,
  };
}

function datasetPreviewDefinition(
  dataset: JiraAnalyticsDatasetDraft,
): JiraAnalyticsAggregateDraft & {
  baseFilterLogic: 'and' | 'or';
  baseFilters: JiraAnalyticsDatasetDraft['baseFilters'];
} {
  return {
    name: dataset.name,
    description: dataset.description,
    source: dataset.source,
    metric: 'count',
    groupBy: 'none',
    scope: 'retro',
    filterLogic: 'and',
    filters: [],
    baseFilterLogic: dataset.baseFilterLogic,
    baseFilters: dataset.baseFilters,
    periodMode: jiraAnalyticsSourceUsesPeriod(dataset.source) ? 'DASHBOARD' : 'NONE',
    periodDays: null,
    timeZone: dataset.timeZone,
    sortOrder: dataset.sortOrder,
  };
}

function asOfDate(
  input: z.infer<typeof asOfEvaluationSchema>,
  definition: JiraAnalyticsAggregateDraft,
) {
  if (!input.asOf) return undefined;
  if (input.evaluatedAt) {
    throw new AggregateConflictError(
      'CONFIG_CHANGED',
      'Параметры asOf и evaluatedAt нельзя использовать одновременно',
    );
  }
  if (jiraAnalyticsSourceUsesPeriod(definition.source)) {
    throw new AggregateConflictError(
      'CONFIG_CHANGED',
      'Срез на дату доступен только для источников Тикеты и SLA Critical/Blocker',
    );
  }
  const parsed = new Date(input.asOf);
  if (parsed.getTime() > Date.now()) {
    throw new AggregateConflictError('CONFIG_CHANGED', 'Дата исторического среза не может быть в будущем');
  }
  return parsed;
}

function logAsOfEvaluation(projectId: string, result: { evaluatedAt: string; reconstruction?: {
  asOf: string;
  tickets: number;
  ticketsWithoutObservation: number;
  versionRowsScanned: number;
} }) {
  if (!result.reconstruction) return;
  logEvent('info', 'jira.analytics.as_of', {
    projectId,
    asOf: result.reconstruction.asOf,
    tickets: result.reconstruction.tickets,
    ticketsWithoutObservation: result.reconstruction.ticketsWithoutObservation,
    versionRowsScanned: result.reconstruction.versionRowsScanned,
  });
}

function conflictMessage(error: AggregateConflictError) {
  if (error.code === 'VERSION') return 'Определение уже изменено другим пользователем';
  if (error.code === 'IN_USE') return 'Агрегат используется виджетами и не может быть удалён';
  if (error.code === 'MISSING_DEFINITION') return 'Не все определения агрегатов доступны';
  if (error.code === 'SERIALIZATION') return 'Данные изменяются параллельно, повторите операцию';
  return error.userMessage ?? (typeof error.details === 'string' ? error.details : 'Конфигурация дашборда изменилась');
}

export function registerJiraAggregateRoutes(
  router: Router,
  prisma: PrismaClient = defaultPrisma,
  canReadProject: typeof userCanReadProject = userCanReadProject,
) {
  router.get('/projects/:projectId/jira/analytics-facets', async (req, res) => {
    const access = await ensureProjectReadAccess(req.params.projectId, req, canReadProject);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }
    if (!ensureRuntimeIcu(res)) return;
    try {
      res.json(await loadJiraAnalyticsFacets(prisma, req.params.projectId));
    } catch (error) {
      if (respondToAggregateLimit(error, res)) return;
      throw error;
    }
  });

  router.get('/projects/:projectId/jira/aggregates', async (req, res) => {
    const access = await ensureProjectReadAccess(req.params.projectId, req, canReadProject);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }
    const [definitions, settings, conversion] = await Promise.all([
      prisma.jiraAggregateDefinition.findMany({
        where: { projectId: req.params.projectId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
      prisma.jiraAnalyticsSettings.findUnique({
        where: { projectId: req.params.projectId },
        select: { dashboardConfig: true },
      }),
      prisma.jiraAnalyticsDashboardConversion.findUnique({
        where: { projectId: req.params.projectId },
        select: {
          id: true,
          attempt: true,
          sourceConfigHash: true,
          originalConfigHash: true,
          originalConfigStored: true,
          convertedConfigHash: true,
          convertedAt: true,
          rolledBackAt: true,
          rollbackState: true,
          rollbackFinalizedAt: true,
        },
      }),
    ]);
    const validDefinitions = definitions.flatMap((definition) => {
      const dataset = safeJiraAggregateDatasetFromRow(definition);
      return dataset ? [definition] : [];
    });
    const invalidDefinitionIds = definitions
      .filter((definition) => !safeJiraAggregateDatasetFromRow(definition))
      .map((definition) => definition.id);
    if (invalidDefinitionIds.length > 0) {
      logEvent('error', 'jira.analytics.aggregate_contract_invalid', {
        projectId: req.params.projectId,
        aggregateIds: invalidDefinitionIds,
      });
    }
    const dashboardConfig = settings?.dashboardConfig ?? null;
    let editableConfig = null;
    let editableConfigError: string | null = null;
    const editableDiagnostics: string[] = [];
    try {
      editableConfig = await editableJiraDashboardV3(
        prisma,
        req.params.projectId,
        dashboardConfig,
        validDefinitions,
        editableDiagnostics,
      );
    } catch (error) {
      editableConfig = null;
      editableConfigError = editableDiagnostics.length > 0
        ? `Нельзя достоверно перевести ${editableDiagnostics.length} виджет(а) на v3. Администратор может начать с пустой конфигурации.`
        : 'Сохранённый дашборд нельзя подготовить для редактирования. Обратитесь к системному администратору.';
      logEvent('warn', 'jira.analytics.dashboard_v3_unavailable', {
        projectId: req.params.projectId,
        reason: error instanceof Error ? error.message : 'DASHBOARD_CONFIG_INVALID',
        diagnostics: editableDiagnostics,
      });
    }
    const pinnedRevisionRequests = editableConfig?.widgets.flatMap((widget) =>
      widget.placement === 'retro' && widget.aggregateVersion
        ? [{ aggregateId: widget.aggregateId, version: widget.aggregateVersion }]
        : [],
    ) ?? [];
    const pinnedRevisions = pinnedRevisionRequests.length > 0
      ? await prisma.jiraAggregateDefinitionRevision.findMany({
          where: { projectId: req.params.projectId, OR: pinnedRevisionRequests },
          select: { aggregateId: true, version: true, definition: true },
        })
      : [];
    const revisionContracts = pinnedRevisions.flatMap((revision) => {
      const normalized = normalizeJiraAnalyticsDatasetRevision(revision.definition);
      return normalized ? [{
        aggregateId: revision.aggregateId,
        version: revision.version,
        definition: normalized.dataset,
      }] : [];
    });
    res.json({
      definitions: validDefinitions.map((definition) =>
        jiraAggregatePublicDefinitionFromDataset(definition, safeJiraAggregateDatasetFromRow(definition)!)
      ),
      invalidDefinitionCount: invalidDefinitionIds.length,
      revisionContracts,
      dashboard: {
        stored: dashboardConfig !== null,
        version: dashboardConfig && typeof dashboardConfig === 'object' && !Array.isArray(dashboardConfig)
          ? Number((dashboardConfig as Prisma.JsonObject).version) || null
          : null,
        configHash: jiraDashboardConfigHash(dashboardConfig),
        conversionId: conversion?.id ?? null,
        attempt: conversion?.attempt ?? null,
        sourceConfigHash: conversion?.sourceConfigHash ?? null,
        originalConfigHash: conversion?.originalConfigHash ?? null,
        originalConfigStored: conversion?.originalConfigStored ?? null,
        convertedConfigHash: conversion?.convertedConfigHash ?? null,
        convertedAt: conversion?.convertedAt.toISOString() ?? null,
        rolledBackAt: conversion?.rolledBackAt?.toISOString() ?? null,
        rollbackState: conversion?.rollbackState ?? null,
        rollbackFinalizedAt: conversion?.rollbackFinalizedAt?.toISOString() ?? null,
        rollbackAvailableUntil: conversion?.rollbackState === 'AVAILABLE'
          ? 'AVAILABLE_UNTIL_LEGACY_RETIREMENT'
          : null,
        editableConfig,
        editableConfigError,
      },
    });
  });

  router.post('/projects/:projectId/jira/aggregates', async (req, res) => {
    const user = requireSystemAdmin(req, res, 'Настраивать агрегаты может только системный администратор');
    if (!user) {
      return;
    }
    if (!ensureRuntimeIcu(res) || !await ensureWritableProject(req.params.projectId, res, prisma)) return;
    const parsed = definitionBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Некорректное определение агрегата', details: parsed.error.flatten() });
      return;
    }
    try {
      const created = await prisma.$transaction(async (transaction) => {
        await lockJiraAggregateProject(transaction, req.params.projectId);
        const definition = await transaction.jiraAggregateDefinition.create({
          data: jiraAggregateDatasetCreateData(req.params.projectId, parsed.data.definition),
        });
        await transaction.jiraAggregateDefinitionRevision.create({
          data: jiraAggregateDatasetRevisionCreateData(
            req.params.projectId,
            definition.id,
            definition.version,
            parsed.data.definition,
          ),
        });
        return definition;
      });
      await recordAuditEvent({
        req,
        actor: user,
        action: 'jira.aggregate.create',
        objectType: 'JiraAggregateDefinition',
        objectId: created.id,
        projectId: req.params.projectId,
        afterValue: created,
      });
      res.status(201).json(jiraAggregatePublicDefinition(created));
    } catch (error) {
      if (isPrismaUniqueConflict(error)) {
        res.status(409).json({ error: 'Агрегат с таким именем уже существует' });
        return;
      }
      throw error;
    }
  });

  router.patch('/projects/:projectId/jira/aggregates/:aggregateId', async (req, res) => {
    const user = requireSystemAdmin(req, res, 'Настраивать агрегаты может только системный администратор');
    if (!user) {
      return;
    }
    if (!ensureRuntimeIcu(res) || !await ensureWritableProject(req.params.projectId, res, prisma)) return;
    const parsed = updateDefinitionBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Некорректное определение агрегата', details: parsed.error.flatten() });
      return;
    }
    try {
      const outcome = await prisma.$transaction(async (transaction) => {
        await lockJiraAggregateProject(transaction, req.params.projectId);
        const before = await transaction.jiraAggregateDefinition.findFirst({
          where: { id: req.params.aggregateId, projectId: req.params.projectId },
        });
        if (!before) throw new AggregateNotFoundError();
        if (before.source !== parsed.data.definition.source) {
          throw new AggregateConflictError(
            'CONFIG_CHANGED',
            jiraAggregatePublicDefinition(before),
            before,
            'Тип строк существующего агрегата менять нельзя; создайте новый агрегат',
          );
        }
        const settingsRows = await transaction.$queryRaw<Array<{
          dashboardConfig: Prisma.JsonValue | null;
        }>>(Prisma.sql`
          SELECT "dashboardConfig"
          FROM "JiraAnalyticsSettings"
          WHERE "projectId" = ${req.params.projectId}
          FOR UPDATE
        `);
        const dashboardConfig = settingsRows[0]?.dashboardConfig ?? null;
        const dashboardRecord = dashboardConfig && typeof dashboardConfig === 'object' && !Array.isArray(dashboardConfig)
          ? dashboardConfig as Prisma.JsonObject
          : null;
        const dashboardV3 = jiraAnalyticsDashboardV3Schema.safeParse(dashboardConfig);
        if (dashboardRecord?.version === 3 && !dashboardV3.success) {
          throw new AggregateConflictError(
            'CONFIG_CHANGED',
            jiraAggregatePublicDefinition(before),
            before,
            'Сохранённая конфигурация виджетов v3 некорректна; сначала восстановите её',
          );
        }
        const dashboard = jiraAnalyticsDashboardConfigSchema.safeParse(dashboardConfig);
        const activeV2Widgets = dashboard.success && dashboard.data.version === 2
          ? dashboard.data.widgets.filter((widget) =>
              widget.aggregateId === before.id && widget.placement === 'active'
            )
          : [];
        const convertedV2Widgets = activeV2Widgets.length > 0
          ? convertJiraDashboardV2ToV3(
              {
                version: 2,
                periodDays: dashboard.success ? dashboard.data.periodDays : 90,
                assignee: dashboard.success ? dashboard.data.assignee : '',
                widgets: activeV2Widgets.map((widget) => ({ ...widget, aggregateVersion: null })),
              },
              [before],
            ).widgets
          : [];
        const incompatibleWidgets = [
          ...(dashboardV3.success
          ? dashboardV3.data.widgets.flatMap((widget) => {
              if (widget.aggregateId !== before.id || widget.placement !== 'active') return [];
              const error = jiraAnalyticsWidgetDatasetError(widget, parsed.data.definition);
              return error ? [{ widgetId: widget.id, error }] : [];
            })
          : []),
          ...convertedV2Widgets.flatMap((widget) => {
            const error = jiraAnalyticsWidgetDatasetError(widget, parsed.data.definition);
            return error ? [{ widgetId: widget.id, error }] : [];
          }),
        ];
        if (incompatibleWidgets.length > 0) {
          throw new AggregateConflictError(
            'CONFIG_CHANGED',
            jiraAggregatePublicDefinition(before),
            before,
            `Изменение сделает недоступными виджеты: ${incompatibleWidgets.map((item) => item.widgetId).join(', ')}`,
          );
        }
        const result = await transaction.jiraAggregateDefinition.updateMany({
          where: {
            id: before.id,
            projectId: req.params.projectId,
            version: parsed.data.expectedVersion,
          },
          data: jiraAggregateDatasetUpdateData(parsed.data.definition),
        });
        if (result.count !== 1) {
          const current = await transaction.jiraAggregateDefinition.findUnique({ where: { id: before.id } });
          throw new AggregateConflictError('VERSION', current && jiraAggregatePublicDefinition(current));
        }
        const updated = await transaction.jiraAggregateDefinition.findUniqueOrThrow({ where: { id: before.id } });
        await transaction.jiraAggregateDefinitionRevision.create({
          data: jiraAggregateDatasetRevisionCreateData(
            req.params.projectId,
            updated.id,
            updated.version,
            parsed.data.definition,
          ),
        });
        return { before, updated };
      });
      await recordAuditEvent({
        req,
        actor: user,
        action: 'jira.aggregate.update',
        objectType: 'JiraAggregateDefinition',
        objectId: outcome.updated.id,
        projectId: req.params.projectId,
        beforeValue: outcome.before,
        afterValue: outcome.updated,
        changes: buildAuditFieldChanges(outcome.before, outcome.updated, aggregateAuditFields),
      });
      res.json(jiraAggregatePublicDefinition(outcome.updated));
    } catch (error) {
      if (error instanceof AggregateNotFoundError) {
        res.status(404).json({ error: 'Агрегат не найден' });
        return;
      }
      if (error instanceof AggregateConflictError) {
        res.status(409).json({ error: conflictMessage(error), current: error.details ?? null });
        return;
      }
      if (isPrismaUniqueConflict(error)) {
        res.status(409).json({ error: 'Агрегат с таким именем уже существует' });
        return;
      }
      throw error;
    }
  });

  router.delete('/projects/:projectId/jira/aggregates/:aggregateId', async (req, res) => {
    const user = requireSystemAdmin(req, res, 'Настраивать агрегаты может только системный администратор');
    if (!user) {
      return;
    }
    if (!await ensureWritableProject(req.params.projectId, res, prisma)) return;
    const parsed = expectedVersionQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Укажите версию удаляемого агрегата' });
      return;
    }
    try {
      const deleted = await prisma.$transaction(async (transaction) => {
        await lockJiraAggregateProject(transaction, req.params.projectId);
        const locked = await transaction.$queryRaw<Array<{ id: string; version: number }>>(Prisma.sql`
          SELECT "id", "version"
          FROM "JiraAggregateDefinition"
          WHERE "id" = ${req.params.aggregateId} AND "projectId" = ${req.params.projectId}
          FOR UPDATE
        `);
        if (!locked[0]) throw new AggregateNotFoundError();
        const before = await transaction.jiraAggregateDefinition.findUniqueOrThrow({
          where: { id: locked[0].id },
        });
        if (locked[0].version !== parsed.data.expectedVersion) {
          throw new AggregateConflictError('VERSION', jiraAggregatePublicDefinition(before), before);
        }
        const settingsRows = await transaction.$queryRaw<Array<{ dashboardConfig: Prisma.JsonValue | null }>>(Prisma.sql`
          SELECT "dashboardConfig"
          FROM "JiraAnalyticsSettings"
          WHERE "projectId" = ${req.params.projectId}
          FOR UPDATE
        `);
        const config = settingsRows[0]?.dashboardConfig;
        const usage = inspectJiraDashboardDefinitionUse(config, before.id);
        if (usage.widgetIds.length > 0) {
          throw new AggregateConflictError('IN_USE', { widgetIds: usage.widgetIds }, before);
        }
        if (!usage.verifiable) {
          throw new AggregateConflictError(
            'CONFIG_CHANGED',
            'Сохранённый дашборд нельзя безопасно проверить на использование агрегата',
            before,
          );
        }
        await transaction.jiraAggregateDefinition.delete({ where: { id: before.id } });
        return before;
      });
      await recordAuditEvent({
        req,
        actor: user,
        action: 'jira.aggregate.delete',
        objectType: 'JiraAggregateDefinition',
        objectId: deleted.id,
        projectId: req.params.projectId,
        beforeValue: deleted,
      });
      res.status(204).send();
    } catch (error) {
      if (error instanceof AggregateNotFoundError) {
        res.status(404).json({ error: 'Агрегат не найден' });
        return;
      }
      if (error instanceof AggregateConflictError) {
        if (error.auditDefinition) {
          await recordAuditEvent({
            req,
            actor: user,
            action: 'jira.aggregate.delete.rejected',
            objectType: 'JiraAggregateDefinition',
            objectId: error.auditDefinition.id,
            projectId: req.params.projectId,
            beforeValue: error.auditDefinition,
            metadata: { reason: error.code, details: error.details ?? null },
          });
        }
        res.status(409).json({ error: conflictMessage(error), details: error.details ?? null });
        return;
      }
      throw error;
    }
  });

  router.post('/projects/:projectId/jira/aggregates/preview', async (req, res) => {
    const user = requireSystemAdmin(req, res, 'Предпросмотр агрегата доступен только системному администратору');
    if (!user) {
      return;
    }
    const access = await ensureProjectReadAccess(req.params.projectId, req, canReadProject);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }
    if (!ensureRuntimeIcu(res)) return;
    const parsed = previewBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Некорректные параметры предпросмотра', details: parsed.error.flatten() });
      return;
    }
    try {
      const definition = datasetPreviewDefinition(parsed.data.definition);
      const asOf = asOfDate(parsed.data, definition);
      const result = await evaluateJiraAggregateFromDatabase(
        prisma,
        req.params.projectId,
        definition,
        evaluationOptions(parsed.data, definition),
        asOf,
      );
      logAsOfEvaluation(req.params.projectId, result);
      res.json(result);
    } catch (error) {
      if (respondToAggregateLimit(error, res)) return;
      if (error instanceof AggregateConflictError) {
        res.status(400).json({ error: conflictMessage(error) });
        return;
      }
      throw error;
    }
  });

  router.get('/projects/:projectId/jira/aggregates/:aggregateId/result', async (req, res) => {
    const access = await ensureProjectReadAccess(req.params.projectId, req, canReadProject);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }
    if (!ensureRuntimeIcu(res)) return;
    const parsed = asOfEvaluationSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Некорректные параметры расчёта', details: parsed.error.flatten() });
      return;
    }
    const row = await prisma.jiraAggregateDefinition.findFirst({
      where: { id: req.params.aggregateId, projectId: req.params.projectId },
    });
    if (!row) {
      res.status(404).json({ error: 'Агрегат не найден' });
      return;
    }
    try {
      const definition = row.definitionSchemaVersion >= 2
        ? (() => {
            const dataset = safeJiraAggregateDatasetFromRow(row);
            return dataset ? datasetPreviewDefinition(dataset) : null;
          })()
        : safeJiraAggregateDraftFromRow(row);
      if (!definition) {
        res.status(409).json({ error: 'Сохранённый контракт агрегата повреждён' });
        return;
      }
      const asOf = asOfDate(parsed.data, definition);
      const result = await evaluateJiraAggregateFromDatabase(
        prisma,
        req.params.projectId,
        definition,
        evaluationOptions(parsed.data, definition),
        asOf,
      );
      logAsOfEvaluation(req.params.projectId, result);
      res.json({
        definition: jiraAggregatePublicDefinition(row),
        result,
      });
    } catch (error) {
      if (respondToAggregateLimit(error, res)) return;
      if (error instanceof AggregateConflictError) {
        res.status(400).json({ error: conflictMessage(error) });
        return;
      }
      throw error;
    }
  });

  router.get('/projects/:projectId/jira/aggregates/:aggregateId/export.csv', async (req, res) => {
    const access = await ensureProjectReadAccess(req.params.projectId, req, canReadProject);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }
    if (!ensureRuntimeIcu(res)) return;
    const parsed = exportEvaluationSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Некорректные параметры экспорта', details: parsed.error.flatten() });
      return;
    }
    const row = await prisma.jiraAggregateDefinition.findFirst({
      where: { id: req.params.aggregateId, projectId: req.params.projectId },
    });
    if (!row) {
      res.status(404).json({ error: 'Агрегат не найден' });
      return;
    }
    try {
      const definition = row.definitionSchemaVersion >= 2
        ? (() => {
            const dataset = safeJiraAggregateDatasetFromRow(row);
            return dataset ? datasetPreviewDefinition(dataset) : null;
          })()
        : safeJiraAggregateDraftFromRow(row);
      if (!definition) {
        res.status(409).json({ error: 'Сохранённый контракт агрегата повреждён' });
        return;
      }
      const input = { ...parsed.data, page: 1, pageSize: 1 };
      const result = await evaluateJiraAggregateFromDatabase(
        prisma,
        req.params.projectId,
        definition,
        jiraAggregateExportOptions(evaluationOptions(input, definition)),
        asOfDate(input, definition),
        jiraAggregateExportLimits(),
      );
      logAsOfEvaluation(req.params.projectId, result);
      const filePart = row.name.normalize('NFKC').replaceAll(/[^\p{L}\p{N}]+/gu, '-').replaceAll(/^-|-$/gu, '') || 'aggregate';
      const encodedFilename = encodeURIComponent(`jira-aggregate-${filePart}.csv`);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="jira-aggregate.csv"; filename*=UTF-8''${encodedFilename}`);
      res.setHeader('X-PMS-Analytics-Quality', result.quality.status);
      res.setHeader('X-PMS-Evaluated-At', result.evaluatedAt);
      res.send(`\uFEFF${jiraAggregateResultCsv(result)}`);
    } catch (error) {
      if (respondToAggregateLimit(error, res)) return;
      if (error instanceof AggregateConflictError) {
        res.status(400).json({ error: conflictMessage(error) });
        return;
      }
      throw error;
    }
  });

  router.get('/projects/:projectId/jira/aggregate-dashboard-results', async (req, res) => {
    const access = await ensureProjectReadAccess(req.params.projectId, req, canReadProject);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }
    if (!ensureRuntimeIcu(res)) return;
    const parsed = dashboardEvaluationSchema.safeParse(req.query);
    if (!parsed.success || parsed.data.periodDays === undefined) {
      res.status(400).json({ error: 'Передайте явные periodDays и assignee для расчёта дашборда' });
      return;
    }
    try {
      const [settings, definitions] = await Promise.all([
        prisma.jiraAnalyticsSettings.findUnique({
          where: { projectId: req.params.projectId },
          select: { dashboardConfig: true },
        }),
        prisma.jiraAggregateDefinition.findMany({ where: { projectId: req.params.projectId } }),
      ]);
      res.json(await evaluateSavedDashboardFromDatabase(
        prisma,
        req.params.projectId,
        settings?.dashboardConfig ?? null,
        definitions,
        {
          now: parsed.data.evaluatedAt ?? new Date().toISOString(),
          periodDays: parsed.data.periodDays,
          assignee: parsed.data.assignee,
          page: parsed.data.page,
          pageSize: parsed.data.pageSize,
          groupKey: parsed.data.groupKey,
        },
        parsed.data.widgetId,
      ));
    } catch (error) {
      if (respondToAggregateLimit(error, res)) return;
      throw error;
    }
  });

  router.post('/projects/:projectId/jira/aggregates/reconcile-dashboard', async (req, res) => {
    const user = requireSystemAdmin(req, res, 'Сверка дашборда доступна только системному администратору');
    if (!user) return;
    const access = await ensureProjectReadAccess(req.params.projectId, req, canReadProject);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }
    if (!ensureRuntimeIcu(res)) return;
    const parsed = reconciliationBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Некорректные параметры сверки', details: parsed.error.flatten() });
      return;
    }
    try {
      const [settings, definitions, conversion] = await Promise.all([
        prisma.jiraAnalyticsSettings.findUnique({
          where: { projectId: req.params.projectId },
          select: { dashboardConfig: true },
        }),
        prisma.jiraAggregateDefinition.findMany({ where: { projectId: req.params.projectId } }),
        prisma.jiraAnalyticsDashboardConversion.findUnique({
          where: { projectId: req.params.projectId },
          select: { originalConfig: true },
        }),
      ]);
      const currentConfig = settings?.dashboardConfig ?? null;
      const currentHash = jiraDashboardConfigHash(currentConfig);
      if (currentHash !== parsed.data.expectedConfigHash) {
        throw new AggregateConflictError('CONFIG_CHANGED', { currentConfigHash: currentHash });
      }
      const configs = jiraDashboardReconciliationConfigs(
        currentConfig,
        conversion?.originalConfig ?? null,
        definitions,
      );
      const result = await reconcileJiraDashboardFromDatabase(
        prisma,
        req.params.projectId,
        configs.legacy,
        configs.managed,
        definitions,
        {
          now: new Date().toISOString(),
          periodDays: parsed.data.periodDays,
          assignee: parsed.data.assignee,
          page: 1,
          pageSize: 100,
        },
      );
      await recordAuditEvent({
        req,
        actor: user,
        action: 'jira.aggregate.reconcile',
        objectType: 'JiraAnalyticsDashboard',
        objectId: req.params.projectId,
        projectId: req.params.projectId,
        metadata: {
          status: result.status,
          evaluatedAt: result.evaluatedAt,
          legacyConfigHash: result.legacyConfigHash,
          managedConfigHash: result.managedConfigHash,
          comparedWidgets: result.comparedWidgets,
          matchedWidgets: result.matchedWidgets,
          mismatchedWidgets: result.mismatchedWidgets,
          mismatchedWidgetIds: result.widgets
            .filter((widget) => widget.status === 'MISMATCH')
            .map((widget) => widget.widgetId),
        },
      });
      res.json(result);
    } catch (error) {
      if (respondToAggregateLimit(error, res)) return;
      if (error instanceof AggregateConflictError) {
        res.status(409).json({ error: conflictMessage(error), details: error.details ?? null });
        return;
      }
      if (error instanceof Error && (
        error.message === 'DASHBOARD_RECONCILIATION_SOURCE_MISSING' ||
        error.message.startsWith('AGGREGATE_DEFINITION_MISSING:')
      )) {
        res.status(409).json({
          error: error.message === 'DASHBOARD_RECONCILIATION_SOURCE_MISSING'
            ? 'Для сверки нужен корректный дашборд v1 либо исходная конфигурация выполненной конвертации'
            : 'Сначала импортируйте все определения агрегатов для виджетов v1',
        });
        return;
      }
      throw error;
    }
  });

  router.post('/projects/:projectId/jira/aggregates/import-dashboard', async (req, res) => {
    const user = requireSystemAdmin(req, res, 'Импорт агрегатов доступен только системному администратору');
    if (!user) {
      return;
    }
    if (!ensureRuntimeIcu(res) || !await ensureWritableProject(req.params.projectId, res, prisma)) return;
    const parsed = migrationBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Некорректные параметры импорта' });
      return;
    }
    try {
      const outcome = await prisma.$transaction(async (transaction) => {
        await lockJiraAggregateProject(transaction, req.params.projectId);
        const settingsRows = await transaction.$queryRaw<Array<{ dashboardConfig: Prisma.JsonValue | null }>>(Prisma.sql`
          SELECT "dashboardConfig"
          FROM "JiraAnalyticsSettings"
          WHERE "projectId" = ${req.params.projectId}
          FOR UPDATE
        `);
        const dashboardConfig = settingsRows[0]?.dashboardConfig ?? null;
        const currentHash = jiraDashboardConfigHash(dashboardConfig);
        if (currentHash !== parsed.data.expectedConfigHash) {
          throw new AggregateConflictError('CONFIG_CHANGED', { currentConfigHash: currentHash });
        }
        const existing = await transaction.jiraAggregateDefinition.findMany({
          where: { projectId: req.params.projectId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
        const plan = buildJiraAggregateImportPlan(dashboardConfig, existing);
        if (!parsed.data.dryRun) {
          for (const item of plan.items) {
            if (!item.existingId) {
              const created = await transaction.jiraAggregateDefinition.create({
                data: jiraAggregateCreateData(req.params.projectId, item.definition),
              });
              await transaction.jiraAggregateDefinitionRevision.create({
                data: jiraAggregateRevisionCreateData(
                  req.params.projectId,
                  created.id,
                  created.version,
                  item.definition,
                ),
              });
            }
          }
        }
        return {
          currentHash,
          sourceWidgets: plan.config?.widgets.length ?? 0,
          items: plan.items.map((item) => ({
            fingerprint: item.fingerprint,
            name: item.definition.name,
            existingId: item.existingId,
            action: item.existingId ? 'REUSE' : parsed.data.dryRun ? 'WOULD_CREATE' : 'CREATED',
          })),
        };
      });
      await recordAuditEvent({
        req,
        actor: user,
        action: parsed.data.dryRun ? 'jira.aggregate.import.dry_run' : 'jira.aggregate.import',
        objectType: 'JiraAggregateDefinition',
        objectId: req.params.projectId,
        projectId: req.params.projectId,
        metadata: { configHash: outcome.currentHash, sourceWidgets: outcome.sourceWidgets, items: outcome.items },
      });
      res.json(outcome);
    } catch (error) {
      if (error instanceof AggregateConflictError) {
        res.status(409).json({ error: conflictMessage(error), details: error.details ?? null });
        return;
      }
      if (isPrismaUniqueConflict(error)) {
        res.status(409).json({ error: 'Агрегат с таким именем уже существует' });
        return;
      }
      if (error instanceof Error && error.message === 'DASHBOARD_V1_INVALID') {
        res.status(409).json({ error: 'Сохранённый дашборд v1 нельзя импортировать автоматически' });
        return;
      }
      if (error instanceof Error && error.message === 'DASHBOARD_NOT_V1') {
        res.status(409).json({ error: 'Импорт определений доступен только для дашборда v1' });
        return;
      }
      throw error;
    }
  });

  router.post('/projects/:projectId/jira/aggregates/switch-dashboard', async (req, res) => {
    const user = requireSystemAdmin(req, res, 'Переключение дашборда доступно только системному администратору');
    if (!user) return;
    if (!ensureRuntimeIcu(res) || !await ensureWritableProject(req.params.projectId, res, prisma)) return;
    const parsed = switchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Некорректные параметры переключения', details: parsed.error.flatten() });
      return;
    }
    try {
      const [settings, definitions, previousConversion] = await Promise.all([
        prisma.jiraAnalyticsSettings.findUnique({
          where: { projectId: req.params.projectId },
          select: { dashboardConfig: true },
        }),
        prisma.jiraAggregateDefinition.findMany({
          where: { projectId: req.params.projectId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        }),
        prisma.jiraAnalyticsDashboardConversion.findUnique({
          where: { projectId: req.params.projectId },
          select: { id: true, attempt: true, rollbackState: true },
        }),
      ]);
      const rawConfig = settings?.dashboardConfig ?? null;
      const currentHash = jiraDashboardConfigHash(rawConfig);
      if (currentHash !== parsed.data.expectedConfigHash) {
        throw new AggregateConflictError('CONFIG_CHANGED', { currentConfigHash: currentHash });
      }
      if (previousConversion?.rollbackState === 'CLOSED') {
        throw new AggregateConflictError('CONFIG_CHANGED', 'Окно legacy-отката закрыто для этого проекта');
      }
      if (previousConversion?.rollbackState === 'AVAILABLE') {
        throw new AggregateConflictError('CONFIG_CHANGED', 'Дашборд уже переключён на управляемые агрегаты');
      }
      const preflight = buildJiraDashboardSwitchPlan(req.params.projectId, rawConfig, definitions);
      const reconciliation = await reconcileJiraDashboardFromDatabase(
        prisma,
        req.params.projectId,
        preflight.legacy,
        preflight.managed,
        preflight.definitions,
        {
          now: new Date().toISOString(),
          periodDays: parsed.data.periodDays,
          assignee: parsed.data.assignee,
          page: 1,
          pageSize: 100,
        },
      );
      const base = {
        dryRun: parsed.data.dryRun,
        sourceStored: preflight.sourceStored,
        sourceConfigHash: preflight.sourceConfigHash,
        effectiveConfigHash: preflight.effectiveConfigHash,
        planHash: preflight.planHash,
        sourceWidgets: preflight.legacy.widgets.length,
        reconciliation,
        items: preflight.items.map((item) => ({
          fingerprint: item.fingerprint,
          name: item.definition.name,
          existingId: item.existingId,
          action: item.existingId ? 'REUSE' : parsed.data.dryRun ? 'WOULD_CREATE' : 'CREATED',
        })),
      };
      if (parsed.data.dryRun) {
        res.json({
          ...base,
          conversionId: previousConversion?.id ?? null,
          attempt: (previousConversion?.attempt ?? 0) + 1,
          rollbackState: null,
          rollbackAvailableUntil: 'AVAILABLE_UNTIL_LEGACY_RETIREMENT',
        });
        return;
      }
      if (reconciliation.status !== 'MATCH') {
        throw new AggregateConflictError('CONFIG_CHANGED', {
          reason: 'RECONCILIATION_MISMATCH',
          reconciliation,
        });
      }
      const switched = await runSerializable(prisma, async (transaction) => {
        await lockJiraAggregateProject(transaction, req.params.projectId);
        const projectRows = await transaction.$queryRaw<Array<{ status: string }>>(Prisma.sql`
          SELECT "status"
          FROM "Project"
          WHERE "id" = ${req.params.projectId}
          FOR UPDATE
        `);
        if (!projectRows[0] || projectRows[0].status === 'CLOSED') {
          throw new AggregateConflictError('CONFIG_CHANGED', 'Проект недоступен для переключения');
        }
        const settingsRows = await transaction.$queryRaw<Array<{ id: string; dashboardConfig: Prisma.JsonValue | null }>>(Prisma.sql`
          SELECT "id", "dashboardConfig"
          FROM "JiraAnalyticsSettings"
          WHERE "projectId" = ${req.params.projectId}
          FOR UPDATE
        `);
        const lockedRawConfig = settingsRows[0]?.dashboardConfig ?? null;
        const lockedHash = jiraDashboardConfigHash(lockedRawConfig);
        if (lockedHash !== parsed.data.expectedConfigHash) {
          throw new AggregateConflictError('CONFIG_CHANGED', { currentConfigHash: lockedHash });
        }
        const conversionRows = await transaction.$queryRaw<Array<{
          id: string;
          attempt: number;
          rollbackState: 'AVAILABLE' | 'USED' | 'CLOSED';
        }>>(Prisma.sql`
          SELECT "id", "attempt", "rollbackState"
          FROM "JiraAnalyticsDashboardConversion"
          WHERE "projectId" = ${req.params.projectId}
          FOR UPDATE
        `);
        const previous = conversionRows[0] ?? null;
        if (previous?.rollbackState === 'CLOSED') {
          throw new AggregateConflictError('CONFIG_CHANGED', 'Окно legacy-отката закрыто для этого проекта');
        }
        if (previous?.rollbackState === 'AVAILABLE') {
          throw new AggregateConflictError('CONFIG_CHANGED', 'Дашборд уже переключён на управляемые агрегаты');
        }
        const lockedDefinitions = await transaction.jiraAggregateDefinition.findMany({
          where: { projectId: req.params.projectId },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        });
        const lockedPlan = buildJiraDashboardSwitchPlan(
          req.params.projectId,
          lockedRawConfig,
          lockedDefinitions,
        );
        if (lockedPlan.planHash !== preflight.planHash) {
          throw new AggregateConflictError('CONFIG_CHANGED', { currentPlanHash: lockedPlan.planHash });
        }
        const idsByFingerprint = new Map(
          lockedPlan.items.flatMap((item) => item.existingId
            ? [[item.fingerprint, item.existingId] as const]
            : []),
        );
        const versionsById = new Map(
          lockedDefinitions.map((definition) => [definition.id, definition.version]),
        );
        const createdDefinitionIds: string[] = [];
        for (const item of lockedPlan.items) {
          if (item.existingId) continue;
          const created = await transaction.jiraAggregateDefinition.create({
            data: jiraAggregateCreateData(req.params.projectId, item.definition),
          });
          await transaction.jiraAggregateDefinitionRevision.create({
            data: jiraAggregateRevisionCreateData(
              req.params.projectId,
              created.id,
              created.version,
              item.definition,
            ),
          });
          idsByFingerprint.set(item.fingerprint, created.id);
          versionsById.set(created.id, created.version);
          createdDefinitionIds.push(created.id);
        }
        const managed = convertJiraDashboardToV2(lockedPlan.legacy, idsByFingerprint, versionsById);
        const convertedConfigHash = jiraDashboardConfigHash(managed);
        await transaction.jiraAnalyticsSettings.upsert({
          where: { projectId: req.params.projectId },
          create: {
            projectId: req.params.projectId,
            jiraScopeType: 'LABEL',
            jiraScopeValue: '',
            dashboardConfig: managed as Prisma.InputJsonObject,
          },
          update: { dashboardConfig: managed as Prisma.InputJsonObject },
        });
        const conversionData = {
          originalConfig: lockedPlan.legacy as Prisma.InputJsonObject,
          originalConfigStored: lockedPlan.sourceStored,
          sourceConfigHash: lockedPlan.sourceConfigHash,
          originalConfigHash: lockedPlan.effectiveConfigHash,
          convertedConfigHash,
          createdDefinitionIds,
          rollbackState: 'AVAILABLE' as const,
          convertedAt: new Date(),
          rolledBackAt: null,
          rollbackFinalizedAt: null,
        };
        const conversion = previous
          ? await transaction.jiraAnalyticsDashboardConversion.update({
              where: { id: previous.id },
              data: { ...conversionData, attempt: previous.attempt + 1 },
            })
          : await transaction.jiraAnalyticsDashboardConversion.create({
              data: { projectId: req.params.projectId, ...conversionData, attempt: 1 },
            });
        await transaction.auditEvent.create({
          data: {
            actorId: user.id,
            actorEmail: user.email ?? null,
            actorName: user.name ?? null,
            action: 'jira.aggregate.dashboard.switch',
            objectType: 'JiraAnalyticsDashboardConversion',
            objectId: conversion.id,
            projectId: req.params.projectId,
            ipAddress: req.ip ?? null,
            userAgent: req.get('user-agent') ?? null,
            beforeValue: { dashboardConfig: lockedRawConfig } as Prisma.InputJsonObject,
            afterValue: { dashboardConfig: managed } as Prisma.InputJsonObject,
            metadata: {
              conversionId: conversion.id,
              attempt: conversion.attempt,
              planHash: preflight.planHash,
              reconciliationStatus: reconciliation.status,
              createdDefinitionIds,
            },
          },
        });
        return {
          conversionId: conversion.id,
          attempt: conversion.attempt,
          convertedConfigHash,
          createdDefinitionIds,
          items: lockedPlan.items.map((item) => ({
            fingerprint: item.fingerprint,
            name: item.definition.name,
            existingId: item.existingId,
            action: item.existingId ? 'REUSE' as const : 'CREATED' as const,
          })),
        };
      });
      res.json({
        ...base,
        conversionId: switched.conversionId,
        attempt: switched.attempt,
        afterHash: switched.convertedConfigHash,
        items: switched.items,
        rollbackState: 'AVAILABLE',
        rollbackAvailableUntil: 'AVAILABLE_UNTIL_LEGACY_RETIREMENT',
      });
    } catch (error) {
      if (respondToAggregateLimit(error, res)) return;
      if (error instanceof AggregateConflictError) {
        res.status(409).json({ error: conflictMessage(error), details: error.details ?? null });
        return;
      }
      if (error instanceof Error && (
        error.message === 'DASHBOARD_NOT_V1' || error.message === 'DASHBOARD_V1_INVALID'
      )) {
        res.status(409).json({ error: 'Переключить можно только корректный дашборд v1' });
        return;
      }
      if (isPrismaUniqueConflict(error)) {
        res.status(409).json({ error: 'Определения агрегатов изменились, повторите проверку' });
        return;
      }
      throw error;
    }
  });

  router.post('/projects/:projectId/jira/aggregates/convert-dashboard', async (req, res) => {
    const user = requireSystemAdmin(req, res, 'Конвертация дашборда доступна только системному администратору');
    if (!user) {
      return;
    }
    if (!ensureRuntimeIcu(res) || !await ensureWritableProject(req.params.projectId, res, prisma)) return;
    const parsed = migrationBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Некорректные параметры конвертации' });
      return;
    }
    if (!parsed.data.dryRun) {
      res.status(410).json({ error: 'Используйте управляемое переключение с обязательной сверкой v1/v2' });
      return;
    }
    try {
      const outcome = await prisma.$transaction(async (transaction) => {
        await lockJiraAggregateProject(transaction, req.params.projectId);
        const settingsRows = await transaction.$queryRaw<Array<{ id: string; dashboardConfig: Prisma.JsonValue | null }>>(Prisma.sql`
          SELECT "id", "dashboardConfig"
          FROM "JiraAnalyticsSettings"
          WHERE "projectId" = ${req.params.projectId}
          FOR UPDATE
        `);
        const settings = settingsRows[0];
        if (!settings?.dashboardConfig) throw new AggregateConflictError('CONFIG_CHANGED', 'Сохранённый дашборд отсутствует');
        const currentHash = jiraDashboardConfigHash(settings.dashboardConfig);
        if (currentHash !== parsed.data.expectedConfigHash) {
          throw new AggregateConflictError('CONFIG_CHANGED', { currentConfigHash: currentHash });
        }
        const config = jiraAnalyticsDashboardConfigSchema.safeParse(settings.dashboardConfig);
        if (!config.success || config.data.version !== 1) {
          throw new AggregateConflictError('CONFIG_CHANGED', 'Конвертировать можно только корректный дашборд v1');
        }
        const definitions = await transaction.jiraAggregateDefinition.findMany({
          where: { projectId: req.params.projectId },
        });
        const idsByFingerprint = new Map(definitions.map((definition) => [definition.fingerprint, definition.id]));
        const converted = convertJiraDashboardToV2(
          config.data,
          idsByFingerprint,
          new Map(definitions.map((definition) => [definition.id, definition.version])),
        );
        const convertedHash = jiraDashboardConfigHash(converted);
        const referencedIds = [...new Set(converted.widgets.map((widget) => widget.aggregateId))];
        if (referencedIds.length > 0) {
          const locked = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id"
            FROM "JiraAggregateDefinition"
            WHERE "projectId" = ${req.params.projectId}
              AND "id" IN (${Prisma.join(referencedIds)})
            FOR KEY SHARE
          `);
          if (locked.length !== referencedIds.length) throw new AggregateConflictError('MISSING_DEFINITION');
        }
        if (!parsed.data.dryRun) {
          const existingConversion = await transaction.jiraAnalyticsDashboardConversion.findUnique({
            where: { projectId: req.params.projectId },
          });
          if (existingConversion && !existingConversion.rolledBackAt) {
            throw new AggregateConflictError('CONFIG_CHANGED', 'Для проекта уже есть активная конвертация');
          }
          await transaction.jiraAnalyticsDashboardConversion.upsert({
            where: { projectId: req.params.projectId },
            create: {
              projectId: req.params.projectId,
              originalConfig: settings.dashboardConfig,
              sourceConfigHash: currentHash,
              originalConfigHash: currentHash,
              convertedConfigHash: convertedHash,
            },
            update: {
              originalConfig: settings.dashboardConfig,
              originalConfigHash: currentHash,
              convertedConfigHash: convertedHash,
              convertedAt: new Date(),
              rolledBackAt: null,
            },
          });
          await transaction.jiraAnalyticsSettings.update({
            where: { id: settings.id },
            data: { dashboardConfig: converted as Prisma.InputJsonObject },
          });
        }
        return { beforeHash: currentHash, afterHash: convertedHash, config: converted };
      });
      res.json(outcome);
    } catch (error) {
      if (error instanceof AggregateConflictError) {
        res.status(409).json({ error: conflictMessage(error), details: error.details ?? null });
        return;
      }
      if (error instanceof Error && error.message.startsWith('AGGREGATE_DEFINITION_MISSING:')) {
        res.status(409).json({ error: 'Сначала импортируйте все определения текущего дашборда' });
        return;
      }
      throw error;
    }
  });

  router.post('/projects/:projectId/jira/aggregates/rollback-dashboard', async (req, res) => {
    const user = requireSystemAdmin(req, res, 'Откат дашборда доступен только системному администратору');
    if (!user) return;
    if (!await ensureWritableProject(req.params.projectId, res, prisma)) return;
    const parsed = rollbackBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Некорректные параметры отката', details: parsed.error.flatten() });
      return;
    }
    try {
      const outcome = await runSerializable(prisma, async (transaction) => {
        await lockJiraAggregateProject(transaction, req.params.projectId);
        const projectRows = await transaction.$queryRaw<Array<{ status: string }>>(Prisma.sql`
          SELECT "status"
          FROM "Project"
          WHERE "id" = ${req.params.projectId}
          FOR UPDATE
        `);
        if (!projectRows[0] || projectRows[0].status === 'CLOSED') {
          throw new AggregateConflictError('CONFIG_CHANGED', 'Проект недоступен для отката');
        }
        const settingsRows = await transaction.$queryRaw<Array<{ id: string; dashboardConfig: Prisma.JsonValue | null }>>(Prisma.sql`
          SELECT "id", "dashboardConfig"
          FROM "JiraAnalyticsSettings"
          WHERE "projectId" = ${req.params.projectId}
          FOR UPDATE
        `);
        const settings = settingsRows[0];
        const conversion = await transaction.jiraAnalyticsDashboardConversion.findUnique({
          where: { projectId: req.params.projectId },
        });
        if (!settings || !conversion || conversion.rollbackState !== 'AVAILABLE') {
          throw new AggregateConflictError('CONFIG_CHANGED', 'Активная конвертация для отката отсутствует');
        }
        if (conversion.attempt !== parsed.data.attempt) {
          throw new AggregateConflictError('CONFIG_CHANGED', {
            reason: 'CONVERSION_ATTEMPT_CHANGED',
            currentAttempt: conversion.attempt,
          });
        }
        const currentHash = jiraDashboardConfigHash(settings.dashboardConfig);
        if (currentHash !== parsed.data.expectedConfigHash || currentHash !== conversion.convertedConfigHash) {
          throw new AggregateConflictError('CONFIG_CHANGED', { currentConfigHash: currentHash });
        }
        if (!parsed.data.dryRun) {
          const restoredConfig = conversion.originalConfigStored ? conversion.originalConfig : null;
          await transaction.auditEvent.create({
            data: {
              actorId: user.id,
              actorEmail: user.email ?? null,
              actorName: user.name ?? null,
              action: 'jira.aggregate.dashboard.rollback',
              objectType: 'JiraAnalyticsDashboardConversion',
              objectId: conversion.id,
              projectId: req.params.projectId,
              ipAddress: req.ip ?? null,
              userAgent: req.get('user-agent') ?? null,
              beforeValue: {
                dashboardConfig: settings.dashboardConfig,
                configHash: currentHash,
              } as Prisma.InputJsonObject,
              afterValue: {
                dashboardConfig: restoredConfig,
                configHash: conversion.sourceConfigHash,
              } as Prisma.InputJsonObject,
              metadata: {
                conversionId: conversion.id,
                attempt: conversion.attempt,
                rollbackState: 'USED',
              },
            },
          });
          await transaction.jiraAnalyticsSettings.update({
            where: { id: settings.id },
            data: {
              dashboardConfig: conversion.originalConfigStored
                ? conversion.originalConfig as Prisma.InputJsonObject
                : Prisma.DbNull,
            },
          });
          await transaction.jiraAnalyticsDashboardConversion.update({
            where: { id: conversion.id },
            data: {
              rollbackState: 'USED',
              rolledBackAt: new Date(),
              rollbackFinalizedAt: null,
            },
          });
        }
        return {
          conversionId: conversion.id,
          attempt: conversion.attempt,
          beforeHash: currentHash,
          afterHash: conversion.sourceConfigHash,
          effectiveConfigHash: conversion.originalConfigHash,
          sourceStored: conversion.originalConfigStored,
          config: conversion.originalConfigStored ? conversion.originalConfig : null,
          discardedConfig: settings.dashboardConfig,
          rollbackState: parsed.data.dryRun ? 'AVAILABLE' : 'USED',
          rollbackAvailableUntil: parsed.data.dryRun ? 'AVAILABLE_UNTIL_LEGACY_RETIREMENT' : null,
        };
      });
      res.json(outcome);
    } catch (error) {
      if (error instanceof AggregateConflictError) {
        res.status(409).json({ error: conflictMessage(error), details: error.details ?? null });
        return;
      }
      throw error;
    }
  });
}
