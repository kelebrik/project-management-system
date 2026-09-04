import {
  createIssueSchema,
  issueStatusUpdateSchema,
  jiraAnalyticsScopeValueMaxLength,
  normalizeJiraAnalyticsScopeValue,
  updateIssueSchema,
} from '@pms/shared';
import { JiraSyncRunKind, Prisma } from '@prisma/client';
import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { jiraDisplayUrl, jiraUrlMatchesConfiguredBase } from '../jira-url-policy.js';
import { normalizedJiraIssueKey, resolveJiraConfig } from '../jira.js';
import { currentApiToken, currentUser } from '../server/auth.js';
import { logEvent } from '../server/logger.js';
import { canProceedWithWrite } from '../server/permissions.js';
import { ensureProjectWriteAccess } from '../server/project-access.js';
import { buildAuditFieldChanges, recordAuditEvent } from '../services/audit.js';
import {
  rebuildJiraCurrentProjections,
} from '../services/jira-analytics-sync.js';
import { sampleJiraCapacity } from '../services/jira-capacity.js';
import {
  jiraHistoryDatabaseBytes,
  jiraBackfillCompleteness,
  jiraHistoryStorageBudgetBytes,
  jiraHistoryStatus,
  JIRA_HISTORY_CRITICAL_PERCENT,
} from '../services/jira-history.js';
import { notifyJiraSyncRunner } from '../services/jira-sync-runtime.js';
import {
  acquireJiraProjectionRebuildLease,
  enqueueJiraSyncRun,
  findActiveJiraSyncRun,
  findJiraSyncRun,
  jiraHistoryWriteEnabled,
  JiraSyncFencedError,
  JIRA_SYNC_POLL_AFTER_MS,
  publicJiraSyncRun,
  releaseJiraProjectionRebuildLease,
  renewJiraProjectionRebuildLease,
} from '../services/jira-sync-runs.js';
import {
  ensureDefaultJiraWorkSections,
} from '../services/jira-work-sections.js';
import {
  type IssueWorkPackageMutation,
  upsertIssueWorkPackage,
} from '../services/open-issue-work-package.js';
import {
  getProjectWbsSnapshot,
  recalculateProjectWbsHierarchyStatuses,
} from '../services/wbs.js';
import { recordWbsCommand } from '../services/wbs-audit.js';
import { recalculateProjectWbsSchedule } from '../services/wbs-schedule.js';
import {
  clearJiraProjectData,
  JiraProjectDataBusyError,
  JiraProjectDataNotFoundError,
  JiraProjectDataReadOnlyError,
} from '../services/jira-project-data.js';
import { emitWebhookEvent } from '../services/webhooks.js';
import { registerJiraSemanticAggregateRoutes } from './jira-semantic-aggregates.routes.js';
import { runWithWbsWriteQueue } from './wbs/write-queue.js';
import {
  JIRA_CAPACITY_DEFAULT_ALLOCATED_GIB,
  JIRA_CAPACITY_DEFAULT_STORAGE_GIB,
} from './issues-route-support.js';

export function registerIssueJiraRoutes(router: Router) {
const jiraIntegrationSchema = z.object({
  baseUrl: z.string().trim().url(),
  boardUrl: z.string().trim().url(),
  projectKey: z.string().trim().min(1),
  issuesJql: z.string().trim().min(1),
  openIssuesJql: z.string().trim().min(1),
});

const jiraWorkSectionsSchema = z.object({
  sections: z
    .array(
      z.object({
        id: z.string().trim().optional(),
        title: z.string().trim().min(1).max(80),
        jql: z.string().trim().max(4000),
        filterUrl: z
          .union([z.literal(''), z.string().trim().url().max(2000)])
          .optional()
          .default(''),
        sortOrder: z.number().int().min(0),
      }),
    )
    .min(3),
});

const jiraSyncBaseSchema = z.object({
  baseUrl: z
    .enum(['https://tasks.dev.sberdevices.ru', 'https://tasks.sberdevices.ru'])
    .optional(),
});

const jiraSyncSchema = z.discriminatedUnion('scopeType', [
  jiraSyncBaseSchema.extend({
    scopeType: z.literal('LABEL'),
    scopeValue: z
      .string()
      .trim()
      .min(1, 'Укажите лейбл Jira')
      .max(jiraAnalyticsScopeValueMaxLength)
      .transform((value, context) => {
        try {
          return normalizeJiraAnalyticsScopeValue('LABEL', value);
        } catch (error) {
          context.addIssue({
            code: 'custom',
            message: error instanceof Error ? error.message : 'Некорректные лейблы Jira',
          });
          return z.NEVER;
        }
      }),
  }),
  jiraSyncBaseSchema.extend({
    scopeType: z.literal('EPIC'),
    scopeValue: z
      .string()
      .trim()
      .toUpperCase()
      .max(100)
      .transform((value, context) => {
        try {
          return normalizeJiraAnalyticsScopeValue('EPIC', value);
        } catch (error) {
          context.addIssue({
            code: 'custom',
            message: error instanceof Error ? error.message : 'Некорректный код эпика Jira',
          });
          return z.NEVER;
        }
      }),
  }),
]);

const jiraCapacitySampleSchema = z.object({
  scopeType: z.enum(['LABEL', 'EPIC']),
  scopeValue: z.string().trim().min(1).max(jiraAnalyticsScopeValueMaxLength),
  sampleSize: z.number().int().min(10).max(100).default(20),
  storageBudgetGiB: z.number().positive().max(10_000).default(JIRA_CAPACITY_DEFAULT_STORAGE_GIB),
  allocatedHistoryGiB: z.number().nonnegative().max(10_000).default(JIRA_CAPACITY_DEFAULT_ALLOCATED_GIB),
}).superRefine((value, context) => {
  try {
    normalizeJiraAnalyticsScopeValue(value.scopeType, value.scopeValue);
  } catch (error) {
    context.addIssue({
      code: 'custom',
      path: ['scopeValue'],
      message: error instanceof Error ? error.message : 'Недопустимое значение',
    });
  }
}).transform((value) => ({
  ...value,
  scopeValue: normalizeJiraAnalyticsScopeValue(value.scopeType, value.scopeValue),
}));

router.put('/projects/:projectId/jira-integration', async (req, res) => {
  const parsed = jiraIntegrationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
  });

  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  const integration = await prisma.jiraIntegration.upsert({
    where: { projectId: project.id },
    create: {
      projectId: project.id,
      ...parsed.data,
      syncStatus: 'CONFIGURED',
    },
    update: {
      ...parsed.data,
      syncStatus: 'CONFIGURED',
    },
  });

  res.json(integration);
});

router.put('/projects/:projectId/jira-work-sections', async (req, res) => {
  const parsed = jiraWorkSectionsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    select: { id: true },
  });

  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }
  await ensureDefaultJiraWorkSections(project.id);
  const sections = await prisma.$transaction(
    parsed.data.sections
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((section) =>
        prisma.jiraWorkSection.upsert({
          where: {
            projectId_sortOrder: {
              projectId: project.id,
              sortOrder: section.sortOrder,
            },
          },
          create: {
            projectId: project.id,
            sortOrder: section.sortOrder,
            title: section.title,
            jql: section.jql,
            filterUrl: section.filterUrl,
          },
          update: {
            title: section.title,
            jql: section.jql,
            filterUrl: section.filterUrl,
          },
          include: {
            issues: {
              orderBy: { syncedAt: 'desc' },
              include: {
                snapshot: true,
              },
            },
          },
        }),
      ),
  );

  res.json(sections);
});

router.post('/projects/:projectId/jira/capacity-sample', async (req, res) => {
  if (currentUser(req)?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Замер ёмкости доступен только администратору системы' });
    return;
  }

  const parsed = jiraCapacitySampleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    select: { id: true, jiraIntegration: { select: { baseUrl: true } } },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  try {
    const report = await sampleJiraCapacity({
      ...parsed.data,
      baseUrl: project.jiraIntegration?.baseUrl,
    });
    logEvent('info', 'jira.capacity_sample.completed', {
      projectId: project.id,
      scopeType: report.scope.type,
      tickets: report.scope.tickets,
      observedSample: report.scope.observedSample,
      requests: report.collection.requests,
      elapsedMs: report.collection.elapsedMs,
      securityGate: report.security.status,
      capacityGate: report.capacityGate.status,
      capacityLevel: report.capacityGate.level,
      capacityUtilizationPercent: report.capacityGate.utilizationPercent,
    });
    res.json(report);
  } catch (error) {
    logEvent('error', 'jira.capacity_sample.failed', {
      projectId: project.id,
      scopeType: parsed.data.scopeType,
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Не удалось выполнить замер Jira',
    });
  }
});

router.get('/projects/:projectId/jira/history-status', async (req, res) => {
  if (currentUser(req)?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Диагностика истории доступна только администратору системы' });
    return;
  }
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    select: { id: true },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }
  res.json(await jiraHistoryStatus(prisma, project.id));
});

router.delete('/projects/:projectId/jira/data', async (req, res) => {
  const user = currentUser(req);
  if (user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Очистка данных Jira доступна только администратору системы' });
    return;
  }
  try {
    const result = await clearJiraProjectData(prisma, req.params.projectId);
    await recordAuditEvent({
      req,
      actor: user,
      action: 'jira.project_data.clear',
      objectType: 'Project',
      objectId: result.projectId,
      projectId: result.projectId,
      metadata: result,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof JiraProjectDataNotFoundError) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    if (error instanceof JiraProjectDataReadOnlyError) {
      res.status(423).json({ error: 'Закрытый проект доступен только для чтения' });
      return;
    }
    if (error instanceof JiraProjectDataBusyError) {
      res.status(409).json({ error: 'Дождитесь завершения обновления Jira для этого проекта' });
      return;
    }
    throw error;
  }
});

router.post('/projects/:projectId/jira/history/rebuild-projections', async (req, res) => {
  if (currentUser(req)?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Восстановление проекций доступно только администратору системы' });
    return;
  }
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    select: {
      id: true,
      jiraAnalyticsSettings: { select: { syncStatus: true } },
    },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }
  if (!project.jiraAnalyticsSettings) {
    res.json({ rebuilt: 0, skippedUnversioned: 0 });
    return;
  }
  const rebuildFence = await acquireJiraProjectionRebuildLease(prisma, project.id);
  if (!rebuildFence) {
    res.status(409).json({ error: 'Обновление Jira для этого проекта уже выполняется' });
    return;
  }
  try {
    res.json(await rebuildJiraCurrentProjections(
      prisma,
      project.id,
      200,
      (transaction) => renewJiraProjectionRebuildLease(transaction, rebuildFence),
    ));
  } finally {
    await releaseJiraProjectionRebuildLease(
      prisma,
      rebuildFence,
      project.jiraAnalyticsSettings.syncStatus,
    );
  }
});

router.post('/projects/:projectId/jira/sync', async (req, res) => {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Требуется вход в систему' });
    return;
  }
  if (user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Обновлять данные Jira может только системный администратор' });
    return;
  }
  const parsedSync = jiraSyncSchema.safeParse(req.body ?? {});
  if (!parsedSync.success) {
    const scopeType = req.body?.scopeType;
    res.status(400).json({
      error: scopeType !== 'LABEL' && scopeType !== 'EPIC'
        ? 'Выберите способ отбора тикетов Jira: лейбл или код эпика'
        : parsedSync.error.issues[0]?.message ?? 'Некорректные параметры Jira',
    });
    return;
  }
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    select: {
      id: true,
      jiraAnalyticsSettings: {
        select: { jiraScopeType: true, jiraScopeValue: true },
      },
    },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }
  const storedScope = project.jiraAnalyticsSettings;
  const changesStoredScope = !storedScope
    || storedScope.jiraScopeType !== parsedSync.data.scopeType
    || storedScope.jiraScopeValue !== parsedSync.data.scopeValue;
  if (changesStoredScope) {
    const historyBytes = await jiraHistoryDatabaseBytes(prisma);
    if (historyBytes / jiraHistoryStorageBudgetBytes() * 100 >= JIRA_HISTORY_CRITICAL_PERCENT) {
      res.status(409).json({
        error: 'История Jira заняла не менее 95% доступного бюджета. Подключение новой области заблокировано.',
      });
      return;
    }
  }
  try {
    const run = await enqueueJiraSyncRun(prisma, {
      projectId: project.id,
      kind: JiraSyncRunKind.SYNC,
      scopeType: parsedSync.data.scopeType,
      scopeValue: parsedSync.data.scopeValue,
      jiraBaseUrl: parsedSync.data.baseUrl,
      scopeChanged: changesStoredScope,
      requestedById: user.id,
      requestedByRole: user.role,
    });
    await recordAuditEvent({
      req,
      actor: user,
      action: 'jira.sync.enqueue',
      objectType: 'JiraSyncRun',
      objectId: run.id,
      projectId: project.id,
      metadata: {
        jiraScopeType: run.jiraScopeType,
        jiraScopeValue: run.jiraScopeValue,
        historyWriteEnabled: run.historyWriteEnabled,
      },
    });
    notifyJiraSyncRunner();
    res.status(202).json({
      runId: run.id,
      status: run.status,
      statusUrl: `/api/projects/${project.id}/jira/sync-runs/${run.id}`,
      pollAfterMs: JIRA_SYNC_POLL_AFTER_MS,
    });
  } catch (error) {
    if (error instanceof JiraSyncFencedError || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
      const active = await findActiveJiraSyncRun(prisma, project.id);
      res.status(409).json({
        error: 'Обновление Jira для этого проекта уже выполняется',
        runId: active?.id ?? null,
        statusUrl: active ? `/api/projects/${project.id}/jira/sync-runs/${active.id}` : null,
      });
      return;
    }
    throw error;
  }
});

router.get('/projects/:projectId/jira/sync-runs/active', async (req, res) => {
  if (!(await ensureProjectWriteAccess(req.params.projectId, req, res))) return;
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    select: { id: true },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }
  const active = await findActiveJiraSyncRun(prisma, req.params.projectId);
  res.json({ active: active ? publicJiraSyncRun(active) : null });
});

router.get('/projects/:projectId/jira/sync-runs/:runId', async (req, res) => {
  if (!(await ensureProjectWriteAccess(req.params.projectId, req, res))) return;
  const run = await findJiraSyncRun(prisma, req.params.projectId, req.params.runId);
  if (!run) {
    res.status(404).json({ error: 'Запуск синхронизации Jira не найден' });
    return;
  }
  res.json(publicJiraSyncRun(run));
});

router.post('/projects/:projectId/jira/backfill', async (req, res) => {
  if (currentUser(req)?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Полный импорт истории доступен только администратору системы' });
    return;
  }
  if (!jiraHistoryWriteEnabled()) {
    res.status(409).json({ error: 'Историческая запись Jira отключена настройкой сервера' });
    return;
  }
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    select: {
      id: true,
      jiraAnalyticsSettings: { select: { jiraScopeType: true, jiraScopeValue: true } },
    },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }
  if (!project.jiraAnalyticsSettings?.jiraScopeValue) {
    res.status(409).json({ error: 'Сначала настройте и запустите обычную синхронизацию Jira' });
    return;
  }
  const historyBytes = await jiraHistoryDatabaseBytes(prisma);
  if (historyBytes / jiraHistoryStorageBudgetBytes() * 100 >= JIRA_HISTORY_CRITICAL_PERCENT) {
    res.status(409).json({ error: 'Полный импорт остановлен: занято не менее 95% бюджета истории' });
    return;
  }
  const user = currentUser(req);
  try {
    const run = await enqueueJiraSyncRun(prisma, {
      projectId: project.id,
      kind: JiraSyncRunKind.BACKFILL,
      scopeType: project.jiraAnalyticsSettings.jiraScopeType,
      scopeValue: project.jiraAnalyticsSettings.jiraScopeValue,
      scopeChanged: false,
      requestedById: user?.id,
      requestedByRole: user?.role,
    });
    await recordAuditEvent({
      req,
      actor: user,
      action: 'jira.history.backfill.enqueue',
      objectType: 'JiraSyncRun',
      objectId: run.id,
      projectId: project.id,
      metadata: {
        jiraScopeType: run.jiraScopeType,
        jiraScopeValue: run.jiraScopeValue,
        historyWriteEnabled: run.historyWriteEnabled,
      },
    });
    notifyJiraSyncRunner();
    res.status(202).json({
      runId: run.id,
      status: run.status,
      statusUrl: `/api/projects/${project.id}/jira/sync-runs/${run.id}`,
      pollAfterMs: JIRA_SYNC_POLL_AFTER_MS,
    });
  } catch (error) {
    if (error instanceof JiraSyncFencedError || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
      const active = await findActiveJiraSyncRun(prisma, project.id);
      res.status(409).json({
        error: 'Обновление Jira для этого проекта уже выполняется',
        runId: active?.id ?? null,
        statusUrl: active ? `/api/projects/${project.id}/jira/sync-runs/${active.id}` : null,
      });
      return;
    }
    throw error;
  }
});

router.get('/projects/:projectId/jira/backfill/completeness', async (req, res) => {
  if (currentUser(req)?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Отчёт полноты доступен только администратору системы' });
    return;
  }
  const parsed = z.object({
    section: z.enum(['tickets', 'missing']).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  }).safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    select: { id: true },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }
  try {
    res.json(await jiraBackfillCompleteness(prisma, project.id, parsed.data));
  } catch (error) {
    const bounded = error as Error & { status?: number; kind?: string; limit?: number };
    if (bounded.status === 413) {
      res.status(413).json({ error: bounded.message, kind: bounded.kind, limit: bounded.limit });
      return;
    }
    throw error;
  }
});
}
