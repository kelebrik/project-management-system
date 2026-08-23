import assert from 'node:assert/strict';
import test from 'node:test';

import {
  jiraHistoryCapacityLevel,
  jiraHistoryAdminError,
  jiraHistoryNeedsFullReconciliation,
  jiraHistoryRetryAt,
  jiraHistoryUpdatedSinceJql,
  latestJiraHistoryCursor,
  queueJiraHistoryRetry,
  redactJiraHistoryError,
  resolveJiraHistoryRetry,
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

test('Jira history diagnostics redact connection passwords and tokens', () => {
  const message = [
    'postgresql://service:secret@db.example/tv?password=query-secret&sslmode=require',
    'https://jira-user:jira-secret@jira.example',
    'password=hidden',
    'password=\nline-secret',
    'token: bearer-secret',
    'Authorization: Bearer eyJhbGciOi',
    'Authorization=Basic c2VjcmV0',
    '{"password":"json-secret","token":"json-token"}',
    'ATATT3xFfExampleToken',
  ].join(' ');
  const redacted = redactJiraHistoryError(message);

  for (const secret of [
    'secret',
    'query-secret',
    'jira-secret',
    'hidden',
    'line-secret',
    'bearer-secret',
    'eyJhbGciOi',
    'c2VjcmV0',
    'json-secret',
    'json-token',
    'ATATT3xFfExampleToken',
  ]) {
    assert.doesNotMatch(redacted, new RegExp(secret, 'i'));
  }
  assert.match(redacted, /sslmode=require/);
});

test('Jira history admin diagnostics expose only structured persistence causes', () => {
  assert.equal(
    jiraHistoryAdminError(
      'PERSISTENCE_FAILED',
      "Failed to deserialize column of type 'void'. password=secret",
    ),
    'Prisma не может прочитать тип результата PostgreSQL: void',
  );
  assert.match(
    jiraHistoryAdminError('PERSISTENCE_FAILED', 'unexpected database error token=secret'),
    /^Ошибка сохранения версии в базе данных · диагностика [a-f0-9]{12}$/,
  );
  assert.doesNotMatch(
    jiraHistoryAdminError('FETCH_ISSUE_FAILED', 'Authorization: Bearer secret-token'),
    /secret-token/,
  );
});

test('Jira history retry persistence normalizes issue keys on queue and resolution', async () => {
  let upsertInput: { where: unknown; create: { issueKey: string } } | undefined;
  let resolveWhere: unknown;
  const transaction = {
    jiraIssueHistoryRetry: {
      findUnique: async () => null,
      upsert: async (input: typeof upsertInput) => {
        upsertInput = input;
        return input;
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof transaction) => unknown) => callback(transaction),
    jiraIssueHistoryRetry: {
      updateMany: async ({ where }: { where: unknown }) => {
        resolveWhere = where;
        return { count: 1 };
      },
    },
  } as unknown as Parameters<typeof queueJiraHistoryRetry>[0];

  await queueJiraHistoryRetry(prisma, {
    projectId: 'project-1',
    issueKey: ' cvte-1 ',
    jiraIssueId: '1001',
    reasonCode: 'PERSISTENCE_FAILED',
    error: new Error('failed'),
    observedUpdatedAt: null,
    failedAt: new Date('2026-08-22T10:00:00Z'),
  });
  await resolveJiraHistoryRetry(prisma, 'project-1', 'cvte-1', new Date());

  assert.equal(upsertInput?.create.issueKey, 'CVTE-1');
  assert.deepEqual(upsertInput?.where, {
    projectId_issueKey: { projectId: 'project-1', issueKey: 'CVTE-1' },
  });
  assert.deepEqual(resolveWhere, {
    projectId: 'project-1',
    issueKey: 'CVTE-1',
    status: 'PENDING',
  });
});
