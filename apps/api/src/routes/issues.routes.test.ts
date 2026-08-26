import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';

import { JiraReadOnlyRequestError } from '../jira.js';
import {
  createIssuesRouter,
  isFatalJiraHistoryBatchError,
  jiraHistoryFullSweepState,
  jiraHistoryIssueIsRetryEligible,
  jiraHistorySyncFailedCompletely,
  JIRA_CAPACITY_DEFAULT_ALLOCATED_GIB,
  JIRA_CAPACITY_DEFAULT_STORAGE_GIB,
} from './issues.routes.js';
import { projectDetailsInclude } from './projects/includes.js';
import { jiraSemanticEvaluationNow } from './jira-semantic-aggregates.routes.js';

type Route = {
  path: string;
  methods: Record<string, boolean>;
  stack: Array<{ handle: (req: Request, res: Response) => Promise<void> }>;
};

function findRoute(path: string, method?: string) {
  const router = createIssuesRouter() as unknown as { stack: Array<{ route?: Route }> };
  const route = router.stack.find((layer) => layer.route?.path === path
    && (!method || layer.route.methods[method]))?.route;
  assert.ok(route, `${method?.toUpperCase() ?? 'ANY'} ${path}`);
  return route;
}

function routeResponse() {
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
    send() {
      return this;
    },
  } as unknown as Response;
  return { response, status: () => status, payload: () => payload };
}

async function expectForbidden(path: string, method: string, error: string, body: unknown = {}) {
  const route = findRoute(path, method);
  const result = routeResponse();
  await route.stack[0]!.handle({
    params: { projectId: 'project-1' },
    body,
    currentUser: { role: 'PROJECT_MANAGER' },
  } as unknown as Request, result.response);
  assert.equal(result.status(), 403);
  assert.deepEqual(result.payload(), { error });
}

test('Jira capacity sampler uses the approved global history defaults', () => {
  assert.equal(JIRA_CAPACITY_DEFAULT_STORAGE_GIB, 5);
  assert.equal(JIRA_CAPACITY_DEFAULT_ALLOCATED_GIB, 0);
});

test('project details do not transport the top-level Jira analytics population', () => {
  assert.equal('jiraSnapshots' in projectDetailsInclude, false);
  assert.equal(projectDetailsInclude.jiraWorkSections.include.issues.include.snapshot, true);
});

test('Jira history stops batch fallback after global failures but retries request timeouts', () => {
  assert.equal(isFatalJiraHistoryBatchError(new JiraReadOnlyRequestError('blocked')), true);
  assert.equal(isFatalJiraHistoryBatchError(new Error('Jira authentication failed')), true);
  assert.equal(isFatalJiraHistoryBatchError(new Error('превышен лимит времени ожидания Jira')), false);
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

test('Jira history returns to incremental sync after a full sweep with pending retries', () => {
  assert.deepEqual(jiraHistoryFullSweepState(true, 244), { returnToIncremental: true, clean: false });
  assert.deepEqual(jiraHistoryFullSweepState(true, 0), { returnToIncremental: true, clean: true });
  assert.deepEqual(jiraHistoryFullSweepState(false, 0), { returnToIncremental: false, clean: false });
});

test('Jira datalake controls reject non-admin users before database or Jira access', async () => {
  await expectForbidden(
    '/projects/:projectId/jira/capacity-sample',
    'post',
    'Замер ёмкости доступен только администратору системы',
    { scopeType: 'LABEL', scopeValue: 'cvte968' },
  );
  await expectForbidden(
    '/projects/:projectId/jira/sync',
    'post',
    'Обновлять данные Jira может только системный администратор',
    { baseUrl: 'https://tasks.sberdevices.ru', scopeType: 'LABEL', scopeValue: 'cvte968, cvte950' },
  );
  await expectForbidden(
    '/projects/:projectId/jira/history-status',
    'get',
    'Диагностика истории доступна только администратору системы',
  );
  await expectForbidden(
    '/projects/:projectId/jira/data',
    'delete',
    'Очистка данных Jira доступна только администратору системы',
  );
  await expectForbidden(
    '/projects/:projectId/jira/history/rebuild-projections',
    'post',
    'Восстановление проекций доступно только администратору системы',
  );
});

test('Jira aggregate and widget mutations reject non-admin users before database access', async () => {
  const cases = [
    ['/projects/:projectId/jira/semantic-aggregates', 'post', 'Настраивать агрегаты может только системный администратор'],
    ['/projects/:projectId/jira/semantic-aggregates/bootstrap', 'post', 'Создавать системные агрегаты может только системный администратор'],
    ['/projects/:projectId/jira/semantic-aggregates/:aggregateId', 'patch', 'Настраивать агрегаты может только системный администратор'],
    ['/projects/:projectId/jira/semantic-aggregates/:aggregateId', 'delete', 'Архивировать агрегаты может только системный администратор'],
    ['/projects/:projectId/jira/semantic-aggregates/preview', 'post', 'Предпросмотр черновика доступен только системному администратору'],
    ['/projects/:projectId/jira/semantic-aggregates/:aggregateId/publish', 'post', 'Публиковать агрегаты может только системный администратор'],
    ['/projects/:projectId/jira/semantic-dashboard', 'patch', 'Настраивать виджеты может только системный администратор'],
  ] as const;
  for (const [path, method, error] of cases) await expectForbidden(path, method, error);
});

test('semantic dashboard requires authentication before validation or database access', async () => {
  const route = findRoute('/projects/:projectId/jira/semantic-dashboard', 'patch');
  const result = routeResponse();
  await route.stack[0]!.handle({ params: { projectId: 'project-1' }, body: {} } as unknown as Request, result.response);
  assert.equal(result.status(), 401);
  assert.deepEqual(result.payload(), { error: 'Требуется вход в систему' });
});

test('semantic historical evaluation uses the requested as-of instant as now', () => {
  const asOf = '2025-01-01T12:00:00.000Z';
  assert.equal(jiraSemanticEvaluationNow(asOf), asOf);
});

test('retired aggregate and dashboard routes are not registered', () => {
  const router = createIssuesRouter() as unknown as { stack: Array<{ route?: Route }> };
  const retired = new Set([
    '/projects/:projectId/jira/aggregates',
    '/projects/:projectId/jira/aggregate-dashboard-results',
    '/projects/:projectId/jira/analytics-dashboard',
  ]);
  assert.deepEqual(router.stack.flatMap((layer) => layer.route && retired.has(layer.route.path) ? [layer.route.path] : []), []);
});
