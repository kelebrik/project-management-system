import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';

import type { JiraIssue } from '../../apps/api/src/jira.js';
import {
  createPrismaJiraAnalyticsSyncStore,
  syncJiraIssueAnalytics,
} from '../../apps/api/src/services/jira-analytics-sync.js';
import { prepareJiraAsOfIssueBatches } from '../../apps/api/src/services/jira-history-asof.js';

const testDatabaseUrl = process.env.JIRA_HISTORY_TEST_DATABASE_URL?.trim() ?? '';

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
  } finally {
    if (projectId) await prisma.project.delete({ where: { id: projectId } });
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
