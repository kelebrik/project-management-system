import {
  jiraAnalyticsAggregateDraftSchema,
  jiraAnalyticsDashboardConfigSchema,
  jiraAnalyticsPeriodDays,
  jiraAnalyticsSourceUsesPeriod,
  type JiraAnalyticsAggregateDraft,
  type JiraAnalyticsEvaluationOptions,
} from '@pms/shared';
import { Prisma, type JiraAggregateDefinition, type PrismaClient } from '@prisma/client';
import type { Response, Router } from 'express';
import { z } from 'zod';
import { prisma as defaultPrisma } from '../db.js';
import { currentUser } from '../server/auth.js';
import { userCanReadProject } from '../server/business-units.js';
import { buildAuditFieldChanges, recordAuditEvent } from '../services/audit.js';
import {
  buildJiraAggregateImportPlan,
  convertJiraDashboardToV2,
  evaluateJiraAggregate,
  jiraAggregateCreateData,
  jiraAggregateDraftFromRow,
  jiraAggregateFingerprint,
  jiraAggregatePublicDefinition,
  jiraAggregateUpdateData,
  jiraDashboardConfigHash,
  inspectJiraDashboardDefinitionUse,
  JiraAggregatePopulationLimitError,
  loadJiraAggregateIssues,
  lockJiraAggregateProject,
  resolveSavedDashboard,
} from '../services/jira-aggregates.js';

const definitionBodySchema = z.object({
  definition: jiraAnalyticsAggregateDraftSchema,
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

const dashboardEvaluationSchema = evaluationSchema.extend({
  widgetId: z.string().min(1).max(200).optional(),
});

const previewBodySchema = evaluationSchema.extend({
  definition: jiraAnalyticsAggregateDraftSchema,
});

const migrationBodySchema = z.object({
  dryRun: z.boolean(),
  expectedConfigHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

const aggregateAuditFields = [
  'name',
  'description',
  'source',
  'metric',
  'groupBy',
  'scope',
  'filterLogic',
  'filters',
  'periodMode',
  'periodDays',
  'timeZone',
  'sortOrder',
  'version',
];

class AggregateConflictError extends Error {
  constructor(
    public readonly code: 'VERSION' | 'IN_USE' | 'CONFIG_CHANGED' | 'MISSING_DEFINITION',
    public readonly details?: unknown,
    public readonly auditDefinition?: JiraAggregateDefinition,
  ) {
    super(code);
  }
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

function respondToPopulationLimit(error: unknown, res: Response) {
  if (!(error instanceof JiraAggregatePopulationLimitError)) return false;
  res.status(413).json({
    error: `Для одного расчёта доступно не более ${error.limit.toLocaleString('ru-RU')} активных тикетов`,
    limit: error.limit,
  });
  return true;
}

function evaluationOptions(
  input: z.infer<typeof evaluationSchema>,
  definition: JiraAnalyticsAggregateDraft,
): JiraAnalyticsEvaluationOptions {
  if (definition.periodMode === 'DASHBOARD' && input.periodDays === undefined) {
    throw new AggregateConflictError('CONFIG_CHANGED', 'Для агрегата нужен явный период дашборда');
  }
  if (definition.periodMode === 'FIXED' && input.periodDays !== undefined) {
    throw new AggregateConflictError('CONFIG_CHANGED', 'Фиксированный период нельзя переопределять');
  }
  return {
    now: input.evaluatedAt ?? new Date().toISOString(),
    periodDays: input.periodDays,
    assignee: input.assignee,
    page: input.page,
    pageSize: input.pageSize,
    groupKey: input.groupKey,
  };
}

function conflictMessage(error: AggregateConflictError) {
  if (error.code === 'VERSION') return 'Определение уже изменено другим пользователем';
  if (error.code === 'IN_USE') return 'Агрегат используется виджетами и не может быть удалён';
  if (error.code === 'MISSING_DEFINITION') return 'Не все определения агрегатов доступны';
  return typeof error.details === 'string' ? error.details : 'Конфигурация дашборда изменилась';
}

export function registerJiraAggregateRoutes(
  router: Router,
  prisma: PrismaClient = defaultPrisma,
  canReadProject: typeof userCanReadProject = userCanReadProject,
) {
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
        select: { convertedConfigHash: true, convertedAt: true, rolledBackAt: true },
      }),
    ]);
    const dashboardConfig = settings?.dashboardConfig ?? null;
    res.json({
      definitions: definitions.map(jiraAggregatePublicDefinition),
      dashboard: {
        stored: dashboardConfig !== null,
        version: dashboardConfig && typeof dashboardConfig === 'object' && !Array.isArray(dashboardConfig)
          ? Number((dashboardConfig as Prisma.JsonObject).version) || null
          : null,
        configHash: jiraDashboardConfigHash(dashboardConfig),
        convertedConfigHash: conversion?.convertedConfigHash ?? null,
        convertedAt: conversion?.convertedAt.toISOString() ?? null,
        rolledBackAt: conversion?.rolledBackAt?.toISOString() ?? null,
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
        return transaction.jiraAggregateDefinition.create({
          data: jiraAggregateCreateData(req.params.projectId, parsed.data.definition),
        });
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
        res.status(409).json({ error: 'Агрегат с таким именем или правилами уже существует' });
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
        const result = await transaction.jiraAggregateDefinition.updateMany({
          where: {
            id: before.id,
            projectId: req.params.projectId,
            version: parsed.data.expectedVersion,
          },
          data: jiraAggregateUpdateData(parsed.data.definition),
        });
        if (result.count !== 1) {
          const current = await transaction.jiraAggregateDefinition.findUnique({ where: { id: before.id } });
          throw new AggregateConflictError('VERSION', current && jiraAggregatePublicDefinition(current));
        }
        const updated = await transaction.jiraAggregateDefinition.findUniqueOrThrow({ where: { id: before.id } });
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
        res.status(409).json({ error: 'Агрегат с таким именем или правилами уже существует' });
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
      const issues = await loadJiraAggregateIssues(prisma, req.params.projectId);
      res.json(evaluateJiraAggregate(
        parsed.data.definition,
        issues,
        evaluationOptions(parsed.data, parsed.data.definition),
      ));
    } catch (error) {
      if (respondToPopulationLimit(error, res)) return;
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
    const parsed = evaluationSchema.safeParse(req.query);
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
      const definition = jiraAggregateDraftFromRow(row);
      const issues = await loadJiraAggregateIssues(prisma, req.params.projectId);
      res.json({
        definition: jiraAggregatePublicDefinition(row),
        result: evaluateJiraAggregate(definition, issues, evaluationOptions(parsed.data, definition)),
      });
    } catch (error) {
      if (respondToPopulationLimit(error, res)) return;
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
      const [settings, definitions, issues] = await Promise.all([
        prisma.jiraAnalyticsSettings.findUnique({
          where: { projectId: req.params.projectId },
          select: { dashboardConfig: true },
        }),
        prisma.jiraAggregateDefinition.findMany({ where: { projectId: req.params.projectId } }),
        loadJiraAggregateIssues(prisma, req.params.projectId),
      ]);
      res.json(resolveSavedDashboard(
        settings?.dashboardConfig ?? null,
        definitions,
        issues,
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
      if (respondToPopulationLimit(error, res)) return;
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
              await transaction.jiraAggregateDefinition.create({
                data: jiraAggregateCreateData(req.params.projectId, item.definition),
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
        res.status(409).json({ error: 'Агрегат с таким именем или правилами уже существует' });
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
        const converted = convertJiraDashboardToV2(config.data, idsByFingerprint);
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
      await recordAuditEvent({
        req,
        actor: user,
        action: parsed.data.dryRun ? 'jira.aggregate.convert.dry_run' : 'jira.aggregate.convert',
        objectType: 'JiraAnalyticsSettings',
        objectId: req.params.projectId,
        projectId: req.params.projectId,
        metadata: { beforeHash: outcome.beforeHash, afterHash: outcome.afterHash },
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
    if (!user) {
      return;
    }
    if (!await ensureWritableProject(req.params.projectId, res, prisma)) return;
    const parsed = migrationBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Некорректные параметры отката' });
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
        const conversion = await transaction.jiraAnalyticsDashboardConversion.findUnique({
          where: { projectId: req.params.projectId },
        });
        if (!settings || !conversion || conversion.rolledBackAt) {
          throw new AggregateConflictError('CONFIG_CHANGED', 'Активная конвертация для отката отсутствует');
        }
        const currentHash = jiraDashboardConfigHash(settings.dashboardConfig);
        if (currentHash !== parsed.data.expectedConfigHash || currentHash !== conversion.convertedConfigHash) {
          throw new AggregateConflictError('CONFIG_CHANGED', { currentConfigHash: currentHash });
        }
        if (!parsed.data.dryRun) {
          await transaction.jiraAnalyticsSettings.update({
            where: { id: settings.id },
            data: { dashboardConfig: conversion.originalConfig as Prisma.InputJsonObject },
          });
          await transaction.jiraAnalyticsDashboardConversion.update({
            where: { id: conversion.id },
            data: { rolledBackAt: new Date() },
          });
        }
        return {
          beforeHash: currentHash,
          afterHash: conversion.originalConfigHash,
          config: conversion.originalConfig,
        };
      });
      await recordAuditEvent({
        req,
        actor: user,
        action: parsed.data.dryRun ? 'jira.aggregate.rollback.dry_run' : 'jira.aggregate.rollback',
        objectType: 'JiraAnalyticsSettings',
        objectId: req.params.projectId,
        projectId: req.params.projectId,
        metadata: { beforeHash: outcome.beforeHash, afterHash: outcome.afterHash },
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
