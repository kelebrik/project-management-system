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
