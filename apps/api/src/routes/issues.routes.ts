import {
  JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1,
  createIssueSchema,
  issueStatusUpdateSchema,
  jiraAnalyticsDashboardV3Schema,
  jiraAnalyticsDashboardV4Schema,
  jiraAnalyticsWidgetDatasetError,
  jiraAnalyticsScopeValueMaxLength,
  normalizeJiraAnalyticsDatasetRevision,
  normalizeJiraAnalyticsScopeValue,
  updateIssueSchema,
} from '@pms/shared';
import { JiraSyncRunKind, Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { currentUser } from '../server/auth.js';
import { logEvent } from '../server/logger.js';
import { ensureProjectWriteAccess } from '../server/project-access.js';
import { buildAuditFieldChanges, recordAuditEvent } from '../services/audit.js';
import {
  rebuildJiraCurrentProjections,
} from '../services/jira-analytics-sync.js';
import { sampleJiraCapacity } from '../services/jira-capacity.js';
import {
  jiraDashboardConfigHash,
  jiraDashboardReferencedAggregateIds,
  safeJiraAggregateDatasetFromRow,
  lockJiraAggregateProject,
} from '../services/jira-aggregates.js';
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
  clearJiraProjectData,
  JiraProjectDataBusyError,
  JiraProjectDataNotFoundError,
  JiraProjectDataReadOnlyError,
} from '../services/jira-project-data.js';
import { emitWebhookEvent } from '../services/webhooks.js';
import { registerJiraAggregateRoutes } from './jira-aggregates.routes.js';

export const JIRA_CAPACITY_DEFAULT_STORAGE_GIB = 5;
export const JIRA_CAPACITY_DEFAULT_ALLOCATED_GIB = 0;

export {
  isFatalJiraHistoryBatchError,
  jiraHistoryFullSweepState,
  jiraHistoryIssueIsRetryEligible,
  jiraHistorySyncFailedCompletely,
} from '../services/jira-sync-pipeline.js';

export function jiraDashboardOmittedV3WidgetIds(
  previousConfig: unknown,
  nextConfig: z.infer<typeof jiraAnalyticsDashboardV4Schema>,
) {
  const previousV3 = jiraAnalyticsDashboardV3Schema.safeParse(previousConfig);
  if (!previousV3.success) return [];
  const nextWidgetIds = new Set(nextConfig.widgets.map((widget) => widget.id));
  return previousV3.data.widgets
    .filter((widget) => !nextWidgetIds.has(widget.id))
    .map((widget) => widget.id);
}

export function createIssuesRouter() {
  const router = Router();
  registerJiraAggregateRoutes(router);

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
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
  'source',
  'title',
  'severity',
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

const jiraAnalyticsDashboardSchema = z.object({
  config: jiraAnalyticsDashboardV4Schema,
  expectedConfigHash: z.string().regex(/^[0-9a-f]{64}$/),
  acceptPartialMigration: z.boolean().default(false),
});

class JiraDashboardAggregateReferenceError extends Error {
  constructor(public readonly details: {
    missingIds: string[];
    missingRevisions: Array<{ widgetId: string; aggregateId: string; version: number | null }>;
    contractMismatches: Array<{ widgetId: string; aggregateId: string; error: string }>;
  }) {
    super('JIRA_DASHBOARD_AGGREGATE_REFERENCE_INVALID');
  }
}

class JiraDashboardConfigConflictError extends Error {
  constructor(public readonly currentConfigHash: string) {
    super('JIRA_DASHBOARD_CONFIG_CHANGED');
  }
}

class JiraDashboardPartialMigrationError extends Error {
  constructor(public readonly omittedWidgetIds: string[]) {
    super('JIRA_DASHBOARD_PARTIAL_MIGRATION_REQUIRES_CONFIRMATION');
  }
}

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

  const primaryJiraKey = parsed.data.jiraTicketKey?.trim() || null;
  const primaryJiraUrl = parsed.data.jiraTicketUrl?.trim() || null;
  const jiraLinks = [
    ...parsed.data.jiraLinks,
    ...(primaryJiraKey && primaryJiraUrl
      ? [{ jiraKey: primaryJiraKey, jiraUrl: primaryJiraUrl }]
      : []),
  ]
    .map((link) => ({
      jiraKey: link.jiraKey?.trim() ?? '',
      jiraUrl: link.jiraUrl?.trim() ?? '',
    }))
    .filter((link) => link.jiraKey && link.jiraUrl)
    .filter(
      (link, index, allLinks) =>
        allLinks.findIndex((candidate) => candidate.jiraKey === link.jiraKey) === index,
    );

  const invalidUrl = [primaryJiraUrl, ...jiraLinks.map((link) => link.jiraUrl)].find(
    (url) => url && !isValidUrl(url),
  );
  if (invalidUrl) {
    res.status(400).json({ error: `Некорректный Jira URL: ${invalidUrl}` });
    return;
  }

  const jiraBaseUrl = project.jiraIntegration?.baseUrl;
  const invalidLink = jiraLinks.find((link) => jiraBaseUrl && !link.jiraUrl.startsWith(jiraBaseUrl));
  if (jiraBaseUrl && invalidLink) {
    res.status(400).json({ error: `URL Jira должен начинаться с ${jiraBaseUrl}` });
    return;
  }

  const issue = await prisma.issue.create({
    data: {
      projectId: project.id,
      source: jiraLinks.length > 0 ? 'JIRA' : 'INTERNAL',
      title: parsed.data.title,
      severity: parsed.data.severity,
      status: 'Open',
      owner: parsed.data.owner,
      impact: parsed.data.impact,
      decisionRequired: parsed.data.decisionRequired,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      initialDueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      jiraTicketKey: primaryJiraKey ?? jiraLinks[0]?.jiraKey ?? null,
      jiraTicketUrl: primaryJiraUrl ?? jiraLinks[0]?.jiraUrl ?? null,
      jiraLinks: {
        create: jiraLinks.map((link) => ({
          jiraKey: link.jiraKey,
          jiraUrl: link.jiraUrl,
        })),
      },
    },
    include: issueInclude,
  });

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
  });

  if (!issue) {
    res.status(404).json({ error: 'Открытый вопрос не найден' });
    return;
  }

  const nextDueDate =
    parsed.data.dueDate === undefined
      ? undefined
      : parsed.data.dueDate
        ? new Date(parsed.data.dueDate)
        : null;
  const nextInitialDueDate =
    parsed.data.dueDate === undefined || issue.initialDueDate
      ? undefined
      : issue.dueDate ?? nextDueDate;
  const nextJiraUrl =
    parsed.data.jiraTicketUrl === undefined
      ? undefined
      : parsed.data.jiraTicketUrl?.trim() || null;
  if (nextJiraUrl && !isValidUrl(nextJiraUrl)) {
    res.status(400).json({ error: `Некорректный Jira URL: ${nextJiraUrl}` });
    return;
  }
  const nextStatus = parsed.data.status ?? issue.status;
  const resolvedDueDate = nextDueDate === undefined ? issue.dueDate : nextDueDate;
  const resolvedInitialDueDate =
    nextInitialDueDate === undefined ? issue.initialDueDate : nextInitialDueDate;
  const shouldCaptureClosedDelay =
    isClosedIssueStatus(nextStatus) &&
    !isClosedIssueStatus(issue.status);

  const updated = await prisma.issue.update({
    where: { id: issue.id },
    data: {
      ...parsed.data,
      dueDate: nextDueDate,
      initialDueDate: nextInitialDueDate,
      closedDelayDays: shouldCaptureClosedDelay
        ? calendarDelayDays(resolvedInitialDueDate, resolvedDueDate)
        : undefined,
      jiraTicketKey:
        parsed.data.jiraTicketKey === undefined
          ? undefined
          : parsed.data.jiraTicketKey?.trim() || null,
      jiraTicketUrl: nextJiraUrl,
    },
    include: issueInclude,
  });

  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'issue.update',
    objectType: 'Issue',
    objectId: issue.id,
    projectId: issue.projectId,
    beforeValue: issue,
    afterValue: updated,
    metadata: { changedFields: Object.keys(parsed.data) },
    changes: buildAuditFieldChanges(issue, updated, issueAuditFields),
  });
  await emitWebhookEvent({
    eventType: 'issue.updated',
    projectId: issue.projectId,
    payload: { before: issue, after: updated },
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

  const statusAt = new Date(parsed.data.statusAt);
  if (Number.isNaN(statusAt.getTime())) {
    res.status(400).json({ error: 'Некорректная дата статуса' });
    return;
  }

  const statusUpdate = await prisma.issueStatusUpdate.create({
    data: {
      issueId: issue.id,
      statusAt,
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
  jiraUrl: z.string().trim().url(),
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

  const jiraBaseUrl = issue.project.jiraIntegration?.baseUrl;
  if (jiraBaseUrl && !parsed.data.jiraUrl.startsWith(jiraBaseUrl)) {
    res.status(400).json({ error: `URL Jira должен начинаться с ${jiraBaseUrl}` });
    return;
  }

  const previousLink = await prisma.issueJiraLink.findUnique({
    where: {
      issueId_jiraKey: {
        issueId: issue.id,
        jiraKey: parsed.data.jiraKey,
      },
    },
  });
  const link = await prisma.issueJiraLink.upsert({
    where: {
      issueId_jiraKey: {
        issueId: issue.id,
        jiraKey: parsed.data.jiraKey,
      },
    },
    create: {
      issueId: issue.id,
      jiraKey: parsed.data.jiraKey,
      jiraUrl: parsed.data.jiraUrl,
    },
    update: {
      jiraUrl: parsed.data.jiraUrl,
    },
  });

  if (!issue.jiraTicketKey || !issue.jiraTicketUrl) {
    const updatedIssue = await prisma.issue.update({
      where: { id: issue.id },
      data: {
        source: 'JIRA',
        jiraTicketKey: parsed.data.jiraKey,
        jiraTicketUrl: parsed.data.jiraUrl,
      },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'issue.update',
      objectType: 'Issue',
      objectId: issue.id,
      projectId: issue.projectId,
      beforeValue: issue,
      afterValue: updatedIssue,
      metadata: { changedFields: ['source', 'jiraTicketKey', 'jiraTicketUrl'] },
      changes: buildAuditFieldChanges(issue, updatedIssue, [
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
    projectId: issue.projectId,
    beforeValue: previousLink,
    afterValue: link,
    metadata: { issueId: issue.id },
    changes: buildAuditFieldChanges(previousLink ?? {}, link, ['jiraKey', 'jiraUrl']),
  });
  await emitWebhookEvent({
    eventType: 'issue.jira_link.updated',
    projectId: issue.projectId,
    payload: { issueId: issue.id, link },
  }).catch(() => undefined);
  res.status(201).json(link);
});

router.delete('/open-issues/:issueId/jira-links/:linkId', async (req, res) => {
  const link = await prisma.issueJiraLink.findUnique({
    where: { id: req.params.linkId },
  });

  if (!link || link.issueId !== req.params.issueId) {
    res.status(404).json({ error: 'Связь Jira не найдена' });
    return;
  }

  await prisma.issueJiraLink.delete({
    where: { id: link.id },
  });

  const remainingLinks = await prisma.issueJiraLink.findMany({
    where: { issueId: req.params.issueId },
    orderBy: { createdAt: 'asc' },
  });

  const beforeIssue = await prisma.issue.findUnique({
    where: { id: req.params.issueId },
  });
  const updatedIssue = await prisma.issue.update({
    where: { id: req.params.issueId },
    data: {
      source: remainingLinks.length > 0 ? 'JIRA' : 'INTERNAL',
      jiraTicketKey: remainingLinks[0]?.jiraKey ?? null,
      jiraTicketUrl: remainingLinks[0]?.jiraUrl ?? null,
    },
  });

  const issue = await prisma.issue.findUnique({
    where: { id: req.params.issueId },
    select: { projectId: true },
  });
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'issue.jira_link.delete',
    objectType: 'IssueJiraLink',
    objectId: link.id,
    projectId: issue?.projectId ?? null,
    beforeValue: link,
    metadata: { issueId: req.params.issueId },
  });
  if (beforeIssue) {
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
  }
  await emitWebhookEvent({
    eventType: 'issue.jira_link.deleted',
    projectId: issue?.projectId ?? null,
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

router.patch('/projects/:projectId/jira/analytics-dashboard', async (req, res) => {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Требуется вход в систему' });
    return;
  }
  if (user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Настраивать виджеты может только системный администратор' });
    return;
  }
  const parsed = jiraAnalyticsDashboardSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Некорректная конфигурация аналитики Jira' });
    return;
  }
  if (JSON.stringify(parsed.data.config).length > 100_000) {
    res.status(400).json({ error: 'Конфигурация аналитики Jira слишком большая' });
    return;
  }
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    select: { id: true, status: true },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }
  if (project.status === 'CLOSED') {
    res.status(423).json({ error: 'Проект закрыт и доступен только для чтения' });
    return;
  }
  const dashboardConfig = parsed.data.config as Prisma.InputJsonObject;
  let before;
  let settings;
  try {
    ({ before, settings } = await prisma.$transaction(async (transaction) => {
      await lockJiraAggregateProject(transaction, project.id);
      const referencedIds = jiraDashboardReferencedAggregateIds(parsed.data.config);
      if (referencedIds.length > 0) {
        await transaction.$queryRaw<Array<{ id: string; scope: string }>>(Prisma.sql`
            SELECT "id", "scope"
            FROM "JiraAggregateDefinition"
            WHERE "projectId" = ${project.id}
              AND "id" IN (${Prisma.join(referencedIds)})
            FOR KEY SHARE
          `);
      }
      const definitions = referencedIds.length > 0
        ? await transaction.jiraAggregateDefinition.findMany({ where: { projectId: project.id, id: { in: referencedIds } } })
        : [];
      const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
      const missingIds = referencedIds.filter((id) => !definitionsById.has(id));
      const requestedRevisions = parsed.data.config.widgets.flatMap((widget) =>
        widget.placement === 'retro' && widget.aggregateVersion
          ? [{ aggregateId: widget.aggregateId, version: widget.aggregateVersion }]
          : [],
      );
      const revisions = requestedRevisions.length > 0
        ? await transaction.jiraAggregateDefinitionRevision.findMany({
            where: { projectId: project.id, OR: requestedRevisions },
            select: { aggregateId: true, version: true, definition: true },
          })
        : [];
      const revisionKeys = new Set(revisions.map((revision) => `${revision.aggregateId}:${revision.version}`));
      const missingRevisions = parsed.data.config.widgets.flatMap((widget) => {
        if (widget.placement !== 'retro') return [];
        const version = widget.aggregateVersion ?? null;
        return version && revisionKeys.has(`${widget.aggregateId}:${version}`)
          ? []
          : [{ widgetId: widget.id, aggregateId: widget.aggregateId, version }];
      });
      const revisionsByKey = new Map(revisions.map((revision) => [
        `${revision.aggregateId}:${revision.version}`,
        revision,
      ]));
      const contractMismatches = parsed.data.config.widgets.flatMap((widget) => {
        const row = definitionsById.get(widget.aggregateId);
        if (!row) return [];
        const revision = widget.aggregateVersion && widget.aggregateVersion !== row.version
          ? revisionsByKey.get(`${widget.aggregateId}:${widget.aggregateVersion}`)
          : null;
        const dataset = revision
          ? normalizeJiraAnalyticsDatasetRevision(revision.definition)?.dataset ?? null
          : safeJiraAggregateDatasetFromRow(row);
        if (!dataset) return [{ widgetId: widget.id, aggregateId: widget.aggregateId, error: 'Ревизия агрегата недоступна' }];
        const error = jiraAnalyticsWidgetDatasetError(widget, dataset);
        return error ? [{ widgetId: widget.id, aggregateId: widget.aggregateId, error }] : [];
      });
      if (missingIds.length > 0 || missingRevisions.length > 0 || contractMismatches.length > 0) {
        throw new JiraDashboardAggregateReferenceError({ missingIds, missingRevisions, contractMismatches });
      }
      const lockedSettings = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "JiraAnalyticsSettings"
        WHERE "projectId" = ${project.id}
        FOR UPDATE
      `);
      const previous = lockedSettings[0]
        ? await transaction.jiraAnalyticsSettings.findUnique({ where: { id: lockedSettings[0].id } })
        : null;
      const previousConfig = previous?.dashboardConfig ?? null;
      const previousConfigHash = jiraDashboardConfigHash(previousConfig);
      if (previousConfigHash !== parsed.data.expectedConfigHash) {
        throw new JiraDashboardConfigConflictError(previousConfigHash);
      }
      const omittedWidgetIds = jiraDashboardOmittedV3WidgetIds(previousConfig, parsed.data.config);
      if (omittedWidgetIds.length > 0 && !parsed.data.acceptPartialMigration) {
        throw new JiraDashboardPartialMigrationError(omittedWidgetIds);
      }
      const previousRecord = previousConfig && typeof previousConfig === 'object' && !Array.isArray(previousConfig)
        ? previousConfig as Prisma.JsonObject
        : null;
      const previousVersion = previousRecord?.version === 4
        ? 4
        : previousRecord?.version === 3
          ? 3
          : previousRecord?.version === 2
            ? 2
            : 1;
      const conversion = await transaction.jiraAnalyticsDashboardConversion.findUnique({
        where: { projectId: project.id },
      });
      if (previousVersion < 3 && (!conversion || conversion.rollbackState === 'USED')) {
        const originalConfigStored = previousConfig !== null;
        const originalConfig = originalConfigStored
          ? previousConfig as Prisma.InputJsonValue
          : JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1 as Prisma.InputJsonObject;
        const conversionData = {
          originalConfig,
          originalConfigStored,
          sourceConfigHash: jiraDashboardConfigHash(previousConfig),
          originalConfigHash: jiraDashboardConfigHash(originalConfig),
          convertedConfigHash: jiraDashboardConfigHash(parsed.data.config),
          createdDefinitionIds: [] as string[],
          rollbackState: 'AVAILABLE' as const,
          convertedAt: new Date(),
          rolledBackAt: null,
          rollbackFinalizedAt: null,
        };
        if (conversion) {
          await transaction.jiraAnalyticsDashboardConversion.update({
            where: { id: conversion.id },
            data: { ...conversionData, attempt: conversion.attempt + 1 },
          });
        } else {
          await transaction.jiraAnalyticsDashboardConversion.create({
            data: { projectId: project.id, ...conversionData, attempt: 1 },
          });
        }
      }
      const next = await transaction.jiraAnalyticsSettings.upsert({
        where: { projectId: project.id },
        create: {
          projectId: project.id,
          jiraScopeType: 'LABEL',
          jiraScopeValue: '',
          dashboardConfig,
        },
        update: { dashboardConfig },
      });
      await transaction.jiraAnalyticsDashboardConversion.updateMany({
        where: { projectId: project.id, rollbackState: 'AVAILABLE' },
        data: { convertedConfigHash: jiraDashboardConfigHash(parsed.data.config) },
      });
      return { before: previous, settings: next };
    }));
  } catch (error) {
    if (error instanceof JiraDashboardAggregateReferenceError) {
      res.status(409).json({
        error: 'Конфигурация ссылается на недоступные или несовместимые агрегаты',
        ...error.details,
      });
      return;
    }
    if (error instanceof JiraDashboardConfigConflictError) {
      res.status(409).json({
        error: 'Конфигурация виджетов уже изменена другим администратором; обновите страницу',
        currentConfigHash: error.currentConfigHash,
      });
      return;
    }
    if (error instanceof JiraDashboardPartialMigrationError) {
      res.status(409).json({
        error: 'При переводе на v4 часть виджетов будет удалена; требуется явное подтверждение',
        omittedWidgetIds: error.omittedWidgetIds,
      });
      return;
    }
    throw error;
  }
  await recordAuditEvent({
    req,
    actor: user,
    action: 'jira.analytics.widgets.update',
    objectType: 'JiraAnalyticsSettings',
    objectId: settings.id,
    projectId: project.id,
    beforeValue: before,
    afterValue: settings,
  });
  res.json({ ...settings, configHash: jiraDashboardConfigHash(settings.dashboardConfig) });
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
