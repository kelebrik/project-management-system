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
  calendarDelayDays,
  ensureIssuePhaseSelectionAccess,
  ensureIssueWbsWriteAccess,
  finalizeIssueWorkPackage,
  isClosedIssueStatus,
  issueAuditFields,
  issueInclude,
  issuePhaseExists,
  issueRiskExists,
  issueSeverityToRaidImpact,
  issueJiraUrlForKey,
  isValidHttpUrl,
  normalizeIssueJiraKey,
} from './issues-route-support.js';

export function registerOpenIssueRoutes(router: Router) {
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
  const riskId = parsed.data.riskId?.trim() || null;
  if (phaseId && !(await issuePhaseExists(project.id, phaseId))) {
    res.status(400).json({ error: 'Выбранная фаза не найдена в Структуре проекта' });
    return;
  }
  if (riskId && !(await issueRiskExists(project.id, riskId))) {
    res.status(400).json({ error: 'Выбранный риск не найден в реестре проекта' });
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
            riskId,
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
            threadLinks: referenceUrl
              ? { create: { threadUrl: referenceUrl } }
              : undefined,
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
        if (parsed.data.riskId) {
          const risk = await tx.raidItem.findFirst({
            where: {
              id: parsed.data.riskId,
              projectId: currentIssue.projectId,
              type: 'RISK',
            },
            select: { id: true },
          });
          if (!risk) {
            res.status(400).json({ error: 'Выбранный риск не найден в реестре проекта' });
            return null;
          }
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
}
