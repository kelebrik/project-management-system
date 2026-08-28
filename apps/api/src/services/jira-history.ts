import { createHash } from 'node:crypto';

import { Prisma, type PrismaClient } from '@prisma/client';

export const JIRA_HISTORY_STORAGE_BUDGET_BYTES = 5 * 1024 ** 3;
export const JIRA_HISTORY_CRITICAL_PERCENT = 95;
export const JIRA_HISTORY_CURSOR_OVERLAP_MS = 5 * 60_000;
export const JIRA_HISTORY_FULL_RECONCILIATION_MS = 7 * 24 * 60 * 60_000;

export function jiraHistoryStorageBudgetBytes(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number(env.JIRA_HISTORY_BUDGET_BYTES);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : JIRA_HISTORY_STORAGE_BUDGET_BYTES;
}

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
  return prisma.$transaction((transaction) => queueJiraHistoryRetryInTransaction(transaction, input));
}

export async function queueJiraHistoryRetryInTransaction(
  transaction: Prisma.TransactionClient,
  input: JiraHistoryRetryInput,
) {
    const issueKey = input.issueKey.trim().toUpperCase();
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
}

export async function resolveJiraHistoryRetry(
  prisma: Pick<PrismaClient, 'jiraIssueHistoryRetry'>,
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
      + pg_total_relation_size('"JiraIssueLabelChange"'::regclass)
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
    unversionedProjections,
    historyWriteGaps,
    globalLabelChanges,
    projectLabelChanges,
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
    prisma.jiraIssueSnapshot.count({
      where: { projectId, retiredAt: null, projectionUnversionedSince: { not: null } },
    }),
    prisma.jiraSyncRun.aggregate({
      where: { projectId, historyWriteEnabled: false, startedAt: { not: null } },
      _count: { _all: true },
      _min: { startedAt: true },
      _max: { finishedAt: true },
    }),
    prisma.jiraIssueLabelChange.count(),
    prisma.jiraIssueLabelChange.count({ where: { snapshot: { projectId } } }),
  ]);
  const global = globalRows[0];
  const project = projectRows[0];
  const storageBudgetBytes = jiraHistoryStorageBudgetBytes();
  const utilizationPercent = globalDatabaseBytes / storageBudgetBytes * 100;
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
      budgetBytes: storageBudgetBytes,
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
    historyWrite: {
      enabled: jiraHistoryWriteEnabledForStatus(),
      gapRuns: historyWriteGaps._count._all,
      gapFirstAt: historyWriteGaps._min.startedAt?.toISOString() ?? null,
      gapLastAt: historyWriteGaps._max.finishedAt?.toISOString() ?? null,
    },
    projections: {
      unversioned: unversionedProjections,
    },
    labelChanges: {
      global: globalLabelChanges,
      project: projectLabelChanges,
    },
  };
}

type JiraCompletenessAggregateRow = {
  scopedTickets: bigint;
  stableIdTickets: bigint;
  observedTickets: bigint;
  fullyHydratedTickets: bigint;
  versions: bigint;
  firstObservedAt: Date | null;
  lastObservedAt: Date | null;
  versionsMin: number | null;
  versionsMax: number | null;
  versionsAverage: number | null;
  versionsP95: number | null;
  bucket0: bigint;
  bucket1: bigint;
  bucket2To5: bigint;
  bucket6To20: bigint;
  bucket21To100: bigint;
  bucketOver100: bigint;
};

export async function jiraBackfillCompleteness(
  prisma: PrismaClient,
  projectId: string,
  options: { section?: 'tickets' | 'missing'; offset?: number; pageSize?: number } = {},
) {
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 50));
  const offset = Math.max(0, options.offset ?? 0);
  if (offset + pageSize > 10_000) {
    const error = new Error('Окно выгрузки полноты Jira превышает 10000 строк') as Error & {
      status?: number;
      kind?: string;
      limit?: number;
    };
    error.status = 413;
    error.kind = 'JIRA_BACKFILL_COMPLETENESS';
    error.limit = 10_000;
    throw error;
  }

  const [rows, retries, retryReasons, gaps, latestBackfill, unversioned] = await Promise.all([
    prisma.$queryRaw<JiraCompletenessAggregateRow[]>(Prisma.sql`
      WITH per_ticket AS (
        SELECT s."id", s."jiraId", s."currentVersionId", s."projectionUnversionedSince",
               COUNT(v."id")::integer AS versions,
               BOOL_OR(v."id" = s."currentVersionId"
                 AND v."changelogComplete" AND v."commentsComplete"
                 AND v."worklogsComplete" AND v."remoteLinksComplete") AS hydrated,
               MIN(v."observedAt") AS first_observed,
               MAX(v."observedAt") AS last_observed
          FROM "JiraIssueSnapshot" s
          LEFT JOIN "JiraIssueVersion" v ON v."snapshotId" = s."id"
         WHERE s."projectId" = ${projectId} AND s."retiredAt" IS NULL
         GROUP BY s."id", s."jiraId", s."currentVersionId", s."projectionUnversionedSince"
      )
      SELECT COUNT(*)::bigint AS "scopedTickets",
             COUNT(*) FILTER (WHERE "jiraId" IS NOT NULL)::bigint AS "stableIdTickets",
             COUNT(*) FILTER (WHERE "currentVersionId" IS NOT NULL
               AND "projectionUnversionedSince" IS NULL)::bigint AS "observedTickets",
             COUNT(*) FILTER (WHERE hydrated
               AND "projectionUnversionedSince" IS NULL)::bigint AS "fullyHydratedTickets",
             COALESCE(SUM(versions), 0)::bigint AS versions,
             MIN(first_observed) AS "firstObservedAt",
             MAX(last_observed) AS "lastObservedAt",
             MIN(versions)::integer AS "versionsMin",
             MAX(versions)::integer AS "versionsMax",
             AVG(versions)::float8 AS "versionsAverage",
             percentile_cont(0.95) WITHIN GROUP (ORDER BY versions)::float8 AS "versionsP95",
             COUNT(*) FILTER (WHERE versions = 0)::bigint AS bucket0,
             COUNT(*) FILTER (WHERE versions = 1)::bigint AS bucket1,
             COUNT(*) FILTER (WHERE versions BETWEEN 2 AND 5)::bigint AS "bucket2To5",
             COUNT(*) FILTER (WHERE versions BETWEEN 6 AND 20)::bigint AS "bucket6To20",
             COUNT(*) FILTER (WHERE versions BETWEEN 21 AND 100)::bigint AS "bucket21To100",
             COUNT(*) FILTER (WHERE versions > 100)::bigint AS "bucketOver100"
        FROM per_ticket
    `),
    prisma.jiraIssueHistoryRetry.count({ where: { projectId, status: 'PENDING' } }),
    prisma.jiraIssueHistoryRetry.groupBy({
      by: ['reasonCode'],
      where: { projectId, status: 'PENDING' },
      _count: { _all: true },
      orderBy: { reasonCode: 'asc' },
    }),
    prisma.jiraSyncRun.aggregate({
      where: { projectId, historyWriteEnabled: false, startedAt: { not: null } },
      _count: { _all: true },
      _min: { startedAt: true },
      _max: { finishedAt: true },
    }),
    prisma.jiraSyncRun.findFirst({
      where: { projectId, kind: 'BACKFILL' },
      orderBy: { enqueuedAt: 'desc' },
      select: {
        id: true,
        status: true,
        enqueuedAt: true,
        startedAt: true,
        finishedAt: true,
        elapsedMs: true,
        discoveredIssueCount: true,
        hydratedIssueCount: true,
        versionsCreated: true,
        retriesQueued: true,
        jiraRequestCount: true,
        jiraRequestDurationMsTotal: true,
      },
    }),
    prisma.jiraIssueSnapshot.count({
      where: { projectId, retiredAt: null, projectionUnversionedSince: { not: null } },
    }),
  ]);
  const row = rows[0];
  const denominator = Number(row?.stableIdTickets ?? 0n);
  const observed = Number(row?.observedTickets ?? 0n);
  const where = {
    projectId,
    retiredAt: null,
    ...(options.section === 'missing' ? {
      OR: [
        { jiraId: null },
        { currentVersionId: null },
        { projectionUnversionedSince: { not: null } },
      ],
    } : {}),
  } as const;
  const [items, total] = await Promise.all([
    prisma.jiraIssueSnapshot.findMany({
      where,
      orderBy: { issueKey: 'asc' },
      skip: offset,
      take: pageSize,
      select: {
        issueKey: true,
        jiraId: true,
        currentVersionId: true,
        projectionUnversionedSince: true,
        _count: { select: { versions: true } },
      },
    }),
    prisma.jiraIssueSnapshot.count({ where }),
  ]);
  return {
    reportVersion: 1 as const,
    generatedAt: new Date().toISOString(),
    historyWriteEnabled: jiraHistoryWriteEnabledForStatus(),
    scope: {
      tickets: Number(row?.scopedTickets ?? 0n),
      stableJiraId: denominator,
      withoutStableJiraId: Number(row?.scopedTickets ?? 0n) - denominator,
      observed,
      withoutObservedVersion: Math.max(0, denominator - observed),
      fullyHydrated: Number(row?.fullyHydratedTickets ?? 0n),
      coveragePercent: denominator === 0 ? null : Math.round(observed / denominator * 10_000) / 100,
      unversionedProjection: unversioned,
    },
    versions: {
      total: Number(row?.versions ?? 0n),
      firstObservedAt: row?.firstObservedAt?.toISOString() ?? null,
      lastObservedAt: row?.lastObservedAt?.toISOString() ?? null,
      perTicket: {
        min: row?.versionsMin ?? 0,
        max: row?.versionsMax ?? 0,
        average: Math.round((row?.versionsAverage ?? 0) * 100) / 100,
        p95: Math.round((row?.versionsP95 ?? 0) * 100) / 100,
        buckets: {
          '0': Number(row?.bucket0 ?? 0n),
          '1': Number(row?.bucket1 ?? 0n),
          '2-5': Number(row?.bucket2To5 ?? 0n),
          '6-20': Number(row?.bucket6To20 ?? 0n),
          '21-100': Number(row?.bucket21To100 ?? 0n),
          '>100': Number(row?.bucketOver100 ?? 0n),
        },
      },
    },
    retry: {
      pending: retries,
      byReason: retryReasons.map((entry) => ({
        reasonCode: entry.reasonCode,
        count: entry._count._all,
      })),
    },
    historyWriteGap: {
      runs: gaps._count._all,
      firstAt: gaps._min.startedAt?.toISOString() ?? null,
      lastAt: gaps._max.finishedAt?.toISOString() ?? null,
    },
    latestBackfill: latestBackfill ? {
      ...latestBackfill,
      enqueuedAt: latestBackfill.enqueuedAt.toISOString(),
      startedAt: latestBackfill.startedAt?.toISOString() ?? null,
      finishedAt: latestBackfill.finishedAt?.toISOString() ?? null,
    } : null,
    page: {
      section: options.section ?? 'tickets',
      offset,
      pageSize,
      total,
      items: items.map((item) => ({
        issueKey: item.issueKey,
        stableJiraId: Boolean(item.jiraId),
        observedVersion: Boolean(item.currentVersionId && !item.projectionUnversionedSince),
        versions: item._count.versions,
        projectionUnversionedSince: item.projectionUnversionedSince?.toISOString() ?? null,
      })),
    },
    limitations: [
      'Backfill сохраняет доступное текущее наблюдение и историю Jira, но не создаёт прошлые полные снимки задним числом.',
      'Полнота прошлых состояний ограничена данными, которые Jira возвращает через changelog, comments и worklogs.',
    ],
  };
}

function jiraHistoryWriteEnabledForStatus(env: NodeJS.ProcessEnv = process.env) {
  return env.JIRA_HISTORY_WRITE_ENABLED !== 'false';
}
