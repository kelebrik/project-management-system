import { JiraSyncRunKind, Prisma, type PrismaClient } from '@prisma/client';

import { prisma } from '../db.js';
import {
  fetchJiraIssueKeysWithMeta,
  fetchJiraIssuesWithMeta,
  jiraJqlWithIssueKeys,
  JiraReadOnlyRequestError,
  JiraSyncDeadlineError,
  resolveJiraConfig,
  type JiraIssue,
} from '../jira.js';
import { logEvent } from '../server/logger.js';
import {
  createPrismaJiraAnalyticsSyncStore,
  finalizeJiraAnalyticsSync,
  JiraHistoryObservationError,
  jiraCriticalBugSlaSnapshotIds,
  syncJiraIssueAnalytics,
  type JiraAnalyticsSyncedSnapshot,
} from './jira-analytics-sync.js';
import {
  dueJiraHistoryRetryKeys,
  jiraHistoryDatabaseBytes,
  jiraHistoryNeedsFullReconciliation,
  jiraHistoryStorageBudgetBytes,
  jiraHistoryUpdatedSinceJql,
  JIRA_HISTORY_CRITICAL_PERCENT,
  pendingJiraHistoryRetryKeys,
  queueJiraHistoryRetryInTransaction,
  resolveJiraHistoryRetry,
} from './jira-history.js';
import {
  assertJiraSyncFence,
  checkpointJiraSyncRun,
  disableJiraSyncHistoryWrites,
  extendJiraSyncLease,
  JiraSyncCapacityError,
  JiraSyncFencedError,
  type ClaimedJiraSyncRun,
  type JiraSyncFence,
} from './jira-sync-runs.js';
import {
  ensureDefaultJiraWorkSections,
  jiraCriticalPriorityProjectKeys,
  jiraIssueKeyBatchDifference,
  jiraIssueKeyBatchJql,
  jiraIssueKeyBatches,
  jiraParentKeyBatchJql,
  jiraWorkSectionScopedJqls,
  normalizedJiraIssueKeys,
  resolveJiraWorkSectionJql,
} from './jira-work-sections.js';

const JIRA_ANALYTICS_SYNC_CONCURRENCY = 4;
const JIRA_ANALYTICS_BATCH_SIZE = 50;
const JIRA_HISTORY_BATCH_SIZE = 20;
const JIRA_SYNC_DISCOVERY_PAGE_SIZE = 100;

export function isFatalJiraHistoryBatchError(error: unknown) {
  if (
    error instanceof JiraReadOnlyRequestError
    || error instanceof JiraSyncDeadlineError
    || error instanceof JiraSyncCapacityError
    || error instanceof JiraSyncFencedError
  ) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /authentication|did not authenticate|unexpected Jira user/i.test(message);
}

export function jiraHistorySyncFailedCompletely(attempted: number, succeeded: number) {
  return attempted > 0 && succeeded === 0;
}

export function jiraHistoryIssueIsRetryEligible(
  issueKey: string,
  pendingRetryKeys: ReadonlySet<string>,
  dueRetryKeys: ReadonlySet<string>,
) {
  const normalized = issueKey.toUpperCase();
  return !pendingRetryKeys.has(normalized) || dueRetryKeys.has(normalized);
}

export function jiraHistoryFullSweepState(
  fullReconciliation: boolean,
  pendingDiscoveredRetries: number,
) {
  return {
    returnToIncremental: fullReconciliation,
    clean: fullReconciliation && pendingDiscoveredRetries === 0,
  };
}

export function jiraHistoryResumeAfter(
  runCursorIssueKey: string | null,
  restartFullSweep: boolean,
  fullCursorIssueKey: string | null,
) {
  return runCursorIssueKey ?? (restartFullSweep ? null : fullCursorIssueKey);
}

export function jiraHistoryIssueKeysAfterResume(
  issueKeys: readonly string[],
  resumeCursorIssueKey: string | null,
) {
  return issueKeys.filter((key) => !resumeCursorIssueKey || key > resumeCursorIssueKey);
}

export function jiraHistoryFullCursorAfterBatch(
  currentCursorIssueKey: string | null,
  batchLastIssueKey: string | null,
) {
  if (!batchLastIssueKey) return currentCursorIssueKey;
  if (currentCursorIssueKey && currentCursorIssueKey >= batchLastIssueKey) {
    return currentCursorIssueKey;
  }
  return batchLastIssueKey;
}

export function jiraHistoryFullSweepStartedAt(
  resumeAfter: string | null,
  storedStartedAt: Date | null,
  runStartedAt: Date,
  attemptStartedAt: Date,
) {
  return resumeAfter ? storedStartedAt ?? runStartedAt : attemptStartedAt;
}

export type JiraSyncPipelineResult = {
  result: Prisma.InputJsonValue;
  status: 'SUCCEEDED' | 'SUCCEEDED_WITH_RETRIES';
  discoveredIssueCount: number;
  hydratedIssueCount: number;
  versionsCreated: number;
  retriesQueued: number;
};

type PipelineOptions = {
  prisma?: PrismaClient;
  signal?: AbortSignal;
  onProgress?: (progress: { phase: string; done: number; total: number; unit: string }) => void;
};

const JIRA_SYNC_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new JiraSyncFencedError();
}

async function assertCapacity(database: PrismaClient) {
  const bytes = await jiraHistoryDatabaseBytes(database);
  const budget = jiraHistoryStorageBudgetBytes();
  if (bytes / budget * 100 >= JIRA_HISTORY_CRITICAL_PERCENT) {
    throw new JiraSyncCapacityError(
      `История Jira заняла не менее ${JIRA_HISTORY_CRITICAL_PERCENT}% доступного бюджета`,
    );
  }
}

async function syncJiraAnalyticsIssues(
  database: PrismaClient,
  fence: JiraSyncFence,
  issues: JiraIssue[],
  syncedAt: Date,
  historyWriteEnabled: boolean,
) {
  const snapshots = new Array<JiraAnalyticsSyncedSnapshot | undefined>(issues.length);
  const failures: Array<{ issueKey: string; reasonCode: string; message: string }> = [];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < issues.length) {
      const index = nextIndex;
      nextIndex += 1;
      const issue = issues[index];
      try {
        snapshots[index] = await database.$transaction(async (transaction) => {
          await assertJiraSyncFence(transaction, fence);
          const snapshot = await syncJiraIssueAnalytics(
            createPrismaJiraAnalyticsSyncStore(transaction, syncedAt, historyWriteEnabled),
            fence.projectId,
            issue,
            syncedAt,
            fence.runId,
          );
          if (historyWriteEnabled) {
            await resolveJiraHistoryRetry(transaction, fence.projectId, issue.key, syncedAt);
          }
          return snapshot;
        }, JIRA_SYNC_TRANSACTION_OPTIONS);
      } catch (error) {
        if (isFatalJiraHistoryBatchError(error)) throw error;
        const reasonCode = error instanceof JiraHistoryObservationError
          ? error.reasonCode
          : 'PERSISTENCE_FAILED';
        if (historyWriteEnabled) {
          await database.$transaction(async (transaction) => {
            await assertJiraSyncFence(transaction, fence);
            await queueJiraHistoryRetryInTransaction(transaction, {
              projectId: fence.projectId,
              issueKey: issue.key,
              jiraIssueId: issue.jiraId,
              reasonCode,
              error,
              observedUpdatedAt: issue.updatedAt,
              failedAt: syncedAt,
            });
          }, JIRA_SYNC_TRANSACTION_OPTIONS);
        }
        failures.push({
          issueKey: issue.key,
          reasonCode,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(JIRA_ANALYTICS_SYNC_CONCURRENCY, issues.length) },
    () => worker(),
  ));
  return { failures, snapshots };
}

export async function runJiraSyncPipeline(
  run: ClaimedJiraSyncRun,
  options: PipelineOptions = {},
): Promise<JiraSyncPipelineResult> {
  const database = options.prisma ?? prisma;
  const fence: JiraSyncFence = {
    runId: run.id,
    projectId: run.projectId,
    fenceToken: run.fenceToken,
  };
  const deadlineAt = run.deadlineAt.getTime();
  const syncedAt = new Date();
  const workSections = await ensureDefaultJiraWorkSections(run.projectId);
  const configuredSections = workSections.filter((section) =>
    resolveJiraWorkSectionJql(section.jql, section.filterUrl));
  const syncedIssueKeys = new Set<string>();
  const snapshotIdByIssueKey = new Map<string, string>();
  const trackedSnapshotIds: string[] = [];
  const historyFailures: Array<{ issueKey: string; reasonCode: string; message: string }> = [];
  const jiraUsers = new Set<string>();
  const remoteDevelopmentCache = new Map<string, JiraIssue['development']>();
  let capacityDegraded = false;

  const enforceHistoryCapacity = async () => {
    if (!run.historyWriteEnabled) return;
    try {
      await assertCapacity(database);
    } catch (error) {
      if (!(error instanceof JiraSyncCapacityError) || run.kind === JiraSyncRunKind.BACKFILL) {
        throw error;
      }
      await disableJiraSyncHistoryWrites(database, fence);
      run.historyWriteEnabled = false;
      capacityDegraded = true;
      logEvent('warn', 'jira.sync.history_disabled_capacity', {
        projectId: run.projectId,
        runId: run.id,
      });
    }
  };

  abortIfNeeded(options.signal);
  await enforceHistoryCapacity();
  options.onProgress?.({ phase: 'DISCOVERY', done: 0, total: 0, unit: 'issues' });
  const discovery = await fetchJiraIssueKeysWithMeta('ORDER BY key ASC', {
    baseUrl: run.jiraBaseUrl ?? undefined,
    fetchAllPages: true,
    analyticsScope: { type: run.jiraScopeType, value: run.jiraScopeValue },
    pageSize: JIRA_SYNC_DISCOVERY_PAGE_SIZE,
    deadlineAt,
  });
  if (discovery.jiraUser) jiraUsers.add(discovery.jiraUser);
  let discoveredIssueKeys = normalizedJiraIssueKeys(discovery.issueKeys);
  if (run.jiraScopeType === 'EPIC' && discoveredIssueKeys.length > 0) {
    const subtaskIssueKeys: string[] = [];
    for (const parentIssueKeys of jiraIssueKeyBatches(discoveredIssueKeys, JIRA_ANALYTICS_BATCH_SIZE)) {
      abortIfNeeded(options.signal);
      const subtasks = await fetchJiraIssueKeysWithMeta(jiraParentKeyBatchJql(parentIssueKeys), {
        baseUrl: run.jiraBaseUrl ?? undefined,
        fetchAllPages: true,
        pageSize: JIRA_SYNC_DISCOVERY_PAGE_SIZE,
        deadlineAt,
      });
      if (subtasks.jiraUser) jiraUsers.add(subtasks.jiraUser);
      subtaskIssueKeys.push(...subtasks.issueKeys);
    }
    discoveredIssueKeys = normalizedJiraIssueKeys([...discoveredIssueKeys, ...subtaskIssueKeys]);
  }
  const discoveredIssueCount = discoveredIssueKeys.length;
  await checkpointJiraSyncRun(database, fence, {
    phase: 'PLANNING',
    discoveredIssueCount,
  });
  options.onProgress?.({
    phase: 'PLANNING',
    done: 0,
    total: discoveredIssueCount,
    unit: 'issues',
  });

  const criticalBugSlaProjectKeys = jiraCriticalPriorityProjectKeys('', discoveredIssueKeys);
  if (discoveredIssueKeys.length === 0) {
    return {
      status: 'SUCCEEDED',
      discoveredIssueCount: 0,
      hydratedIssueCount: 0,
      versionsCreated: 0,
      retriesQueued: 0,
      result: {
        synced: 0,
        emptyScope: true,
        jiraScopeType: run.jiraScopeType,
        jiraScopeValue: run.jiraScopeValue,
        criticalBugSlaConfigured: true,
        criticalBugSlaScope: run.jiraScopeType.toLowerCase(),
        criticalBugSlaProjectKeys,
        criticalBugSlaCandidates: 0,
        criticalBugSlaIssues: 0,
        configuredSections: configuredSections.length,
        totalSections: workSections.length,
        jiraUsers: [...jiraUsers],
        sections: [],
        historyWriteEnabled: run.historyWriteEnabled,
        warning: run.jiraScopeType === 'LABEL'
          ? 'По указанному лейблу тикеты не найдены; прежние данные сохранены'
          : 'По указанному коду эпика тикеты не найдены; прежние данные сохранены',
      },
    };
  }

  for (const issueKeys of jiraIssueKeyBatches(discoveredIssueKeys, 500)) {
    const existingSnapshots = await database.jiraIssueSnapshot.findMany({
      where: { projectId: run.projectId, issueKey: { in: issueKeys } },
      select: { id: true, issueKey: true },
    });
    existingSnapshots.forEach((snapshot) => {
      snapshotIdByIssueKey.set(snapshot.issueKey.toUpperCase(), snapshot.id);
    });
  }

  const [settings, unversionedProjections] = await Promise.all([
    database.jiraAnalyticsSettings.findUnique({
      where: { projectId: run.projectId },
      select: {
        historyCursorUpdatedAt: true,
        historyCursorJiraIssueId: true,
        historyLastFullReconciledAt: true,
        historyFullCursorIssueKey: true,
        historyFullStartedAt: true,
      },
    }),
    run.historyWriteEnabled
      ? database.jiraIssueSnapshot.findMany({
          where: {
            projectId: run.projectId,
            retiredAt: null,
            projectionUnversionedSince: { not: null },
          },
          select: { issueKey: true },
        })
      : Promise.resolve([]),
  ]);
  const unversionedIssueKeys = normalizedJiraIssueKeys(
    unversionedProjections.map((snapshot) => snapshot.issueKey),
  );
  const historyGapRecovery = unversionedIssueKeys.length > 0;
  const storedCursor = !run.scopeChanged
    && settings?.historyCursorUpdatedAt
    && settings.historyCursorJiraIssueId
    ? { updatedAt: settings.historyCursorUpdatedAt, jiraIssueId: settings.historyCursorJiraIssueId }
    : null;
  let finalHistoryCursor = storedCursor;
  let finalFullReconciledAt = settings?.historyLastFullReconciledAt ?? null;
  let finalFullCursorIssueKey = settings?.historyFullCursorIssueKey ?? null;
  let finalFullStartedAt = settings?.historyFullStartedAt ?? null;
  const fullReconciliation = run.kind === JiraSyncRunKind.BACKFILL
    || !storedCursor
    || run.scopeChanged
    || Boolean(settings?.historyFullCursorIssueKey)
    || jiraHistoryNeedsFullReconciliation(settings?.historyLastFullReconciledAt, syncedAt);
  const [dueRetryKeyList, pendingRetryKeys] = await Promise.all([
    dueJiraHistoryRetryKeys(database, run.projectId, syncedAt),
    pendingJiraHistoryRetryKeys(database, run.projectId),
  ]);
  const dueRetryKeys = new Set(dueRetryKeyList.map((key) => key.toUpperCase()));
  const discoveredSet = new Set(discoveredIssueKeys);
  const historyIssueKeySet = new Set<string>();

  if (fullReconciliation) {
    const restartFullSweep = run.scopeChanged
      || (run.kind === JiraSyncRunKind.BACKFILL && !run.resumeCursorIssueKey);
    const resumeAfter = jiraHistoryResumeAfter(
      run.resumeCursorIssueKey,
      restartFullSweep,
      settings?.historyFullCursorIssueKey ?? null,
    );
    discoveredIssueKeys
      .filter((key) => !resumeAfter || key > resumeAfter)
      .filter((key) => run.kind === JiraSyncRunKind.BACKFILL
        || jiraHistoryIssueIsRetryEligible(key, pendingRetryKeys, dueRetryKeys))
      .forEach((key) => historyIssueKeySet.add(key));
    finalFullStartedAt = jiraHistoryFullSweepStartedAt(
      resumeAfter,
      finalFullStartedAt,
      run.startedAt,
      syncedAt,
    );
  } else if (storedCursor) {
    for (const issueKeys of jiraIssueKeyBatches(
      discoveredIssueKeys,
      JIRA_SYNC_DISCOVERY_PAGE_SIZE,
    )) {
      abortIfNeeded(options.signal);
      const changed = await fetchJiraIssueKeysWithMeta(
        jiraJqlWithIssueKeys(jiraHistoryUpdatedSinceJql(storedCursor.updatedAt, new Date()), issueKeys),
        {
          baseUrl: run.jiraBaseUrl ?? undefined,
          fetchAllPages: true,
          pageSize: JIRA_SYNC_DISCOVERY_PAGE_SIZE,
          deadlineAt,
        },
      );
      if (changed.jiraUser) jiraUsers.add(changed.jiraUser);
      changed.issueKeys.forEach((key) => {
        const normalized = key.toUpperCase();
        if (jiraHistoryIssueIsRetryEligible(normalized, pendingRetryKeys, dueRetryKeys)) {
          historyIssueKeySet.add(normalized);
        }
      });
    }
    discoveredIssueKeys
      .filter((key) => !snapshotIdByIssueKey.has(key))
      .filter((key) => jiraHistoryIssueIsRetryEligible(key, pendingRetryKeys, dueRetryKeys))
      .forEach((key) => historyIssueKeySet.add(key));
  }
  dueRetryKeys.forEach((key) => {
    const normalized = key.toUpperCase();
    if (discoveredSet.has(normalized)) historyIssueKeySet.add(normalized);
  });
  unversionedIssueKeys
    .filter((key) => discoveredSet.has(key))
    .filter((key) => jiraHistoryIssueIsRetryEligible(key, pendingRetryKeys, dueRetryKeys))
    .forEach((key) => historyIssueKeySet.add(key));
  const historyIssueKeys = jiraHistoryIssueKeysAfterResume(
    normalizedJiraIssueKeys([...historyIssueKeySet]),
    run.resumeCursorIssueKey,
  );
  const configuredPageSize = resolveJiraConfig(process.env, {
    baseUrl: run.jiraBaseUrl ?? undefined,
  }).maxResults;
  const batches = jiraIssueKeyBatches(
    historyIssueKeys,
    Math.min(JIRA_HISTORY_BATCH_SIZE, configuredPageSize),
  );
  let hydratedIssueCount = run.hydratedIssueCount;
  let attemptHydratedIssueCount = 0;
  options.onProgress?.({ phase: 'HISTORY', done: 0, total: historyIssueKeys.length, unit: 'issues' });

  const queueHistoryFetchFailure = async (
    issueKey: string,
    error: unknown,
    reasonCode = 'FETCH_ISSUE_FAILED',
  ) => {
    if (run.historyWriteEnabled) {
      await database.$transaction(async (transaction) => {
        await assertJiraSyncFence(transaction, fence);
        await queueJiraHistoryRetryInTransaction(transaction, {
          projectId: run.projectId,
          issueKey,
          jiraIssueId: null,
          reasonCode,
          error,
          observedUpdatedAt: null,
          failedAt: syncedAt,
        });
      }, JIRA_SYNC_TRANSACTION_OPTIONS);
    }
    historyFailures.push({
      issueKey,
      reasonCode,
      message: error instanceof Error ? error.message : String(error),
    });
  };
  const fetchHistoryIssues = (issueKeys: readonly string[]) =>
    fetchJiraIssuesWithMeta(jiraIssueKeyBatchJql(issueKeys), {
      baseUrl: run.jiraBaseUrl ?? undefined,
      fetchAllPages: true,
      includeAnalyticsFields: true,
      includeChangelog: true,
      includeRemoteDevelopment: true,
      includeHistoryDocument: run.historyWriteEnabled,
      remoteDevelopmentCache,
      deadlineAt,
    });
  const applyHistoryResult = async (
    requestedIssueKeys: readonly string[],
    jiraResult: Awaited<ReturnType<typeof fetchJiraIssuesWithMeta>>,
  ) => {
    if (jiraResult.jiraUser) jiraUsers.add(jiraResult.jiraUser);
    const { missingKeys, unexpectedKeys } = jiraIssueKeyBatchDifference(
      requestedIssueKeys,
      jiraResult.issues.map((issue) => issue.key),
    );
    if (unexpectedKeys.length > 0) {
      throw new Error(`Jira вернула незапрошенные тикеты: ${unexpectedKeys.join(', ')}`);
    }
    for (const issueKey of missingKeys) {
      await queueHistoryFetchFailure(
        issueKey,
        'Jira did not return a discovered issue during history hydration',
        'FETCH_MISSING',
      );
    }
    const syncResult = await syncJiraAnalyticsIssues(
      database,
      fence,
      jiraResult.issues,
      syncedAt,
      run.historyWriteEnabled,
    );
    historyFailures.push(...syncResult.failures);
    jiraResult.issues.forEach((issue, index) => {
      const snapshot = syncResult.snapshots[index];
      if (!snapshot) return;
      syncedIssueKeys.add(issue.key.toUpperCase());
      snapshotIdByIssueKey.set(issue.key.toUpperCase(), snapshot.id);
      hydratedIssueCount += 1;
      attemptHydratedIssueCount += 1;
    });
  };

  for (const issueKeys of batches) {
    abortIfNeeded(options.signal);
    await enforceHistoryCapacity();
    try {
      await applyHistoryResult(issueKeys, await fetchHistoryIssues(issueKeys));
    } catch (error) {
      if (isFatalJiraHistoryBatchError(error)) throw error;
      for (const issueKey of issueKeys) {
        try {
          await applyHistoryResult([issueKey], await fetchHistoryIssues([issueKey]));
        } catch (issueError) {
          if (isFatalJiraHistoryBatchError(issueError)) throw issueError;
          await queueHistoryFetchFailure(issueKey, issueError);
        }
      }
    }
    await enforceHistoryCapacity();
    const batchLastKey = issueKeys.at(-1) ?? null;
    if (fullReconciliation) {
      finalFullCursorIssueKey = jiraHistoryFullCursorAfterBatch(
        finalFullCursorIssueKey,
        batchLastKey,
      );
    }
    await checkpointJiraSyncRun(database, fence, {
      phase: 'HISTORY',
      resumeCursorIssueKey: batchLastKey,
      discoveredIssueCount,
      hydratedIssueCount,
      retriesQueued: run.retriesQueued + historyFailures.length,
    });
    if (run.historyWriteEnabled && fullReconciliation) {
      const checkpoint = await database.$executeRaw(Prisma.sql`
        UPDATE "JiraAnalyticsSettings"
           SET "historyFullCursorIssueKey" = ${finalFullCursorIssueKey},
               "historyFullStartedAt" = ${finalFullStartedAt},
               "updatedAt" = now()
         WHERE "projectId" = ${run.projectId}
           AND "syncRunId" = ${run.id}
           AND "syncFenceToken" = ${run.fenceToken}
           AND "syncLockExpiresAt" > now()
      `);
      if (checkpoint !== 1) throw new JiraSyncFencedError();
    }
    options.onProgress?.({
      phase: 'HISTORY',
      done: Math.min(historyIssueKeys.length, attemptHydratedIssueCount + historyFailures.length),
      total: historyIssueKeys.length,
      unit: 'issues',
    });
  }

  const freshHistoryAttempts = historyIssueKeys.filter((key) => !pendingRetryKeys.has(key)).length;
  if (jiraHistorySyncFailedCompletely(freshHistoryAttempts, syncedIssueKeys.size)) {
    throw new Error('Ни одно наблюдение Jira не сохранено: см. диагностику истории');
  }
  const remainingRetryKeys = await pendingJiraHistoryRetryKeys(database, run.projectId);
  const pendingDiscoveredRetries = [...remainingRetryKeys]
    .filter((key) => discoveredSet.has(key)).length;
  const fullSweep = jiraHistoryFullSweepState(fullReconciliation, pendingDiscoveredRetries);
  if (run.historyWriteEnabled && fullSweep.returnToIncremental) {
    finalFullReconciledAt = syncedAt;
    finalFullCursorIssueKey = null;
    finalHistoryCursor = { updatedAt: finalFullStartedAt ?? syncedAt, jiraIssueId: '0' };
    finalFullStartedAt = null;
  } else if (run.historyWriteEnabled) {
    finalHistoryCursor = { updatedAt: run.startedAt, jiraIssueId: '0' };
  }
  if (snapshotIdByIssueKey.size === 0) {
    throw new Error('Не удалось сохранить данные ни для одного найденного тикета');
  }

  const activeSnapshots: JiraAnalyticsSyncedSnapshot[] = [];
  const activeSnapshotIds = [...new Set(snapshotIdByIssueKey.values())];
  for (let offset = 0; offset < activeSnapshotIds.length; offset += 500) {
    activeSnapshots.push(...await database.jiraIssueSnapshot.findMany({
      where: { id: { in: activeSnapshotIds.slice(offset, offset + 500) } },
      select: { id: true, issueType: true, criticalPriorityAt: true, criticalEndPriority: true },
    }));
  }
  const tracked = jiraCriticalBugSlaSnapshotIds(activeSnapshots);
  trackedSnapshotIds.push(...tracked);
  const criticalBugSlaCandidates = activeSnapshots.filter((item) => item.criticalPriorityAt).length;

  options.onProgress?.({ phase: 'SECTIONS', done: 0, total: workSections.length, unit: 'sections' });
  const sectionStats: Array<{
    id: string;
    title: string;
    sortOrder: number;
    issues: number;
    jiraUser: string | null;
    issueKeys: string[];
  }> = [];
  for (const [index, section] of workSections.entries()) {
    abortIfNeeded(options.signal);
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
        baseUrl: run.jiraBaseUrl ?? undefined,
        fetchAllPages: true,
        pageSize: JIRA_SYNC_DISCOVERY_PAGE_SIZE,
        deadlineAt,
      });
      if (jiraResult.jiraUser) {
        sectionJiraUser = jiraResult.jiraUser;
        jiraUsers.add(jiraResult.jiraUser);
      }
      sectionIssueKeys.push(...jiraResult.issueKeys);
    }
    const issueKeys = normalizedJiraIssueKeys(sectionIssueKeys)
      .filter((key) => snapshotIdByIssueKey.has(key));
    sectionStats.push({
      id: section.id,
      title: section.title,
      sortOrder: section.sortOrder,
      issues: issueKeys.length,
      jiraUser: sectionJiraUser,
      issueKeys,
    });
    options.onProgress?.({
      phase: 'SECTIONS',
      done: index + 1,
      total: workSections.length,
      unit: 'sections',
    });
  }

  await extendJiraSyncLease(database, fence, 180_000);
  await database.$transaction(async (transaction) => {
    const updated = await transaction.$executeRaw(Prisma.sql`
      UPDATE "JiraAnalyticsSettings"
         SET "lastSyncedAt" = ${syncedAt},
             "historyCursorUpdatedAt" = CASE WHEN ${run.historyWriteEnabled}
               THEN ${finalHistoryCursor?.updatedAt ?? null}
               ELSE "historyCursorUpdatedAt" END,
             "historyCursorJiraIssueId" = CASE WHEN ${run.historyWriteEnabled}
               THEN ${finalHistoryCursor?.jiraIssueId ?? null}
               ELSE "historyCursorJiraIssueId" END,
             "historyLastFullReconciledAt" = CASE WHEN ${run.historyWriteEnabled}
               THEN ${finalFullReconciledAt}
               ELSE "historyLastFullReconciledAt" END,
             "historyFullCursorIssueKey" = CASE WHEN ${run.historyWriteEnabled}
               THEN ${finalFullCursorIssueKey}
               ELSE "historyFullCursorIssueKey" END,
             "historyFullStartedAt" = CASE WHEN ${run.historyWriteEnabled}
               THEN ${finalFullStartedAt}
               ELSE "historyFullStartedAt" END,
             "updatedAt" = now()
       WHERE "projectId" = ${run.projectId}
         AND "syncRunId" = ${run.id}
         AND "syncFenceToken" = ${run.fenceToken}
         AND "syncLockExpiresAt" > now()
    `);
    if (updated !== 1) throw new JiraSyncFencedError();
    await finalizeJiraAnalyticsSync(
      transaction,
      run.projectId,
      syncedAt,
      sectionStats.map((section) => ({ sectionId: section.id, issueKeys: section.issueKeys })),
      snapshotIdByIssueKey,
      discoveredIssueKeys,
      trackedSnapshotIds,
    );
  }, JIRA_SYNC_TRANSACTION_OPTIONS);

  const [versionsCreated, remainingUnversionedProjections] = await Promise.all([
    database.jiraIssueVersion.count({
      where: { projectId: run.projectId, syncRunId: run.id },
    }),
    historyGapRecovery && run.historyWriteEnabled
      ? database.jiraIssueSnapshot.count({
          where: {
            projectId: run.projectId,
            retiredAt: null,
            projectionUnversionedSince: { not: null },
          },
        })
      : Promise.resolve(historyGapRecovery ? unversionedIssueKeys.length : 0),
  ]);
  const historyGapRecoveryClean = historyGapRecovery
    && run.historyWriteEnabled
    && remainingUnversionedProjections === 0;
  const publicSectionStats = sectionStats.map(({ issueKeys: _keys, ...section }) => section);
  const result: Prisma.InputJsonValue = {
    synced: snapshotIdByIssueKey.size,
    history: {
      enabled: run.historyWriteEnabled,
      processed: Math.min(
        discoveredIssueCount,
        hydratedIssueCount + run.retriesQueued + historyFailures.length,
      ),
      processedThisAttempt: attemptHydratedIssueCount + historyFailures.length,
      retriesQueued: run.retriesQueued + historyFailures.length,
      fullReconciliation,
      fullReconciliationClean: run.historyWriteEnabled && fullSweep.clean,
      historyGapRecovery,
      historyGapRecoveryClean,
      disabledReason: capacityDegraded ? 'CAPACITY_LIMIT' : null,
      pendingRetries: pendingDiscoveredRetries,
      cursorUpdatedAt: run.historyWriteEnabled
        ? finalHistoryCursor?.updatedAt.toISOString() ?? null
        : settings?.historyCursorUpdatedAt?.toISOString() ?? null,
      cursorJiraIssueId: run.historyWriteEnabled
        ? finalHistoryCursor?.jiraIssueId ?? null
        : settings?.historyCursorJiraIssueId ?? null,
    },
    jiraScopeType: run.jiraScopeType,
    jiraScopeValue: run.jiraScopeValue,
    criticalBugSlaConfigured: true,
    criticalBugSlaScope: run.jiraScopeType.toLowerCase(),
    criticalBugSlaProjectKeys,
    criticalBugSlaCandidates,
    criticalBugSlaIssues: trackedSnapshotIds.length,
    configuredSections: configuredSections.length,
    totalSections: workSections.length,
    jiraUsers: [...jiraUsers],
    sections: publicSectionStats,
  };
  logEvent('info', 'jira.sync.completed', {
    projectId: run.projectId,
    runId: run.id,
    kind: run.kind,
    jiraScopeType: run.jiraScopeType,
    configuredSections: configuredSections.length,
    syncedIssues: snapshotIdByIssueKey.size,
    historyIssuesProcessed: historyIssueKeys.length,
    historyRetriesQueued: historyFailures.length,
    historyWriteEnabled: run.historyWriteEnabled,
  });
  return {
    result,
    status: historyFailures.length > 0 || pendingDiscoveredRetries > 0
      ? 'SUCCEEDED_WITH_RETRIES'
      : 'SUCCEEDED',
    discoveredIssueCount,
    hydratedIssueCount,
    versionsCreated,
    retriesQueued: run.retriesQueued + historyFailures.length,
  };
}
