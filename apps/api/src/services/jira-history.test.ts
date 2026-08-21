import assert from 'node:assert/strict';
import test from 'node:test';

import {
  jiraHistoryCapacityLevel,
  jiraHistoryNeedsFullReconciliation,
  jiraHistoryRetryAt,
  jiraHistoryUpdatedSinceJql,
  latestJiraHistoryCursor,
} from './jira-history.js';

test('Jira history retry uses bounded exponential backoff', () => {
  const failedAt = new Date('2026-08-21T10:00:00Z');

  assert.deepEqual(jiraHistoryRetryAt(failedAt, 1), new Date('2026-08-21T10:01:00Z'));
  assert.deepEqual(jiraHistoryRetryAt(failedAt, 3), new Date('2026-08-21T10:04:00Z'));
  assert.deepEqual(jiraHistoryRetryAt(failedAt, 50), new Date('2026-08-22T10:00:00Z'));
});

test('Jira history cursor query uses a timezone-independent relative overlap window', () => {
  assert.equal(
    jiraHistoryUpdatedSinceJql(
      new Date('2026-08-21T10:10:42Z'),
      new Date('2026-08-21T10:20:10Z'),
    ),
    'updated >= "-15m" ORDER BY updated ASC, key ASC',
  );
  assert.equal(
    jiraHistoryUpdatedSinceJql(
      new Date('2026-08-21T10:25:00Z'),
      new Date('2026-08-21T10:20:00Z'),
    ),
    'updated >= "-5m" ORDER BY updated ASC, key ASC',
  );
});

test('Jira history performs first and weekly full reconciliations', () => {
  const now = new Date('2026-08-21T10:00:00Z');

  assert.equal(jiraHistoryNeedsFullReconciliation(null, now), true);
  assert.equal(
    jiraHistoryNeedsFullReconciliation(new Date('2026-08-15T10:00:01Z'), now),
    false,
  );
  assert.equal(
    jiraHistoryNeedsFullReconciliation(new Date('2026-08-14T10:00:00Z'), now),
    true,
  );
});

test('Jira history cursor is deterministic for equal timestamps and numeric ids', () => {
  const updatedAt = new Date('2026-08-21T10:00:00Z');
  const cursor = latestJiraHistoryCursor(null, [
    { jiraId: '9', updatedAt },
    { jiraId: '10', updatedAt },
    { jiraId: null, updatedAt: new Date('2026-08-22T10:00:00Z') },
  ]);

  assert.deepEqual(cursor, { jiraIssueId: '10', updatedAt });
});

test('Jira history capacity levels match the global budget policy', () => {
  assert.equal(jiraHistoryCapacityLevel(69.99), 'NORMAL');
  assert.equal(jiraHistoryCapacityLevel(70), 'WARNING');
  assert.equal(jiraHistoryCapacityLevel(85), 'HIGH');
  assert.equal(jiraHistoryCapacityLevel(95), 'CRITICAL');
  assert.equal(jiraHistoryCapacityLevel(100.01), 'EXCEEDED');
});
