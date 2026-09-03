import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';

import {
  clearJiraProjectData,
  JiraProjectDataBusyError,
  JiraProjectDataNotFoundError,
  JiraProjectDataReadOnlyError,
} from './jira-project-data.js';

test('project Jira clear deletes only imported data for the selected project', async () => {
  const calls: Array<{ operation: string; value: unknown }> = [];
  const transaction = {
    $queryRaw: async (query: { text: string }) => {
      calls.push({ operation: 'queryRaw', value: query.text });
      return query.text.includes('JiraAnalyticsSettings')
        ? [{ syncRunId: null, leaseActive: false }]
        : [{ lock: '' }];
    },
    project: {
      findUnique: async (value: unknown) => {
        calls.push({ operation: 'project.findUnique', value });
        return { id: 'project-1', status: 'ACTIVE' };
      },
    },
    jiraSyncRun: {
      findFirst: async (value: unknown) => {
        calls.push({ operation: 'run.findFirst', value });
        return null;
      },
    },
    jiraIssueSnapshot: {
      deleteMany: async (value: unknown) => {
        calls.push({ operation: 'snapshot.deleteMany', value });
        return { count: 2 };
      },
    },
    jiraIssueVersion: {
      deleteMany: async (value: unknown) => {
        calls.push({ operation: 'version.deleteMany', value });
        return { count: 7 };
      },
    },
    jiraIssueStatusTransition: {
      deleteMany: async (value: unknown) => {
        calls.push({ operation: 'transition.deleteMany', value });
        return { count: 3 };
      },
    },
    jiraIssueLabelChange: {
      deleteMany: async (value: unknown) => {
        calls.push({ operation: 'labelChange.deleteMany', value });
        return { count: 6 };
      },
    },
    jiraDevelopmentActivity: {
      deleteMany: async (value: unknown) => {
        calls.push({ operation: 'activity.deleteMany', value });
        return { count: 4 };
      },
    },
    jiraWorkSectionIssue: {
      deleteMany: async (value: unknown) => {
        calls.push({ operation: 'membership.deleteMany', value });
        return { count: 5 };
      },
    },
    jiraIssueHistoryRetry: {
      deleteMany: async (value: unknown) => {
        calls.push({ operation: 'retry.deleteMany', value });
        return { count: 1 };
      },
    },
    jiraAnalyticsSettings: {
      updateMany: async (value: unknown) => {
        calls.push({ operation: 'settings.updateMany', value });
        return { count: 1 };
      },
    },
    jiraIntegration: {
      updateMany: async (value: unknown) => {
        calls.push({ operation: 'integration.updateMany', value });
        return { count: 1 };
      },
    },
  };
  const database = {
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as unknown as PrismaClient;

  const result = await clearJiraProjectData(database, 'project-1');

  assert.deepEqual(result, {
    projectId: 'project-1',
    ticketsDeleted: 2,
    versionsDeleted: 7,
    statusTransitionsDeleted: 3,
    labelChangesDeleted: 6,
    developmentActivitiesDeleted: 4,
    membershipsDeleted: 5,
    retriesDeleted: 1,
  });
  for (const operation of [
    'snapshot.deleteMany',
    'version.deleteMany',
    'retry.deleteMany',
  ]) {
    assert.deepEqual(calls.find((item) => item.operation === operation)?.value, {
      where: { projectId: 'project-1' },
    });
  }
  for (const operation of [
    'transition.deleteMany',
    'labelChange.deleteMany',
    'activity.deleteMany',
    'membership.deleteMany',
  ]) {
    assert.deepEqual(calls.find((item) => item.operation === operation)?.value, {
      where: { snapshot: { projectId: 'project-1' } },
    });
  }
  const settingsWrite = calls.find((item) => item.operation === 'settings.updateMany');
  assert.deepEqual(settingsWrite?.value, {
    where: { projectId: 'project-1' },
    data: {
      syncStatus: 'CONFIGURED',
      lastSyncedAt: null,
      currentProjectionRefreshedAt: null,
      syncStartedAt: null,
      syncLockExpiresAt: null,
      syncRunId: null,
      syncFenceToken: { increment: 1 },
      historyCursorUpdatedAt: null,
      historyCursorJiraIssueId: null,
      historyLastFullReconciledAt: null,
      historyFullCursorIssueKey: null,
      historyFullStartedAt: null,
    },
  });
});

test('project Jira clear refuses to race an active synchronization', async () => {
  const transaction = {
    $queryRaw: async (query: { text: string }) => query.text.includes('JiraAnalyticsSettings')
      ? [{ syncRunId: 'run-1', leaseActive: true }]
      : [{ lock: '' }],
    project: { findUnique: async () => ({ id: 'project-1', status: 'ACTIVE' }) },
    jiraSyncRun: { findFirst: async () => ({ id: 'run-1' }) },
  };
  const database = {
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as unknown as PrismaClient;

  await assert.rejects(
    clearJiraProjectData(database, 'project-1'),
    JiraProjectDataBusyError,
  );
});

test('project Jira clear recovers from a stale settings run id after its lease expires', async () => {
  const transaction = {
    $queryRaw: async (query: { text: string }) => query.text.includes('JiraAnalyticsSettings')
      ? [{ syncRunId: 'stale-run', leaseActive: false }]
      : [{ lock: '' }],
    project: { findUnique: async () => ({ id: 'project-1', status: 'ACTIVE' }) },
    jiraSyncRun: { findFirst: async () => null },
    jiraWorkSectionIssue: { deleteMany: async () => ({ count: 0 }) },
    jiraIssueStatusTransition: { deleteMany: async () => ({ count: 0 }) },
    jiraIssueLabelChange: { deleteMany: async () => ({ count: 0 }) },
    jiraDevelopmentActivity: { deleteMany: async () => ({ count: 0 }) },
    jiraIssueVersion: { deleteMany: async () => ({ count: 0 }) },
    jiraIssueSnapshot: { deleteMany: async () => ({ count: 0 }) },
    jiraIssueHistoryRetry: { deleteMany: async () => ({ count: 0 }) },
    jiraAnalyticsSettings: { updateMany: async () => ({ count: 1 }) },
    jiraIntegration: { updateMany: async () => ({ count: 1 }) },
  };
  const database = {
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as unknown as PrismaClient;

  await assert.doesNotReject(clearJiraProjectData(database, 'project-1'));
});

test('project Jira clear rejects an unknown project before deleting data', async () => {
  let deletes = 0;
  const transaction = {
    $queryRaw: async () => [{ lock: '' }],
    project: { findUnique: async () => null },
    jiraIssueSnapshot: { deleteMany: async () => { deletes += 1; } },
  };
  const database = {
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as unknown as PrismaClient;

  await assert.rejects(
    clearJiraProjectData(database, 'missing-project'),
    JiraProjectDataNotFoundError,
  );
  assert.equal(deletes, 0);
});

test('project Jira clear keeps closed projects read-only', async () => {
  let deletes = 0;
  const transaction = {
    $queryRaw: async () => [{ lock: '' }],
    project: { findUnique: async () => ({ id: 'project-1', status: 'CLOSED' }) },
    jiraIssueSnapshot: { deleteMany: async () => { deletes += 1; } },
  };
  const database = {
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as unknown as PrismaClient;

  await assert.rejects(
    clearJiraProjectData(database, 'project-1'),
    JiraProjectDataReadOnlyError,
  );
  assert.equal(deletes, 0);
});
