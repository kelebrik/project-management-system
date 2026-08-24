import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';

import {
  clearJiraProjectData,
  JiraProjectDataBusyError,
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
      count: async (value: unknown) => {
        calls.push({ operation: 'snapshot.count', value });
        return 2;
      },
      deleteMany: async (value: unknown) => {
        calls.push({ operation: 'snapshot.deleteMany', value });
        return { count: 2 };
      },
    },
    jiraIssueVersion: {
      count: async (value: unknown) => {
        calls.push({ operation: 'version.count', value });
        return 7;
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
    retriesDeleted: 1,
  });
  for (const call of calls.filter((item) => item.operation.endsWith('deleteMany'))) {
    assert.deepEqual(call.value, { where: { projectId: 'project-1' } });
  }
  const settingsWrite = calls.find((item) => item.operation === 'settings.updateMany');
  assert.deepEqual(settingsWrite?.value, {
    where: { projectId: 'project-1' },
    data: {
      syncStatus: 'CONFIGURED',
      lastSyncedAt: null,
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
