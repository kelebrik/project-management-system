import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { JiraSyncRunKind } from '@prisma/client';

import { JiraSyncDeadlineError, jiraReadOnlyRouteTemplate } from '../jira.js';
import {
  isFatalJiraHistoryBatchError,
  jiraHistoryFullCursorAfterBatch,
  jiraHistoryFullSweepStartedAt,
  jiraHistoryIssueKeysAfterResume,
  jiraHistoryResumeAfter,
} from './jira-sync-pipeline.js';
import {
  jiraHistoryWriteEnabled,
  jiraHistoryWriteEnabledForRun,
  jiraSyncRunTouchesFullSyncStatus,
  JiraSyncCapacityError,
  publicJiraSyncRun,
} from './jira-sync-runs.js';
import { jiraHistoryStorageBudgetBytes, JIRA_HISTORY_STORAGE_BUDGET_BYTES } from './jira-history.js';

test('history dual-write flag is fail-safe and only exact false disables it', () => {
  assert.equal(jiraHistoryWriteEnabled({}), true);
  assert.equal(jiraHistoryWriteEnabled({ JIRA_HISTORY_WRITE_ENABLED: 'FALSE' }), true);
  assert.equal(jiraHistoryWriteEnabled({ JIRA_HISTORY_WRITE_ENABLED: 'false' }), false);
  assert.equal(jiraHistoryWriteEnabledForRun(JiraSyncRunKind.SYNC, {}), true);
  assert.equal(jiraHistoryWriteEnabledForRun(JiraSyncRunKind.CURRENT, {}), false);
});

test('current refresh keeps the status of the full Jira synchronization independent', () => {
  assert.equal(jiraSyncRunTouchesFullSyncStatus(JiraSyncRunKind.CURRENT), false);
  assert.equal(jiraSyncRunTouchesFullSyncStatus(JiraSyncRunKind.SYNC), true);
  assert.equal(jiraSyncRunTouchesFullSyncStatus(JiraSyncRunKind.BACKFILL), true);
});

test('history storage budget rejects malformed and non-positive overrides', () => {
  assert.equal(jiraHistoryStorageBudgetBytes({}), JIRA_HISTORY_STORAGE_BUDGET_BYTES);
  assert.equal(jiraHistoryStorageBudgetBytes({ JIRA_HISTORY_BUDGET_BYTES: '-1' }), JIRA_HISTORY_STORAGE_BUDGET_BYTES);
  assert.equal(jiraHistoryStorageBudgetBytes({ JIRA_HISTORY_BUDGET_BYTES: '1048576' }), 1_048_576);
});

test('Jira metrics use bounded route names without ticket keys', () => {
  assert.equal(jiraReadOnlyRouteTemplate('/rest/api/2/issue/CVTE-1778/changelog'), 'changelog');
  assert.equal(jiraReadOnlyRouteTemplate('/rest/api/2/issue/CVTE-1778/comment'), 'comment');
  assert.equal(jiraReadOnlyRouteTemplate('/rest/api/2/search'), 'search');
  assert.doesNotMatch(jiraReadOnlyRouteTemplate('/rest/api/2/issue/CVTE-1778'), /CVTE/u);
});

test('global deadline is fatal while a per-request timeout remains retryable', () => {
  assert.equal(isFatalJiraHistoryBatchError(new JiraSyncDeadlineError('deadline')), true);
  assert.equal(
    isFatalJiraHistoryBatchError(new Error('changelog: превышен лимит времени ожидания Jira')),
    false,
  );
  assert.equal(isFatalJiraHistoryBatchError(new JiraSyncCapacityError('capacity')), true);
});

test('Jira sync bounds discovery pages and issue-key JQL batches', async () => {
  const source = await readFile(new URL('./jira-sync-pipeline.ts', import.meta.url), 'utf8');
  assert.match(source, /const JIRA_SYNC_DISCOVERY_PAGE_SIZE = 100;/);
  assert.equal(source.match(/pageSize: JIRA_SYNC_DISCOVERY_PAGE_SIZE/g)?.length, 4);
  assert.match(
    source,
    /jiraIssueKeyBatches\(\s*discoveredIssueKeys,\s*JIRA_SYNC_DISCOVERY_PAGE_SIZE,\s*\)/,
  );
  assert.doesNotMatch(source, /pageSize:\s*500/);
});

test('history resumes after its run checkpoint while explicit restarts ignore stale sweep cursors', () => {
  assert.equal(jiraHistoryResumeAfter('CVTE-020', true, 'CVTE-900'), 'CVTE-020');
  assert.equal(jiraHistoryResumeAfter(null, true, 'CVTE-900'), null);
  assert.equal(jiraHistoryResumeAfter(null, false, 'CVTE-900'), 'CVTE-900');
  assert.deepEqual(
    jiraHistoryIssueKeysAfterResume(['CVTE-010', 'CVTE-020', 'CVTE-030'], 'CVTE-020'),
    ['CVTE-030'],
  );
  assert.equal(jiraHistoryFullCursorAfterBatch('CVTE-500', 'CVTE-180'), 'CVTE-500');
  assert.equal(jiraHistoryFullCursorAfterBatch('CVTE-500', 'CVTE-700'), 'CVTE-700');
  assert.equal(jiraHistoryFullCursorAfterBatch(null, 'CVTE-180'), 'CVTE-180');
  const originalSweep = new Date('2026-08-23T10:00:00Z');
  const originalRun = new Date('2026-08-23T09:59:00Z');
  const resumedAttempt = new Date('2026-08-23T10:16:00Z');
  assert.equal(
    jiraHistoryFullSweepStartedAt('CVTE-020', originalSweep, originalRun, resumedAttempt),
    originalSweep,
  );
  assert.equal(
    jiraHistoryFullSweepStartedAt('CVTE-020', null, originalRun, resumedAttempt),
    originalRun,
  );
  assert.equal(
    jiraHistoryFullSweepStartedAt(null, originalSweep, originalRun, resumedAttempt),
    resumedAttempt,
  );
});

test('public durable run never exposes worker, fence, lease, cursor or Jira paths', () => {
  const serialized = publicJiraSyncRun({
    id: 'run-1',
    projectId: 'project-1',
    kind: 'SYNC',
    status: 'RUNNING',
    phase: 'HISTORY',
    activeSlot: 'project-1',
    historyWriteEnabled: true,
    jiraScopeType: 'LABEL',
    jiraScopeValue: 'cvte968',
    jiraBaseUrl: null,
    scopeChanged: false,
    requestedById: 'user-1',
    requestedByRole: 'ADMIN',
    attempt: 1,
    deadlinePauseCount: 0,
    maxAttempts: 3,
    fenceToken: 9,
    workerId: 'secret-worker',
    leaseExpiresAt: new Date(),
    heartbeatAt: new Date(),
    deadlineAt: new Date(),
    enqueuedAt: new Date(),
    startedAt: new Date(),
    finishedAt: null,
    elapsedMs: null,
    resumeCursorIssueKey: 'CVTE-10',
    resumedFromRunId: null,
    discoveredIssueCount: 20,
    hydratedIssueCount: 10,
    versionsCreated: 4,
    retriesQueued: 0,
    jiraRequestCount: 7,
    jiraRequestDurationMsTotal: 100,
    jiraRequestDurationMsMax: 30,
    jiraRequestsByRoute: { changelog: 4 },
    jiraRequestsByStatusClass: { '2xx': 7 },
    progressDone: 10,
    progressTotal: 20,
    progressUnit: 'issues',
    result: null,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const text = JSON.stringify(serialized);
  assert.doesNotMatch(text, /secret-worker|fenceToken|leaseExpiresAt|resumeCursorIssueKey/u);
});
