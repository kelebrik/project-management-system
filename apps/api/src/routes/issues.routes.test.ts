import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import { createIssueSchema, issueStatusUpdateSchema, updateIssueSchema } from '@pms/shared';

import { JiraReadOnlyRequestError } from '../jira.js';
import {
  createIssuesRouter,
  isFatalJiraHistoryBatchError,
  issueJiraStateAfterLinkDeletion,
  issueJiraUrlForKey,
  jiraHistoryFullSweepState,
  jiraHistoryIssueIsRetryEligible,
  jiraHistorySyncFailedCompletely,
  JIRA_CAPACITY_DEFAULT_ALLOCATED_GIB,
  JIRA_CAPACITY_DEFAULT_STORAGE_GIB,
  normalizeIssueJiraKey,
  openIssuePhaseSelectionError,
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

test('open issue contracts support the inline register fields and narrow updates', () => {
  const created = createIssueSchema.parse({ title: 'Проверить заводскую прошивку' });
  assert.equal(created.category, 'Без раздела');
  assert.equal(created.referenceLabel, '');
  assert.equal(created.referenceUrl, undefined);
  assert.equal(created.readiness, 'RED');
  assert.equal(created.phaseId, undefined);
  assert.equal('jiraTicketUrl' in createIssueSchema.parse({
    title: 'Проверить заводскую прошивку',
    jiraTicketKey: 'CVTE-1801',
    jiraTicketUrl: 'https://untrusted.example.test/CVTE-1801',
    jiraLinks: [{
      jiraKey: 'SPS-42',
      jiraUrl: 'https://untrusted.example.test/SPS-42',
    }],
  }), false);
  assert.deepEqual(createIssueSchema.parse({
    title: 'Проверить заводскую прошивку',
    jiraLinks: [{ jiraKey: 'SPS-42', jiraUrl: 'https://untrusted.example.test/SPS-42' }],
  }).jiraLinks, [{ jiraKey: 'SPS-42' }]);

  assert.deepEqual(updateIssueSchema.parse({
    category: 'ChangHong',
    referenceLabel: 'Ссылка на тред',
    referenceUrl: 'https://example.test/thread/1',
    readiness: 'AMBER',
  }), {
    category: 'ChangHong',
    referenceLabel: 'Ссылка на тред',
    referenceUrl: 'https://example.test/thread/1',
    readiness: 'AMBER',
  });
  assert.equal(updateIssueSchema.safeParse({ readiness: 'BLUE' }).success, false);
  assert.equal(updateIssueSchema.safeParse({ category: '' }).success, false);
  assert.equal(updateIssueSchema.safeParse({ referenceUrl: 'javascript:alert(1)' }).success, false);
  assert.equal(updateIssueSchema.safeParse({ referenceUrl: 'https://example.test/thread/2' }).success, true);
  assert.deepEqual(updateIssueSchema.parse({ phaseId: 'phase-1' }), { phaseId: 'phase-1' });
  assert.deepEqual(updateIssueSchema.parse({ jiraTicketUrl: 'https://untrusted.example.test/X-1' }), {});
  assert.deepEqual(issueStatusUpdateSchema.parse({
    statusAt: '2020-01-01',
    text: 'Статус на сегодня',
  }), { text: 'Статус на сегодня' });
});

test('open issue Jira links are derived from a normalized key and project base URL', () => {
  assert.equal(normalizeIssueJiraKey(' cvte-1801 '), 'CVTE-1801');
  assert.equal(normalizeIssueJiraKey('CVTE'), null);
  assert.equal(normalizeIssueJiraKey('CVTE-abc'), null);
  assert.equal(
    issueJiraUrlForKey('https://jira.example.test/', 'cvte-1801'),
    'https://jira.example.test/browse/CVTE-1801',
  );
  assert.equal(
    issueJiraUrlForKey('jira.example.test', 'SPS-42'),
    'https://jira.example.test/browse/SPS-42',
  );
  assert.equal(
    issueJiraUrlForKey('https://jira.example.test/jira/?ignored=true', 'SPS-42'),
    'https://jira.example.test/jira/browse/SPS-42',
  );
});

test('only a system administrator can select an open issue WBS phase', () => {
  assert.equal(openIssuePhaseSelectionError('ADMIN'), null);
  assert.equal(openIssuePhaseSelectionError('PROJECT_MANAGER'), 'Недостаточно прав для выбора фазы и создания пакета работ');
  assert.equal(openIssuePhaseSelectionError('TEAM_MEMBER'), 'Недостаточно прав для выбора фазы и создания пакета работ');
});

test('deleting an additional Jira link preserves a synthetic primary link', () => {
  assert.deepEqual(issueJiraStateAfterLinkDeletion(
    { jiraKey: 'CVTE-1', jiraUrl: 'https://jira.example.test/browse/CVTE-1' },
    { jiraKey: 'SPS-2', jiraUrl: 'https://jira.example.test/browse/SPS-2' },
    [],
  ), {
    source: 'JIRA',
    jiraTicketKey: 'CVTE-1',
    jiraTicketUrl: 'https://jira.example.test/browse/CVTE-1',
  });
  assert.deepEqual(issueJiraStateAfterLinkDeletion(
    { jiraKey: 'CVTE-1', jiraUrl: 'https://jira.example.test/browse/CVTE-1' },
    { jiraKey: 'CVTE-1', jiraUrl: 'https://jira.example.test/browse/CVTE-1' },
    [{ jiraKey: 'SPS-2', jiraUrl: 'https://jira.example.test/browse/SPS-2' }],
  ), {
    source: 'JIRA',
    jiraTicketKey: 'SPS-2',
    jiraTicketUrl: 'https://jira.example.test/browse/SPS-2',
  });
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
    ['/projects/:projectId/jira/goal-labels', 'patch', 'Настраивать связи целей с Jira может только системный администратор'],
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
