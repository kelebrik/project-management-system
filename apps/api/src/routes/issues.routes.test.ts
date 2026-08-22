import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma, type PrismaClient, type ProjectAccessLevel } from '@prisma/client';
import { Router } from 'express';
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
import { registerJiraAggregateRoutes } from './jira-aggregates.routes.js';

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

function aggregateRoute(
  prisma: PrismaClient,
  path: string,
  method: string,
  projectAccessLevel: (userId: string, projectId: string) => Promise<ProjectAccessLevel | null> = async () => null,
) {
  const router = Router();
  registerJiraAggregateRoutes(router, prisma, projectAccessLevel);
  const stack = (router as unknown as {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: (req: Request, res: Response) => Promise<void> }>;
      };
    }>;
  }).stack;
  const route = stack.find((layer) => layer.route?.path === path && layer.route.methods[method])?.route;
  assert.ok(route, `${method.toUpperCase()} ${path}`);
  return route.stack[0]!.handle;
}

const aggregateDefinition = {
  name: 'Count issues',
  description: '',
  source: 'issues',
  metric: 'count',
  groupBy: 'none',
  scope: 'active',
  filterLogic: 'and',
  filters: [],
  periodMode: 'NONE',
  periodDays: null,
  timeZone: 'Europe/Moscow',
  sortOrder: 0,
};

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

test('Jira history returns to incremental sync after a full sweep with pending retries', () => {
  assert.deepEqual(jiraHistoryFullSweepState(true, 244), {
    returnToIncremental: true,
    clean: false,
  });
  assert.deepEqual(jiraHistoryFullSweepState(true, 0), {
    returnToIncremental: true,
    clean: true,
  });
  assert.deepEqual(jiraHistoryFullSweepState(false, 0), {
    returnToIncremental: false,
    clean: false,
  });
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

test('Jira aggregate mutations reject non-admin users before database access', async () => {
  const router = createIssuesRouter() as unknown as {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: (req: Request, res: Response) => Promise<void> }>;
      };
    }>;
  };
  const cases = [
    {
      path: '/projects/:projectId/jira/aggregates',
      method: 'post',
      error: 'Настраивать агрегаты может только системный администратор',
    },
    {
      path: '/projects/:projectId/jira/aggregates/:aggregateId',
      method: 'patch',
      error: 'Настраивать агрегаты может только системный администратор',
    },
    {
      path: '/projects/:projectId/jira/aggregates/:aggregateId',
      method: 'delete',
      error: 'Настраивать агрегаты может только системный администратор',
    },
    {
      path: '/projects/:projectId/jira/aggregates/preview',
      method: 'post',
      error: 'Предпросмотр агрегата доступен только системному администратору',
    },
    {
      path: '/projects/:projectId/jira/aggregates/import-dashboard',
      method: 'post',
      error: 'Импорт агрегатов доступен только системному администратору',
    },
    {
      path: '/projects/:projectId/jira/aggregates/convert-dashboard',
      method: 'post',
      error: 'Конвертация дашборда доступна только системному администратору',
    },
    {
      path: '/projects/:projectId/jira/aggregates/rollback-dashboard',
      method: 'post',
      error: 'Откат дашборда доступен только системному администратору',
    },
  ];

  for (const expected of cases) {
    const route = router.stack.find(
      (layer) => layer.route?.path === expected.path && layer.route.methods[expected.method],
    )?.route;
    assert.ok(route, `${expected.method.toUpperCase()} ${expected.path}`);

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
      body: {},
      currentUser: { role: 'PROJECT_MANAGER' },
    } as unknown as Request;

    await route.stack[0]!.handle(request, response);
    assert.equal(status, 403);
    assert.deepEqual(payload, { error: expected.error });
  }
});

test('Jira analytics dashboard save requires authentication before validation or database access', async () => {
  const router = createIssuesRouter() as unknown as {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: (req: Request, res: Response) => Promise<void> }>;
      };
    }>;
  };
  const route = router.stack.find(
    (layer) => layer.route?.path === '/projects/:projectId/jira/analytics-dashboard' && layer.route.methods.patch,
  )?.route;
  assert.ok(route);
  const result = routeResponse();
  await route.stack[0]!.handle({
    params: { projectId: 'project-1' },
    body: {},
  } as unknown as Request, result.response);
  assert.equal(result.status(), 401);
});

test('Jira aggregate admin endpoints distinguish anonymous and forbidden callers', async () => {
  const prisma = {} as PrismaClient;
  const handle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregates/preview',
    'post',
  );
  const anonymous = routeResponse();
  await handle({
    params: { projectId: 'project-1' },
    body: {},
  } as unknown as Request, anonymous.response);
  assert.equal(anonymous.status(), 401);
  assert.deepEqual(anonymous.payload(), { error: 'Требуется вход в систему' });

  const forbidden = routeResponse();
  await handle({
    params: { projectId: 'project-1' },
    body: {},
    currentUser: { id: 'manager-1', role: 'PROJECT_MANAGER' },
  } as unknown as Request, forbidden.response);
  assert.equal(forbidden.status(), 403);
  assert.deepEqual(forbidden.payload(), {
    error: 'Предпросмотр агрегата доступен только системному администратору',
  });
});

test('Jira aggregate catalog allows a project reader and rejects a non-member', async () => {
  const prisma = {
    project: { findUnique: async () => ({ id: 'project-1' }) },
    jiraAggregateDefinition: { findMany: async () => [] },
    jiraAnalyticsSettings: { findUnique: async () => null },
    jiraAnalyticsDashboardConversion: { findUnique: async () => null },
  } as unknown as PrismaClient;
  const request = {
    params: { projectId: 'project-1' },
    currentUser: { id: 'reader-1', role: 'EXECUTIVE_VIEWER' },
  } as unknown as Request;

  const readerHandle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregates',
    'get',
    async () => 'VIEW',
  );
  const reader = routeResponse();
  await readerHandle(request, reader.response);
  assert.equal(reader.status(), 200);
  assert.deepEqual((reader.payload() as { definitions?: unknown[] }).definitions, []);

  const outsiderHandle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregates',
    'get',
    async () => null,
  );
  const outsider = routeResponse();
  await outsiderHandle(request, outsider.response);
  assert.equal(outsider.status(), 403);
});

test('Jira aggregate create rejects a closed project before any definition write', async () => {
  const prisma = {
    project: { findUnique: async () => ({ status: 'CLOSED' }) },
  } as unknown as PrismaClient;
  const handle = aggregateRoute(prisma, '/projects/:projectId/jira/aggregates', 'post');
  const result = routeResponse();
  await handle({
    params: { projectId: 'project-1' },
    body: { definition: aggregateDefinition },
    currentUser: { id: 'admin-1', role: 'ADMIN' },
  } as unknown as Request, result.response);
  assert.equal(result.status(), 423);
  assert.deepEqual(result.payload(), { error: 'Проект закрыт и доступен только для чтения' });
});

test('Jira aggregate update maps an optimistic version conflict to HTTP 409', async () => {
  const row = {
    id: 'aggregate-1',
    projectId: 'project-1',
    ...aggregateDefinition,
    nameKey: 'count issues',
    fingerprint: 'a'.repeat(64),
    version: 2,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const transaction = {
    $queryRaw: async () => [{ lock: '' }],
    jiraAggregateDefinition: {
      findFirst: async () => row,
      updateMany: async () => ({ count: 0 }),
      findUnique: async () => row,
    },
  };
  const prisma = {
    project: { findUnique: async () => ({ status: 'ACTIVE' }) },
    $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as unknown as PrismaClient;
  const handle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregates/:aggregateId',
    'patch',
  );
  const result = routeResponse();
  await handle({
    params: { projectId: 'project-1', aggregateId: 'aggregate-1' },
    body: { definition: aggregateDefinition, expectedVersion: 1 },
    currentUser: { id: 'admin-1', role: 'ADMIN' },
  } as unknown as Request, result.response);
  assert.equal(result.status(), 409);
  assert.equal(
    (result.payload() as { error?: string }).error,
    'Определение уже изменено другим пользователем',
  );
});

test('Jira aggregate preview returns 413 for an oversized project population', async () => {
  const prisma = {
    project: { findUnique: async () => ({ id: 'project-1' }) },
    jiraIssueSnapshot: {
      findMany: async () => Array.from({ length: 5_001 }, () => ({})),
    },
  } as unknown as PrismaClient;
  const handle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregates/preview',
    'post',
  );
  const result = routeResponse();
  await handle({
    params: { projectId: 'project-1' },
    body: {
      definition: aggregateDefinition,
      assignee: '',
      page: 1,
      pageSize: 12,
    },
    currentUser: { id: 'admin-1', role: 'ADMIN' },
  } as unknown as Request, result.response);
  assert.equal(result.status(), 413);
  assert.equal((result.payload() as { limit?: number }).limit, 5_000);
});

test('Jira dashboard evaluation requires explicit runtime period before loading analytics', async () => {
  const prisma = {
    project: { findUnique: async () => ({ id: 'project-1' }) },
  } as unknown as PrismaClient;
  const handle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregate-dashboard-results',
    'get',
  );
  const result = routeResponse();
  await handle({
    params: { projectId: 'project-1' },
    query: { assignee: '' },
    currentUser: { id: 'admin-1', role: 'ADMIN' },
  } as unknown as Request, result.response);
  assert.equal(result.status(), 400);
  assert.match(String((result.payload() as { error?: string }).error), /periodDays/);
});

test('Jira dashboard import maps an expected hash mismatch to HTTP 409', async () => {
  const transaction = {
    $queryRaw: async (query: { text: string }) => query.text.includes('pg_advisory_xact_lock')
      ? [{ lock: '' }]
      : [{ dashboardConfig: null }],
  };
  const prisma = {
    project: { findUnique: async () => ({ status: 'ACTIVE' }) },
    $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as unknown as PrismaClient;
  const handle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregates/import-dashboard',
    'post',
  );
  const result = routeResponse();
  await handle({
    params: { projectId: 'project-1' },
    body: { dryRun: true, expectedConfigHash: 'f'.repeat(64) },
    currentUser: { id: 'admin-1', role: 'ADMIN' },
  } as unknown as Request, result.response);
  assert.equal(result.status(), 409);
  assert.match(String((result.payload() as { error?: string }).error), /Конфигурация/);
});

test('Jira dashboard import maps a definition uniqueness race to HTTP 409', async () => {
  const prisma = {
    project: { findUnique: async () => ({ status: 'ACTIVE' }) },
    $transaction: async () => {
      throw new Prisma.PrismaClientKnownRequestError('unique aggregate', {
        code: 'P2002',
        clientVersion: 'test',
      });
    },
  } as unknown as PrismaClient;
  const handle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregates/import-dashboard',
    'post',
  );
  const result = routeResponse();
  await handle({
    params: { projectId: 'project-1' },
    body: { dryRun: false, expectedConfigHash: 'f'.repeat(64) },
    currentUser: { id: 'admin-1', role: 'ADMIN' },
  } as unknown as Request, result.response);
  assert.equal(result.status(), 409);
  assert.match(String((result.payload() as { error?: string }).error), /уже существует/);
});
