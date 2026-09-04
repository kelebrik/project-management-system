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
    const url = jiraDisplayUrl(configuredBaseUrl);
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

export type IssueJiraReference = {
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

export function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function calendarDelayDays(initialValue: Date | null, currentValue: Date | null) {
  if (!initialValue || !currentValue) return 0;
  const initialDate = new Date(initialValue);
  initialDate.setHours(0, 0, 0, 0);
  const currentDate = new Date(currentValue);
  currentDate.setHours(0, 0, 0, 0);
  if (Number.isNaN(initialDate.getTime()) || Number.isNaN(currentDate.getTime())) return 0;
  return Math.max(0, Math.round((currentDate.getTime() - initialDate.getTime()) / 86_400_000));
}

export function isClosedIssueStatus(status: string | undefined) {
  return status === 'Done' || status === 'Closed' || status === 'Resolved';
}

export function issueSeverityToRaidImpact(severity: string) {
  if (severity === 'CRITICAL') return 5;
  if (severity === 'HIGH') return 4;
  if (severity === 'MEDIUM') return 3;
  return 2;
}

export const issueAuditFields = [
  'phaseId',
  'workPackageId',
  'riskId',
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

export const issueInclude = {
  threadLinks: { orderBy: { createdAt: 'asc' as const } },
  jiraLinks: { orderBy: { createdAt: 'asc' as const } },
  statusUpdates: { orderBy: [{ statusAt: 'desc' as const }, { createdAt: 'desc' as const }] },
};

export async function issuePhaseExists(projectId: string, phaseId: string) {
  return prisma.wbsItem.findFirst({
    where: { id: phaseId, projectId, type: 'PHASE' },
    select: { id: true },
  });
}

export async function issueRiskExists(projectId: string, riskId: string) {
  return prisma.raidItem.findFirst({
    where: { id: riskId, projectId, type: 'RISK' },
    select: { id: true },
  });
}

export async function ensureIssueWbsWriteAccess(
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

export async function ensureIssuePhaseSelectionAccess(
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

export async function finalizeIssueWorkPackage(
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
