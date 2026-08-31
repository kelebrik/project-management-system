import {
  createIssueSchema,
  issueStatusUpdateSchema,
  jiraAnalyticsScopeValueMaxLength,
  normalizeJiraAnalyticsScopeValue,
  updateIssueSchema,
} from '@pms/shared';
import { JiraSyncRunKind, Prisma } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
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

export const JIRA_CAPACITY_DEFAULT_STORAGE_GIB = 5;
export const JIRA_CAPACITY_DEFAULT_ALLOCATED_GIB = 0;
export const normalizeIssueJiraKey = normalizedJiraIssueKey;

export function issueJiraUrlForKey(
  baseUrl: string | null | undefined,
  jiraKey: string,
) {
  const normalizedKey = normalizedJiraIssueKey(jiraKey);
  if (!normalizedKey) return null;
  const configuredBaseUrl = resolveJiraConfig(
    process.env,
    baseUrl?.trim() ? { baseUrl: baseUrl.trim() } : {},
  ).baseUrl;
  if (!configuredBaseUrl) return null;
  try {
    const url = new URL(configuredBaseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/browse/${encodeURIComponent(normalizedKey)}`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function openIssuePhaseSelectionError(userRole: string) {
  return userRole !== 'ADMIN'
    ? 'Недостаточно прав для выбора фазы и создания пакета работ'
    : null;
}

type IssueJiraReference = {
  jiraKey: string | null;
  jiraUrl: string | null;
};

export function issueJiraStateAfterLinkDeletion(
  current: IssueJiraReference,
  deleted: { jiraKey: string; jiraUrl: string },
  remaining: Array<{ jiraKey: string; jiraUrl: string }>,
) {
  const deletedPrimary = deleted.jiraKey === current.jiraKey
    || deleted.jiraUrl === current.jiraUrl;
  const nextPrimary = deletedPrimary ? remaining[0] ?? null : current;
  const jiraTicketKey = nextPrimary?.jiraKey ?? null;
  const jiraTicketUrl = nextPrimary?.jiraUrl ?? null;
  return {
    source: remaining.length > 0 || Boolean(jiraTicketKey && jiraTicketUrl)
      ? 'JIRA' as const
      : 'INTERNAL' as const,
    jiraTicketKey,
    jiraTicketUrl,
  };
}

export {
  isFatalJiraHistoryBatchError,
  jiraHistoryFullSweepState,
  jiraHistoryIssueIsRetryEligible,
  jiraHistorySyncFailedCompletely,
} from '../services/jira-sync-pipeline.js';

export function createIssuesRouter() {
  const router = Router();
  registerJiraSemanticAggregateRoutes(router);

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function calendarDelayDays(initialValue: Date | null, currentValue: Date | null) {
  if (!initialValue || !currentValue) return 0;
  const initialDate = new Date(initialValue);
  initialDate.setHours(0, 0, 0, 0);
  const currentDate = new Date(currentValue);
  currentDate.setHours(0, 0, 0, 0);
  if (Number.isNaN(initialDate.getTime()) || Number.isNaN(currentDate.getTime())) return 0;
  return Math.max(0, Math.round((currentDate.getTime() - initialDate.getTime()) / 86_400_000));
}

function isClosedIssueStatus(status: string | undefined) {
  return status === 'Done' || status === 'Closed' || status === 'Resolved';
}

function issueSeverityToRaidImpact(severity: string) {
  if (severity === 'CRITICAL') return 5;
  if (severity === 'HIGH') return 4;
  if (severity === 'MEDIUM') return 3;
  return 2;
}

const issueAuditFields = [
  'phaseId',
  'workPackageId',
  'source',
  'category',
  'title',
  'referenceLabel',
  'referenceUrl',
  'severity',
  'readiness',
  'status',
  'owner',
  'impact',
  'decisionRequired',
  'dueDate',
  'initialDueDate',
  'closedDelayDays',
  'jiraTicketKey',
  'jiraTicketUrl',
];

const issueInclude = {
  jiraLinks: { orderBy: { createdAt: 'asc' as const } },
  statusUpdates: { orderBy: [{ statusAt: 'desc' as const }, { createdAt: 'desc' as const }] },
};

async function issuePhaseExists(projectId: string, phaseId: string) {
  return prisma.wbsItem.findFirst({
    where: { id: phaseId, projectId, type: 'PHASE' },
    select: { id: true },
  });
}

async function ensureIssueWbsWriteAccess(
  projectId: string,
  method: 'POST' | 'PATCH',
  req: Request,
  res: Response,
) {
  const decision = await canProceedWithWrite({
    user: currentUser(req),
    apiToken: currentApiToken(req),
    pathname: `/projects/${projectId}/wbs-items`,
    method,
  });
  if (decision.ok) return true;
  res.status(decision.status).json({ error: decision.error });
  return false;
}

async function ensureIssuePhaseSelectionAccess(
  projectId: string,
  method: 'POST' | 'PATCH',
  req: Request,
  res: Response,
) {
  const user = currentUser(req);
  if (user) {
    const error = openIssuePhaseSelectionError(user.role);
    if (error) {
      res.status(403).json({ error });
      return false;
    }
    return true;
  }
  if (currentApiToken(req)) {
    return ensureIssueWbsWriteAccess(projectId, method, req, res);
  }
  res.status(401).json({ error: 'Требуется вход в систему' });
  return false;
}

async function finalizeIssueWorkPackage(
  projectId: string,
  mutation: IssueWorkPackageMutation | null,
) {
  if (!mutation || mutation.kind === 'unchanged') return;
  await recalculateProjectWbsSchedule(projectId);
  await recalculateProjectWbsHierarchyStatuses(projectId);
  const snapshot = await getProjectWbsSnapshot(projectId);
  await recordWbsCommand({
    projectId,
    type: mutation.kind === 'created' ? 'CREATE' : 'UPDATE',
    payload: {
      action: mutation.kind === 'created'
        ? 'open-issue-work-package-created'
        : mutation.kind === 'moved'
          ? 'open-issue-work-package-moved'
          : 'open-issue-work-package-updated',
      workPackageId: mutation.workPackageId,
    },
    afterSnapshot: snapshot,
  });
  await emitWebhookEvent({
    eventType: mutation.kind === 'created' ? 'wbs.item.created' : 'wbs.item.updated',
    projectId,
    payload: {
      action: 'open-issue-phase-link',
      itemId: mutation.workPackageId,
      snapshot,
    },
  }).catch(() => undefined);
}

router.get('/projects/:projectId/open-issues', async (req, res) => {
  const issues = await prisma.issue.findMany({
    where: {
      projectId: req.params.projectId,
      status: { notIn: ['Done', 'Closed', 'Resolved'] },
    },
    orderBy: [{ decisionRequired: 'desc' }, { severity: 'desc' }, { updatedAt: 'desc' }],
    include: issueInclude,
  });

  res.json(issues);
});

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

router.post('/projects/:projectId/open-issues', async (req, res) => {
  const parsed = createIssueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    include: { jiraIntegration: true },
  });

  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  const phaseId = parsed.data.phaseId?.trim() || null;
  if (phaseId && !(await issuePhaseExists(project.id, phaseId))) {
    res.status(400).json({ error: 'Выбранная фаза не найдена в Структуре проекта' });
    return;
  }
  if (phaseId && !(await ensureIssuePhaseSelectionAccess(project.id, 'POST', req, res))) return;
  if (phaseId && !(await ensureIssueWbsWriteAccess(project.id, 'POST', req, res))) return;

  const requestedJiraKeys = [
    parsed.data.jiraTicketKey,
    ...parsed.data.jiraLinks.map((link) => link.jiraKey),
  ].filter((value): value is string => Boolean(value?.trim()));
  const invalidJiraKey = requestedJiraKeys.find((value) => !normalizeIssueJiraKey(value));
  if (invalidJiraKey) {
    res.status(400).json({ error: `Некорректный ключ Jira: ${invalidJiraKey}` });
    return;
  }
  const jiraLinks = requestedJiraKeys
    .map((value) => normalizeIssueJiraKey(value)!)
    .filter(
      (jiraKey, index, allKeys) => allKeys.indexOf(jiraKey) === index,
    )
    .map((jiraKey) => ({
      jiraKey,
      jiraUrl: issueJiraUrlForKey(project.jiraIntegration?.baseUrl, jiraKey) ?? '',
    }));
  const invalidJiraUrl = jiraLinks.find((link) => !link.jiraUrl);
  if (invalidJiraUrl) {
    res.status(400).json({ error: 'Не удалось построить URL Jira из настроек проекта' });
    return;
  }
  const referenceUrl = parsed.data.referenceUrl?.trim() || null;
  if (referenceUrl && !isValidHttpUrl(referenceUrl)) {
    res.status(400).json({ error: `Некорректный URL ссылки: ${referenceUrl}` });
    return;
  }

  const dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  const { issue, workPackageMutation } = await runWithWbsWriteQueue(
    project.id,
    async () => {
      const result = await prisma.$transaction(async (tx) => {
        const mutation = phaseId
          ? await upsertIssueWorkPackage(tx, {
              projectId: project.id,
              phaseId,
              title: parsed.data.title,
              owner: parsed.data.owner,
              dueDate,
            })
          : null;
        const createdIssue = await tx.issue.create({
          data: {
            projectId: project.id,
            phaseId,
            workPackageId: mutation?.workPackageId ?? null,
            source: jiraLinks.length > 0 ? 'JIRA' : 'INTERNAL',
            category: parsed.data.category,
            title: parsed.data.title,
            referenceLabel: parsed.data.referenceLabel,
            referenceUrl,
            severity: parsed.data.severity,
            readiness: parsed.data.readiness,
            status: 'Open',
            owner: parsed.data.owner,
            impact: parsed.data.impact,
            decisionRequired: parsed.data.decisionRequired,
            dueDate,
            initialDueDate: dueDate,
            jiraTicketKey: jiraLinks[0]?.jiraKey ?? null,
            jiraTicketUrl: jiraLinks[0]?.jiraUrl ?? null,
            jiraLinks: {
              create: jiraLinks.map((link) => ({
                jiraKey: link.jiraKey,
                jiraUrl: link.jiraUrl,
              })),
            },
          },
          include: issueInclude,
        });
        return { issue: createdIssue, workPackageMutation: mutation };
      }, {
        maxWait: 10_000,
        timeout: 20_000,
      });
      await finalizeIssueWorkPackage(project.id, result.workPackageMutation);
      return result;
    },
  );

  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'issue.create',
    objectType: 'Issue',
    objectId: issue.id,
    projectId: project.id,
    afterValue: issue,
    changes: buildAuditFieldChanges({}, issue, issueAuditFields),
  });
  await emitWebhookEvent({
    eventType: 'issue.created',
    projectId: project.id,
    payload: { issue },
  }).catch(() => undefined);
  res.status(201).json(issue);
});

router.patch('/open-issues/:issueId', async (req, res) => {
  const parsed = updateIssueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const issue = await prisma.issue.findUnique({
    where: { id: req.params.issueId },
    include: { project: { include: { jiraIntegration: true } } },
  });

  if (!issue) {
    res.status(404).json({ error: 'Открытый вопрос не найден' });
    return;
  }

  const requestedJiraKey = parsed.data.jiraTicketKey === undefined
    ? undefined
    : parsed.data.jiraTicketKey?.trim()
      ? normalizeIssueJiraKey(parsed.data.jiraTicketKey)
      : null;
  if (parsed.data.jiraTicketKey?.trim() && !requestedJiraKey) {
    res.status(400).json({ error: `Некорректный ключ Jira: ${parsed.data.jiraTicketKey}` });
    return;
  }
  const nextJiraUrl = requestedJiraKey === undefined
    ? undefined
    : requestedJiraKey === null
      ? null
      : issueJiraUrlForKey(issue.project.jiraIntegration?.baseUrl, requestedJiraKey);
  if (requestedJiraKey && !nextJiraUrl) {
    res.status(400).json({ error: 'Не настроена интеграция Jira для проекта' });
    return;
  }
  const nextReferenceUrl =
    parsed.data.referenceUrl === undefined
      ? undefined
      : parsed.data.referenceUrl?.trim() || null;
  if (nextReferenceUrl && !isValidHttpUrl(nextReferenceUrl)) {
    res.status(400).json({ error: `Некорректный URL ссылки: ${nextReferenceUrl}` });
    return;
  }
  const result = await runWithWbsWriteQueue(
    issue.projectId,
    async () => {
      const transactionResult = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`
          SELECT "id" FROM "Issue" WHERE "id" = ${issue.id} FOR UPDATE
        `);
        const currentIssue = await tx.issue.findUnique({ where: { id: issue.id } });
        if (!currentIssue) {
          res.status(404).json({ error: 'Открытый вопрос не найден' });
          return null;
        }
        const phaseSelectionChanged = parsed.data.phaseId !== undefined
          && parsed.data.phaseId !== currentIssue.phaseId;
        if (phaseSelectionChanged
          && !(await ensureIssuePhaseSelectionAccess(
            currentIssue.projectId,
            'PATCH',
            req,
            res,
          ))) {
          return null;
        }
        if (parsed.data.phaseId === null && currentIssue.workPackageId) {
          res.status(409).json({
            error: 'Фазу нельзя очистить после создания пакета работ; выберите другую фазу',
          });
          return null;
        }

        const targetPhaseId = parsed.data.phaseId === undefined
          ? currentIssue.phaseId
          : parsed.data.phaseId;
        if (targetPhaseId && (
          targetPhaseId !== currentIssue.phaseId
          || !currentIssue.workPackageId
        )) {
          const phase = await tx.wbsItem.findFirst({
            where: { id: targetPhaseId, projectId: currentIssue.projectId, type: 'PHASE' },
            select: { id: true },
          });
          if (!phase) {
            res.status(400).json({ error: 'Выбранная фаза не найдена в Структуре проекта' });
            return null;
          }
        }

        const nextDueDate = parsed.data.dueDate === undefined
          ? undefined
          : parsed.data.dueDate
            ? new Date(parsed.data.dueDate)
            : null;
        const nextInitialDueDate =
          parsed.data.dueDate === undefined || currentIssue.initialDueDate
            ? undefined
            : currentIssue.dueDate ?? nextDueDate;
        const resolvedDueDate = nextDueDate === undefined
          ? currentIssue.dueDate
          : nextDueDate;
        const resolvedInitialDueDate = nextInitialDueDate === undefined
          ? currentIssue.initialDueDate
          : nextInitialDueDate;
        const nextStatus = parsed.data.status ?? currentIssue.status;
        const shouldCaptureClosedDelay = isClosedIssueStatus(nextStatus)
          && !isClosedIssueStatus(currentIssue.status);
        const workPackageFieldsChanged = parsed.data.title !== undefined
          || parsed.data.owner !== undefined
          || parsed.data.dueDate !== undefined;
        const shouldUpsertWorkPackage = Boolean(
          targetPhaseId
          && (
            phaseSelectionChanged
            || (Boolean(currentIssue.workPackageId) && workPackageFieldsChanged)
          ),
        );
        if (shouldUpsertWorkPackage) {
          if (!(await ensureIssueWbsWriteAccess(
            currentIssue.projectId,
            'PATCH',
            req,
            res,
          ))) {
            return null;
          }
          if (!currentIssue.workPackageId
            && !(await ensureIssueWbsWriteAccess(
              currentIssue.projectId,
              'POST',
              req,
              res,
            ))) {
            return null;
          }
        }
        const mutation = shouldUpsertWorkPackage && targetPhaseId
          ? await upsertIssueWorkPackage(tx, {
              projectId: currentIssue.projectId,
              phaseId: targetPhaseId,
              workPackageId: currentIssue.workPackageId,
              title: parsed.data.title ?? currentIssue.title,
              owner: parsed.data.owner ?? currentIssue.owner,
              dueDate: resolvedDueDate,
            })
          : null;

        let resolvedJiraKey = currentIssue.jiraTicketKey;
        let resolvedJiraUrl = currentIssue.jiraTicketUrl;
        let jiraLinksCount: number | null = null;
        if (requestedJiraKey !== undefined) {
          const primaryLink = currentIssue.jiraTicketKey || currentIssue.jiraTicketUrl
            ? await tx.issueJiraLink.findFirst({
                where: {
                  issueId: currentIssue.id,
                  OR: [
                    ...(currentIssue.jiraTicketKey
                      ? [{ jiraKey: currentIssue.jiraTicketKey }]
                      : []),
                    ...(currentIssue.jiraTicketUrl
                      ? [{ jiraUrl: currentIssue.jiraTicketUrl }]
                      : []),
                  ],
                },
                orderBy: { createdAt: 'asc' },
              })
            : null;
          if (requestedJiraKey === null) {
            if (primaryLink) {
              await tx.issueJiraLink.delete({ where: { id: primaryLink.id } });
            }
            const replacement = await tx.issueJiraLink.findFirst({
              where: { issueId: currentIssue.id },
              orderBy: { createdAt: 'asc' },
            });
            resolvedJiraKey = replacement?.jiraKey ?? null;
            resolvedJiraUrl = replacement?.jiraUrl ?? null;
          } else {
            const targetLink = await tx.issueJiraLink.findUnique({
              where: {
                issueId_jiraKey: {
                  issueId: currentIssue.id,
                  jiraKey: requestedJiraKey,
                },
              },
            });
            if (primaryLink && targetLink && primaryLink.id !== targetLink.id) {
              await tx.issueJiraLink.delete({ where: { id: primaryLink.id } });
            }
            const linkToUpdate = targetLink ?? primaryLink;
            if (linkToUpdate) {
              await tx.issueJiraLink.update({
                where: { id: linkToUpdate.id },
                data: { jiraKey: requestedJiraKey, jiraUrl: nextJiraUrl! },
              });
            } else {
              await tx.issueJiraLink.create({
                data: {
                  issueId: currentIssue.id,
                  jiraKey: requestedJiraKey,
                  jiraUrl: nextJiraUrl!,
                },
              });
            }
            resolvedJiraKey = requestedJiraKey;
            resolvedJiraUrl = nextJiraUrl!;
          }
          jiraLinksCount = await tx.issueJiraLink.count({
            where: { issueId: currentIssue.id },
          });
        }
        const updatedIssue = await tx.issue.update({
          where: { id: currentIssue.id },
          data: {
            ...parsed.data,
            workPackageId: mutation?.workPackageId,
            referenceUrl: nextReferenceUrl,
            dueDate: nextDueDate,
            initialDueDate: nextInitialDueDate,
            closedDelayDays: shouldCaptureClosedDelay
              ? calendarDelayDays(resolvedInitialDueDate, resolvedDueDate)
              : undefined,
            source: jiraLinksCount === null
              ? undefined
              : jiraLinksCount > 0 || Boolean(resolvedJiraKey && resolvedJiraUrl)
                ? 'JIRA'
                : 'INTERNAL',
            jiraTicketKey: requestedJiraKey === undefined ? undefined : resolvedJiraKey,
            jiraTicketUrl: requestedJiraKey === undefined ? undefined : resolvedJiraUrl,
          },
          include: issueInclude,
        });
        return {
          beforeIssue: currentIssue,
          updated: updatedIssue,
          workPackageMutation: mutation,
        };
      }, {
        maxWait: 10_000,
        timeout: 20_000,
      });
      if (!transactionResult) return null;
      await finalizeIssueWorkPackage(issue.projectId, transactionResult.workPackageMutation);
      return transactionResult;
    },
  );
  if (!result) return;
  const { beforeIssue, updated } = result;

  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'issue.update',
    objectType: 'Issue',
    objectId: issue.id,
    projectId: issue.projectId,
    beforeValue: beforeIssue,
    afterValue: updated,
    metadata: { changedFields: Object.keys(parsed.data) },
    changes: buildAuditFieldChanges(beforeIssue, updated, issueAuditFields),
  });
  await emitWebhookEvent({
    eventType: 'issue.updated',
    projectId: issue.projectId,
    payload: { before: beforeIssue, after: updated },
  }).catch(() => undefined);
  res.json(updated);
});

router.post('/open-issues/:issueId/convert-to-problem', async (req, res) => {
  const issue = await prisma.issue.findUnique({
    where: { id: req.params.issueId },
    include: issueInclude,
  });

  if (!issue) {
    res.status(404).json({ error: 'Открытый вопрос не найден' });
    return;
  }

  if (isClosedIssueStatus(issue.status)) {
    res.status(409).json({ error: 'Закрытый вопрос нельзя перевести в проблему' });
    return;
  }

  const primaryJiraLink = issue.jiraTicketKey || issue.jiraTicketUrl
    ? { jiraKey: issue.jiraTicketKey, jiraUrl: issue.jiraTicketUrl }
    : issue.jiraLinks[0];
  const impact = issueSeverityToRaidImpact(issue.severity);
  const probability = 5;
  const convertedAt = new Date();
  const description = issue.impact.trim()
    ? issue.impact.trim()
    : `Проблема создана из открытого вопроса: ${issue.title}`;

  const { raidItem, updatedIssue } = await prisma.$transaction(async (tx) => {
    const createdRaidItem = await tx.raidItem.create({
      data: {
        projectId: issue.projectId,
        type: 'DEPENDENCY',
        title: issue.title,
        description,
        owner: issue.owner || 'Не назначен',
        status: 'OPEN',
        probability,
        impact,
        riskScore: probability * impact,
        mitigationPlan: null,
        contingencyPlan: null,
        dueDate: issue.dueDate,
        residualRisk: 0,
        validationDate: null,
        linkedRiskId: null,
        dependencyType: 'Открытый вопрос',
        predecessor: null,
        successor: null,
        supplier: null,
        jiraTicketKey: primaryJiraLink?.jiraKey ?? null,
        jiraTicketUrl: primaryJiraLink?.jiraUrl ?? null,
        decisionRequired: issue.decisionRequired,
        escalationLevel: 'Проект',
        scheduleImpactDays: 0,
        budgetImpact: 0,
        statusUpdates: {
          create: {
            statusAt: convertedAt,
            text: `Создано из открытого вопроса: ${issue.title}`,
          },
        },
      },
      include: {
        statusUpdates: { orderBy: [{ statusAt: 'desc' }, { createdAt: 'desc' }] },
      },
    });

    const closedIssue = await tx.issue.update({
      where: { id: issue.id },
      data: {
        status: 'Resolved',
        decisionRequired: false,
        closedDelayDays: calendarDelayDays(issue.initialDueDate, issue.dueDate),
      },
      include: issueInclude,
    });

    return { raidItem: createdRaidItem, updatedIssue: closedIssue };
  });

  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'issue.convert_to_problem',
    objectType: 'Issue',
    objectId: issue.id,
    projectId: issue.projectId,
    beforeValue: issue,
    afterValue: updatedIssue,
    metadata: { raidItemId: raidItem.id },
    changes: buildAuditFieldChanges(issue, updatedIssue, issueAuditFields),
  });
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'raid_item.create',
    objectType: 'RaidItem',
    objectId: raidItem.id,
    projectId: issue.projectId,
    afterValue: raidItem,
    metadata: { convertedFromIssueId: issue.id },
  });
  await emitWebhookEvent({
    eventType: 'issue.converted_to_problem',
    projectId: issue.projectId,
    payload: { before: issue, issue: updatedIssue, raidItem },
  }).catch(() => undefined);

  res.status(201).json({ issue: updatedIssue, raidItem });
});

router.post('/open-issues/:issueId/status-updates', async (req, res) => {
  const parsed = issueStatusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const issue = await prisma.issue.findUnique({
    where: { id: req.params.issueId },
  });

  if (!issue) {
    res.status(404).json({ error: 'Открытый вопрос не найден' });
    return;
  }

  const statusUpdate = await prisma.issueStatusUpdate.create({
    data: {
      issueId: issue.id,
      statusAt: new Date(),
      text: parsed.data.text,
    },
  });

  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'issue.status_update.create',
    objectType: 'IssueStatusUpdate',
    objectId: statusUpdate.id,
    projectId: issue.projectId,
    afterValue: statusUpdate,
    metadata: { issueId: issue.id },
    changes: buildAuditFieldChanges({}, statusUpdate, ['statusAt', 'text']),
  });
  await emitWebhookEvent({
    eventType: 'issue.status_updated',
    projectId: issue.projectId,
    payload: { issueId: issue.id, statusUpdate },
  }).catch(() => undefined);

  res.status(201).json(statusUpdate);
});

const issueJiraLinkSchema = z.object({
  jiraKey: z.string().trim().min(1),
});

router.post('/open-issues/:issueId/jira-links', async (req, res) => {
  const parsed = issueJiraLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const issue = await prisma.issue.findUnique({
    where: { id: req.params.issueId },
    include: { project: { include: { jiraIntegration: true } } },
  });

  if (!issue) {
    res.status(404).json({ error: 'Открытый вопрос не найден' });
    return;
  }

  const jiraKey = normalizeIssueJiraKey(parsed.data.jiraKey);
  if (!jiraKey) {
    res.status(400).json({ error: `Некорректный ключ Jira: ${parsed.data.jiraKey}` });
    return;
  }
  const jiraUrl = issueJiraUrlForKey(issue.project.jiraIntegration?.baseUrl, jiraKey);
  if (!jiraUrl) {
    res.status(400).json({ error: 'Не удалось построить URL Jira из настроек проекта' });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "Issue" WHERE "id" = ${issue.id} FOR UPDATE
    `);
    const currentIssue = await tx.issue.findUnique({ where: { id: issue.id } });
    if (!currentIssue) return null;
    const previousLink = await tx.issueJiraLink.findUnique({
      where: {
        issueId_jiraKey: {
          issueId: currentIssue.id,
          jiraKey,
        },
      },
    });
    const link = await tx.issueJiraLink.upsert({
      where: {
        issueId_jiraKey: {
          issueId: currentIssue.id,
          jiraKey,
        },
      },
      create: {
        issueId: currentIssue.id,
        jiraKey,
        jiraUrl,
      },
      update: { jiraUrl },
    });
    const updatedIssue = !currentIssue.jiraTicketKey || !currentIssue.jiraTicketUrl
      ? await tx.issue.update({
          where: { id: currentIssue.id },
          data: {
            source: 'JIRA',
            jiraTicketKey: jiraKey,
            jiraTicketUrl: jiraUrl,
          },
        })
      : null;
    return { previousLink, link, beforeIssue: currentIssue, updatedIssue };
  });
  if (!result) {
    res.status(404).json({ error: 'Открытый вопрос не найден' });
    return;
  }
  const { previousLink, link, beforeIssue, updatedIssue } = result;

  if (updatedIssue) {
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'issue.update',
      objectType: 'Issue',
      objectId: issue.id,
      projectId: issue.projectId,
      beforeValue: beforeIssue,
      afterValue: updatedIssue,
      metadata: { changedFields: ['source', 'jiraTicketKey', 'jiraTicketUrl'] },
      changes: buildAuditFieldChanges(beforeIssue, updatedIssue, [
        'source',
        'jiraTicketKey',
        'jiraTicketUrl',
      ]),
    });
  }

  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: previousLink ? 'issue.jira_link.update' : 'issue.jira_link.create',
    objectType: 'IssueJiraLink',
    objectId: link.id,
    projectId: beforeIssue.projectId,
    beforeValue: previousLink,
    afterValue: link,
    metadata: { issueId: beforeIssue.id },
    changes: buildAuditFieldChanges(previousLink ?? {}, link, ['jiraKey', 'jiraUrl']),
  });
  await emitWebhookEvent({
    eventType: 'issue.jira_link.updated',
    projectId: beforeIssue.projectId,
    payload: { issueId: beforeIssue.id, link },
  }).catch(() => undefined);
  res.status(201).json(link);
});

router.patch('/open-issues/:issueId/jira-links/:linkId', async (req, res) => {
  const parsed = issueJiraLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const jiraKey = normalizeIssueJiraKey(parsed.data.jiraKey);
  if (!jiraKey) {
    res.status(400).json({ error: `Некорректный ключ Jira: ${parsed.data.jiraKey}` });
    return;
  }

  const currentLink = await prisma.issueJiraLink.findUnique({
    where: { id: req.params.linkId },
    include: {
      issue: { include: { project: { include: { jiraIntegration: true } } } },
    },
  });
  if (!currentLink || currentLink.issueId !== req.params.issueId) {
    res.status(404).json({ error: 'Связь Jira не найдена' });
    return;
  }
  const jiraUrl = issueJiraUrlForKey(
    currentLink.issue.project.jiraIntegration?.baseUrl,
    jiraKey,
  );
  if (!jiraUrl) {
    res.status(400).json({ error: 'Не удалось построить URL Jira из настроек проекта' });
    return;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "Issue" WHERE "id" = ${currentLink.issue.id} FOR UPDATE
      `);
      const [beforeLink, beforeIssue] = await Promise.all([
        tx.issueJiraLink.findUnique({ where: { id: currentLink.id } }),
        tx.issue.findUnique({ where: { id: currentLink.issue.id } }),
      ]);
      if (!beforeLink || beforeLink.issueId !== req.params.issueId || !beforeIssue) return null;
      const link = await tx.issueJiraLink.update({
        where: { id: beforeLink.id },
        data: { jiraKey, jiraUrl },
      });
      const wasPrimary = beforeIssue.jiraTicketKey === beforeLink.jiraKey
        || beforeIssue.jiraTicketUrl === beforeLink.jiraUrl;
      const issue = wasPrimary
        ? await tx.issue.update({
            where: { id: beforeIssue.id },
            data: { source: 'JIRA', jiraTicketKey: jiraKey, jiraTicketUrl: jiraUrl },
          })
        : null;
      return { beforeLink, beforeIssue, link, issue };
    });
    if (!result) {
      res.status(404).json({ error: 'Связь Jira не найдена' });
      return;
    }

    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'issue.jira_link.update',
      objectType: 'IssueJiraLink',
      objectId: result.link.id,
      projectId: currentLink.issue.projectId,
      beforeValue: result.beforeLink,
      afterValue: result.link,
      metadata: { issueId: result.beforeIssue.id },
      changes: buildAuditFieldChanges(result.beforeLink, result.link, ['jiraKey', 'jiraUrl']),
    });
    if (result.issue) {
      await recordAuditEvent({
        req,
        actor: currentUser(req),
        action: 'issue.update',
        objectType: 'Issue',
        objectId: result.beforeIssue.id,
        projectId: result.beforeIssue.projectId,
        beforeValue: result.beforeIssue,
        afterValue: result.issue,
        metadata: { changedFields: ['source', 'jiraTicketKey', 'jiraTicketUrl'] },
        changes: buildAuditFieldChanges(result.beforeIssue, result.issue, [
          'source',
          'jiraTicketKey',
          'jiraTicketUrl',
        ]),
      });
    }
    await emitWebhookEvent({
      eventType: 'issue.jira_link.updated',
      projectId: currentLink.issue.projectId,
      payload: { issueId: result.beforeIssue.id, link: result.link },
    }).catch(() => undefined);
    res.json(result.link);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: `Тикет ${jiraKey} уже связан с этим вопросом` });
      return;
    }
    throw error;
  }
});

router.delete('/open-issues/:issueId/jira-links/:linkId', async (req, res) => {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "Issue" WHERE "id" = ${req.params.issueId} FOR UPDATE
    `);
    const [link, beforeIssue] = await Promise.all([
      tx.issueJiraLink.findUnique({ where: { id: req.params.linkId } }),
      tx.issue.findUnique({ where: { id: req.params.issueId } }),
    ]);
    if (!link || link.issueId !== req.params.issueId || !beforeIssue) return null;

    await tx.issueJiraLink.delete({ where: { id: link.id } });
    const remainingLinks = await tx.issueJiraLink.findMany({
      where: { issueId: beforeIssue.id },
      orderBy: { createdAt: 'asc' },
    });
    const nextJiraState = issueJiraStateAfterLinkDeletion(
      {
        jiraKey: beforeIssue.jiraTicketKey,
        jiraUrl: beforeIssue.jiraTicketUrl,
      },
      link,
      remainingLinks,
    );
    const updatedIssue = await tx.issue.update({
      where: { id: beforeIssue.id },
      data: nextJiraState,
    });
    return { link, beforeIssue, updatedIssue };
  });
  if (!result) {
    res.status(404).json({ error: 'Связь Jira не найдена' });
    return;
  }
  const { link, beforeIssue, updatedIssue } = result;
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'issue.jira_link.delete',
    objectType: 'IssueJiraLink',
    objectId: link.id,
    projectId: beforeIssue.projectId,
    beforeValue: link,
    metadata: { issueId: req.params.issueId },
  });
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'issue.update',
    objectType: 'Issue',
    objectId: beforeIssue.id,
    projectId: beforeIssue.projectId,
    beforeValue: beforeIssue,
    afterValue: updatedIssue,
    metadata: { changedFields: ['source', 'jiraTicketKey', 'jiraTicketUrl'] },
    changes: buildAuditFieldChanges(beforeIssue, updatedIssue, [
      'source',
      'jiraTicketKey',
      'jiraTicketUrl',
    ]),
  });
  await emitWebhookEvent({
    eventType: 'issue.jira_link.deleted',
    projectId: beforeIssue.projectId,
    payload: { issueId: req.params.issueId, link },
  }).catch(() => undefined);
  res.status(204).send();
});

const updateTaskJiraSchema = z.object({
  jiraTicketKey: z.string().trim().min(1).optional().nullable(),
  jiraTicketUrl: z.string().trim().url().optional().nullable(),
});

router.patch('/tasks/:taskId/jira-link', async (req, res) => {
  const parsed = updateTaskJiraSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const task = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    include: { project: { include: { jiraIntegration: true } } },
  });

  if (!task) {
    res.status(404).json({ error: 'Задача не найдена' });
    return;
  }

  const jiraBaseUrl = task.project.jiraIntegration?.baseUrl;
  if (jiraBaseUrl && parsed.data.jiraTicketUrl && !parsed.data.jiraTicketUrl.startsWith(jiraBaseUrl)) {
    res.status(400).json({ error: `URL Jira должен начинаться с ${jiraBaseUrl}` });
    return;
  }

  const updated = await prisma.task.update({
    where: { id: req.params.taskId },
    data: parsed.data,
  });

  res.json(updated);
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


  return router;
}
