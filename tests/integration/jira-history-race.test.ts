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

test('CURRENT lifecycle preserves full-sync state and yields to explicit operations', {
  skip: !testDatabaseUrl,
}, async () => {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'JIRA_HISTORY_TEST_DATABASE_URL must target a test database');
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  let businessUnitId: string | null = null;
  try {
    const fixture = await createCurrentRefreshFixture(prisma, 'current-life');
    businessUnitId = fixture.businessUnit.id;
    const enqueueCurrent = async () => {
      const run = await enqueueJiraSyncRun(prisma, {
        projectId: fixture.project.id,
        kind: JiraSyncRunKind.CURRENT,
        scopeType: 'LABEL',
        scopeValue: 'current-life-scope',
        scopeChanged: false,
        preserveStoredScope: true,
      });
      await prisma.jiraSyncRun.update({
        where: { id: run.id },
        data: { enqueuedAt: new Date('2000-01-01T00:00:00Z') },
      });
      return run;
    };
    const assertFullSyncState = async () => {
      const settings = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
        where: { projectId: fixture.project.id },
      });
      assert.equal(settings.syncStatus, 'OK');
      assert.equal(settings.lastSyncedAt?.toISOString(), fixture.lastSyncedAt.toISOString());
    };

    const completedRun = await enqueueCurrent();
    const completedClaim = await claimNextJiraSyncRun(prisma, 'current-complete-worker');
    assert.equal(completedClaim?.id, completedRun.id);
    await assertFullSyncState();
    await completeJiraSyncRun(prisma, completedClaim!, {
      status: 'SUCCEEDED',
      result: { currentProjectionOnly: true },
      requestSummary: emptyRequestSummary,
      discoveredIssueCount: 0,
      hydratedIssueCount: 0,
      versionsCreated: 0,
      retriesQueued: 0,
    });
    await assertFullSyncState();

    const shutdownRun = await enqueueCurrent();
    const shutdownClaim = await claimNextJiraSyncRun(prisma, 'current-shutdown-worker');
    assert.equal(shutdownClaim?.id, shutdownRun.id);
    await releaseJiraSyncRunOnShutdown(prisma, shutdownClaim!);
    await assertFullSyncState();

    const explicitRun = await enqueueJiraSyncRun(prisma, {
      projectId: fixture.project.id,
      kind: JiraSyncRunKind.SYNC,
      scopeType: 'LABEL',
      scopeValue: 'current-life-scope',
      scopeChanged: false,
    });
    const preempted = await prisma.jiraSyncRun.findUniqueOrThrow({ where: { id: shutdownRun.id } });
    assert.equal(preempted.status, 'CANCELLED');
    assert.equal(preempted.errorCode, 'PREEMPTED_BY_EXPLICIT_OPERATION');
    await prisma.jiraSyncRun.update({
      where: { id: explicitRun.id },
      data: { status: 'CANCELLED', phase: 'DONE', activeSlot: null, finishedAt: new Date() },
    });

    const reapedRun = await enqueueCurrent();
    const reapedClaim = await claimNextJiraSyncRun(prisma, 'current-reap-worker');
    assert.equal(reapedClaim?.id, reapedRun.id);
    const expiredAt = new Date(Date.now() - 60_000);
    await prisma.jiraSyncRun.update({
      where: { id: reapedRun.id },
      data: { maxAttempts: reapedClaim!.attempt, leaseExpiresAt: expiredAt },
    });
    await prisma.jiraAnalyticsSettings.update({
      where: { projectId: fixture.project.id },
      data: { syncLockExpiresAt: expiredAt },
    });
    await reapExpiredJiraSyncRuns(prisma);
    assert.equal(
      (await prisma.jiraSyncRun.findUniqueOrThrow({ where: { id: reapedRun.id } })).status,
      'FAILED',
    );
    await assertFullSyncState();

    const clearRun = await enqueueCurrent();
    const clearClaim = await claimNextJiraSyncRun(prisma, 'current-clear-worker');
    assert.equal(clearClaim?.id, clearRun.id);
    await clearJiraProjectData(prisma, fixture.project.id);
    assert.equal(
      (await prisma.jiraSyncRun.findUniqueOrThrow({ where: { id: clearRun.id } })).status,
      'CANCELLED',
    );
    const runCountAfterClear = await prisma.jiraSyncRun.count({
      where: { projectId: fixture.project.id },
    });
    const refreshAfterClear = await requestJiraCurrentRefresh(
      prisma,
      fixture.project.id,
      { id: 'reader-after-clear', role: 'USER' },
    );
    assert.equal(refreshAfterClear.queued, false);
    assert.equal(refreshAfterClear.freshness.state, 'NOT_CONFIGURED');
    assert.equal(refreshAfterClear.freshness.pollAfterMs, null);
    assert.equal(await prisma.jiraSyncRun.count({
      where: { projectId: fixture.project.id },
    }), runCountAfterClear);
  } finally {
    if (businessUnitId) await prisma.project.deleteMany({ where: { businessUnitId } });
    if (businessUnitId) await prisma.businessUnit.delete({ where: { id: businessUnitId } });
    await prisma.$disconnect();
  }
});

test('explicit Jira runs are claimed before older background CURRENT runs', {
  skip: !testDatabaseUrl,
}, async () => {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'JIRA_HISTORY_TEST_DATABASE_URL must target a test database');
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const businessUnitIds: string[] = [];
  try {
    const currentFixture = await createCurrentRefreshFixture(prisma, 'current-priority');
    const explicitFixture = await createCurrentRefreshFixture(prisma, 'sync-priority');
    businessUnitIds.push(currentFixture.businessUnit.id, explicitFixture.businessUnit.id);

    const currentRun = await enqueueJiraSyncRun(prisma, {
      projectId: currentFixture.project.id,
      kind: JiraSyncRunKind.CURRENT,
      scopeType: 'LABEL',
      scopeValue: 'current-priority-scope',
      scopeChanged: false,
      preserveStoredScope: true,
    });
    await prisma.jiraSyncRun.update({
      where: { id: currentRun.id },
      data: { enqueuedAt: new Date('2000-01-01T00:00:00Z') },
    });
    const explicitRun = await enqueueJiraSyncRun(prisma, {
      projectId: explicitFixture.project.id,
      kind: JiraSyncRunKind.SYNC,
      scopeType: 'LABEL',
      scopeValue: 'sync-priority-scope',
      scopeChanged: false,
    });
    await prisma.jiraSyncRun.update({
      where: { id: explicitRun.id },
      data: { enqueuedAt: new Date('2001-01-01T00:00:00Z') },
    });

    const claimed = await claimNextJiraSyncRun(prisma, 'explicit-priority-worker');
    assert.equal(claimed?.id, explicitRun.id);
    assert.equal(claimed?.kind, JiraSyncRunKind.SYNC);
  } finally {
    await prisma.project.deleteMany({ where: { businessUnitId: { in: businessUnitIds } } });
    await prisma.businessUnit.deleteMany({ where: { id: { in: businessUnitIds } } });
    await prisma.$disconnect();
  }
});

test('CURRENT enqueue rejects a stale stored scope without creating a run', {
  skip: !testDatabaseUrl,
}, async () => {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'JIRA_HISTORY_TEST_DATABASE_URL must target a test database');
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  let businessUnitId: string | null = null;
  try {
    const fixture = await createCurrentRefreshFixture(prisma, 'current-scope');
    businessUnitId = fixture.businessUnit.id;
    await assert.rejects(enqueueJiraSyncRun(prisma, {
      projectId: fixture.project.id,
      kind: JiraSyncRunKind.CURRENT,
      scopeType: 'LABEL',
      scopeValue: 'stale-browser-scope',
      scopeChanged: false,
      preserveStoredScope: true,
    }), JiraSyncFencedError);
    assert.equal(await prisma.jiraSyncRun.count({ where: { projectId: fixture.project.id } }), 0);
  } finally {
    if (businessUnitId) await prisma.project.deleteMany({ where: { businessUnitId } });
    if (businessUnitId) await prisma.businessUnit.delete({ where: { id: businessUnitId } });
    await prisma.$disconnect();
  }
});

test('empty CURRENT response preserves snapshots and the successful refresh timestamp', {
  skip: !testDatabaseUrl,
}, async () => {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'JIRA_HISTORY_TEST_DATABASE_URL must target a test database');
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  let businessUnitId: string | null = null;
  try {
    const fixture = await createCurrentRefreshFixture(prisma, 'current-empty');
    businessUnitId = fixture.businessUnit.id;
    const snapshot = await prisma.jiraIssueSnapshot.create({
      data: {
        projectId: fixture.project.id,
        jiraId: 'current-empty-1',
        issueKey: 'EMPTY-1',
        issueUrl: 'https://jira.example/browse/EMPTY-1',
        summary: 'Existing projection must survive an empty response',
        status: 'In Progress',
        priority: 'Critical',
        issueType: 'Bug',
        criticalPriorityAt: new Date('2026-08-20T00:00:00Z'),
        criticalEndPriority: 'Critical',
        criticalSlaTracked: true,
        updatedAt: new Date('2026-09-01T07:00:00Z'),
      },
    });
    const queued = await enqueueJiraSyncRun(prisma, {
      projectId: fixture.project.id,
      kind: JiraSyncRunKind.CURRENT,
      scopeType: 'LABEL',
      scopeValue: 'current-empty-scope',
      scopeChanged: false,
      preserveStoredScope: true,
    });
    await prisma.jiraSyncRun.update({
      where: { id: queued.id },
      data: { enqueuedAt: new Date('2000-01-01T00:00:00Z') },
    });
    const claimed = await claimNextJiraSyncRun(prisma, 'current-empty-worker');
    assert.equal(claimed?.id, queued.id);
    const result = await runJiraCurrentRefreshPipeline(claimed!, {
      prisma,
      fetchIssues: async () => ({ issues: [], jiraUsers: ['read-only-test'] }),
    });
    assert.equal(result.result.emptyScope, true);
    const preserved = await prisma.jiraIssueSnapshot.findUniqueOrThrow({
      where: { id: snapshot.id },
    });
    assert.equal(preserved.retiredAt, null);
    assert.equal(preserved.criticalSlaTracked, true);
    const settings = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
      where: { projectId: fixture.project.id },
    });
    assert.equal(
      settings.currentProjectionRefreshedAt?.toISOString(),
      fixture.currentProjectionRefreshedAt.toISOString(),
    );
  } finally {
    if (businessUnitId) await prisma.project.deleteMany({ where: { businessUnitId } });
    if (businessUnitId) await prisma.businessUnit.delete({ where: { id: businessUnitId } });
    await prisma.$disconnect();
  }
});

test('missing system aggregate bootstrap is idempotent and leaves dashboard settings unchanged', {
  skip: !testDatabaseUrl,
}, async () => {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'JIRA_HISTORY_TEST_DATABASE_URL must target a test database');
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  let businessUnitId: string | null = null;
  try {
    const businessUnit = await prisma.businessUnit.create({
      data: { code: `missing-aggregates-${suffix}`, name: `Missing aggregates ${suffix}` },
    });
    businessUnitId = businessUnit.id;
    const project = await prisma.project.create({
      data: {
        businessUnitId: businessUnit.id,
        code: `MISAGG-${suffix}`,
        name: 'Missing aggregate bootstrap test',
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
        projectId: project.id,
        jiraScopeType: 'LABEL',
        jiraScopeValue: 'cvte968',
        dashboardConfig: JIRA_SEMANTIC_EMPTY_DASHBOARD as unknown as Prisma.InputJsonObject,
        semanticDefaultWidgetsVersion: 42,
      },
    });
    const settingsBefore = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
      where: { projectId: project.id },
      select: { dashboardConfig: true, semanticDefaultWidgetsVersion: true, jiraScopeType: true, jiraScopeValue: true },
    });

    const first = await ensureMissingJiraSystemSemanticAggregates(prisma, project.id);
    const second = await ensureMissingJiraSystemSemanticAggregates(prisma, project.id);

    assert.deepEqual(first, JIRA_SYSTEM_SEMANTIC_AGGREGATES.map((aggregate) => aggregate.key));
    assert.deepEqual(second, []);
    assert.equal(await prisma.jiraAggregateDefinition.count({ where: { projectId: project.id } }), JIRA_SYSTEM_SEMANTIC_AGGREGATES.length);
    assert.equal(await prisma.jiraAggregateDefinitionRevision.count({ where: { projectId: project.id } }), JIRA_SYSTEM_SEMANTIC_AGGREGATES.length);
    assert.deepEqual(await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
      where: { projectId: project.id },
      select: { dashboardConfig: true, semanticDefaultWidgetsVersion: true, jiraScopeType: true, jiraScopeValue: true },
    }), settingsBefore);
  } finally {
    if (businessUnitId) await prisma.project.deleteMany({ where: { businessUnitId } });
    if (businessUnitId) await prisma.businessUnit.delete({ where: { id: businessUnitId } });
    await prisma.$disconnect();
  }
});

test('open issue register migration preserves existing rows and applies defaults in PostgreSQL', {
  skip: !testDatabaseUrl,
}, async () => {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'JIRA_HISTORY_TEST_DATABASE_URL must target a test database');
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  try {
    await prisma.$executeRawUnsafe('CREATE TEMP TABLE "IssueMigrationProbe" ("id" TEXT PRIMARY KEY)');
    await prisma.$executeRawUnsafe('INSERT INTO "IssueMigrationProbe" ("id") VALUES (\'existing\')');
    const migration = fs.readFileSync(
      path.resolve('prisma/migrations/20260831120000_open_issue_inline_table/migration.sql'),
      'utf8',
    ).replaceAll('"Issue"', '"IssueMigrationProbe"');
    await prisma.$executeRawUnsafe(migration);
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      category: string;
      referenceLabel: string;
      referenceUrl: string | null;
      readiness: string;
    }>>('SELECT "id", "category", "referenceLabel", "referenceUrl", "readiness"::text AS "readiness" FROM "IssueMigrationProbe"');
    assert.deepEqual(rows, [{
      id: 'existing',
      category: 'Без раздела',
      referenceLabel: '',
      referenceUrl: null,
      readiness: 'RED',
    }]);
  } finally {
    await prisma.$disconnect();
  }
});

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

test('Jira as-of reconstruction selects deterministic observed winners in PostgreSQL', {
  skip: !testDatabaseUrl,
}, async () => {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'JIRA_HISTORY_TEST_DATABASE_URL must target a test database');
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  let businessUnitId: string | null = null;
  let projectId: string | null = null;
  const asOf = new Date('2026-08-23T13:30:00Z');

  const versionData = (
    snapshotId: string,
    jiraIssueId: string,
    issueKey: string,
    sequence: number,
    values: {
      observedAt: string;
      jiraUpdatedAt: string;
      summary: string;
      priority?: string;
      provenance?: 'OBSERVED' | 'RECONSTRUCTED';
    },
  ) => ({
    id: `c1-${suffix}-${jiraIssueId}-${sequence}`,
    projectId: projectId!,
    snapshotId,
    jiraIssueId,
    issueKey,
    observedAt: new Date(values.observedAt),
    jiraUpdatedAt: new Date(values.jiraUpdatedAt),
    provenance: values.provenance ?? 'OBSERVED',
    contentHash: sequence.toString(16).padStart(64, '0'),
    payload: { fixture: true, sequence },
    payloadBytes: 32,
    syncRunId: `c1-${suffix}`,
    changelogComplete: true,
    commentsComplete: true,
    worklogsComplete: true,
    remoteLinksComplete: true,
    summary: values.summary,
    issueUrl: `https://jira.example/browse/${issueKey}`,
    issueType: 'Bug',
    status: 'In Progress',
    priority: values.priority ?? 'Major',
    issueCreatedAt: new Date('2026-08-20T09:00:00Z'),
    issueUpdatedAt: new Date(values.jiraUpdatedAt),
    criticalPriorityAt: values.priority === 'Critical'
      ? new Date('2026-08-22T09:00:00Z')
      : null,
    criticalEndPriority: values.priority ?? 'Major',
    developmentDataAvailable: true,
    transitionHistoryComplete: true,
  });

  try {
    const businessUnit = await prisma.businessUnit.create({
      data: { code: `c1-asof-${suffix}`, name: `C1 as-of ${suffix}` },
    });
    businessUnitId = businessUnit.id;
    const project = await prisma.project.create({
      data: {
        businessUnitId: businessUnit.id,
        code: `C1ASOF-${suffix}`,
        name: 'C1 as-of PostgreSQL test',
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

    const active = await prisma.jiraIssueSnapshot.create({
      data: {
        projectId,
        jiraId: `c1-active-${suffix}`,
        issueKey: `C1ACTIVE-${suffix}`,
        issueUrl: 'https://jira.example/browse/C1ACTIVE-1',
        summary: 'Current state does not drive reconstruction',
        status: 'Done',
        priority: 'Minor',
        issueType: 'Bug',
        issueCreatedAt: new Date('2026-08-20T09:00:00Z'),
        updatedAt: new Date('2026-08-24T09:00:00Z'),
      },
    });
    const retiredAfter = await prisma.jiraIssueSnapshot.create({
      data: {
        projectId,
        jiraId: `c1-retired-after-${suffix}`,
        issueKey: `C1RETIRED-${suffix}`,
        issueUrl: 'https://jira.example/browse/C1RETIRED-1',
        summary: 'Retired after selected instant',
        status: 'Done',
        priority: 'Major',
        issueType: 'Task',
        issueCreatedAt: new Date('2026-08-20T09:00:00Z'),
        updatedAt: new Date('2026-08-23T11:00:00Z'),
        retiredAt: new Date('2026-08-24T00:00:00Z'),
      },
    });
    const withoutObservation = await prisma.jiraIssueSnapshot.create({
      data: {
        projectId,
        jiraId: `c1-no-observation-${suffix}`,
        issueKey: `C1EMPTY-${suffix}`,
        issueUrl: 'https://jira.example/browse/C1EMPTY-1',
        summary: 'No observed history',
        status: 'Open',
        priority: 'Major',
        issueType: 'Task',
        issueCreatedAt: new Date('2026-08-20T09:00:00Z'),
        updatedAt: new Date('2026-08-23T11:00:00Z'),
      },
    });
    const retiredBefore = await prisma.jiraIssueSnapshot.create({
      data: {
        projectId,
        jiraId: `c1-retired-before-${suffix}`,
        issueKey: `C1OLD-${suffix}`,
        issueUrl: 'https://jira.example/browse/C1OLD-1',
        summary: 'Retired before selected instant',
        status: 'Done',
        priority: 'Major',
        issueType: 'Task',
        issueCreatedAt: new Date('2026-08-20T09:00:00Z'),
        updatedAt: new Date('2026-08-22T11:00:00Z'),
        retiredAt: new Date('2026-08-23T00:00:00Z'),
      },
    });
    await prisma.jiraIssueSnapshot.create({
      data: {
        projectId,
        jiraId: active.jiraId,
        issueKey: `C1RENAMED-${suffix}`,
        issueUrl: 'https://jira.example/browse/C1RENAMED-1',
        summary: 'Renamed key for the same stable Jira ID',
        status: 'Open',
        priority: 'Major',
        issueType: 'Bug',
        issueCreatedAt: new Date('2026-08-20T09:00:00Z'),
        updatedAt: new Date('2026-08-23T11:00:00Z'),
      },
    });
    await prisma.jiraIssueSnapshot.create({
      data: {
        projectId,
        jiraId: `c1-created-after-${suffix}`,
        issueKey: `C1FUTURE-${suffix}`,
        issueUrl: 'https://jira.example/browse/C1FUTURE-1',
        summary: 'Created after selected instant',
        status: 'Open',
        priority: 'Major',
        issueType: 'Task',
        issueCreatedAt: new Date('2026-08-24T09:00:00Z'),
        updatedAt: new Date('2026-08-24T09:00:00Z'),
      },
    });

    await prisma.jiraIssueVersion.createMany({
      data: [
        versionData(active.id, active.jiraId!, active.issueKey, 1, {
          observedAt: '2026-08-22T10:00:00Z',
          jiraUpdatedAt: '2026-08-22T09:00:00Z',
          summary: 'Initial observed state',
        }),
        versionData(active.id, active.jiraId!, active.issueKey, 2, {
          observedAt: '2026-08-23T12:00:00Z',
          jiraUpdatedAt: '2026-08-23T11:00:00Z',
          summary: 'Earlier observation for equal Jira update',
          priority: 'Critical',
        }),
        versionData(active.id, active.jiraId!, active.issueKey, 3, {
          observedAt: '2026-08-23T13:00:00Z',
          jiraUpdatedAt: '2026-08-23T11:00:00Z',
          summary: 'Deterministic winner',
          priority: 'Critical',
        }),
        versionData(active.id, active.jiraId!, active.issueKey, 4, {
          observedAt: '2026-08-23T13:10:00Z',
          jiraUpdatedAt: '2026-08-23T12:00:00Z',
          summary: 'Reconstructed rows are excluded',
          priority: 'Blocker',
          provenance: 'RECONSTRUCTED',
        }),
        versionData(retiredAfter.id, retiredAfter.jiraId!, retiredAfter.issueKey, 5, {
          observedAt: '2026-08-23T11:30:00Z',
          jiraUpdatedAt: '2026-08-23T11:00:00Z',
          summary: 'Visible before retirement',
        }),
        versionData(retiredBefore.id, retiredBefore.jiraId!, retiredBefore.issueKey, 6, {
          observedAt: '2026-08-22T12:00:00Z',
          jiraUpdatedAt: '2026-08-22T11:00:00Z',
          summary: 'Excluded by retirement boundary',
        }),
      ],
    });

    const prepared = await prepareJiraAsOfIssueBatches(prisma, projectId, asOf);
    const issues = [];
    for await (const batch of prepared.batches) issues.push(...batch);

    assert.deepEqual(issues.map((issue) => issue.summary).sort(), [
      'Deterministic winner',
      'Visible before retirement',
    ]);
    assert.equal(issues.find((issue) => issue.issueKey === active.issueKey)?.criticalSlaTracked, true);
    assert.equal(prepared.reconstruction.tickets, 2);
    assert.equal(prepared.reconstruction.ticketsWithoutObservation, 1);
    assert.equal(prepared.reconstruction.ticketsRetiredAfterAsOf, 1);
    assert.equal(prepared.reconstruction.versionRowsScanned, 4);
    assert.equal(prepared.reconstruction.provenance, 'RECONSTRUCTED');
    assert.equal(prepared.reconstruction.basis, 'OBSERVED_VERSIONS');
    assert.equal(prepared.reconstruction.beforeHistoryStart, false);
    assert.ok(prepared.reconstruction.stalenessHours);

    const beforeHistory = await prepareJiraAsOfIssueBatches(
      prisma,
      projectId,
      new Date('2026-08-21T00:00:00Z'),
    );
    assert.equal(beforeHistory.reconstruction.tickets, 0);
    assert.equal(beforeHistory.reconstruction.ticketsWithoutObservation, 4);
    assert.equal(beforeHistory.reconstruction.beforeHistoryStart, true);
    assert.equal(beforeHistory.reconstruction.earliestObservationAt, null);
    assert.equal(withoutObservation.projectId, projectId);
  } finally {
    if (projectId) await prisma.project.delete({ where: { id: projectId } });
    if (businessUnitId) await prisma.businessUnit.delete({ where: { id: businessUnitId } });
    await prisma.$disconnect();
  }
});

test('project Jira clear removes one project population and preserves the other project data', {
  skip: !testDatabaseUrl,
}, async () => {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'JIRA_HISTORY_TEST_DATABASE_URL must target a test database');
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  let businessUnitId: string | null = null;
  try {
    const businessUnit = await prisma.businessUnit.create({
      data: { code: `clear-${suffix}`, name: `Clear isolation ${suffix}` },
    });
    businessUnitId = businessUnit.id;
    const projectData = (code: string, name: string) => ({
      businessUnitId: businessUnit.id,
      code,
      name,
      portfolio: 'Integration',
      sponsor: 'Integration',
      projectManager: 'Integration',
      startDate: new Date('2026-08-01T00:00:00Z'),
      targetDate: new Date('2026-09-01T00:00:00Z'),
      budgetPlanned: '0',
      budgetForecast: '0',
      summary: 'Disposable integration fixture',
    });
    const [selectedProject, otherProject] = await Promise.all([
      prisma.project.create({
        data: projectData(`CLEAR-A-${suffix}`, 'Selected project'),
      }),
      prisma.project.create({
        data: projectData(`CLEAR-B-${suffix}`, 'Other project'),
      }),
    ]);
    const dashboardConfig = { version: 2, widgets: [] };
    await prisma.jiraAnalyticsSettings.createMany({
      data: [
        {
          projectId: selectedProject.id,
          jiraScopeType: 'LABEL',
          jiraScopeValue: 'selected-scope',
          jiraLabel: 'selected-scope',
          dashboardConfig,
          historyCursorJiraIssueId: '10001',
          historyCursorUpdatedAt: new Date('2026-08-24T10:00:00Z'),
        },
        {
          projectId: otherProject.id,
          jiraScopeType: 'LABEL',
          jiraScopeValue: 'other-scope',
          jiraLabel: 'other-scope',
        },
      ],
    });
    await prisma.jiraAggregateDefinition.create({
      data: {
        projectId: selectedProject.id,
        name: 'Preserved aggregate',
        nameKey: 'preserved-aggregate',
        source: 'issues',
        metric: 'count',
        groupBy: 'none',
        scope: 'active',
        filterLogic: 'and',
        filters: [],
        periodMode: 'DASHBOARD',
        fingerprint: 'a'.repeat(64),
      },
    });
    await prisma.issue.create({
      data: {
        projectId: selectedProject.id,
        source: 'INTERNAL',
        title: 'Preserved project issue',
        severity: 'MEDIUM',
        status: 'Open',
        owner: 'Integration',
        impact: 'Must survive Jira clear',
      },
    });

    const importedIssue: JiraIssue = {
      ...jiraIssue('Imported ticket', new Date('2026-08-24T10:00:00Z')),
      transitions: [{
        key: 'clear-transition',
        fromStatus: 'Open',
        toStatus: 'In Progress',
        transitionedAt: new Date('2026-08-24T09:00:00Z'),
        actor: 'Integration',
      }],
      transitionHistoryComplete: true,
      labels: ['integration-label'],
      labelChanges: [{
        key: 'clear-label-change',
        changedAt: new Date('2026-08-24T09:15:00Z'),
        fromLabels: [],
        toLabels: ['integration-label'],
        actor: 'Integration',
      }],
      development: {
        commitCount: 2,
        mergeRequestCount: 1,
        updatedAt: new Date('2026-08-24T09:30:00Z'),
        available: true,
      },
    };
    for (const project of [selectedProject, otherProject]) {
      await prisma.$transaction((transaction) => syncJiraIssueAnalytics(
        createPrismaJiraAnalyticsSyncStore(transaction),
        project.id,
        importedIssue,
        new Date('2026-08-24T10:01:00Z'),
        `clear-run-${project.id}`,
      ));
      await prisma.jiraIssueHistoryRetry.create({
        data: {
          projectId: project.id,
          jiraIssueId: importedIssue.jiraId,
          issueKey: importedIssue.key,
          reasonCode: 'TEST_RETRY',
          lastError: 'Disposable retry',
          nextRetryAt: new Date('2026-08-24T11:00:00Z'),
        },
      });
    }
    const selectedSnapshot = await prisma.jiraIssueSnapshot.findUniqueOrThrow({
      where: {
        projectId_issueKey: {
          projectId: selectedProject.id,
          issueKey: importedIssue.key,
        },
      },
    });
    const otherSnapshot = await prisma.jiraIssueSnapshot.findUniqueOrThrow({
      where: {
        projectId_issueKey: {
          projectId: otherProject.id,
          issueKey: importedIssue.key,
        },
      },
    });
    const section = await prisma.jiraWorkSection.create({
      data: { projectId: selectedProject.id, sortOrder: 0, title: 'Preserved section' },
    });
    await prisma.jiraWorkSectionIssue.create({
      data: { sectionId: section.id, snapshotId: selectedSnapshot.id },
    });

    const result = await clearJiraProjectData(prisma, selectedProject.id);

    assert.equal(result.ticketsDeleted, 1);
    assert.equal(result.versionsDeleted, 1);
    assert.equal(result.statusTransitionsDeleted, 1);
    assert.equal(result.labelChangesDeleted, 1);
    assert.equal(result.developmentActivitiesDeleted, 1);
    assert.equal(result.membershipsDeleted, 1);
    assert.equal(result.retriesDeleted, 1);
    assert.equal(await prisma.jiraIssueSnapshot.count({ where: { projectId: selectedProject.id } }), 0);
    assert.equal(await prisma.jiraIssueVersion.count({ where: { projectId: selectedProject.id } }), 0);
    assert.equal(await prisma.jiraIssueLabelChange.count({ where: { snapshot: { projectId: selectedProject.id } } }), 0);
    assert.equal(await prisma.jiraIssueHistoryRetry.count({ where: { projectId: selectedProject.id } }), 0);
    assert.equal(await prisma.jiraIssueSnapshot.count({ where: { projectId: otherProject.id } }), 1);
    assert.equal(await prisma.jiraIssueVersion.count({ where: { projectId: otherProject.id } }), 1);
    assert.equal(await prisma.jiraIssueHistoryRetry.count({ where: { projectId: otherProject.id } }), 1);
    assert.equal(await prisma.jiraIssueStatusTransition.count({ where: { snapshotId: otherSnapshot.id } }), 1);
    assert.equal(await prisma.jiraIssueLabelChange.count({ where: { snapshotId: otherSnapshot.id } }), 1);
    assert.equal(await prisma.jiraDevelopmentActivity.count({ where: { snapshotId: otherSnapshot.id } }), 1);
    assert.equal(await prisma.jiraAggregateDefinition.count({ where: { projectId: selectedProject.id } }), 1);
    assert.equal(await prisma.issue.count({ where: { projectId: selectedProject.id } }), 1);
    assert.equal(await prisma.jiraWorkSection.count({ where: { projectId: selectedProject.id } }), 1);
    const preservedSettings = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
      where: { projectId: selectedProject.id },
    });
    assert.equal(preservedSettings.jiraScopeValue, 'selected-scope');
    assert.deepEqual(preservedSettings.dashboardConfig, dashboardConfig);
    assert.equal(preservedSettings.historyCursorJiraIssueId, null);

    const rebuild = await acquireJiraProjectionRebuildLease(prisma, selectedProject.id);
    assert.ok(rebuild);
    await assert.rejects(
      clearJiraProjectData(prisma, selectedProject.id),
      JiraProjectDataBusyError,
    );
    await releaseJiraProjectionRebuildLease(prisma, rebuild, 'CONFIGURED');
  } finally {
    if (businessUnitId) await prisma.project.deleteMany({ where: { businessUnitId } });
    if (businessUnitId) await prisma.businessUnit.delete({ where: { id: businessUnitId } });
    await prisma.$disconnect();
  }
});

test('system aggregate bootstrap publishes labels, preserves drafts, and repins existing widgets', {
  skip: !testDatabaseUrl,
}, async () => {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'JIRA_HISTORY_TEST_DATABASE_URL must target a test database');
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  let businessUnitId: string | null = null;
  try {
    const businessUnit = await prisma.businessUnit.create({
      data: { code: `labels-bootstrap-${suffix}`, name: `Labels bootstrap ${suffix}` },
    });
    businessUnitId = businessUnit.id;
    const project = await prisma.project.create({
      data: {
        businessUnitId: businessUnit.id,
        code: `LBLBOOT-${suffix}`,
        name: 'Labels aggregate bootstrap test',
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

    await ensureJiraSystemSemanticAggregates(prisma, project.id);
    const seededRows = await prisma.jiraAggregateDefinition.findMany({
      where: { projectId: project.id, system: true },
      include: { revisions: true },
    });
    assert.equal(seededRows.length, JIRA_SYSTEM_SEMANTIC_AGGREGATES.length);
    const seededSettings = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
      where: { projectId: project.id },
    });
    const seededDashboard = jiraSemanticDashboardSchema.parse(seededSettings.dashboardConfig);
    const removedWidget = seededDashboard.widgets.find((widget) => widget.id === 'active-without-sprint-with-code')!;
    const gitlabWidget = seededDashboard.widgets.find((widget) => widget.id === 'active-gitlab-unlinked-branch-commits')!;
    const legacyDashboard = {
      ...seededDashboard,
      widgets: seededDashboard.widgets
        .filter((widget) => widget.id !== removedWidget.id && widget.id !== gitlabWidget.id)
        .map((widget) => ({ ...widget, aggregateVersion: 1 })),
    };

    for (const row of seededRows) {
      const published = row.revisions.find((revision) => revision.version === 1);
      assert.ok(published);
      const legacyPublished = aggregateWithoutLabels(published.definition);
      await prisma.jiraAggregateDefinitionRevision.update({
        where: { aggregateId_version: { aggregateId: row.id, version: 1 } },
        data: { definition: legacyPublished as unknown as Prisma.InputJsonObject },
      });
      if (row.aggregateKey === 'issues') {
        const legacyDraft = { ...legacyPublished, name: 'Черновик тикетов' };
        await prisma.jiraAggregateDefinitionRevision.create({
          data: {
            projectId: project.id,
            aggregateId: row.id,
            version: 2,
            definition: legacyDraft as unknown as Prisma.InputJsonObject,
            fingerprint: 'd'.repeat(64),
            status: 'draft',
            changeKind: 'compatible',
          },
        });
        await prisma.jiraAggregateDefinition.update({
          where: { id: row.id },
          data: {
            version: 2,
            publishedVersion: 1,
            draftDefinition: legacyDraft as unknown as Prisma.InputJsonObject,
            exposedFields: legacyDraft.outputFields.map((field) => field.key),
          },
        });
      } else {
        await prisma.jiraAggregateDefinition.update({
          where: { id: row.id },
          data: {
            version: 1,
            publishedVersion: 1,
            draftDefinition: legacyPublished as unknown as Prisma.InputJsonObject,
            exposedFields: legacyPublished.outputFields.map((field) => field.key),
          },
        });
      }
    }
    await prisma.jiraAnalyticsSettings.update({
      where: { projectId: project.id },
      data: {
        dashboardConfig: legacyDashboard as unknown as Prisma.InputJsonObject,
        semanticDefaultWidgetsVersion: 2,
      },
    });

    await ensureJiraSystemSemanticAggregates(prisma, project.id);

    const upgradedRows = await prisma.jiraAggregateDefinition.findMany({
      where: { projectId: project.id, system: true },
      include: { revisions: { orderBy: { version: 'asc' } } },
    });
    const publishedVersions = new Map<string, number>();
    for (const row of upgradedRows) {
      assert.ok(row.publishedVersion);
      publishedVersions.set(row.id, row.publishedVersion);
      const published = row.revisions.find((revision) => revision.version === row.publishedVersion);
      assert.ok(published);
      const publishedDefinition = jiraSemanticAggregateDefinitionSchema.parse(published.definition);
      if (publishedDefinition.rowConfig.kind !== 'gitlabBranchCommit') {
        assert.ok(
          publishedDefinition.outputFields.some((field) => field.key === 'labels'),
        );
      }
      if (row.aggregateKey === 'issues') {
        assert.equal(row.publishedVersion, 3);
        assert.equal(row.version, 4);
        assert.equal(row.revisions.find((revision) => revision.version === 2)?.status, 'archived');
        const draft = row.revisions.find((revision) => revision.version === 4);
        assert.equal(draft?.status, 'draft');
        assert.equal(jiraSemanticAggregateDefinitionSchema.parse(draft?.definition).name, 'Черновик тикетов');
        assert.ok(
          jiraSemanticAggregateDefinitionSchema.parse(draft?.definition)
            .outputFields.some((field) => field.key === 'labels'),
        );
      } else if (publishedDefinition.rowConfig.kind === 'gitlabBranchCommit') {
        assert.equal(row.publishedVersion, 1);
        assert.equal(row.version, 1);
      } else {
        assert.equal(row.publishedVersion, 2);
        assert.equal(row.version, 2);
      }
    }
    const upgradedSettings = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
      where: { projectId: project.id },
    });
    assert.equal(upgradedSettings.semanticDefaultWidgetsVersion, JIRA_SEMANTIC_DEFAULT_WIDGETS_VERSION);
    const upgradedDashboard = jiraSemanticDashboardSchema.parse(upgradedSettings.dashboardConfig);
    assert.equal(upgradedDashboard.widgets.length, legacyDashboard.widgets.length + 1);
    assert.equal(upgradedDashboard.widgets.some((widget) => widget.id === removedWidget.id), false);
    assert.equal(upgradedDashboard.widgets.some((widget) => widget.id === gitlabWidget.id), true);
    for (const widget of upgradedDashboard.widgets) {
      assert.equal(widget.aggregateVersion, publishedVersions.get(widget.aggregateId));
    }

    const revisionCount = await prisma.jiraAggregateDefinitionRevision.count({
      where: { projectId: project.id },
    });
    const invalidDashboard = { version: 999, invalid: true };
    await prisma.jiraAnalyticsSettings.update({
      where: { projectId: project.id },
      data: {
        dashboardConfig: invalidDashboard,
        semanticDefaultWidgetsVersion: 2,
      },
    });
    await ensureJiraSystemSemanticAggregates(prisma, project.id);
    const invalidSettings = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
      where: { projectId: project.id },
    });
    assert.deepEqual(invalidSettings.dashboardConfig, invalidDashboard);
    assert.equal(invalidSettings.semanticDefaultWidgetsVersion, 2);
    assert.equal(
      await prisma.jiraAggregateDefinitionRevision.count({ where: { projectId: project.id } }),
      revisionCount,
    );
  } finally {
    if (businessUnitId) await prisma.project.deleteMany({ where: { businessUnitId } });
    if (businessUnitId) await prisma.businessUnit.delete({ where: { id: businessUnitId } });
    await prisma.$disconnect();
  }
});
