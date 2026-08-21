import {
  createIssueSchema,
  issueStatusUpdateSchema,
  jiraAnalyticsDashboardConfigSchema,
  updateIssueSchema,
} from '@pms/shared';
import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
  fetchJiraIssueKeysWithMeta,
  fetchJiraIssuesWithMeta,
  resolveJiraConfig,
  type JiraIssue,
} from '../jira.js';
import { currentUser } from '../server/auth.js';
import { logEvent } from '../server/logger.js';
import { buildAuditFieldChanges, recordAuditEvent } from '../services/audit.js';
import {
  createPrismaJiraAnalyticsSyncStore,
  acquireJiraAnalyticsSyncLock,
  finalizeJiraAnalyticsSync,
  jiraCriticalBugSlaSnapshotIds,
  syncJiraIssueAnalytics,
  type JiraAnalyticsSyncedSnapshot,
} from '../services/jira-analytics-sync.js';
import { sampleJiraCapacity } from '../services/jira-capacity.js';
import {
  ensureDefaultJiraWorkSections,
  jiraCriticalPriorityProjectKeys,
  jiraIssueKeyBatchDifference,
  jiraIssueKeyBatchJql,
  jiraIssueKeyBatchLossIsUnsafe,
  jiraIssueKeyBatches,
  jiraParentKeyBatchJql,
  jiraWorkSectionScopedJqls,
  normalizedJiraIssueKeys,
  resolveJiraWorkSectionJql,
} from '../services/jira-work-sections.js';
import { emitWebhookEvent } from '../services/webhooks.js';

export function createIssuesRouter() {
  const router = Router();

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
      .max(100)
      .regex(/^[^\s"'\\]+$/, 'Лейбл не должен содержать пробелы, кавычки или обратный слеш'),
  }),
  jiraSyncBaseSchema.extend({
    scopeType: z.literal('EPIC'),
    scopeValue: z
      .string()
      .trim()
      .toUpperCase()
      .max(100)
      .regex(/^[A-Z][A-Z0-9_]*-\d+$/, 'Укажите корректный код эпика Jira'),
  }),
]);

const jiraAnalyticsDashboardSchema = z.object({
  config: jiraAnalyticsDashboardConfigSchema,
});

const jiraCapacitySampleSchema = z.object({
  scopeType: z.enum(['LABEL', 'EPIC']),
  scopeValue: z.string().trim().min(1).max(100),
  sampleSize: z.number().int().min(10).max(100).default(20),
  storageBudgetGiB: z.number().positive().max(10_000).default(50),
}).superRefine((value, context) => {
  if (/[\u0000-\u001f]/.test(value.scopeValue)) {
    context.addIssue({ code: 'custom', path: ['scopeValue'], message: 'Недопустимое значение' });
  }
  if (value.scopeType === 'EPIC' && !/^[A-Z][A-Z0-9_]*-\d+$/i.test(value.scopeValue)) {
    context.addIssue({ code: 'custom', path: ['scopeValue'], message: 'Укажите код эпика, например CVTE-123' });
  }
});

const JIRA_ANALYTICS_SYNC_CONCURRENCY = 4;
const JIRA_ANALYTICS_SYNC_LOCK_MS = 5 * 60_000;
const JIRA_ANALYTICS_SYNC_DEADLINE_MS = 4 * 60_000;
const JIRA_ANALYTICS_BATCH_SIZE = 50;

async function syncJiraAnalyticsIssues(
  projectId: string,
  issues: JiraIssue[],
  syncedAt: Date,
) {
  const snapshots = new Array<JiraAnalyticsSyncedSnapshot>(issues.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < issues.length) {
      const index = nextIndex;
      nextIndex += 1;
      snapshots[index] = await prisma.$transaction((transaction) =>
        syncJiraIssueAnalytics(
          createPrismaJiraAnalyticsSyncStore(transaction, syncedAt),
          projectId,
          issues[index],
          syncedAt,
        ),
      );
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(JIRA_ANALYTICS_SYNC_CONCURRENCY, issues.length) },
      () => worker(),
    ),
  );
  return snapshots;
}

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
                snapshot: {
                  include: {
                    statusTransitions: { orderBy: { transitionedAt: 'asc' } },
                    developmentActivities: { orderBy: { activityAt: 'desc' } },
                  },
                },
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
  if (user?.role !== 'ADMIN') {
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
    select: { id: true },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }
  const before = await prisma.jiraAnalyticsSettings.findUnique({
    where: { projectId: project.id },
  });
  const dashboardConfig = parsed.data.config as Prisma.InputJsonObject;
  const settings = await prisma.jiraAnalyticsSettings.upsert({
    where: { projectId: project.id },
    create: {
      projectId: project.id,
      jiraScopeType: 'LABEL',
      jiraScopeValue: '',
      dashboardConfig,
    },
    update: { dashboardConfig },
  });
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
  res.json(settings);
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

router.post('/projects/:projectId/jira/sync', async (req, res) => {
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
  const user = currentUser(req);
  const storedScope = project.jiraAnalyticsSettings;
  const changesStoredScope =
    !storedScope ||
    storedScope.jiraScopeType !== parsedSync.data.scopeType ||
    storedScope.jiraScopeValue !== parsedSync.data.scopeValue;
  if (changesStoredScope && user?.role !== 'ADMIN') {
    res.status(403).json({
      error: 'Изменять отбор тикетов Jira может только системный администратор',
    });
    return;
  }

  const lockStartedAt = new Date();
  const lockExpiresAt = new Date(lockStartedAt.getTime() + JIRA_ANALYTICS_SYNC_LOCK_MS);
  const lockAcquired = await acquireJiraAnalyticsSyncLock(
    prisma.jiraAnalyticsSettings,
    project.id,
    {
      type: parsedSync.data.scopeType,
      value: parsedSync.data.scopeValue,
    },
    lockStartedAt,
    lockExpiresAt,
  );
  if (!lockAcquired) {
    res.status(409).json({ error: 'Обновление Jira для этого проекта уже выполняется' });
    return;
  }

  let finalSyncStatus = 'ERROR';
  let finalSyncedAt: Date | null = null;
  try {
    const workSections = await ensureDefaultJiraWorkSections(project.id);
    const configuredSections = workSections.filter((section) =>
      resolveJiraWorkSectionJql(section.jql, section.filterUrl));
    const syncedAt = new Date();
    const deadlineAt = Date.now() + JIRA_ANALYTICS_SYNC_DEADLINE_MS;
    const syncedIssueKeys = new Set<string>();
    const snapshotIdByIssueKey = new Map<string, string>();
    const trackedSnapshotIds: string[] = [];
    const incompleteChangelogKeys: string[] = [];
    const jiraUsers = new Set<string>();
    const remoteDevelopmentCache = new Map<string, JiraIssue['development']>();
    let criticalBugSlaCandidates = 0;

    const discovery = await fetchJiraIssueKeysWithMeta('ORDER BY key ASC', {
      baseUrl: parsedSync.data.baseUrl,
      fetchAllPages: true,
      analyticsScope: {
        type: parsedSync.data.scopeType,
        value: parsedSync.data.scopeValue,
      },
      pageSize: 500,
      deadlineAt,
    });
    if (discovery.jiraUser) jiraUsers.add(discovery.jiraUser);
    let discoveredIssueKeys = normalizedJiraIssueKeys(discovery.issueKeys);
    if (parsedSync.data.scopeType === 'EPIC' && discoveredIssueKeys.length > 0) {
      const subtaskIssueKeys: string[] = [];
      for (const parentIssueKeys of jiraIssueKeyBatches(
        discoveredIssueKeys,
        JIRA_ANALYTICS_BATCH_SIZE,
      )) {
        const subtasks = await fetchJiraIssueKeysWithMeta(
          jiraParentKeyBatchJql(parentIssueKeys),
          {
            baseUrl: parsedSync.data.baseUrl,
            fetchAllPages: true,
            pageSize: 500,
            deadlineAt,
          },
        );
        if (subtasks.jiraUser) jiraUsers.add(subtasks.jiraUser);
        subtaskIssueKeys.push(...subtasks.issueKeys);
      }
      discoveredIssueKeys = normalizedJiraIssueKeys([
        ...discoveredIssueKeys,
        ...subtaskIssueKeys,
      ]);
    }
    const criticalBugSlaProjectKeys = jiraCriticalPriorityProjectKeys('', discoveredIssueKeys);
    const criticalBugSlaConfigured = true;

    if (discoveredIssueKeys.length === 0) {
      finalSyncStatus = 'EMPTY';
      res.json({
        synced: 0,
        emptyScope: true,
        jiraScopeType: parsedSync.data.scopeType,
        jiraScopeValue: parsedSync.data.scopeValue,
        criticalBugSlaConfigured,
        criticalBugSlaScope: parsedSync.data.scopeType.toLowerCase(),
        criticalBugSlaProjectKeys,
        criticalBugSlaCandidates: 0,
        criticalBugSlaIssues: 0,
        configuredSections: configuredSections.length,
        totalSections: workSections.length,
        jiraUsers: [...jiraUsers],
        sections: [],
        warning: parsedSync.data.scopeType === 'LABEL'
          ? 'По указанному лейблу тикеты не найдены; прежние данные сохранены'
          : 'По указанному коду эпика тикеты не найдены; прежние данные сохранены',
      });
      return;
    }

    const configuredPageSize = resolveJiraConfig(process.env, {
      baseUrl: parsedSync.data.baseUrl,
    }).maxResults;
    const batches = jiraIssueKeyBatches(
      discoveredIssueKeys,
      Math.min(JIRA_ANALYTICS_BATCH_SIZE, configuredPageSize),
    );
    for (const issueKeys of batches) {
      const jiraResult = await fetchJiraIssuesWithMeta(jiraIssueKeyBatchJql(issueKeys), {
        baseUrl: parsedSync.data.baseUrl,
        fetchAllPages: true,
        includeAnalyticsFields: true,
        includeChangelog: true,
        includeRemoteDevelopment: true,
        remoteDevelopmentCache,
        deadlineAt,
      });
      if (jiraResult.jiraUser) jiraUsers.add(jiraResult.jiraUser);
      const { missingKeys, unexpectedKeys } = jiraIssueKeyBatchDifference(
        issueKeys,
        jiraResult.issues.map((issue) => issue.key),
      );
      if (unexpectedKeys.length > 0) {
        throw new Error(`Jira вернула незапрошенные тикеты: ${unexpectedKeys.join(', ')}`);
      }
      if (jiraIssueKeyBatchLossIsUnsafe(issueKeys.length, missingKeys.length)) {
        throw new Error(
          `Jira не вернула слишком много запрошенных тикетов: ${missingKeys.join(', ')}`,
        );
      }
      if (missingKeys.length > 0) {
        logEvent('warn', 'jira.sync.batch_keys_missing', {
          projectId: project.id,
          missingKeys,
        });
      }
      for (const issue of jiraResult.issues) {
        syncedIssueKeys.add(issue.key.toUpperCase());
        if (issue.criticalPriorityAt) criticalBugSlaCandidates += 1;
        if (!issue.transitionHistoryComplete) incompleteChangelogKeys.push(issue.key);
      }
      const snapshots = await syncJiraAnalyticsIssues(project.id, jiraResult.issues, syncedAt);
      jiraResult.issues.forEach((issue, index) => {
        const snapshot = snapshots[index];
        if (snapshot) snapshotIdByIssueKey.set(issue.key.toUpperCase(), snapshot.id);
      });
      trackedSnapshotIds.push(...jiraCriticalBugSlaSnapshotIds(snapshots));
    }

    if (snapshotIdByIssueKey.size === 0) {
      throw new Error('Jira не вернула данные ни для одного найденного тикета');
    }
    if (incompleteChangelogKeys.length > 0) {
      throw new Error(
        `Jira вернула неполную историю изменений: ${incompleteChangelogKeys.slice(0, 20).join(', ')}`,
      );
    }

    const sectionStats: Array<{
      id: string;
      title: string;
      sortOrder: number;
      issues: number;
      jiraUser: string | null;
      issueKeys: string[];
    }> = [];
    for (const section of workSections) {
      const jiraQuery = resolveJiraWorkSectionJql(section.jql, section.filterUrl);
      if (!jiraQuery) {
        sectionStats.push({
          id: section.id,
          title: section.title,
          sortOrder: section.sortOrder,
          issues: 0,
          jiraUser: null,
          issueKeys: [],
        });
        continue;
      }
      const sectionIssueKeys: string[] = [];
      let sectionJiraUser: string | null = null;
      for (const scopedJql of jiraWorkSectionScopedJqls(
        jiraQuery,
        [...snapshotIdByIssueKey.keys()],
        JIRA_ANALYTICS_BATCH_SIZE,
      )) {
        const jiraResult = await fetchJiraIssueKeysWithMeta(scopedJql, {
          baseUrl: parsedSync.data.baseUrl,
          fetchAllPages: true,
          pageSize: 500,
          deadlineAt,
        });
        if (jiraResult.jiraUser) {
          sectionJiraUser = jiraResult.jiraUser;
          jiraUsers.add(jiraResult.jiraUser);
        }
        sectionIssueKeys.push(...jiraResult.issueKeys);
      }
      const issueKeys = normalizedJiraIssueKeys(sectionIssueKeys)
        .filter((issueKey) => snapshotIdByIssueKey.has(issueKey));
      sectionStats.push({
        id: section.id,
        title: section.title,
        sortOrder: section.sortOrder,
        issues: issueKeys.length,
        jiraUser: sectionJiraUser,
        issueKeys,
      });
    }

    await prisma.$transaction(async (transaction) => {
      await finalizeJiraAnalyticsSync(
        transaction,
        project.id,
        syncedAt,
        sectionStats.map((section) => ({
          sectionId: section.id,
          issueKeys: section.issueKeys,
        })),
        snapshotIdByIssueKey,
        trackedSnapshotIds,
      );
    }, { maxWait: 10_000, timeout: 60_000 });

    finalSyncStatus = 'OK';
    finalSyncedAt = syncedAt;
    const publicSectionStats = sectionStats.map(({ issueKeys: _issueKeys, ...section }) => section);
    logEvent('info', 'jira.sync.completed', {
      projectId: project.id,
      baseUrl: parsedSync.data.baseUrl ?? 'env',
      jiraScopeType: parsedSync.data.scopeType,
      jiraScopeValue: parsedSync.data.scopeValue,
      configuredSections: configuredSections.length,
      syncedIssues: syncedIssueKeys.size,
      criticalBugSlaConfigured,
      criticalBugSlaScope: parsedSync.data.scopeType.toLowerCase(),
      criticalBugSlaProjectKeys,
      criticalBugSlaCandidates,
      criticalBugSlaIssues: trackedSnapshotIds.length,
      sections: publicSectionStats,
    });

    res.json({
      synced: syncedIssueKeys.size,
      jiraScopeType: parsedSync.data.scopeType,
      jiraScopeValue: parsedSync.data.scopeValue,
      criticalBugSlaConfigured,
      criticalBugSlaScope: parsedSync.data.scopeType.toLowerCase(),
      criticalBugSlaProjectKeys,
      criticalBugSlaCandidates,
      criticalBugSlaIssues: trackedSnapshotIds.length,
      configuredSections: configuredSections.length,
      totalSections: workSections.length,
      jiraUsers: [...jiraUsers],
      sections: publicSectionStats,
    });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Не удалось синхронизировать Jira',
    });
  } finally {
    await prisma.jiraAnalyticsSettings.updateMany({
      where: { projectId: project.id, syncStartedAt: lockStartedAt },
      data: {
        syncStatus: finalSyncStatus,
        lastSyncedAt: finalSyncedAt ?? undefined,
        syncStartedAt: null,
        syncLockExpiresAt: null,
      },
    });
  }
});

  return router;
}
