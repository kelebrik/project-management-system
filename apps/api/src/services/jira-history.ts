import { createHash } from 'node:crypto';

import { Prisma, type PrismaClient } from '@prisma/client';

export const JIRA_HISTORY_STORAGE_BUDGET_BYTES = 5 * 1024 ** 3;
export const JIRA_HISTORY_CRITICAL_PERCENT = 95;
export const JIRA_HISTORY_CURSOR_OVERLAP_MS = 5 * 60_000;
export const JIRA_HISTORY_FULL_RECONCILIATION_MS = 7 * 24 * 60 * 60_000;

type JiraHistoryCursorValue = {
  updatedAt: Date;
  jiraIssueId: string;
};

export type JiraHistoryRetryInput = {
  projectId: string;
  issueKey: string;
  jiraIssueId: string | null;
  reasonCode: string;
  error: unknown;
  observedUpdatedAt: Date | null;
  failedAt: Date;
};

export function redactJiraHistoryError(message: string) {
  return message
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1***@')
    .replace(/(["'](?:password|token|authorization)["']\s*:\s*["'])[^"']*(["'])/gi, '$1***$2')
    .replace(/\b(authorization)(\s*[:=]\s*)(?:(?:bearer|basic)\s+)?[^\s,;&]+/gi, '$1$2***')
    .replace(/\b(password|token)(\s*[:=]\s*)[^\s,;&]+/gi, '$1$2***')
    .replace(/\b(bearer|basic)\s+[a-z0-9._~+/=-]+/gi, '$1 ***')
    .replace(/\bATATT[a-z0-9_-]+\b/gi, '***');
}

export function jiraHistoryAdminError(reasonCode: string, message: string) {
  const redacted = redactJiraHistoryError(message);
  if (reasonCode !== 'PERSISTENCE_FAILED') return redacted.slice(0, 240);

  const unsupportedType = redacted.match(
    /failed to deserialize column of type ['"]?([a-z0-9_ ]{1,40})/i,
  );
  if (unsupportedType?.[1]) {
    return `Prisma не может прочитать тип результата PostgreSQL: ${unsupportedType[1].trim()}`;
  }
  const prismaCode = redacted.match(/\bP\d{4}\b/)?.[0];
  if (prismaCode) return `Ошибка сохранения Prisma ${prismaCode}`;
  const permissionTarget = redacted.match(/permission denied for (?:table|sequence) ["']?([a-z0-9_]+)/i)?.[1];
  if (permissionTarget) return `Нет доступа к объекту БД: ${permissionTarget}`;
  const missingTarget = redacted.match(/(?:relation|column) ["']?([a-z0-9_.]+)["']? does not exist/i)?.[1];
  if (missingTarget) return `В БД отсутствует объект: ${missingTarget}`;

  const fingerprint = createHash('sha256').update(redacted, 'utf8').digest('hex').slice(0, 12);
  return `Ошибка сохранения версии в базе данных · диагностика ${fingerprint}`;
}

function compactError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message
    .replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return redactJiraHistoryError(normalized).slice(0, 1_000)
    || 'Unknown Jira history error';
}

export function jiraHistoryRetryAt(failedAt: Date, attempts: number) {
  const delayMs = Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.min(20, attempts - 1));
  return new Date(failedAt.getTime() + delayMs);
}

export async function queueJiraHistoryRetry(
  prisma: PrismaClient,
  input: JiraHistoryRetryInput,
) {
  const issueKey = input.issueKey.trim().toUpperCase();
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.jiraIssueHistoryRetry.findUnique({
      where: {
        projectId_issueKey: {
          projectId: input.projectId,
          issueKey,
        },
      },
      select: { attempts: true, firstFailedAt: true },
    });
    const attempts = (existing?.attempts ?? 0) + 1;
    return transaction.jiraIssueHistoryRetry.upsert({
      where: {
        projectId_issueKey: {
          projectId: input.projectId,
          issueKey,
        },
      },
      create: {
        projectId: input.projectId,
        issueKey,
        jiraIssueId: input.jiraIssueId,
        reasonCode: input.reasonCode,
        lastError: compactError(input.error),
        attempts,
        firstFailedAt: input.failedAt,
        lastFailedAt: input.failedAt,
        nextRetryAt: jiraHistoryRetryAt(input.failedAt, attempts),
        lastObservedUpdatedAt: input.observedUpdatedAt,
        status: 'PENDING',
      },
      update: {
        jiraIssueId: input.jiraIssueId,
        reasonCode: input.reasonCode,
        lastError: compactError(input.error),
        attempts,
        firstFailedAt: existing?.firstFailedAt ?? input.failedAt,
        lastFailedAt: input.failedAt,
        nextRetryAt: jiraHistoryRetryAt(input.failedAt, attempts),
        lastObservedUpdatedAt: input.observedUpdatedAt,
        status: 'PENDING',
        resolvedAt: null,
      },
    });
  });
}

export async function resolveJiraHistoryRetry(
  prisma: PrismaClient,
  projectId: string,
  issueKey: string,
  resolvedAt: Date,
) {
  await prisma.jiraIssueHistoryRetry.updateMany({
    where: { projectId, issueKey: issueKey.trim().toUpperCase(), status: 'PENDING' },
    data: { status: 'RESOLVED', resolvedAt },
  });
}

export async function dueJiraHistoryRetryKeys(
  prisma: PrismaClient,
  projectId: string,
  now: Date,
) {
  const retries = await prisma.jiraIssueHistoryRetry.findMany({
    where: { projectId, status: 'PENDING', nextRetryAt: { lte: now } },
    orderBy: [{ nextRetryAt: 'asc' }, { issueKey: 'asc' }],
    select: { issueKey: true },
  });
  return retries.map((retry) => retry.issueKey);
}

export async function pendingJiraHistoryRetryKeys(
  prisma: PrismaClient,
  projectId: string,
) {
  const retries = await prisma.jiraIssueHistoryRetry.findMany({
    where: { projectId, status: 'PENDING' },
    select: { issueKey: true },
  });
  return new Set(retries.map((retry) => retry.issueKey.toUpperCase()));
}

export function jiraHistoryNeedsFullReconciliation(
  lastFullReconciledAt: Date | null | undefined,
  now: Date,
) {
  return !lastFullReconciledAt
    || now.getTime() - lastFullReconciledAt.getTime() >= JIRA_HISTORY_FULL_RECONCILIATION_MS;
}

export function jiraHistoryUpdatedSinceJql(cursorUpdatedAt: Date, now = new Date()) {
  const boundedCursorMs = Math.min(cursorUpdatedAt.getTime(), now.getTime());
  const overlapStartMs = boundedCursorMs - JIRA_HISTORY_CURSOR_OVERLAP_MS;
  const minutesAgo = Math.max(5, Math.ceil((now.getTime() - overlapStartMs) / 60_000));
  return `updated >= "-${minutesAgo}m" ORDER BY updated ASC, key ASC`;
}

function compareJiraIds(left: string, right: string) {
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    const difference = BigInt(left) - BigInt(right);
    if (difference !== 0n) return difference < 0n ? -1 : 1;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

export function latestJiraHistoryCursor(
  current: JiraHistoryCursorValue | null,
  issues: readonly { jiraId: string | null; updatedAt: Date }[],
) {
  let latest = current;
  for (const issue of issues) {
    if (!issue.jiraId) continue;
    if (
      !latest
      || issue.updatedAt > latest.updatedAt
      || (issue.updatedAt.getTime() === latest.updatedAt.getTime()
        && compareJiraIds(issue.jiraId, latest.jiraIssueId) > 0)
    ) {
      latest = { updatedAt: issue.updatedAt, jiraIssueId: issue.jiraId };
    }
  }
  return latest;
}

type StorageSizeRow = { bytes: bigint };

export async function jiraHistoryDatabaseBytes(prisma: PrismaClient) {
  const rows = await prisma.$queryRaw<StorageSizeRow[]>(Prisma.sql`
    SELECT (
      pg_total_relation_size('"JiraIssueVersion"'::regclass)
      + pg_total_relation_size('"JiraIssueHistoryRetry"'::regclass)
    )::bigint AS bytes
  `);
  return Number(rows[0]?.bytes ?? 0n);
}

export function jiraHistoryCapacityLevel(utilizationPercent: number) {
  if (utilizationPercent > 100) return 'EXCEEDED' as const;
  if (utilizationPercent >= 95) return 'CRITICAL' as const;
  if (utilizationPercent >= 85) return 'HIGH' as const;
  if (utilizationPercent >= 70) return 'WARNING' as const;
  return 'NORMAL' as const;
}

type JiraHistoryAggregateRow = {
  versions: bigint;
  tickets: bigint;
  payloadBytes: bigint;
  averageBytes: number | null;
  p95Bytes: number | null;
  incompleteHydration: bigint;
  attachmentReferencesStripped: bigint;
};

export async function jiraHistoryStatus(prisma: PrismaClient, projectId: string) {
  const [
    globalDatabaseBytes,
    globalRows,
    projectRows,
    retrySummary,
    retryItems,
    failedBatches,
    settings,
  ] = await Promise.all([
    jiraHistoryDatabaseBytes(prisma),
    prisma.$queryRaw<JiraHistoryAggregateRow[]>(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS versions,
        COUNT(DISTINCT "jiraIssueId")::bigint AS tickets,
        COALESCE(SUM("payloadBytes"), 0)::bigint AS "payloadBytes",
        AVG("payloadBytes")::float8 AS "averageBytes",
        percentile_cont(0.95) WITHIN GROUP (ORDER BY "payloadBytes")::float8 AS "p95Bytes",
        COUNT(*) FILTER (WHERE NOT (
          "changelogComplete" AND "commentsComplete" AND "worklogsComplete" AND "remoteLinksComplete"
        ))::bigint AS "incompleteHydration",
        COALESCE(SUM("attachmentReferencesStripped"), 0)::bigint AS "attachmentReferencesStripped"
      FROM "JiraIssueVersion"
    `),
    prisma.$queryRaw<JiraHistoryAggregateRow[]>(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS versions,
        COUNT(DISTINCT "jiraIssueId")::bigint AS tickets,
        COALESCE(SUM("payloadBytes"), 0)::bigint AS "payloadBytes",
        AVG("payloadBytes")::float8 AS "averageBytes",
        percentile_cont(0.95) WITHIN GROUP (ORDER BY "payloadBytes")::float8 AS "p95Bytes",
        COUNT(*) FILTER (WHERE NOT (
          "changelogComplete" AND "commentsComplete" AND "worklogsComplete" AND "remoteLinksComplete"
        ))::bigint AS "incompleteHydration",
        COALESCE(SUM("attachmentReferencesStripped"), 0)::bigint AS "attachmentReferencesStripped"
      FROM "JiraIssueVersion"
      WHERE "projectId" = ${projectId}
    `),
    prisma.jiraIssueHistoryRetry.aggregate({
      where: { projectId, status: 'PENDING' },
      _count: { _all: true },
      _min: { firstFailedAt: true, nextRetryAt: true },
    }),
    prisma.jiraIssueHistoryRetry.findMany({
      where: { projectId, status: 'PENDING' },
      orderBy: [{ firstFailedAt: 'asc' }, { issueKey: 'asc' }],
      take: 20,
      select: {
        issueKey: true,
        reasonCode: true,
        attempts: true,
        firstFailedAt: true,
        lastFailedAt: true,
        nextRetryAt: true,
        lastError: true,
      },
    }),
    prisma.jiraIssueHistoryRetry.count({
      where: {
        projectId,
        status: 'PENDING',
        reasonCode: { in: ['FETCH_BATCH_FAILED', 'FETCH_ISSUE_FAILED'] },
      },
    }),
    prisma.jiraAnalyticsSettings.findUnique({
      where: { projectId },
      select: {
        historyCursorUpdatedAt: true,
        historyCursorJiraIssueId: true,
        historyLastFullReconciledAt: true,
        historyFullCursorIssueKey: true,
        historyFullStartedAt: true,
      },
    }),
  ]);
  const global = globalRows[0];
  const project = projectRows[0];
  const utilizationPercent = globalDatabaseBytes / JIRA_HISTORY_STORAGE_BUDGET_BYTES * 100;
  const serialize = (row: JiraHistoryAggregateRow | undefined) => ({
    versions: Number(row?.versions ?? 0n),
    tickets: Number(row?.tickets ?? 0n),
    payloadBytes: Number(row?.payloadBytes ?? 0n),
    averageBytes: Math.round(row?.averageBytes ?? 0),
    p95Bytes: Math.round(row?.p95Bytes ?? 0),
    incompleteHydration: Number(row?.incompleteHydration ?? 0n),
    attachmentReferencesStripped: Number(row?.attachmentReferencesStripped ?? 0n),
  });
  return {
    reportVersion: 1 as const,
    generatedAt: new Date().toISOString(),
    storage: {
      budgetBytes: JIRA_HISTORY_STORAGE_BUDGET_BYTES,
      databaseBytes: globalDatabaseBytes,
      utilizationPercent: Math.round(utilizationPercent * 100) / 100,
      level: jiraHistoryCapacityLevel(utilizationPercent),
      newScopeBlocked: utilizationPercent >= JIRA_HISTORY_CRITICAL_PERCENT,
    },
    global: serialize(global),
    project: serialize(project),
    retry: {
      pending: retrySummary._count._all,
      failedBatches,
      oldestFailureAt: retrySummary._min.firstFailedAt?.toISOString() ?? null,
      nextRetryAt: retrySummary._min.nextRetryAt?.toISOString() ?? null,
      items: retryItems.map((retry) => ({
        issueKey: retry.issueKey,
        reasonCode: retry.reasonCode,
        attempts: retry.attempts,
        firstFailedAt: retry.firstFailedAt.toISOString(),
        lastFailedAt: retry.lastFailedAt.toISOString(),
        nextRetryAt: retry.nextRetryAt.toISOString(),
        // This endpoint is restricted to system administrators. Keep the storage
        // error visible here so a failed import can be diagnosed without DB access.
        lastError: jiraHistoryAdminError(retry.reasonCode, retry.lastError),
      })),
    },
    cursor: {
      updatedAt: settings?.historyCursorUpdatedAt?.toISOString() ?? null,
      jiraIssueId: settings?.historyCursorJiraIssueId ?? null,
      lastFullReconciledAt: settings?.historyLastFullReconciledAt?.toISOString() ?? null,
      fullCursorIssueKey: settings?.historyFullCursorIssueKey ?? null,
      fullStartedAt: settings?.historyFullStartedAt?.toISOString() ?? null,
    },
  };
}
