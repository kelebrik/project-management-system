import {
  JiraSyncRunKind,
  JiraSyncRunStatus,
  Prisma,
  type PrismaClient,
} from '@prisma/client';

import { redactJiraHistoryError } from './jira-history.js';
import { JiraSyncDeadlineError } from '../jira.js';
import { lockJiraProjectData } from './jira-project-data.js';

export { JiraSyncDeadlineError } from '../jira.js';

export const JIRA_SYNC_POLL_AFTER_MS = 3_000;
export const JIRA_SYNC_LEASE_MS = positiveEnvInt('JIRA_SYNC_LEASE_MS', 60_000);
export const JIRA_SYNC_HEARTBEAT_MS = Math.min(
  positiveEnvInt('JIRA_SYNC_HEARTBEAT_MS', 10_000),
  Math.floor(JIRA_SYNC_LEASE_MS / 3),
);
export const JIRA_SYNC_ATTEMPT_DEADLINE_MS = positiveEnvInt(
  'JIRA_SYNC_ATTEMPT_DEADLINE_MS',
  15 * 60_000,
);
export const JIRA_SYNC_MAX_ATTEMPTS = positiveEnvInt('JIRA_SYNC_MAX_ATTEMPTS', 3);
export const JIRA_SYNC_RUN_MAX_WALL_MS = positiveEnvInt(
  'JIRA_SYNC_RUN_MAX_WALL_MS',
  2 * 60 * 60_000,
);

const TERMINAL_STATUSES = new Set<JiraSyncRunStatus>([
  JiraSyncRunStatus.SUCCEEDED,
  JiraSyncRunStatus.SUCCEEDED_WITH_RETRIES,
  JiraSyncRunStatus.STOPPED_CAPACITY,
  JiraSyncRunStatus.FAILED,
  JiraSyncRunStatus.CANCELLED,
]);

function positiveEnvInt(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function jiraHistoryWriteEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.JIRA_HISTORY_WRITE_ENABLED !== 'false';
}

export type JiraSyncFence = {
  runId: string;
  projectId: string;
  fenceToken: number;
};

export type JiraProjectionRebuildFence = {
  projectId: string;
  fenceToken: number;
};

export class JiraSyncFencedError extends Error {
  override name = 'JiraSyncFencedError';

  constructor() {
    super('Jira sync worker lost its lease');
  }
}

export class JiraSyncCapacityError extends Error {
  override name = 'JiraSyncCapacityError';
}

export async function acquireJiraProjectionRebuildLease(
  prisma: PrismaClient,
  projectId: string,
): Promise<JiraProjectionRebuildFence | null> {
  return prisma.$transaction(async (transaction) => {
    await lockJiraProjectData(transaction, projectId);
    const rows = await transaction.$queryRaw<Array<{ syncFenceToken: number }>>(Prisma.sql`
      UPDATE "JiraAnalyticsSettings" s
         SET "syncStatus" = 'REBUILDING_PROJECTIONS',
             "syncRunId" = NULL,
             "syncFenceToken" = COALESCE(s."syncFenceToken", 0) + 1,
             "syncStartedAt" = now(),
             "syncLockExpiresAt" = now() + interval '60 seconds',
             "updatedAt" = now()
       WHERE s."projectId" = ${projectId}
         AND (s."syncStartedAt" IS NULL OR s."syncLockExpiresAt" <= now())
         AND NOT EXISTS (
           SELECT 1 FROM "JiraSyncRun" r
            WHERE r."projectId" = ${projectId} AND r."activeSlot" IS NOT NULL
         )
      RETURNING s."syncFenceToken"
    `);
    const fenceToken = rows[0]?.syncFenceToken;
    return fenceToken ? { projectId, fenceToken } : null;
  });
}

export async function renewJiraProjectionRebuildLease(
  transaction: Prisma.TransactionClient,
  fence: JiraProjectionRebuildFence,
) {
  const renewed = await transaction.$executeRaw(Prisma.sql`
    UPDATE "JiraAnalyticsSettings"
       SET "syncLockExpiresAt" = now() + interval '60 seconds', "updatedAt" = now()
     WHERE "projectId" = ${fence.projectId}
       AND "syncRunId" IS NULL
       AND "syncStatus" = 'REBUILDING_PROJECTIONS'
       AND "syncFenceToken" = ${fence.fenceToken}
       AND "syncLockExpiresAt" > now()
  `);
  if (renewed !== 1) throw new JiraSyncFencedError();
}

export async function releaseJiraProjectionRebuildLease(
  prisma: PrismaClient,
  fence: JiraProjectionRebuildFence,
  previousStatus: string,
) {
  return prisma.jiraAnalyticsSettings.updateMany({
    where: {
      projectId: fence.projectId,
      syncRunId: null,
      syncFenceToken: fence.fenceToken,
      syncStatus: 'REBUILDING_PROJECTIONS',
    },
    data: {
      syncStatus: previousStatus,
      syncStartedAt: null,
      syncLockExpiresAt: null,
    },
  });
}

export type JiraSyncRequestSummary = {
  count: number;
  durationMsTotal: number;
  durationMsMax: number;
  byRoute: Record<string, number>;
  byStatusClass: Record<string, number>;
};

export type EnqueueJiraSyncInput = {
  projectId: string;
  kind: JiraSyncRunKind;
  scopeType: 'LABEL' | 'EPIC';
  scopeValue: string;
  jiraBaseUrl?: string;
  scopeChanged: boolean;
  requestedById?: string | null;
  requestedByRole?: string | null;
};

export async function enqueueJiraSyncRun(
  prisma: PrismaClient,
  input: EnqueueJiraSyncInput,
) {
  const historyWriteEnabled = jiraHistoryWriteEnabled();
  return prisma.$transaction(async (transaction) => {
    await lockJiraProjectData(transaction, input.projectId);
    await transaction.jiraAnalyticsSettings.createMany({
      data: [{
        projectId: input.projectId,
        jiraScopeType: input.scopeType,
        jiraScopeValue: input.scopeValue,
        jiraLabel: input.scopeType === 'LABEL' ? input.scopeValue : '',
        syncStatus: 'CONFIGURED',
      }],
      skipDuplicates: true,
    });

    const settingsAvailable = await transaction.$executeRaw(Prisma.sql`
      UPDATE "JiraAnalyticsSettings"
         SET "jiraScopeType" = ${input.scopeType}::"JiraAnalyticsScopeType",
             "jiraScopeValue" = ${input.scopeValue},
             "jiraLabel" = ${input.scopeType === 'LABEL' ? input.scopeValue : ''},
             "historyCursorUpdatedAt" = CASE WHEN ${input.scopeChanged}
               THEN NULL ELSE "historyCursorUpdatedAt" END,
             "historyCursorJiraIssueId" = CASE WHEN ${input.scopeChanged}
               THEN NULL ELSE "historyCursorJiraIssueId" END,
             "historyLastFullReconciledAt" = CASE WHEN ${input.scopeChanged}
               THEN NULL ELSE "historyLastFullReconciledAt" END,
             "historyFullCursorIssueKey" = CASE WHEN ${input.scopeChanged}
               THEN NULL ELSE "historyFullCursorIssueKey" END,
             "historyFullStartedAt" = CASE WHEN ${input.scopeChanged}
               THEN NULL ELSE "historyFullStartedAt" END,
             "updatedAt" = now()
       WHERE "projectId" = ${input.projectId}
         AND ("syncStartedAt" IS NULL OR "syncLockExpiresAt" <= now())
    `);
    if (settingsAvailable !== 1) throw new JiraSyncFencedError();

    return transaction.jiraSyncRun.create({
      data: {
        projectId: input.projectId,
        kind: input.kind,
        activeSlot: input.projectId,
        historyWriteEnabled,
        jiraScopeType: input.scopeType,
        jiraScopeValue: input.scopeValue,
        jiraBaseUrl: input.jiraBaseUrl,
        scopeChanged: input.scopeChanged,
        requestedById: input.requestedById,
        requestedByRole: input.requestedByRole,
        maxAttempts: JIRA_SYNC_MAX_ATTEMPTS,
      },
    });
  });
}

type ClaimedRunRow = {
  id: string;
  projectId: string;
  kind: JiraSyncRunKind;
  status: JiraSyncRunStatus;
  jiraScopeType: 'LABEL' | 'EPIC';
  jiraScopeValue: string;
  jiraBaseUrl: string | null;
  scopeChanged: boolean;
  historyWriteEnabled: boolean;
  attempt: number;
  maxAttempts: number;
  resumeCursorIssueKey: string | null;
  discoveredIssueCount: number;
  hydratedIssueCount: number;
  versionsCreated: number;
  retriesQueued: number;
  enqueuedAt: Date;
  startedAt: Date | null;
};

export type ClaimedJiraSyncRun = Omit<ClaimedRunRow, 'startedAt'> & JiraSyncFence & {
  deadlineAt: Date;
  startedAt: Date;
  workerId: string;
};

class JiraSyncLeaseBusyError extends Error {}

export async function claimNextJiraSyncRun(
  prisma: PrismaClient,
  workerId: string,
): Promise<ClaimedJiraSyncRun | null> {
  while (true) {
    let cancelledClosedProject = false;
    try {
      const claimedRun = await prisma.$transaction(async (transaction) => {
      const candidates = await transaction.$queryRaw<ClaimedRunRow[]>(Prisma.sql`
        SELECT r."id", r."projectId", r."kind", r."status", r."jiraScopeType",
               r."jiraScopeValue", r."jiraBaseUrl", r."scopeChanged",
               r."historyWriteEnabled", r."attempt", r."maxAttempts",
               r."resumeCursorIssueKey", r."discoveredIssueCount",
               r."hydratedIssueCount", r."versionsCreated", r."retriesQueued",
               r."enqueuedAt", r."startedAt"
          FROM "JiraSyncRun" r
          JOIN "JiraAnalyticsSettings" s ON s."projectId" = r."projectId"
         WHERE r."activeSlot" IS NOT NULL
           AND r."attempt" < r."maxAttempts"
           AND (
             r."status" IN ('QUEUED', 'PAUSED_DEADLINE')
             OR (r."status" = 'RUNNING' AND r."leaseExpiresAt" < now())
           )
           AND (s."syncStartedAt" IS NULL OR s."syncLockExpiresAt" <= now())
         ORDER BY r."enqueuedAt" ASC
         LIMIT 1
         FOR UPDATE OF s SKIP LOCKED
      `);
      const candidate = candidates[0];
      if (!candidate) return null;

      const project = await transaction.project.findUnique({
        where: { id: candidate.projectId },
        select: { status: true },
      });
      if (!project || project.status === 'CLOSED') {
        await transaction.$executeRaw(Prisma.sql`
          UPDATE "JiraAnalyticsSettings"
             SET "syncRunId" = NULL, "syncStartedAt" = NULL,
                 "syncLockExpiresAt" = NULL, "syncStatus" = 'CANCELLED',
                 "updatedAt" = now()
           WHERE "projectId" = ${candidate.projectId}
             AND "syncRunId" = ${candidate.id}
        `);
        await transaction.$executeRaw(Prisma.sql`
          UPDATE "JiraSyncRun"
             SET "status" = 'CANCELLED', "phase" = 'DONE', "activeSlot" = NULL,
                 "finishedAt" = now(), "errorCode" = 'PROJECT_CLOSED',
                 "errorMessage" = 'Проект закрыт', "updatedAt" = now()
           WHERE "id" = ${candidate.id}
        `);
        cancelledClosedProject = true;
        return null;
      }

      const leaseSeconds = JIRA_SYNC_LEASE_MS / 1_000;
      const settingsRows = await transaction.$queryRaw<Array<{ syncFenceToken: number }>>(Prisma.sql`
        UPDATE "JiraAnalyticsSettings"
           SET "syncStatus" = ${candidate.kind === JiraSyncRunKind.BACKFILL ? 'BACKFILLING' : 'SYNCING'},
               "syncRunId" = ${candidate.id},
               "syncFenceToken" = COALESCE("syncFenceToken", 0) + 1,
               "syncStartedAt" = now(),
               "syncLockExpiresAt" = now() + (${leaseSeconds} * interval '1 second'),
               "updatedAt" = now()
         WHERE "projectId" = ${candidate.projectId}
           AND (
             "syncStartedAt" IS NULL
             OR "syncLockExpiresAt" <= now()
           )
        RETURNING "syncFenceToken"
      `);
      const fenceToken = settingsRows[0]?.syncFenceToken;
      if (!fenceToken) throw new JiraSyncLeaseBusyError();

      const deadlineSeconds = JIRA_SYNC_ATTEMPT_DEADLINE_MS / 1_000;
      const runRows = await transaction.$queryRaw<Array<{ deadlineAt: Date; startedAt: Date }>>(Prisma.sql`
        UPDATE "JiraSyncRun"
           SET "status" = 'RUNNING',
               "phase" = 'DISCOVERY',
               "attempt" = "attempt" + 1,
               "fenceToken" = ${fenceToken},
               "workerId" = ${workerId},
               "startedAt" = COALESCE("startedAt", now()),
               "heartbeatAt" = now(),
               "leaseExpiresAt" = now() + (${leaseSeconds} * interval '1 second'),
               "deadlineAt" = now() + (${deadlineSeconds} * interval '1 second'),
               "errorCode" = NULL,
               "errorMessage" = NULL,
               "updatedAt" = now()
         WHERE "id" = ${candidate.id}
           AND "activeSlot" IS NOT NULL
           AND "attempt" < "maxAttempts"
           AND (
             "status" IN ('QUEUED', 'PAUSED_DEADLINE')
             OR ("status" = 'RUNNING' AND "leaseExpiresAt" < now())
           )
        RETURNING "deadlineAt", "startedAt"
      `);
      const claimed = runRows[0];
      if (!claimed) throw new JiraSyncFencedError();
      return {
        ...candidate,
        attempt: candidate.attempt + 1,
        runId: candidate.id,
        fenceToken,
        deadlineAt: claimed.deadlineAt,
        startedAt: claimed.startedAt,
        workerId,
      };
      });
      if (cancelledClosedProject) continue;
      return claimedRun;
    } catch (error) {
      if (error instanceof JiraSyncLeaseBusyError) return null;
      throw error;
    }
  }
}

export async function assertJiraSyncFence(
  transaction: Prisma.TransactionClient,
  fence: JiraSyncFence,
) {
  const rows = await transaction.$queryRaw<Array<{ ok: number }>>(Prisma.sql`
    SELECT 1 AS ok
      FROM "JiraAnalyticsSettings"
     WHERE "projectId" = ${fence.projectId}
       AND "syncRunId" = ${fence.runId}
       AND "syncFenceToken" = ${fence.fenceToken}
       AND "syncLockExpiresAt" > now()
     FOR SHARE
  `);
  if (rows.length !== 1) throw new JiraSyncFencedError();
}

export async function disableJiraSyncHistoryWrites(
  prisma: PrismaClient,
  fence: JiraSyncFence,
) {
  await prisma.$transaction(async (transaction) => {
    await assertJiraSyncFence(transaction, fence);
    const updated = await transaction.jiraSyncRun.updateMany({
      where: {
        id: fence.runId,
        fenceToken: fence.fenceToken,
        status: JiraSyncRunStatus.RUNNING,
        historyWriteEnabled: true,
      },
      data: { historyWriteEnabled: false },
    });
    if (updated.count !== 1) throw new JiraSyncFencedError();
  });
}

export async function heartbeatJiraSyncRun(
  prisma: PrismaClient,
  fence: JiraSyncFence,
  progress: { phase: string; done: number; total: number; unit?: string | null },
) {
  const leaseSeconds = JIRA_SYNC_LEASE_MS / 1_000;
  await prisma.$transaction(async (transaction) => {
    const settingsCount = await transaction.$executeRaw(Prisma.sql`
      UPDATE "JiraAnalyticsSettings"
         SET "syncLockExpiresAt" = GREATEST(
               "syncLockExpiresAt",
               now() + (${leaseSeconds} * interval '1 second')
             ),
             "updatedAt" = now()
       WHERE "projectId" = ${fence.projectId}
         AND "syncRunId" = ${fence.runId}
         AND "syncFenceToken" = ${fence.fenceToken}
         AND "syncLockExpiresAt" > now()
    `);
    if (settingsCount !== 1) throw new JiraSyncFencedError();
    const runCount = await transaction.$executeRaw(Prisma.sql`
      UPDATE "JiraSyncRun"
         SET "heartbeatAt" = now(),
             "leaseExpiresAt" = GREATEST(
               "leaseExpiresAt",
               now() + (${leaseSeconds} * interval '1 second')
             ),
             "phase" = ${progress.phase},
             "progressDone" = ${progress.done},
             "progressTotal" = ${progress.total},
             "progressUnit" = ${progress.unit ?? null},
             "updatedAt" = now()
       WHERE "id" = ${fence.runId}
         AND "fenceToken" = ${fence.fenceToken}
         AND "status" = 'RUNNING'
    `);
    if (runCount !== 1) throw new JiraSyncFencedError();
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function extendJiraSyncLease(
  prisma: PrismaClient,
  fence: JiraSyncFence,
  leaseMs: number,
) {
  const leaseSeconds = Math.max(1, leaseMs / 1_000);
  await prisma.$transaction(async (transaction) => {
    const settingsCount = await transaction.$executeRaw(Prisma.sql`
      UPDATE "JiraAnalyticsSettings"
         SET "syncLockExpiresAt" = GREATEST(
               "syncLockExpiresAt",
               now() + (${leaseSeconds} * interval '1 second')
             ),
             "updatedAt" = now()
       WHERE "projectId" = ${fence.projectId}
         AND "syncRunId" = ${fence.runId}
         AND "syncFenceToken" = ${fence.fenceToken}
         AND "syncLockExpiresAt" > now()
    `);
    if (settingsCount !== 1) throw new JiraSyncFencedError();
    const runCount = await transaction.$executeRaw(Prisma.sql`
      UPDATE "JiraSyncRun"
         SET "leaseExpiresAt" = GREATEST(
               "leaseExpiresAt",
               now() + (${leaseSeconds} * interval '1 second')
             ),
             "updatedAt" = now()
       WHERE "id" = ${fence.runId}
         AND "fenceToken" = ${fence.fenceToken}
         AND "status" = 'RUNNING'
    `);
    if (runCount !== 1) throw new JiraSyncFencedError();
  });
}

export async function checkpointJiraSyncRun(
  prisma: PrismaClient,
  fence: JiraSyncFence,
  data: {
    phase?: string;
    resumeCursorIssueKey?: string | null;
    discoveredIssueCount?: number;
    hydratedIssueCount?: number;
    versionsCreated?: number;
    retriesQueued?: number;
  },
) {
  await prisma.$transaction(async (transaction) => {
    await assertJiraSyncFence(transaction, fence);
    const count = await transaction.jiraSyncRun.updateMany({
      where: { id: fence.runId, fenceToken: fence.fenceToken, status: JiraSyncRunStatus.RUNNING },
      data: {
        phase: data.phase,
        resumeCursorIssueKey: data.resumeCursorIssueKey,
        discoveredIssueCount: data.discoveredIssueCount,
        hydratedIssueCount: data.hydratedIssueCount,
        versionsCreated: data.versionsCreated,
        retriesQueued: data.retriesQueued,
      },
    });
    if (count.count !== 1) throw new JiraSyncFencedError();
  });
}

type CompleteJiraSyncInput = {
  status: 'SUCCEEDED' | 'SUCCEEDED_WITH_RETRIES';
  result: Prisma.InputJsonValue;
  requestSummary: JiraSyncRequestSummary;
  discoveredIssueCount: number;
  hydratedIssueCount: number;
  versionsCreated: number;
  retriesQueued: number;
};

export async function completeJiraSyncRun(
  prisma: PrismaClient,
  fence: JiraSyncFence,
  input: CompleteJiraSyncInput,
) {
  await finishJiraSyncRun(prisma, fence, input.status, {
    result: input.result,
    discoveredIssueCount: input.discoveredIssueCount,
    hydratedIssueCount: input.hydratedIssueCount,
    versionsCreated: input.versionsCreated,
    retriesQueued: input.retriesQueued,
    jiraRequestCount: input.requestSummary.count,
    jiraRequestDurationMsTotal: input.requestSummary.durationMsTotal,
    jiraRequestDurationMsMax: input.requestSummary.durationMsMax,
    jiraRequestsByRoute: input.requestSummary.byRoute,
    jiraRequestsByStatusClass: input.requestSummary.byStatusClass,
  });
}

export async function pauseJiraSyncRun(
  prisma: PrismaClient,
  fence: JiraSyncFence,
  requestSummary: JiraSyncRequestSummary,
) {
  await finishJiraSyncRun(prisma, fence, JiraSyncRunStatus.PAUSED_DEADLINE, {
    errorCode: 'ATTEMPT_DEADLINE',
    errorMessage: 'Попытка приостановлена по лимиту времени и будет продолжена',
    jiraRequestCount: requestSummary.count,
    jiraRequestDurationMsTotal: requestSummary.durationMsTotal,
    jiraRequestDurationMsMax: requestSummary.durationMsMax,
    jiraRequestsByRoute: requestSummary.byRoute,
    jiraRequestsByStatusClass: requestSummary.byStatusClass,
  });
}

export async function failJiraSyncRun(
  prisma: PrismaClient,
  fence: JiraSyncFence,
  error: unknown,
  code = 'SYNC_FAILED',
  status: JiraSyncRunStatus = JiraSyncRunStatus.FAILED,
  requestSummary?: JiraSyncRequestSummary,
) {
  await finishJiraSyncRun(prisma, fence, status, {
    errorCode: code,
    errorMessage: redactJiraHistoryError(error instanceof Error ? error.message : String(error)),
    jiraRequestCount: requestSummary?.count,
    jiraRequestDurationMsTotal: requestSummary?.durationMsTotal,
    jiraRequestDurationMsMax: requestSummary?.durationMsMax,
    jiraRequestsByRoute: requestSummary?.byRoute,
    jiraRequestsByStatusClass: requestSummary?.byStatusClass,
  });
}

type FinishJiraSyncData = {
  result?: Prisma.InputJsonValue;
  discoveredIssueCount?: number;
  hydratedIssueCount?: number;
  versionsCreated?: number;
  retriesQueued?: number;
  jiraRequestCount?: number;
  jiraRequestDurationMsTotal?: number;
  jiraRequestDurationMsMax?: number;
  jiraRequestsByRoute?: Record<string, number>;
  jiraRequestsByStatusClass?: Record<string, number>;
  errorCode?: string | null;
  errorMessage?: string | null;
};

function mergeRequestCounters(
  existing: Prisma.JsonValue | null,
  addition: Record<string, number> | undefined,
) {
  const merged: Record<string, number> = {};
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    for (const [key, value] of Object.entries(existing)) {
      if (typeof value === 'number' && Number.isFinite(value)) merged[key] = value;
    }
  }
  for (const [key, value] of Object.entries(addition ?? {})) {
    if (Number.isFinite(value)) merged[key] = (merged[key] ?? 0) + value;
  }
  return merged;
}

async function finishJiraSyncRun(
  prisma: PrismaClient,
  fence: JiraSyncFence,
  status: JiraSyncRunStatus,
  data: FinishJiraSyncData,
) {
  const terminal = TERMINAL_STATUSES.has(status);
  const attemptDeadlineSeconds = JIRA_SYNC_ATTEMPT_DEADLINE_MS / 1_000;
  const completedSuccessfully = status === JiraSyncRunStatus.SUCCEEDED
    || status === JiraSyncRunStatus.SUCCEEDED_WITH_RETRIES;
  await prisma.$transaction(async (transaction) => {
    const released = await transaction.$executeRaw(Prisma.sql`
      UPDATE "JiraAnalyticsSettings"
         SET "syncStatus" = ${completedSuccessfully ? 'OK' : status},
             "syncRunId" = NULL,
             "syncStartedAt" = NULL,
             "syncLockExpiresAt" = NULL,
             "updatedAt" = now()
       WHERE "projectId" = ${fence.projectId}
         AND "syncRunId" = ${fence.runId}
         AND "syncFenceToken" = ${fence.fenceToken}
         AND "syncLockExpiresAt" > now()
    `);
    if (released !== 1) throw new JiraSyncFencedError();
    const stored = await transaction.jiraSyncRun.findUniqueOrThrow({
      where: { id: fence.runId },
      select: {
        jiraRequestCount: true,
        jiraRequestDurationMsTotal: true,
        jiraRequestDurationMsMax: true,
        jiraRequestsByRoute: true,
        jiraRequestsByStatusClass: true,
      },
    });
    const requestCount = stored.jiraRequestCount + (data.jiraRequestCount ?? 0);
    const requestDurationMsTotal = stored.jiraRequestDurationMsTotal
      + (data.jiraRequestDurationMsTotal ?? 0);
    const requestDurationMsMax = Math.max(
      stored.jiraRequestDurationMsMax,
      data.jiraRequestDurationMsMax ?? 0,
    );
    const requestsByRoute = mergeRequestCounters(
      stored.jiraRequestsByRoute,
      data.jiraRequestsByRoute,
    );
    const requestsByStatusClass = mergeRequestCounters(
      stored.jiraRequestsByStatusClass,
      data.jiraRequestsByStatusClass,
    );
    const count = await transaction.$executeRaw(Prisma.sql`
      UPDATE "JiraSyncRun"
         SET "status" = ${status}::"JiraSyncRunStatus",
             "phase" = ${terminal ? 'DONE' : 'PAUSED'},
             "activeSlot" = ${terminal ? null : fence.projectId},
             "attempt" = CASE WHEN ${status === JiraSyncRunStatus.PAUSED_DEADLINE}
               THEN GREATEST("attempt" - 1, 0) ELSE "attempt" END,
             "deadlinePauseCount" = "deadlinePauseCount"
               + CASE WHEN ${status === JiraSyncRunStatus.PAUSED_DEADLINE} THEN 1 ELSE 0 END,
             "finishedAt" = ${terminal ? Prisma.sql`now()` : null},
             "elapsedMs" = COALESCE("elapsedMs", 0) + CASE
               WHEN "deadlineAt" IS NULL THEN 0
               ELSE GREATEST(0, ROUND(EXTRACT(EPOCH FROM (
                 now() - ("deadlineAt" - (${attemptDeadlineSeconds} * interval '1 second'))
               )) * 1000)::integer)
             END,
             "result" = ${data.result === undefined ? Prisma.sql`"result"` : JSON.stringify(data.result)}::jsonb,
             "discoveredIssueCount" = ${data.discoveredIssueCount ?? Prisma.sql`"discoveredIssueCount"`},
             "hydratedIssueCount" = ${data.hydratedIssueCount ?? Prisma.sql`"hydratedIssueCount"`},
             "versionsCreated" = ${data.versionsCreated ?? Prisma.sql`"versionsCreated"`},
             "retriesQueued" = ${data.retriesQueued ?? Prisma.sql`"retriesQueued"`},
             "jiraRequestCount" = ${requestCount},
             "jiraRequestDurationMsTotal" = ${requestDurationMsTotal},
             "jiraRequestDurationMsMax" = ${requestDurationMsMax},
             "jiraRequestsByRoute" = ${JSON.stringify(requestsByRoute)}::jsonb,
             "jiraRequestsByStatusClass" = ${JSON.stringify(requestsByStatusClass)}::jsonb,
             "errorCode" = ${data.errorCode ?? null},
             "errorMessage" = ${data.errorMessage ?? null},
             "workerId" = NULL,
             "leaseExpiresAt" = NULL,
             "deadlineAt" = NULL,
             "updatedAt" = now()
       WHERE "id" = ${fence.runId}
         AND "fenceToken" = ${fence.fenceToken}
         AND "status" = 'RUNNING'
    `);
    if (count !== 1) throw new JiraSyncFencedError();
  });
}

export async function releaseJiraSyncRunOnShutdown(
  prisma: PrismaClient,
  fence: JiraSyncFence,
) {
  const attemptDeadlineSeconds = JIRA_SYNC_ATTEMPT_DEADLINE_MS / 1_000;
  await prisma.$transaction(async (transaction) => {
    const released = await transaction.$executeRaw(Prisma.sql`
      UPDATE "JiraAnalyticsSettings"
         SET "syncRunId" = NULL, "syncStartedAt" = NULL,
             "syncLockExpiresAt" = NULL, "syncStatus" = 'CONFIGURED',
             "updatedAt" = now()
       WHERE "projectId" = ${fence.projectId}
         AND "syncRunId" = ${fence.runId}
         AND "syncFenceToken" = ${fence.fenceToken}
         AND "syncLockExpiresAt" > now()
    `);
    if (released !== 1) throw new JiraSyncFencedError();
    const runCount = await transaction.$executeRaw(Prisma.sql`
      UPDATE "JiraSyncRun"
         SET "status" = 'QUEUED', "phase" = 'PENDING',
             "attempt" = GREATEST("attempt" - 1, 0),
             "elapsedMs" = COALESCE("elapsedMs", 0) + CASE
               WHEN "deadlineAt" IS NULL THEN 0
               ELSE GREATEST(0, ROUND(EXTRACT(EPOCH FROM (
                 now() - ("deadlineAt" - (${attemptDeadlineSeconds} * interval '1 second'))
               )) * 1000)::integer)
             END,
             "workerId" = NULL, "leaseExpiresAt" = NULL,
             "heartbeatAt" = NULL, "deadlineAt" = NULL,
             "errorCode" = 'SHUTDOWN_RELEASED', "updatedAt" = now()
       WHERE "id" = ${fence.runId}
         AND "fenceToken" = ${fence.fenceToken}
         AND "status" = 'RUNNING'
    `);
    if (runCount !== 1) throw new JiraSyncFencedError();
  });
}

export async function reapExpiredJiraSyncRuns(prisma: PrismaClient) {
  const attemptDeadlineSeconds = JIRA_SYNC_ATTEMPT_DEADLINE_MS / 1_000;
  const wallMilliseconds = JIRA_SYNC_RUN_MAX_WALL_MS;
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`
      UPDATE "JiraAnalyticsSettings" s
         SET "syncRunId" = NULL,
             "syncFenceToken" = COALESCE(s."syncFenceToken", 0) + 1,
             "syncStartedAt" = NULL,
             "syncLockExpiresAt" = NULL,
             "syncStatus" = 'FAILED',
             "updatedAt" = now()
        FROM "JiraSyncRun" r
       WHERE s."projectId" = r."projectId"
         AND (
           s."syncRunId" = r."id"
           OR (
             r."status" = 'PAUSED_DEADLINE'
             AND s."syncRunId" IS NULL
             AND s."syncStatus" = 'PAUSED_DEADLINE'
           )
         )
         AND r."activeSlot" IS NOT NULL
         AND (
           (r."attempt" >= r."maxAttempts"
             AND (r."status" <> 'RUNNING' OR r."leaseExpiresAt" < now()))
           OR COALESCE(r."elapsedMs", 0) + CASE
             WHEN r."status" = 'RUNNING' AND r."deadlineAt" IS NOT NULL THEN
               GREATEST(0, ROUND(EXTRACT(EPOCH FROM (
                 now() - (r."deadlineAt" - (${attemptDeadlineSeconds} * interval '1 second'))
               )) * 1000)::integer)
             ELSE 0
           END > ${wallMilliseconds}
         )
    `);
    await transaction.$executeRaw(Prisma.sql`
      UPDATE "JiraSyncRun" r
         SET "status" = 'FAILED', "phase" = 'DONE', "activeSlot" = NULL,
             "finishedAt" = now(),
             "elapsedMs" = COALESCE(r."elapsedMs", 0) + CASE
               WHEN r."status" = 'RUNNING' AND r."deadlineAt" IS NOT NULL THEN
                 GREATEST(0, ROUND(EXTRACT(EPOCH FROM (
                   now() - (r."deadlineAt" - (${attemptDeadlineSeconds} * interval '1 second'))
                 )) * 1000)::integer)
               ELSE 0
             END,
             "errorCode" = CASE WHEN r."attempt" >= r."maxAttempts"
               THEN 'ATTEMPTS_EXHAUSTED' ELSE 'RUN_EXPIRED' END,
             "errorMessage" = CASE WHEN r."attempt" >= r."maxAttempts"
               THEN 'Исчерпано число попыток синхронизации'
               ELSE 'Превышено максимальное время выполнения синхронизации' END,
             "workerId" = NULL, "leaseExpiresAt" = NULL,
             "heartbeatAt" = NULL, "deadlineAt" = NULL, "updatedAt" = now()
       WHERE r."activeSlot" IS NOT NULL
         AND (
           (r."attempt" >= r."maxAttempts"
             AND (r."status" <> 'RUNNING' OR r."leaseExpiresAt" < now()))
           OR COALESCE(r."elapsedMs", 0) + CASE
             WHEN r."status" = 'RUNNING' AND r."deadlineAt" IS NOT NULL THEN
               GREATEST(0, ROUND(EXTRACT(EPOCH FROM (
                 now() - (r."deadlineAt" - (${attemptDeadlineSeconds} * interval '1 second'))
               )) * 1000)::integer)
             ELSE 0
           END > ${wallMilliseconds}
         )
    `);
  });
}

export async function findJiraSyncRun(
  prisma: PrismaClient,
  projectId: string,
  runId: string,
) {
  return prisma.jiraSyncRun.findFirst({ where: { id: runId, projectId } });
}

export async function findActiveJiraSyncRun(prisma: PrismaClient, projectId: string) {
  return prisma.jiraSyncRun.findFirst({
    where: { projectId, activeSlot: { not: null } },
    orderBy: { enqueuedAt: 'desc' },
  });
}

export function publicJiraSyncRun(run: NonNullable<Awaited<ReturnType<typeof findJiraSyncRun>>>) {
  return {
    runId: run.id,
    projectId: run.projectId,
    kind: run.kind,
    status: run.status,
    phase: run.phase,
    progress: {
      done: run.progressDone,
      total: run.progressTotal,
      unit: run.progressUnit,
    },
    attempt: run.attempt,
    deadlinePauseCount: run.deadlinePauseCount,
    maxAttempts: run.maxAttempts,
    queuedAt: run.enqueuedAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    elapsedMs: run.elapsedMs,
    heartbeatAt: run.heartbeatAt?.toISOString() ?? null,
    historyWriteEnabled: run.historyWriteEnabled,
    jiraScopeType: run.jiraScopeType,
    jiraScopeValue: run.jiraScopeValue,
    discoveredIssueCount: run.discoveredIssueCount,
    hydratedIssueCount: run.hydratedIssueCount,
    versionsCreated: run.versionsCreated,
    retriesQueued: run.retriesQueued,
    jiraRequests: {
      count: run.jiraRequestCount,
      durationMsTotal: run.jiraRequestDurationMsTotal,
      durationMsMax: run.jiraRequestDurationMsMax,
      byRoute: run.jiraRequestsByRoute,
      byStatusClass: run.jiraRequestsByStatusClass,
    },
    pollAfterMs: JIRA_SYNC_POLL_AFTER_MS,
    result: run.result,
    error: run.errorCode
      ? { code: run.errorCode, message: run.errorMessage ?? 'Синхронизация Jira завершилась ошибкой' }
      : null,
  };
}
