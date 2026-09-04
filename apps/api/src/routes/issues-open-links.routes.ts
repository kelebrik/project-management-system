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
  isValidHttpUrl,
  issueInclude,
  issueJiraStateAfterLinkDeletion,
  issueJiraUrlForKey,
  normalizeIssueJiraKey,
} from './issues-route-support.js';

export function registerOpenIssueLinkRoutes(router: Router) {
const issueThreadLinkSchema = z.object({
  threadUrl: z.string().trim().min(1).refine(isValidHttpUrl, {
    message: 'URL трэда должен использовать http или https',
  }),
});

router.post('/open-issues/:issueId/thread-links', async (req, res) => {
  const parsed = issueThreadLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const issue = await prisma.issue.findUnique({ where: { id: req.params.issueId } });
  if (!issue) {
    res.status(404).json({ error: 'Открытый вопрос не найден' });
    return;
  }
  const previousLink = await prisma.issueThreadLink.findUnique({
    where: {
      issueId_threadUrl: {
        issueId: issue.id,
        threadUrl: parsed.data.threadUrl,
      },
    },
  });
  const link = await prisma.issueThreadLink.upsert({
    where: {
      issueId_threadUrl: {
        issueId: issue.id,
        threadUrl: parsed.data.threadUrl,
      },
    },
    create: { issueId: issue.id, threadUrl: parsed.data.threadUrl },
    update: {},
  });
  if (!issue.referenceUrl) {
    await prisma.issue.update({
      where: { id: issue.id },
      data: { referenceUrl: link.threadUrl },
    });
  }
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: previousLink ? 'issue.thread_link.update' : 'issue.thread_link.create',
    objectType: 'IssueThreadLink',
    objectId: link.id,
    projectId: issue.projectId,
    beforeValue: previousLink,
    afterValue: link,
    metadata: { issueId: issue.id },
    changes: buildAuditFieldChanges(previousLink ?? {}, link, ['threadUrl']),
  });
  res.status(201).json(link);
});

router.patch('/open-issues/:issueId/thread-links/:linkId', async (req, res) => {
  const parsed = issueThreadLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "Issue" WHERE "id" = ${req.params.issueId} FOR UPDATE
      `);
      const [beforeLink, issue] = await Promise.all([
        tx.issueThreadLink.findUnique({ where: { id: req.params.linkId } }),
        tx.issue.findUnique({ where: { id: req.params.issueId } }),
      ]);
      if (!beforeLink || beforeLink.issueId !== req.params.issueId || !issue) return null;
      const link = await tx.issueThreadLink.update({
        where: { id: beforeLink.id },
        data: { threadUrl: parsed.data.threadUrl },
      });
      if (issue.referenceUrl === beforeLink.threadUrl) {
        await tx.issue.update({
          where: { id: issue.id },
          data: { referenceUrl: link.threadUrl },
        });
      }
      return { beforeLink, issue, link };
    });
    if (!result) {
      res.status(404).json({ error: 'Ссылка на трэд не найдена' });
      return;
    }
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'issue.thread_link.update',
      objectType: 'IssueThreadLink',
      objectId: result.link.id,
      projectId: result.issue.projectId,
      beforeValue: result.beforeLink,
      afterValue: result.link,
      metadata: { issueId: result.issue.id },
      changes: buildAuditFieldChanges(result.beforeLink, result.link, ['threadUrl']),
    });
    res.json(result.link);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Этот трэд уже связан с вопросом' });
      return;
    }
    throw error;
  }
});

router.delete('/open-issues/:issueId/thread-links/:linkId', async (req, res) => {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "Issue" WHERE "id" = ${req.params.issueId} FOR UPDATE
    `);
    const [link, issue] = await Promise.all([
      tx.issueThreadLink.findUnique({ where: { id: req.params.linkId } }),
      tx.issue.findUnique({ where: { id: req.params.issueId } }),
    ]);
    if (!link || link.issueId !== req.params.issueId || !issue) return null;
    await tx.issueThreadLink.delete({ where: { id: link.id } });
    if (issue.referenceUrl === link.threadUrl) {
      const replacement = await tx.issueThreadLink.findFirst({
        where: { issueId: issue.id },
        orderBy: { createdAt: 'asc' },
      });
      await tx.issue.update({
        where: { id: issue.id },
        data: { referenceUrl: replacement?.threadUrl ?? null },
      });
    }
    return { link, issue };
  });
  if (!result) {
    res.status(404).json({ error: 'Ссылка на трэд не найдена' });
    return;
  }
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'issue.thread_link.delete',
    objectType: 'IssueThreadLink',
    objectId: result.link.id,
    projectId: result.issue.projectId,
    beforeValue: result.link,
    metadata: { issueId: result.issue.id },
    changes: buildAuditFieldChanges(result.link, {}, ['threadUrl']),
  });
  res.status(204).send();
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
  if (jiraBaseUrl && parsed.data.jiraTicketUrl && !jiraUrlMatchesConfiguredBase(parsed.data.jiraTicketUrl, jiraBaseUrl)) {
    res.status(400).json({ error: `URL Jira должен начинаться с ${jiraBaseUrl}` });
    return;
  }

  const updated = await prisma.task.update({
    where: { id: req.params.taskId },
    data: parsed.data,
  });

  res.json(updated);
});
}
