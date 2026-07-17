import { createIssueSchema, issueStatusUpdateSchema, updateIssueSchema } from '@pms/shared';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { fetchJiraIssuesWithMeta } from '../jira.js';
import { logEvent } from '../server/logger.js';
import {
  ensureDefaultJiraWorkSections,
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

const jiraSyncSchema = z.object({
  baseUrl: z
    .enum(['https://tasks.dev.sberdevices.ru', 'https://tasks.sberdevices.ru'])
    .optional(),
});

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
              include: { snapshot: true },
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
    await prisma.issue.update({
      where: { id: issue.id },
      data: {
        source: 'JIRA',
        jiraTicketKey: parsed.data.jiraKey,
        jiraTicketUrl: parsed.data.jiraUrl,
      },
    });
  }

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

  await prisma.issue.update({
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

router.post('/projects/:projectId/jira/sync', async (req, res) => {
  const parsedSync = jiraSyncSchema.safeParse(req.body ?? {});
  if (!parsedSync.success) {
    res.status(400).json({ error: parsedSync.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    include: {
      jiraIntegration: true,
    },
  });

  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  try {
    const workSections = await ensureDefaultJiraWorkSections(project.id);
    const sectionsWithFilter = workSections
      .map((section) => ({
        ...section,
        jiraQuery: resolveJiraWorkSectionJql(section.jql, section.filterUrl),
      }))
      .filter((section) => section.jiraQuery);
    const syncedAt = new Date();
    let syncedIssues = 0;
    const sectionStats: Array<{
      id: string;
      title: string;
      sortOrder: number;
      issues: number;
      jiraUser: string | null;
    }> = [];

    for (const section of sectionsWithFilter) {
      const jiraResult = await fetchJiraIssuesWithMeta(section.jiraQuery, {
        baseUrl: parsedSync.data.baseUrl,
      });
      const issues = jiraResult.issues;
      syncedIssues += issues.length;
      sectionStats.push({
        id: section.id,
        title: section.title,
        sortOrder: section.sortOrder,
        issues: issues.length,
        jiraUser: jiraResult.jiraUser,
      });
      await prisma.jiraWorkSectionIssue.deleteMany({
        where: { sectionId: section.id },
      });
      const snapshots = await Promise.all(
        issues.map((issue) =>
          prisma.jiraIssueSnapshot.upsert({
            where: {
              projectId_issueKey: {
                projectId: project.id,
                issueKey: issue.key,
              },
            },
            update: {
              issueUrl: issue.url,
              summary: issue.summary,
              status: issue.status,
              priority: issue.priority,
              assignee: issue.assignee,
              reporter: issue.reporter,
              issueType: issue.issueType,
              resolution: issue.resolution,
              sprint: issue.sprint,
              updatedAt: issue.updatedAt,
              syncedAt,
            },
            create: {
              projectId: project.id,
              issueKey: issue.key,
              issueUrl: issue.url,
              summary: issue.summary,
              status: issue.status,
              priority: issue.priority,
              assignee: issue.assignee,
              reporter: issue.reporter,
              issueType: issue.issueType,
              resolution: issue.resolution,
              sprint: issue.sprint,
              updatedAt: issue.updatedAt,
              syncedAt,
            },
          }),
        ),
      );
      if (snapshots.length > 0) {
        await prisma.jiraWorkSectionIssue.createMany({
          data: snapshots.map((snapshot) => ({
            sectionId: section.id,
            snapshotId: snapshot.id,
            syncedAt,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (project.jiraIntegration) {
      await prisma.jiraIntegration.update({
        where: { id: project.jiraIntegration.id },
        data: { syncStatus: 'OK', lastSyncedAt: syncedAt },
      });
    }

    logEvent('info', 'jira.sync.completed', {
      projectId: project.id,
      baseUrl: parsedSync.data.baseUrl ?? 'env',
      configuredSections: sectionsWithFilter.length,
      syncedIssues,
      sections: sectionStats,
    });

    res.json({
      synced: syncedIssues,
      configuredSections: sectionsWithFilter.length,
      totalSections: workSections.length,
      jiraUsers: Array.from(
        new Set(sectionStats.map((section) => section.jiraUser).filter(Boolean)),
      ),
      sections: sectionStats,
    });
  } catch (error) {
    if (project.jiraIntegration) {
      await prisma.jiraIntegration.update({
        where: { id: project.jiraIntegration.id },
        data: { syncStatus: 'ERROR' },
      });
    }
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Не удалось синхронизировать Jira',
    });
  }
});

  return router;
}
