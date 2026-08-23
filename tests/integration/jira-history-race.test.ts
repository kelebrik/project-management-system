import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';

import type { JiraIssue } from '../../apps/api/src/jira.js';
import {
  createPrismaJiraAnalyticsSyncStore,
  syncJiraIssueAnalytics,
} from '../../apps/api/src/services/jira-analytics-sync.js';

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
