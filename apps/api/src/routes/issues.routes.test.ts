import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';

import { JiraReadOnlyRequestError } from '../jira.js';
import {
  createIssuesRouter,
  isFatalJiraHistoryBatchError,
  jiraHistoryIssueIsRetryEligible,
  jiraHistorySyncFailedCompletely,
  JIRA_CAPACITY_DEFAULT_ALLOCATED_GIB,
  JIRA_CAPACITY_DEFAULT_STORAGE_GIB,
} from './issues.routes.js';

test('Jira capacity sampler uses the approved global history defaults', () => {
  assert.equal(JIRA_CAPACITY_DEFAULT_STORAGE_GIB, 5);
  assert.equal(JIRA_CAPACITY_DEFAULT_ALLOCATED_GIB, 0);
});

test('Jira history stops batch fallback after global failures and deadlines', () => {
  assert.equal(isFatalJiraHistoryBatchError(new JiraReadOnlyRequestError('blocked')), true);
  assert.equal(isFatalJiraHistoryBatchError(new Error('Jira authentication failed')), true);
  assert.equal(isFatalJiraHistoryBatchError(new Error('превышен лимит времени ожидания Jira')), true);
  assert.equal(isFatalJiraHistoryBatchError(new Error('temporary 500 response')), false);
});

test('Jira history reports a complete observation failure without false success', () => {
  assert.equal(jiraHistorySyncFailedCompletely(20, 0), true);
  assert.equal(jiraHistorySyncFailedCompletely(20, 1), false);
  assert.equal(jiraHistorySyncFailedCompletely(0, 0), false);
});

test('Jira history applies retry backoff to newly discovered issues without snapshots', () => {
  const pending = new Set(['CVTE-1']);
  assert.equal(jiraHistoryIssueIsRetryEligible('cvte-1', pending, new Set()), false);
  assert.equal(jiraHistoryIssueIsRetryEligible('CVTE-1', pending, new Set(['CVTE-1'])), true);
  assert.equal(jiraHistoryIssueIsRetryEligible('CVTE-2', pending, new Set()), true);
});

test('Jira capacity sampler rejects non-admin users before sampling', async () => {
  const router = createIssuesRouter() as unknown as {
    stack: Array<{
      route?: {
        path: string;
        stack: Array<{ handle: (req: Request, res: Response) => Promise<void> }>;
      };
    }>;
  };
  const route = router.stack.find(
    (layer) => layer.route?.path === '/projects/:projectId/jira/capacity-sample',
  )?.route;
  assert.ok(route);

  let status = 200;
  let payload: unknown;
  const response = {
    status(nextStatus: number) {
      status = nextStatus;
      return this;
    },
    json(nextPayload: unknown) {
      payload = nextPayload;
      return this;
    },
  } as unknown as Response;
  const request = {
    params: { projectId: 'project-1' },
    body: { scopeType: 'LABEL', scopeValue: 'cvte968' },
    currentUser: { role: 'PROJECT_MANAGER' },
  } as unknown as Request;

  await route.stack[0]!.handle(request, response);

  assert.equal(status, 403);
  assert.deepEqual(payload, {
    error: 'Замер ёмкости доступен только администратору системы',
  });
});

test('Jira history diagnostics reject non-admin users before querying storage', async () => {
  const router = createIssuesRouter() as unknown as {
    stack: Array<{
      route?: {
        path: string;
        stack: Array<{ handle: (req: Request, res: Response) => Promise<void> }>;
      };
    }>;
  };
  const route = router.stack.find(
    (layer) => layer.route?.path === '/projects/:projectId/jira/history-status',
  )?.route;
  assert.ok(route);

  let status = 200;
  let payload: unknown;
  const response = {
    status(nextStatus: number) {
      status = nextStatus;
      return this;
    },
    json(nextPayload: unknown) {
      payload = nextPayload;
      return this;
    },
  } as unknown as Response;
  const request = {
    params: { projectId: 'project-1' },
    currentUser: { role: 'PROJECT_MANAGER' },
  } as unknown as Request;

  await route.stack[0]!.handle(request, response);

  assert.equal(status, 403);
  assert.deepEqual(payload, {
    error: 'Диагностика истории доступна только администратору системы',
  });
});

test('Jira projection rebuild rejects non-admin users before database writes', async () => {
  const router = createIssuesRouter() as unknown as {
    stack: Array<{
      route?: {
        path: string;
        stack: Array<{ handle: (req: Request, res: Response) => Promise<void> }>;
      };
    }>;
  };
  const route = router.stack.find(
    (layer) => layer.route?.path === '/projects/:projectId/jira/history/rebuild-projections',
  )?.route;
  assert.ok(route);

  let status = 200;
  let payload: unknown;
  const response = {
    status(nextStatus: number) {
      status = nextStatus;
      return this;
    },
    json(nextPayload: unknown) {
      payload = nextPayload;
      return this;
    },
  } as unknown as Response;
  const request = {
    params: { projectId: 'project-1' },
    currentUser: { role: 'PROJECT_MANAGER' },
  } as unknown as Request;

  await route.stack[0]!.handle(request, response);

  assert.equal(status, 403);
  assert.deepEqual(payload, {
    error: 'Восстановление проекций доступно только администратору системы',
  });
});
