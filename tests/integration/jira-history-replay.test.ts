import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  JIRA_SEMANTIC_EMPTY_DASHBOARD,
  jiraSemanticAggregateDefinitionSchema,
  jiraSemanticDashboardSchema,
} from '@pms/shared';
import { JiraSyncRunKind, Prisma, PrismaClient } from '@prisma/client';

import type { JiraIssue } from '../../apps/api/src/jira.js';
import {
  createPrismaJiraAnalyticsSyncStore,
  syncJiraIssueAnalytics,
} from '../../apps/api/src/services/jira-analytics-sync.js';
import { prepareJiraAsOfIssueBatches } from '../../apps/api/src/services/jira-history-asof.js';
import { jiraBackfillCompleteness } from '../../apps/api/src/services/jira-history.js';
import {
  clearJiraProjectData,
  JiraProjectDataBusyError,
} from '../../apps/api/src/services/jira-project-data.js';
import {
  requestJiraCurrentRefresh,
  runJiraCurrentRefreshPipeline,
} from '../../apps/api/src/services/jira-current-refresh.js';
import {
  ensureMissingJiraSystemSemanticAggregates,
  ensureJiraSystemSemanticAggregates,
  JIRA_SEMANTIC_DEFAULT_WIDGETS_VERSION,
  JIRA_SYSTEM_SEMANTIC_AGGREGATES,
} from '../../apps/api/src/services/jira-semantic-aggregates.js';
import {
  acquireJiraProjectionRebuildLease,
  assertJiraSyncFence,
  checkpointJiraSyncRun,
  claimNextJiraSyncRun,
  completeJiraSyncRun,
  enqueueJiraSyncRun,
  heartbeatJiraSyncRun,
  JiraSyncFencedError,
  JIRA_SYNC_RUN_MAX_WALL_MS,
  pauseJiraSyncRun,
  reapExpiredJiraSyncRuns,
  releaseJiraProjectionRebuildLease,
  releaseJiraSyncRunOnShutdown,
} from '../../apps/api/src/services/jira-sync-runs.js';

const testDatabaseUrl = process.env.JIRA_HISTORY_TEST_DATABASE_URL?.trim() ?? '';

async function createCurrentRefreshFixture(prisma: PrismaClient, prefix: string) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const businessUnit = await prisma.businessUnit.create({
    data: { code: `${prefix}-bu-${suffix}`, name: `${prefix} BU ${suffix}` },
  });
  const project = await prisma.project.create({
    data: {
      businessUnitId: businessUnit.id,
      code: `${prefix}-${suffix}`,
      name: `${prefix} current Jira refresh fixture`,
      portfolio: 'Integration',
      sponsor: 'Integration',
      projectManager: 'Integration',
      startDate: new Date('2026-08-01T00:00:00Z'),
      targetDate: new Date('2026-09-01T00:00:00Z'),
      budgetPlanned: '0',
      budgetForecast: '0',
      summary: 'Disposable integration fixture',
    },
  });
  const lastSyncedAt = new Date('2026-09-01T08:00:00Z');
  const currentProjectionRefreshedAt = new Date('2026-09-01T09:00:00Z');
  await prisma.jiraAnalyticsSettings.create({
    data: {
      projectId: project.id,
      jiraScopeType: 'LABEL',
      jiraScopeValue: `${prefix}-scope`,
      jiraLabel: `${prefix}-scope`,
      syncStatus: 'OK',
      lastSyncedAt,
      currentProjectionRefreshedAt,
    },
  });
  return { businessUnit, project, lastSyncedAt, currentProjectionRefreshedAt };
}

const emptyRequestSummary = {
  count: 0,
  durationMsTotal: 0,
  durationMsMax: 0,
  byRoute: {},
  byStatusClass: {},
};

function aggregateWithoutLabels(value: unknown) {
  const definition = jiraSemanticAggregateDefinitionSchema.parse(value);
  return {
    ...definition,
    outputFields: definition.outputFields.filter((field) => field.key !== 'labels'),
  };
}

function jiraIssue(summary: string, updatedAt: Date): JiraIssue {
  return {
    jiraId: '10001',
    key: 'A1RACE-1',
    url: 'https://jira.example/browse/A1RACE-1',
    summary,
    status: 'In Progress',
    priority: 'Major',
    assignee: null,
    reporter: 'Integration test',
    issueType: 'Task',
    statusCategory: 'In Progress',
    parentKey: null,
    epicKey: null,
    labels: ['a1-race'],
    sprintIds: [],
    resolution: null,
    resolutionAt: null,
    sprint: null,
    sprintAvailable: true,
    createdAt: new Date('2026-08-20T09:00:00Z'),
    criticalPriorityAt: null,
    criticalEndPriority: 'Major',
    updatedAt,
    transitions: [],
    transitionHistoryComplete: true,
    labelChanges: [],
    development: {
      commitCount: 0,
      mergeRequestCount: 0,
      updatedAt: null,
      available: true,
    },
    history: {
      document: {
        issue: {
          id: '10001',
          key: 'A1RACE-1',
          fields: {
            summary,
            status: { name: 'In Progress' },
            priority: { name: 'Major' },
            labels: ['a1-race'],
            created: '2026-08-20T09:00:00Z',
            updated: updatedAt.toISOString(),
          },
        },
        changelog: [],
        comments: [],
        worklogs: [],
        remoteLinks: [],
      },
      changelogComplete: true,
      commentsComplete: true,
      worklogsComplete: true,
      remoteLinksComplete: true,
      attachmentReferencesStripped: 0,
    },
  };
}

test('Jira history crash replay and concurrent workers are idempotent in PostgreSQL', {
  skip: !testDatabaseUrl,
}, async () => {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'JIRA_HISTORY_TEST_DATABASE_URL must target a test database');
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  let businessUnitId: string | null = null;
  let projectId: string | null = null;
  try {
    const businessUnit = await prisma.businessUnit.create({
      data: { code: `a1-race-${suffix}`, name: `A1 race ${suffix}` },
    });
    businessUnitId = businessUnit.id;
    const project = await prisma.project.create({
      data: {
        businessUnitId: businessUnit.id,
        code: `A1RACE-${suffix}`,
        name: 'A1 history race test',
        portfolio: 'Integration',
        sponsor: 'Integration',
        projectManager: 'Integration',
        startDate: new Date('2026-08-01T00:00:00Z'),
        targetDate: new Date('2026-09-01T00:00:00Z'),
        budgetPlanned: '0',
        budgetForecast: '0',
        summary: 'Disposable integration fixture',
      },
    });
    projectId = project.id;
    await prisma.jiraAnalyticsSettings.create({
      data: {
        projectId: project.id,
        jiraScopeValue: 'a1-race',
        jiraLabel: 'a1-race',
      },
    });

    const firstUpdatedAt = new Date('2026-08-21T09:00:00Z');
    const observedAt = new Date('2026-08-21T10:00:00Z');
    const first = jiraIssue('Committed before cursor crash', firstUpdatedAt);

    // Worker A commits the issue transaction, then crashes before its batch cursor update.
    await prisma.$transaction((transaction) =>
      syncJiraIssueAnalytics(
        createPrismaJiraAnalyticsSyncStore(transaction),
        project.id,
        first,
        observedAt,
        'worker-a',
      ));
    assert.equal((await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
      where: { projectId: project.id },
    })).historyCursorUpdatedAt, null);

    // Worker B replays the same Jira window; only after success may it advance the cursor.
    await prisma.$transaction((transaction) =>
      syncJiraIssueAnalytics(
        createPrismaJiraAnalyticsSyncStore(transaction),
        project.id,
        first,
        new Date('2026-08-21T10:01:00Z'),
        'worker-b-replay',
      ));
    await prisma.jiraAnalyticsSettings.update({
      where: { projectId: project.id },
      data: {
        historyCursorUpdatedAt: firstUpdatedAt,
        historyCursorJiraIssueId: first.jiraId,
      },
    });

    assert.equal(await prisma.jiraIssueVersion.count({ where: { projectId: project.id } }), 1);
    const replayedSnapshot = await prisma.jiraIssueSnapshot.findUniqueOrThrow({
      where: { projectId_issueKey: { projectId: project.id, issueKey: first.key } },
      select: { currentVersionId: true },
    });
    assert.ok(replayedSnapshot.currentVersionId);

    // After a lease expiry, advisory transaction locks serialize two workers correctly.
    const changed = jiraIssue('Concurrent changed observation', new Date('2026-08-21T11:00:00Z'));
    await Promise.all([
      prisma.$transaction((transaction) =>
        syncJiraIssueAnalytics(
          createPrismaJiraAnalyticsSyncStore(transaction),
          project.id,
          changed,
          new Date('2026-08-21T11:01:00Z'),
          'worker-c',
        ), { timeout: 15_000 }),
      prisma.$transaction((transaction) =>
        syncJiraIssueAnalytics(
          createPrismaJiraAnalyticsSyncStore(transaction),
          project.id,
          changed,
          new Date('2026-08-21T11:01:01Z'),
          'worker-d',
        ), { timeout: 15_000 }),
    ]);

    assert.equal(await prisma.jiraIssueVersion.count({ where: { projectId: project.id } }), 2);
    const current = await prisma.jiraIssueSnapshot.findUniqueOrThrow({
      where: { projectId_issueKey: { projectId: project.id, issueKey: changed.key } },
      select: { summary: true, currentVersionId: true },
    });
    assert.equal(current.summary, changed.summary);
    assert.equal(
      await prisma.jiraIssueVersion.count({
        where: { projectId: project.id, id: current.currentVersionId ?? undefined },
      }),
      1,
    );

    const projectionOnly = jiraIssue(
      'Projection changed while history was disabled',
      new Date('2026-08-21T12:00:00Z'),
    );
    const projectionOnlyAt = new Date('2026-08-21T12:01:00Z');
    await prisma.$transaction((transaction) =>
      syncJiraIssueAnalytics(
        createPrismaJiraAnalyticsSyncStore(transaction, projectionOnlyAt, false),
        project.id,
        projectionOnly,
        projectionOnlyAt,
        'history-disabled',
      ));
    assert.equal(await prisma.jiraIssueVersion.count({ where: { projectId: project.id } }), 2);
    const gapReport = await jiraBackfillCompleteness(prisma, project.id, { pageSize: 1 });
    assert.equal(gapReport.scope.unversionedProjection, 1);
    assert.equal(gapReport.scope.observed, 0);
    assert.equal(gapReport.scope.fullyHydrated, 0);

    await prisma.$transaction((transaction) =>
      syncJiraIssueAnalytics(
        createPrismaJiraAnalyticsSyncStore(transaction, new Date('2026-08-21T12:02:00Z'), true),
        project.id,
        projectionOnly,
        new Date('2026-08-21T12:02:00Z'),
        'history-reenabled',
      ));
    const repairedReport = await jiraBackfillCompleteness(prisma, project.id, { pageSize: 1 });
    assert.equal(repairedReport.scope.unversionedProjection, 0);
    assert.equal(repairedReport.scope.observed, 1);
    assert.equal(repairedReport.scope.fullyHydrated, 1);

    const frozenCursorAt = new Date('2026-08-20T00:00:00Z');
    const frozenFullAt = new Date('2026-08-19T00:00:00Z');
    await prisma.jiraAnalyticsSettings.update({
      where: { projectId: project.id },
      data: {
        historyCursorUpdatedAt: frozenCursorAt,
        historyCursorJiraIssueId: '10001',
        historyLastFullReconciledAt: frozenFullAt,
        historyFullCursorIssueKey: 'A1RACE-10',
        historyFullStartedAt: frozenFullAt,
      },
    });
    const previousHistoryFlag = process.env.JIRA_HISTORY_WRITE_ENABLED;
    process.env.JIRA_HISTORY_WRITE_ENABLED = 'false';
    let disabledRun;
    try {
      disabledRun = await enqueueJiraSyncRun(prisma, {
        projectId: project.id,
        kind: JiraSyncRunKind.SYNC,
        scopeType: 'LABEL',
        scopeValue: 'changed-while-disabled',
        scopeChanged: true,
      });
    } finally {
      if (previousHistoryFlag === undefined) delete process.env.JIRA_HISTORY_WRITE_ENABLED;
      else process.env.JIRA_HISTORY_WRITE_ENABLED = previousHistoryFlag;
    }
    assert.equal(disabledRun.historyWriteEnabled, false);
    const frozen = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
      where: { projectId: project.id },
    });
    assert.equal(frozen.historyCursorUpdatedAt, null);
    assert.equal(frozen.historyCursorJiraIssueId, null);
    assert.equal(frozen.historyLastFullReconciledAt, null);
    assert.equal(frozen.historyFullCursorIssueKey, null);
    assert.equal(frozen.historyFullStartedAt, null);
  } finally {
    if (projectId) await prisma.project.delete({ where: { id: projectId } });
    if (businessUnitId) await prisma.businessUnit.delete({ where: { id: businessUnitId } });
    await prisma.$disconnect();
  }
});
test('durable Jira runs fence stale workers, exclude rebuilds, and resume in place', {
  skip: !testDatabaseUrl,
}, async () => {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'JIRA_HISTORY_TEST_DATABASE_URL must target a test database');
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  let businessUnitId: string | null = null;
  let projectId: string | null = null;
  try {
    const businessUnit = await prisma.businessUnit.create({
      data: { code: `run-fence-${suffix}`, name: `Run fence ${suffix}` },
    });
    businessUnitId = businessUnit.id;
    const project = await prisma.project.create({
      data: {
        businessUnitId: businessUnit.id,
        code: `RUNFENCE-${suffix}`,
        name: 'Durable Jira run fence test',
        portfolio: 'Integration',
        sponsor: 'Integration',
        projectManager: 'Integration',
        startDate: new Date('2026-08-01T00:00:00Z'),
        targetDate: new Date('2026-09-01T00:00:00Z'),
        budgetPlanned: '0',
        budgetForecast: '0',
        summary: 'Disposable integration fixture',
      },
    });
    projectId = project.id;
    await prisma.jiraAnalyticsSettings.create({
      data: { projectId, jiraScopeValue: 'run-fence', jiraLabel: 'run-fence' },
    });

    const rebuild = await acquireJiraProjectionRebuildLease(prisma, projectId);
    assert.ok(rebuild);
    await assert.rejects(
      enqueueJiraSyncRun(prisma, {
        projectId,
        kind: JiraSyncRunKind.SYNC,
        scopeType: 'LABEL',
        scopeValue: 'run-fence',
        scopeChanged: false,
      }),
      JiraSyncFencedError,
    );
    await releaseJiraProjectionRebuildLease(prisma, rebuild, 'CONFIGURED');

    const closedProject = await prisma.project.create({
      data: {
        businessUnitId: businessUnit.id,
        code: `RUNCLOSED-${suffix}`,
        name: 'Closed Jira run queue fixture',
        portfolio: 'Integration',
        sponsor: 'Integration',
        projectManager: 'Integration',
        startDate: new Date('2026-08-01T00:00:00Z'),
        targetDate: new Date('2026-09-01T00:00:00Z'),
        budgetPlanned: '0',
        budgetForecast: '0',
        summary: 'Disposable integration fixture',
        status: 'CLOSED',
      },
    });
    await prisma.jiraAnalyticsSettings.create({
      data: {
        projectId: closedProject.id,
        jiraScopeValue: 'closed-run',
        jiraLabel: 'closed-run',
      },
    });
    const closedRun = await enqueueJiraSyncRun(prisma, {
      projectId: closedProject.id,
      kind: JiraSyncRunKind.SYNC,
      scopeType: 'LABEL',
      scopeValue: 'closed-run',
      scopeChanged: false,
    });
    await prisma.jiraSyncRun.update({
      where: { id: closedRun.id },
      data: { enqueuedAt: new Date('2026-08-01T00:00:00Z') },
    });

    const staleCursorAt = new Date('2026-08-20T10:00:00Z');
    await prisma.jiraAnalyticsSettings.update({
      where: { projectId },
      data: {
        historyCursorUpdatedAt: staleCursorAt,
        historyCursorJiraIssueId: '99999',
        historyLastFullReconciledAt: staleCursorAt,
        historyFullCursorIssueKey: 'OLD-500',
        historyFullStartedAt: staleCursorAt,
      },
    });
    const queued = await enqueueJiraSyncRun(prisma, {
      projectId,
      kind: JiraSyncRunKind.BACKFILL,
      scopeType: 'LABEL',
      scopeValue: 'run-fence-next',
      scopeChanged: true,
    });
    const scopeChangedSettings = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
      where: { projectId },
    });
    assert.equal(scopeChangedSettings.jiraScopeValue, 'run-fence-next');
    assert.equal(scopeChangedSettings.historyCursorUpdatedAt, null);
    assert.equal(scopeChangedSettings.historyCursorJiraIssueId, null);
    assert.equal(scopeChangedSettings.historyLastFullReconciledAt, null);
    assert.equal(scopeChangedSettings.historyFullCursorIssueKey, null);
    assert.equal(scopeChangedSettings.historyFullStartedAt, null);
    await prisma.jiraSyncRun.update({
      where: { id: queued.id },
      data: { maxAttempts: 5 },
    });
    await assert.rejects(enqueueJiraSyncRun(prisma, {
      projectId,
      kind: JiraSyncRunKind.SYNC,
      scopeType: 'LABEL',
      scopeValue: 'run-fence-next',
      scopeChanged: false,
    }));
    assert.equal(await acquireJiraProjectionRebuildLease(prisma, projectId), null);

    const firstClaim = await claimNextJiraSyncRun(prisma, 'integration-worker-1');
    assert.ok(firstClaim);
    assert.equal(firstClaim.id, queued.id);
    const cancelledClosedRun = await prisma.jiraSyncRun.findUniqueOrThrow({
      where: { id: closedRun.id },
    });
    assert.equal(cancelledClosedRun.status, 'CANCELLED');
    assert.equal(cancelledClosedRun.activeSlot, null);
    const observed = jiraIssue('Durable replay fixture', new Date('2026-08-23T10:00:00Z'));
    await prisma.$transaction(async (transaction) => {
      await assertJiraSyncFence(transaction, firstClaim);
      await syncJiraIssueAnalytics(
        createPrismaJiraAnalyticsSyncStore(transaction),
        projectId!,
        observed,
        new Date('2026-08-23T10:01:00Z'),
        firstClaim.id,
      );
    });
    await checkpointJiraSyncRun(prisma, firstClaim, {
      phase: 'HISTORY',
      resumeCursorIssueKey: observed.key,
      discoveredIssueCount: 1,
      hydratedIssueCount: 1,
      versionsCreated: 1,
      retriesQueued: 2,
    });
    await pauseJiraSyncRun(prisma, firstClaim, {
      count: 4,
      durationMsTotal: 20,
      durationMsMax: 8,
      byRoute: { issue: 1, changelog: 1, comment: 1, worklog: 1 },
      byStatusClass: { '2xx': 4 },
    });

    const resumed = await claimNextJiraSyncRun(prisma, 'integration-worker-2');
    assert.ok(resumed);
    assert.equal(resumed.id, firstClaim.id);
    assert.equal(resumed.attempt, 1);
    assert.equal(resumed.resumeCursorIssueKey, observed.key);
    assert.equal(resumed.startedAt.toISOString(), firstClaim.startedAt.toISOString());
    assert.equal(resumed.discoveredIssueCount, 1);
    assert.equal(resumed.hydratedIssueCount, 1);
    assert.equal(resumed.versionsCreated, 1);
    assert.equal(resumed.retriesQueued, 2);
    await prisma.$transaction(async (transaction) => {
      await assertJiraSyncFence(transaction, resumed);
      await syncJiraIssueAnalytics(
        createPrismaJiraAnalyticsSyncStore(transaction),
        projectId!,
        observed,
        new Date('2026-08-23T10:02:00Z'),
        resumed.id,
      );
    });
    assert.equal(await prisma.jiraIssueVersion.count({ where: { projectId } }), 1);

    await pauseJiraSyncRun(prisma, resumed, {
      count: 2,
      durationMsTotal: 12,
      durationMsMax: 7,
      byRoute: { issue: 2 },
      byStatusClass: { '2xx': 2 },
    });
    const twicePaused = await prisma.jiraSyncRun.findUniqueOrThrow({ where: { id: resumed.id } });
    assert.equal(twicePaused.jiraRequestCount, 6);
    assert.equal(twicePaused.jiraRequestDurationMsTotal, 32);
    assert.equal(twicePaused.jiraRequestDurationMsMax, 8);
    assert.equal(twicePaused.deadlinePauseCount, 2);
    assert.deepEqual(twicePaused.jiraRequestsByRoute, {
      issue: 3,
      changelog: 1,
      comment: 1,
      worklog: 1,
    });
    const resumedAgain = await claimNextJiraSyncRun(prisma, 'integration-worker-3');
    assert.ok(resumedAgain);
    assert.equal(resumedAgain.id, resumed.id);
    assert.equal(resumedAgain.attempt, 1);
    assert.equal(resumedAgain.resumeCursorIssueKey, observed.key);
    assert.equal(resumedAgain.startedAt.toISOString(), firstClaim.startedAt.toISOString());
    assert.equal(resumedAgain.hydratedIssueCount, 1);
    assert.equal(resumedAgain.versionsCreated, 1);
    assert.equal(resumedAgain.retriesQueued, 2);

    const beforeSteal = await prisma.jiraSyncRun.findUniqueOrThrow({ where: { id: resumedAgain.id } });
    await prisma.jiraAnalyticsSettings.update({
      where: { projectId },
      data: { syncFenceToken: { increment: 1 } },
    });
    await assert.rejects(
      heartbeatJiraSyncRun(prisma, resumedAgain, {
        phase: 'HISTORY', done: 1, total: 1, unit: 'issues',
      }),
      JiraSyncFencedError,
    );
    const changed = jiraIssue('Must not survive a stolen fence', new Date('2026-08-23T11:00:00Z'));
    await assert.rejects(
      prisma.$transaction(async (transaction) => {
        await assertJiraSyncFence(transaction, resumedAgain);
        await syncJiraIssueAnalytics(
          createPrismaJiraAnalyticsSyncStore(transaction),
          projectId!,
          changed,
          new Date('2026-08-23T11:01:00Z'),
          resumedAgain.id,
        );
      }),
      JiraSyncFencedError,
    );
    assert.equal(await prisma.jiraIssueVersion.count({ where: { projectId } }), 1);
    const afterSteal = await prisma.jiraSyncRun.findUniqueOrThrow({ where: { id: resumedAgain.id } });
    assert.equal(afterSteal.heartbeatAt?.getTime(), beforeSteal.heartbeatAt?.getTime());
    assert.equal(afterSteal.resumeCursorIssueKey, beforeSteal.resumeCursorIssueKey);

    await prisma.jiraSyncRun.update({
      where: { id: resumedAgain.id },
      data: { elapsedMs: JIRA_SYNC_RUN_MAX_WALL_MS + 1_000 },
    });
    await reapExpiredJiraSyncRuns(prisma);
    const expired = await prisma.jiraSyncRun.findUniqueOrThrow({ where: { id: resumedAgain.id } });
    assert.equal(expired.status, 'FAILED');
    assert.equal(expired.activeSlot, null);
    assert.equal(expired.errorCode, 'RUN_EXPIRED');
    const releasedSettings = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
      where: { projectId },
    });
    assert.equal(releasedSettings.syncRunId, null);
    assert.equal(releasedSettings.syncLockExpiresAt, null);
    assert.ok(releasedSettings.syncFenceToken > resumedAgain.fenceToken);

    const pausedProject = await prisma.project.create({
      data: {
        businessUnitId: businessUnit.id,
        code: `RUNPAUSED-${suffix}`,
        name: 'Paused Jira run reaper fixture',
        portfolio: 'Integration',
        sponsor: 'Integration',
        projectManager: 'Integration',
        startDate: new Date('2026-08-01T00:00:00Z'),
        targetDate: new Date('2026-09-01T00:00:00Z'),
        budgetPlanned: '0',
        budgetForecast: '0',
        summary: 'Disposable integration fixture',
      },
    });
    await prisma.jiraAnalyticsSettings.create({
      data: {
        projectId: pausedProject.id,
        jiraScopeValue: 'paused-run',
        jiraLabel: 'paused-run',
      },
    });
    const pausedQueued = await enqueueJiraSyncRun(prisma, {
      projectId: pausedProject.id,
      kind: JiraSyncRunKind.SYNC,
      scopeType: 'LABEL',
      scopeValue: 'paused-run',
      scopeChanged: false,
    });
    const pausedClaim = await claimNextJiraSyncRun(prisma, 'integration-paused-worker');
    assert.ok(pausedClaim);
    assert.equal(pausedClaim.id, pausedQueued.id);
    await pauseJiraSyncRun(prisma, pausedClaim, {
      count: 0,
      durationMsTotal: 0,
      durationMsMax: 0,
      byRoute: {},
      byStatusClass: {},
    });
    await prisma.jiraSyncRun.update({
      where: { id: pausedQueued.id },
      data: { enqueuedAt: new Date(Date.now() - JIRA_SYNC_RUN_MAX_WALL_MS - 1_000) },
    });
    await reapExpiredJiraSyncRuns(prisma);
    const waitingPaused = await prisma.jiraSyncRun.findUniqueOrThrow({
      where: { id: pausedQueued.id },
    });
    const waitingPausedSettings = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
      where: { projectId: pausedProject.id },
    });
    assert.equal(waitingPaused.status, 'PAUSED_DEADLINE');
    assert.equal(waitingPausedSettings.syncStatus, 'PAUSED_DEADLINE');
    await prisma.jiraSyncRun.update({
      where: { id: pausedQueued.id },
      data: { elapsedMs: JIRA_SYNC_RUN_MAX_WALL_MS + 1_000 },
    });
    await reapExpiredJiraSyncRuns(prisma);
    const reapedPaused = await prisma.jiraSyncRun.findUniqueOrThrow({
      where: { id: pausedQueued.id },
    });
    const reapedPausedSettings = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
      where: { projectId: pausedProject.id },
    });
    assert.equal(reapedPaused.status, 'FAILED');
    assert.equal(reapedPausedSettings.syncStatus, 'FAILED');
  } finally {
    if (businessUnitId) await prisma.project.deleteMany({ where: { businessUnitId } });
    if (businessUnitId) await prisma.businessUnit.delete({ where: { id: businessUnitId } });
    await prisma.$disconnect();
  }
});
