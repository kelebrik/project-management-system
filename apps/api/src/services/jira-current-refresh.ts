import {
  isJiraBugIssueType,
  isJiraCriticalPriority,
  isJiraUnresolvedResolution,
  type JiraCurrentFreshness,
} from '@pms/shared';
import {
  JiraSyncRunKind,
  JiraSyncRunStatus,
  Prisma,
  type PrismaClient,
} from '@prisma/client';

import { prisma } from '../db.js';
import {
  fetchJiraIssuesWithMeta,
  type JiraIssue,
} from '../jira.js';
import { logEvent } from '../server/logger.js';
import { notifyJiraSyncRunner } from './jira-sync-runtime.js';
import {
  assertJiraSyncFence,
  checkpointJiraSyncRun,
  enqueueJiraSyncRun,
  extendJiraSyncLease,
  findActiveJiraSyncRun,
  JiraSyncFencedError,
  JIRA_SYNC_POLL_AFTER_MS,
  type ClaimedJiraSyncRun,
  type JiraSyncFence,
} from './jira-sync-runs.js';
import {
  jiraIssueKeyBatches,
  jiraParentKeyBatchJql,
  normalizedJiraIssueKeys,
} from './jira-work-sections.js';
import type { JiraSyncPipelineResult } from './jira-sync-pipeline.js';

const JIRA_CURRENT_PAGE_SIZE = 100;
const JIRA_CURRENT_EPIC_PARENT_BATCH_SIZE = 50;
const JIRA_CURRENT_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;
const JIRA_EXPLICIT_RUN_POLL_AFTER_MS = 60_000;

function positiveEnvInt(name: string, fallback: number, env: NodeJS.ProcessEnv) {
  const parsed = Number(env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function jiraCurrentRefreshPolicy(env: NodeJS.ProcessEnv = process.env) {
  const staleAfterMs = positiveEnvInt('JIRA_CURRENT_REFRESH_TTL_MS', 5 * 60_000, env);
  return {
    staleAfterMs,
    retryAfterMs: positiveEnvInt('JIRA_CURRENT_REFRESH_RETRY_MS', 5 * 60_000, env),
  };
}

type FreshnessRun = {
  id: string;
  status: JiraSyncRunStatus;
  finishedAt: Date | null;
  emptyScope?: boolean;
};

type ActiveFreshnessRun = FreshnessRun & {
  kind: JiraSyncRunKind;
};

type JiraCurrentFreshnessInput = {
  configured: boolean;
  refreshAllowed: boolean;
  refreshedAt: Date | null;
  activeRun: ActiveFreshnessRun | null;
  latestCurrentRun: FreshnessRun | null;
};

export function latestJiraProjectionRefreshAt(
  currentProjectionRefreshedAt: Date | null | undefined,
  lastSyncedAt: Date | null | undefined,
) {
  if (!currentProjectionRefreshedAt) return lastSyncedAt ?? null;
  if (!lastSyncedAt) return currentProjectionRefreshedAt;
  return currentProjectionRefreshedAt >= lastSyncedAt
    ? currentProjectionRefreshedAt
    : lastSyncedAt;
}

export function jiraCurrentFreshnessFromState(
  input: JiraCurrentFreshnessInput,
  now = new Date(),
  policy = jiraCurrentRefreshPolicy(),
): JiraCurrentFreshness {
  const ageMs = input.refreshedAt
    ? Math.max(0, now.getTime() - input.refreshedAt.getTime())
    : null;
  const common = {
    refreshedAt: input.refreshedAt?.toISOString() ?? null,
    ageSeconds: ageMs === null ? null : Math.floor(ageMs / 1_000),
    staleAfterSeconds: Math.ceil(policy.staleAfterMs / 1_000),
    refreshAllowed: input.refreshAllowed,
  };
  if (!input.configured) {
    return { ...common, state: 'NOT_CONFIGURED', pollAfterMs: null, runId: null };
  }
  if (input.activeRun) {
    return {
      ...common,
      state: 'REFRESHING',
      pollAfterMs: input.activeRun.kind === JiraSyncRunKind.CURRENT
        ? JIRA_SYNC_POLL_AFTER_MS
        : JIRA_EXPLICIT_RUN_POLL_AFTER_MS,
      runId: input.activeRun.id,
    };
  }
  const latestFailure = input.latestCurrentRun
    && (
      input.latestCurrentRun.status === JiraSyncRunStatus.FAILED
      || input.latestCurrentRun.status === JiraSyncRunStatus.STOPPED_CAPACITY
      || input.latestCurrentRun.status === JiraSyncRunStatus.CANCELLED
      || input.latestCurrentRun.emptyScope
    )
    ? input.latestCurrentRun
    : null;
  const failureAt = latestFailure?.finishedAt?.getTime() ?? null;
  const failedAfterRefresh = failureAt !== null
    && (!input.refreshedAt || failureAt >= input.refreshedAt.getTime());
  const retryRemaining = failedAfterRefresh
    ? Math.max(0, policy.retryAfterMs - (now.getTime() - failureAt!))
    : 0;
  if (retryRemaining > 0) {
    return {
      ...common,
      state: 'ERROR',
      pollAfterMs: input.refreshAllowed ? retryRemaining : null,
      runId: latestFailure?.id ?? null,
    };
  }
  if (ageMs !== null && ageMs <= policy.staleAfterMs) {
    return {
      ...common,
      state: 'FRESH',
      pollAfterMs: input.refreshAllowed
        ? Math.max(1_000, policy.staleAfterMs - ageMs + 1_000)
        : null,
      runId: null,
    };
  }
  return {
    ...common,
    state: 'STALE',
    pollAfterMs: input.refreshAllowed ? 0 : null,
    runId: null,
  };
}

export async function getJiraCurrentFreshness(
  database: PrismaClient,
  projectId: string,
  now = new Date(),
) {
  const [project, activeRun, latestCurrentRun] = await Promise.all([
    database.project.findUnique({
      where: { id: projectId },
      select: {
        status: true,
        jiraAnalyticsSettings: {
          select: {
            jiraScopeType: true,
            jiraScopeValue: true,
            lastSyncedAt: true,
            currentProjectionRefreshedAt: true,
          },
        },
      },
    }),
    findActiveJiraSyncRun(database, projectId),
    database.jiraSyncRun.findFirst({
      where: { projectId, kind: JiraSyncRunKind.CURRENT },
      orderBy: { enqueuedAt: 'desc' },
      select: { id: true, status: true, finishedAt: true, result: true },
    }),
  ]);
  const settings = project?.jiraAnalyticsSettings;
  const configured = Boolean(settings?.jiraScopeValue.trim() && settings.lastSyncedAt);
  return jiraCurrentFreshnessFromState({
    configured,
    refreshAllowed: Boolean(project && project.status !== 'CLOSED' && configured),
    refreshedAt: latestJiraProjectionRefreshAt(
      settings?.currentProjectionRefreshedAt,
      settings?.lastSyncedAt,
    ),
    activeRun: activeRun
      ? {
        id: activeRun.id,
        kind: activeRun.kind,
        status: activeRun.status,
        finishedAt: activeRun.finishedAt,
      }
      : null,
    latestCurrentRun: latestCurrentRun
      ? {
        id: latestCurrentRun.id,
        status: latestCurrentRun.status,
        finishedAt: latestCurrentRun.finishedAt,
        emptyScope: Boolean(
          latestCurrentRun.result
          && typeof latestCurrentRun.result === 'object'
          && !Array.isArray(latestCurrentRun.result)
          && latestCurrentRun.result.emptyScope === true
        ),
      }
      : null,
  }, now);
}

export async function requestJiraCurrentRefresh(
  database: PrismaClient,
  projectId: string,
  requestedBy: { id: string; role: string } | null,
  now = new Date(),
) {
  const freshness = await getJiraCurrentFreshness(database, projectId, now);
  if (
    freshness.state === 'FRESH'
    || freshness.state === 'REFRESHING'
    || freshness.state === 'NOT_CONFIGURED'
    || !freshness.refreshAllowed
    || (freshness.state === 'ERROR' && (freshness.pollAfterMs ?? 0) > 0)
  ) {
    return { freshness, queued: false };
  }

  const project = await database.project.findUnique({
    where: { id: projectId },
    select: {
      jiraAnalyticsSettings: {
        select: { jiraScopeType: true, jiraScopeValue: true },
      },
      jiraIntegration: { select: { baseUrl: true } },
      jiraSyncRuns: {
        where: { jiraBaseUrl: { not: null } },
        orderBy: { enqueuedAt: 'desc' },
        take: 1,
        select: { jiraBaseUrl: true },
      },
    },
  });
  const settings = project?.jiraAnalyticsSettings;
  if (!project || !settings?.jiraScopeValue.trim()) {
    return { freshness: await getJiraCurrentFreshness(database, projectId), queued: false };
  }
  try {
    const run = await enqueueJiraSyncRun(database, {
      projectId,
      kind: JiraSyncRunKind.CURRENT,
      scopeType: settings.jiraScopeType,
      scopeValue: settings.jiraScopeValue,
      jiraBaseUrl: project.jiraSyncRuns[0]?.jiraBaseUrl ?? project.jiraIntegration?.baseUrl ?? undefined,
      scopeChanged: false,
      requestedById: requestedBy?.id ?? null,
      requestedByRole: requestedBy?.role ?? null,
      preserveStoredScope: true,
    });
    notifyJiraSyncRunner();
    logEvent('info', 'jira.current_refresh.queued', { projectId, runId: run.id });
    return {
      freshness: await getJiraCurrentFreshness(database, projectId),
      queued: true,
    };
  } catch (error) {
    if (
      error instanceof JiraSyncFencedError
      || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    ) {
      const latest = await getJiraCurrentFreshness(database, projectId);
      return {
        freshness: latest.state === 'STALE'
          ? {
            ...latest,
            pollAfterMs: latest.refreshAllowed
              ? jiraCurrentRefreshPolicy().retryAfterMs
              : null,
          }
          : latest,
        queued: false,
      };
    }
    throw error;
  }
}

type CurrentSnapshot = {
  id: string;
  jiraId: string | null;
  issueUrl: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string | null;
  reporter: string | null;
  issueType: string;
  labels: string[];
  resolution: string | null;
  sprint: string | null;
  issueCreatedAt: Date | null;
  resolutionAt: Date | null;
  updatedAt: Date;
  retiredAt: Date | null;
  projectionUnversionedSince: Date | null;
  criticalPriorityAt: Date | null;
  criticalEndPriority: string | null;
  criticalSlaTracked: boolean;
};

function sameDate(left: Date | null | undefined, right: Date | null | undefined) {
  return left?.getTime() === right?.getTime();
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

export function jiraCurrentProjectionChanged(existing: CurrentSnapshot, issue: JiraIssue) {
  return (
    (issue.jiraId !== null && issue.jiraId !== existing.jiraId)
    || issue.url !== existing.issueUrl
    || issue.summary !== existing.summary
    || issue.status !== existing.status
    || issue.priority !== existing.priority
    || issue.assignee !== existing.assignee
    || issue.reporter !== existing.reporter
    || issue.issueType !== existing.issueType
    || !sameStrings(issue.labels, existing.labels)
    || issue.resolution !== existing.resolution
    || (issue.sprintAvailable && issue.sprint !== existing.sprint)
    || (issue.createdAt !== null && !sameDate(issue.createdAt, existing.issueCreatedAt))
    || !sameDate(issue.resolutionAt, existing.resolutionAt)
    || !sameDate(issue.updatedAt, existing.updatedAt)
    || existing.retiredAt !== null
  );
}

export function jiraCurrentSlaState(
  existing: Pick<CurrentSnapshot, 'criticalPriorityAt' | 'criticalEndPriority' | 'criticalSlaTracked'> | null,
  issue: Pick<JiraIssue, 'issueType' | 'priority' | 'resolution' | 'resolutionAt'>,
) {
  if (!existing) {
    return { criticalEndPriority: issue.priority, criticalSlaTracked: false };
  }
  const unresolved = isJiraUnresolvedResolution(issue.resolution) && issue.resolutionAt === null;
  if (!unresolved) {
    return {
      criticalEndPriority: existing.criticalEndPriority,
      criticalSlaTracked: existing.criticalSlaTracked,
    };
  }
  return {
    criticalEndPriority: issue.priority,
    criticalSlaTracked: Boolean(
      existing.criticalPriorityAt
      && isJiraBugIssueType(issue.issueType)
      && isJiraCriticalPriority(issue.priority)
    ),
  };
}

async function persistCurrentIssue(
  database: PrismaClient,
  fence: JiraSyncFence,
  issue: JiraIssue,
  syncedAt: Date,
) {
  return database.$transaction(async (transaction) => {
    await assertJiraSyncFence(transaction, fence);
    await transaction.$queryRaw<Array<{ lock: string }>>(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${fence.projectId}:${issue.jiraId ?? issue.key}`}, 0))::text AS lock`,
    );
    const existing = await transaction.jiraIssueSnapshot.findUnique({
      where: { projectId_issueKey: { projectId: fence.projectId, issueKey: issue.key } },
      select: {
        id: true,
        jiraId: true,
        issueUrl: true,
        summary: true,
        status: true,
        priority: true,
        assignee: true,
        reporter: true,
        issueType: true,
        labels: true,
        resolution: true,
        sprint: true,
        issueCreatedAt: true,
        resolutionAt: true,
        updatedAt: true,
        retiredAt: true,
        projectionUnversionedSince: true,
        criticalPriorityAt: true,
        criticalEndPriority: true,
        criticalSlaTracked: true,
      },
    });
    if (existing && existing.updatedAt > issue.updatedAt) {
      return transaction.jiraIssueSnapshot.update({
        where: { id: existing.id },
        data: {
          syncedAt,
          retiredAt: null,
          projectionUnversionedSince: existing.retiredAt
            ? existing.projectionUnversionedSince ?? syncedAt
            : existing.projectionUnversionedSince,
        },
        select: { id: true },
      });
    }

    const changed = existing ? jiraCurrentProjectionChanged(existing, issue) : true;
    const currentSlaState = jiraCurrentSlaState(existing, issue);
    return transaction.jiraIssueSnapshot.upsert({
      where: { projectId_issueKey: { projectId: fence.projectId, issueKey: issue.key } },
      update: {
        jiraId: issue.jiraId ?? undefined,
        issueUrl: issue.url,
        summary: issue.summary,
        status: issue.status,
        priority: issue.priority,
        assignee: issue.assignee,
        reporter: issue.reporter,
        issueType: issue.issueType,
        labels: issue.labels,
        resolution: issue.resolution,
        sprint: issue.sprintAvailable ? issue.sprint : undefined,
        issueCreatedAt: issue.createdAt ?? undefined,
        resolutionAt: issue.resolutionAt,
        updatedAt: issue.updatedAt,
        syncedAt,
        retiredAt: null,
        projectionUnversionedSince: changed
          ? existing?.projectionUnversionedSince ?? syncedAt
          : existing?.projectionUnversionedSince,
        criticalEndPriority: currentSlaState.criticalEndPriority,
        criticalSlaTracked: currentSlaState.criticalSlaTracked,
      },
      create: {
        projectId: fence.projectId,
        jiraId: issue.jiraId,
        issueKey: issue.key,
        issueUrl: issue.url,
        summary: issue.summary,
        status: issue.status,
        priority: issue.priority,
        assignee: issue.assignee,
        reporter: issue.reporter,
        issueType: issue.issueType,
        labels: issue.labels,
        resolution: issue.resolution,
        sprint: issue.sprint,
        issueCreatedAt: issue.createdAt,
        resolutionAt: issue.resolutionAt,
        updatedAt: issue.updatedAt,
        syncedAt,
        projectionUnversionedSince: syncedAt,
        criticalEndPriority: currentSlaState.criticalEndPriority,
        criticalSlaTracked: currentSlaState.criticalSlaTracked,
      },
      select: { id: true },
    });
  }, JIRA_CURRENT_TRANSACTION_OPTIONS);
}

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new JiraSyncFencedError();
}

async function fetchCurrentIssues(run: ClaimedJiraSyncRun, signal?: AbortSignal) {
  const jiraUsers = new Set<string>();
  const options = {
    baseUrl: run.jiraBaseUrl ?? undefined,
    fetchAllPages: true,
    includeAnalyticsFields: true,
    includeChangelog: false,
    includeRemoteDevelopment: false,
    includeHistoryDocument: false,
    pageSize: JIRA_CURRENT_PAGE_SIZE,
    deadlineAt: run.deadlineAt.getTime(),
  } as const;
  abortIfNeeded(signal);
  const primary = await fetchJiraIssuesWithMeta('ORDER BY key ASC', {
    ...options,
    analyticsScope: { type: run.jiraScopeType, value: run.jiraScopeValue },
  });
  if (primary.jiraUser) jiraUsers.add(primary.jiraUser);
  const byKey = new Map(primary.issues.map((issue) => [issue.key.toUpperCase(), issue]));
  if (run.jiraScopeType === 'EPIC' && byKey.size > 0) {
    for (const parentKeys of jiraIssueKeyBatches(
      [...byKey.keys()],
      JIRA_CURRENT_EPIC_PARENT_BATCH_SIZE,
    )) {
      abortIfNeeded(signal);
      const subtasks = await fetchJiraIssuesWithMeta(jiraParentKeyBatchJql(parentKeys), options);
      if (subtasks.jiraUser) jiraUsers.add(subtasks.jiraUser);
      subtasks.issues.forEach((issue) => byKey.set(issue.key.toUpperCase(), issue));
    }
  }
  return {
    issues: [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key)),
    jiraUsers: [...jiraUsers],
  };
}

export async function runJiraCurrentRefreshPipeline(
  run: ClaimedJiraSyncRun,
  options: {
    prisma?: PrismaClient;
    signal?: AbortSignal;
    onProgress?: (progress: { phase: string; done: number; total: number; unit: string }) => void;
    fetchIssues?: typeof fetchCurrentIssues;
  } = {},
): Promise<JiraSyncPipelineResult> {
  const database = options.prisma ?? prisma;
  const fence = { runId: run.id, projectId: run.projectId, fenceToken: run.fenceToken };
  const syncedAt = new Date();
  options.onProgress?.({ phase: 'CURRENT_FETCH', done: 0, total: 0, unit: 'issues' });
  const fetched = await (options.fetchIssues ?? fetchCurrentIssues)(run, options.signal);
  const discoveredIssueKeys = normalizedJiraIssueKeys(fetched.issues.map((issue) => issue.key));
  await checkpointJiraSyncRun(database, fence, {
    phase: 'CURRENT_WRITE',
    discoveredIssueCount: discoveredIssueKeys.length,
  });
  if (fetched.issues.length === 0) {
    return {
      status: 'SUCCEEDED',
      discoveredIssueCount: 0,
      hydratedIssueCount: 0,
      versionsCreated: 0,
      retriesQueued: 0,
      result: {
        synced: 0,
        emptyScope: true,
        preservedExistingProjection: true,
        currentProjectionOnly: true,
        historyWriteEnabled: false,
        jiraScopeType: run.jiraScopeType,
        jiraScopeValue: run.jiraScopeValue,
        jiraUsers: fetched.jiraUsers,
        warning: run.jiraScopeType === 'LABEL'
          ? 'По указанному лейблу тикеты не найдены; прежние данные сохранены'
          : 'По указанному коду эпика тикеты не найдены; прежние данные сохранены',
      },
    };
  }
  options.onProgress?.({
    phase: 'CURRENT_WRITE',
    done: 0,
    total: fetched.issues.length,
    unit: 'issues',
  });

  const snapshotIdByIssueKey = new Map<string, string>();
  for (const [index, issue] of fetched.issues.entries()) {
    abortIfNeeded(options.signal);
    const snapshot = await persistCurrentIssue(database, fence, issue, syncedAt);
    snapshotIdByIssueKey.set(issue.key.toUpperCase(), snapshot.id);
    if ((index + 1) % 25 === 0 || index + 1 === fetched.issues.length) {
      await checkpointJiraSyncRun(database, fence, {
        phase: 'CURRENT_WRITE',
        hydratedIssueCount: index + 1,
      });
      options.onProgress?.({
        phase: 'CURRENT_WRITE',
        done: index + 1,
        total: fetched.issues.length,
        unit: 'issues',
      });
    }
  }

  await extendJiraSyncLease(database, fence, 180_000);
  await database.$transaction(async (transaction) => {
    await assertJiraSyncFence(transaction, fence);
    const activeSnapshotIds = [...snapshotIdByIssueKey.values()];
    const excludeActiveSnapshots = activeSnapshotIds.length > 0
      ? Prisma.sql`AND "id" NOT IN (${Prisma.join(activeSnapshotIds)})`
      : Prisma.empty;
    await transaction.$executeRaw(Prisma.sql`
      UPDATE "JiraIssueSnapshot"
         SET "retiredAt" = ${syncedAt},
             "criticalSlaTracked" = false,
             "projectionUnversionedSince" = COALESCE("projectionUnversionedSince", ${syncedAt})
       WHERE "projectId" = ${run.projectId}
         AND "retiredAt" IS NULL
         ${excludeActiveSnapshots}
    `);
    await transaction.jiraAnalyticsSettings.update({
      where: { projectId: run.projectId },
      data: { currentProjectionRefreshedAt: syncedAt },
    });
  }, JIRA_CURRENT_TRANSACTION_OPTIONS);

  return {
    status: 'SUCCEEDED',
    discoveredIssueCount: discoveredIssueKeys.length,
    hydratedIssueCount: fetched.issues.length,
    versionsCreated: 0,
    retriesQueued: 0,
    result: {
      synced: fetched.issues.length,
      currentProjectionOnly: true,
      historyWriteEnabled: false,
      jiraScopeType: run.jiraScopeType,
      jiraScopeValue: run.jiraScopeValue,
      jiraUsers: fetched.jiraUsers,
    },
  };
}
