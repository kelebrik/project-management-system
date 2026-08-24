import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { Prisma, type PrismaClient } from '@prisma/client';
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
import { buildJiraDashboardSwitchPlan, jiraDashboardConfigHash } from '../services/jira-aggregates.js';
import { projectDetailsInclude } from './projects/includes.js';

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
  canReadProject: (req: Request, projectId: string) => Promise<boolean> = async () => false,
) {
  const router = Router();
  registerJiraAggregateRoutes(router, prisma, canReadProject);
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
      path: '/projects/:projectId/jira/aggregates/switch-dashboard',
      method: 'post',
      error: 'Переключение дашборда доступно только системному администратору',
    },
    {
      path: '/projects/:projectId/jira/aggregates/rollback-dashboard',
      method: 'post',
      error: 'Откат дашборда доступен только системному администратору',
    },
    {
      path: '/projects/:projectId/jira/aggregates/reconcile-dashboard',
      method: 'post',
      error: 'Сверка дашборда доступна только системному администратору',
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
    async () => true,
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

test('Jira aggregate catalog follows the broad project read policy without an explicit project grant', async () => {
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
    async () => true,
  );
  const reader = routeResponse();
  await readerHandle(request, reader.response);
  assert.equal(reader.status(), 200);
  assert.deepEqual((reader.payload() as { definitions?: unknown[] }).definitions, []);

  const missingProjectHandle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregates',
    'get',
    async () => false,
  );
  const missingProject = routeResponse();
  await missingProjectHandle(request, missingProject.response);
  assert.equal(missingProject.status(), 404);
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
      count: async () => 5_001,
      findMany: async () => [],
    },
    jiraIssueStatusTransition: { count: async () => 0 },
    jiraDevelopmentActivity: { count: async () => 0 },
  } as unknown as PrismaClient;
  const handle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregates/preview',
    'post',
    async () => true,
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

test('Jira aggregate preview returns a distinct 413 for an oversized as-of history', async () => {
  const prisma = {
    $queryRaw: async () => [{
      versionRows: 200_001n,
      scopedTickets: 1n,
      earliestObservationAt: new Date('2026-01-01T00:00:00.000Z'),
    }],
  } as unknown as PrismaClient;
  const handle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregates/preview',
    'post',
    async () => true,
  );
  const result = routeResponse();
  await handle({
    params: { projectId: 'project-1' },
    body: {
      definition: aggregateDefinition,
      assignee: '',
      page: 1,
      pageSize: 12,
      asOf: '2026-08-01T00:00:00.000Z',
    },
    currentUser: { id: 'admin-1', role: 'ADMIN' },
  } as unknown as Request, result.response);
  assert.equal(result.status(), 413);
  assert.deepEqual(result.payload(), {
    error: 'Для одного исторического расчёта доступно не более 200 000 наблюдённых версий',
    kind: 'versions',
    limit: 200_000,
  });
});

test('Jira aggregate as-of validation rejects ambiguous, future, and event-source requests', async () => {
  const prisma = {} as PrismaClient;
  const handle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregates/preview',
    'post',
    async () => true,
  );
  const cases = [
    {
      body: {
        definition: aggregateDefinition,
        assignee: '',
        asOf: '2026-08-01T00:00:00.000Z',
        evaluatedAt: '2026-08-01T00:00:00.000Z',
      },
      error: /asOf и evaluatedAt/u,
    },
    {
      body: {
        definition: aggregateDefinition,
        assignee: '',
        asOf: '2099-01-01T00:00:00.000Z',
      },
      error: /в будущем/u,
    },
    {
      body: {
        definition: {
          ...aggregateDefinition,
          source: 'transitions',
          metric: 'count',
          periodMode: 'DASHBOARD',
        },
        periodDays: 90,
        assignee: '',
        asOf: '2026-08-01T00:00:00.000Z',
      },
      error: /Тикеты и SLA Critical\/Blocker/u,
    },
  ];
  for (const item of cases) {
    const result = routeResponse();
    await handle({
      params: { projectId: 'project-1' },
      body: { page: 1, pageSize: 12, ...item.body },
      currentUser: { id: 'admin-1', role: 'ADMIN' },
    } as unknown as Request, result.response);
    assert.equal(result.status(), 400);
    assert.match(String((result.payload() as { error?: string }).error), item.error);
  }
});

test('Jira saved aggregate result allows an authorized reader to request an as-of state', async () => {
  const responses = [
    [{ versionRows: 0n, scopedTickets: 0n, earliestObservationAt: null }],
    [{ tickets: 0n, ticketsRetiredAfterAsOf: 0n, stalenessP50: null, stalenessP95: null, stalenessMax: null }],
    [],
  ];
  const prisma = {
    jiraAggregateDefinition: {
      findFirst: async () => ({
        id: 'aggregate-1',
        projectId: 'project-1',
        name: aggregateDefinition.name,
        nameKey: 'count issues',
        description: aggregateDefinition.description,
        source: aggregateDefinition.source,
        metric: aggregateDefinition.metric,
        groupBy: aggregateDefinition.groupBy,
        scope: aggregateDefinition.scope,
        filterLogic: aggregateDefinition.filterLogic,
        filters: aggregateDefinition.filters,
        periodMode: aggregateDefinition.periodMode,
        periodDays: aggregateDefinition.periodDays,
        timeZone: aggregateDefinition.timeZone,
        fingerprint: 'a'.repeat(64),
        sortOrder: aggregateDefinition.sortOrder,
        version: 1,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    },
    $queryRaw: async () => responses.shift() ?? [],
  } as unknown as PrismaClient;
  const handle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregates/:aggregateId/result',
    'get',
    async () => true,
  );
  const result = routeResponse();
  await handle({
    params: { projectId: 'project-1', aggregateId: 'aggregate-1' },
    query: { assignee: '', asOf: '2026-08-01T00:00:00.000Z' },
    currentUser: { id: 'viewer-1', role: 'EXECUTIVE_VIEWER' },
  } as unknown as Request, result.response);

  assert.equal(result.status(), 200);
  assert.equal(
    (result.payload() as { result?: { reconstruction?: { mode?: string } } })
      .result?.reconstruction?.mode,
    'AS_OF',
  );
});

test('Jira dashboard endpoint rejects asOf instead of silently ignoring it', async () => {
  const prisma = {} as PrismaClient;
  const handle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregate-dashboard-results',
    'get',
    async () => true,
  );
  const result = routeResponse();
  await handle({
    params: { projectId: 'project-1' },
    query: { periodDays: '90', assignee: '', asOf: '2026-08-01T00:00:00.000Z' },
    currentUser: { id: 'viewer-1', role: 'EXECUTIVE_VIEWER' },
  } as unknown as Request, result.response);
  assert.equal(result.status(), 400);
});

test('Jira v1/v2 reconciliation remains a read-only diagnostic for closed projects', () => {
  const routeSource = fs.readFileSync(new URL('./jira-aggregates.routes.ts', import.meta.url), 'utf8');
  const reconciliationRoute = routeSource.match(
    /router\.post\('\/projects\/:projectId\/jira\/aggregates\/reconcile-dashboard'[\s\S]*?\n  \}\);/u,
  )?.[0] ?? '';
  assert.match(reconciliationRoute, /requireSystemAdmin/u);
  assert.match(reconciliationRoute, /ensureProjectReadAccess/u);
  assert.doesNotMatch(reconciliationRoute, /ensureWritableProject/u);
});

test('Jira aggregate CSV uses an ASCII header fallback and encoded UTF-8 filename', () => {
  const routeSource = fs.readFileSync(new URL('./jira-aggregates.routes.ts', import.meta.url), 'utf8');
  const exportRoute = routeSource.match(
    /router\.get\('\/projects\/:projectId\/jira\/aggregates\/:aggregateId\/export\.csv'[\s\S]*?\n  \}\);/u,
  )?.[0] ?? '';
  assert.match(exportRoute, /filename="jira-aggregate\.csv"/u);
  assert.match(exportRoute, /filename\*=UTF-8''/u);
  assert.doesNotMatch(exportRoute, /ensureWritableProject/u);
});

test('Jira dashboard evaluation requires an explicit runtime period before loading analytics', async () => {
  const prisma = {
    project: { findUnique: async () => ({ id: 'project-1' }) },
  } as unknown as PrismaClient;
  const handle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregate-dashboard-results',
    'get',
    async () => true,
  );
  const result = routeResponse();
  await handle({
    params: { projectId: 'project-1' },
    query: { assignee: '' },
    currentUser: { id: 'viewer-1', role: 'EXECUTIVE_VIEWER' },
  } as unknown as Request, result.response);
  assert.equal(result.status(), 400);
  assert.match(String((result.payload() as { error?: string }).error), /periodDays/);
});

test('Jira dashboard evaluation coerces the query period for a viewer without an explicit project grant', async () => {
  const prisma = {
    jiraAnalyticsSettings: { findUnique: async () => null },
    jiraAggregateDefinition: { findMany: async () => [] },
    jiraIssueSnapshot: { count: async () => 0, findMany: async () => [] },
    jiraIssueStatusTransition: { count: async () => 0 },
    jiraDevelopmentActivity: { count: async () => 0 },
  } as unknown as PrismaClient;
  const handle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregate-dashboard-results',
    'get',
    async () => true,
  );
  const result = routeResponse();
  await handle({
    params: { projectId: 'project-1' },
    query: { periodDays: '90', assignee: '', page: '1', pageSize: '12' },
    currentUser: { id: 'viewer-1', role: 'EXECUTIVE_VIEWER' },
  } as unknown as Request, result.response);
  assert.equal(result.status(), 200);
  assert.ok(Array.isArray((result.payload() as { widgets?: unknown[] }).widgets));
});

test('Jira analytics facets follow project read access and return only compact data', async () => {
  const prisma = {
    jiraIssueSnapshot: {
      findMany: async () => [{
        status: 'In Progress',
        resolution: null,
        assignee: 'User',
        transitionHistoryComplete: true,
        developmentDataAvailable: false,
        criticalSlaTracked: false,
        criticalPriorityAt: null,
        syncedAt: new Date('2026-08-23T10:00:00.000Z'),
      }],
    },
  } as unknown as PrismaClient;
  const handle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/analytics-facets',
    'get',
    async () => true,
  );
  const result = routeResponse();
  await handle({
    params: { projectId: 'project-1' },
    currentUser: { id: 'viewer-1', role: 'EXECUTIVE_VIEWER' },
  } as unknown as Request, result.response);
  assert.equal(result.status(), 200);
  assert.deepEqual(result.payload(), {
    issueCount: 1,
    activeIssueCount: 1,
    transitionHistoryCompleteCount: 1,
    developmentDataAvailableCount: 0,
    criticalSlaTrackedCount: 0,
    criticalSlaReadyCount: 0,
    latestSyncedAt: '2026-08-23T10:00:00.000Z',
    assignees: ['User'],
    assigneesTruncated: false,
  });
  assert.equal('summary' in (result.payload() as Record<string, unknown>), false);
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

test('stage F switch dry-run reconciles the implicit default without opening a write transaction', async () => {
  let writeTransactions = 0;
  const prisma = {
    project: { findUnique: async () => ({ status: 'ACTIVE' }) },
    jiraAnalyticsSettings: { findUnique: async () => null },
    jiraAggregateDefinition: { findMany: async () => [] },
    jiraAnalyticsDashboardConversion: { findUnique: async () => null },
    jiraIssueSnapshot: { count: async () => 0, findMany: async () => [] },
    jiraIssueStatusTransition: { count: async () => 0 },
    jiraDevelopmentActivity: { count: async () => 0 },
    $transaction: async () => {
      writeTransactions += 1;
      throw new Error('write transaction must not run');
    },
  } as unknown as PrismaClient;
  const handle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregates/switch-dashboard',
    'post',
  );
  const result = routeResponse();
  await handle({
    params: { projectId: 'project-1' },
    body: {
      dryRun: true,
      expectedConfigHash: jiraDashboardConfigHash(null),
      periodDays: 90,
      assignee: '',
    },
    currentUser: { id: 'admin-1', role: 'ADMIN' },
  } as unknown as Request, result.response);
  assert.equal(result.status(), 200);
  assert.equal((result.payload() as { sourceStored?: boolean }).sourceStored, false);
  assert.equal((result.payload() as { reconciliation?: { status: string } }).reconciliation?.status, 'MATCH');
  assert.equal(writeTransactions, 0);
});

test('stage F rollback rejects a stale conversion attempt inside the serializable transaction', async () => {
  const dashboard = {
    version: 2,
    periodDays: 90,
    assignee: '',
    widgets: [],
  };
  const currentHash = jiraDashboardConfigHash(dashboard);
  const transaction = {
    $queryRaw: async (query: { text: string }) => {
      if (query.text.includes('pg_advisory_xact_lock')) return [{ lock: '' }];
      if (query.text.includes('FROM "Project"')) return [{ status: 'ACTIVE' }];
      return [{ id: 'settings-1', dashboardConfig: dashboard }];
    },
    jiraAnalyticsDashboardConversion: {
      findUnique: async () => ({
        id: 'conversion-1',
        projectId: 'project-1',
        attempt: 2,
        rollbackState: 'AVAILABLE',
        originalConfig: { version: 1, periodDays: 90, assignee: '', widgets: [] },
        originalConfigStored: true,
        sourceConfigHash: 'a'.repeat(64),
        originalConfigHash: 'a'.repeat(64),
        convertedConfigHash: currentHash,
      }),
    },
  };
  const prisma = {
    project: { findUnique: async () => ({ status: 'ACTIVE' }) },
    $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as unknown as PrismaClient;
  const handle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregates/rollback-dashboard',
    'post',
  );
  const result = routeResponse();
  await handle({
    params: { projectId: 'project-1' },
    body: { dryRun: false, expectedConfigHash: currentHash, attempt: 1 },
    currentUser: { id: 'admin-1', role: 'ADMIN' },
  } as unknown as Request, result.response);
  assert.equal(result.status(), 409);
  assert.equal((result.payload() as { details?: { currentAttempt: number } }).details?.currentAttempt, 2);
});

test('stage F switch resets every conversion generation field atomically', async () => {
  const legacy = {
    version: 1 as const,
    periodDays: 90 as const,
    assignee: '',
    widgets: [{
      id: 'one',
      title: 'One',
      source: 'issues' as const,
      metric: 'count' as const,
      groupBy: 'none' as const,
      visualization: 'number' as const,
      filterLogic: 'and' as const,
      filters: [],
      width: 'half' as const,
      section: 'active' as const,
    }],
  };
  const planned = buildJiraDashboardSwitchPlan('project-1', legacy, []);
  const definition = { ...planned.definitions[0], id: 'aggregate-1' };
  const conversionUpdate: { data?: Record<string, unknown> } = {};
  const settingsWrite: { data?: Record<string, unknown> } = {};
  const auditWrite: { data?: Record<string, unknown> } = {};
  let isolationLevel: unknown;
  const transaction = {
    $queryRaw: async (query: { text: string }) => {
      if (query.text.includes('pg_advisory_xact_lock')) return [{ lock: '' }];
      if (query.text.includes('FROM "Project"')) return [{ status: 'ACTIVE' }];
      if (query.text.includes('FROM "JiraAnalyticsSettings"')) {
        return [{ id: 'settings-1', dashboardConfig: legacy }];
      }
      return [{ id: 'conversion-1', attempt: 3, rollbackState: 'USED' }];
    },
    jiraAggregateDefinition: { findMany: async () => [definition] },
    jiraAnalyticsSettings: {
      upsert: async ({ update }: { update: Record<string, unknown> }) => {
        settingsWrite.data = update;
        return { id: 'settings-1', ...update };
      },
    },
    jiraAnalyticsDashboardConversion: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        conversionUpdate.data = data;
        return { id: 'conversion-1', attempt: data.attempt };
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditWrite.data = data;
        return { id: 'audit-1' };
      },
    },
  };
  const prisma = {
    project: { findUnique: async () => ({ status: 'ACTIVE' }) },
    jiraAnalyticsSettings: { findUnique: async () => ({ dashboardConfig: legacy }) },
    jiraAggregateDefinition: { findMany: async () => [definition] },
    jiraAnalyticsDashboardConversion: {
      findUnique: async () => ({ id: 'conversion-1', attempt: 3, rollbackState: 'USED' }),
    },
    jiraIssueSnapshot: { count: async () => 0, findMany: async () => [] },
    jiraIssueStatusTransition: { count: async () => 0 },
    jiraDevelopmentActivity: { count: async () => 0 },
    $transaction: async (
      callback: (client: typeof transaction) => Promise<unknown>,
      options: { isolationLevel?: unknown },
    ) => {
      isolationLevel = options.isolationLevel;
      return callback(transaction);
    },
  } as unknown as PrismaClient;
  const handle = aggregateRoute(
    prisma,
    '/projects/:projectId/jira/aggregates/switch-dashboard',
    'post',
  );
  const result = routeResponse();
  await handle({
    params: { projectId: 'project-1' },
    body: {
      dryRun: false,
      expectedConfigHash: jiraDashboardConfigHash(legacy),
      periodDays: 90,
      assignee: '',
    },
    currentUser: {
      id: 'admin-1',
      email: 'admin@example.test',
      name: 'Admin',
      role: 'ADMIN',
    },
    get: () => null,
  } as unknown as Request, result.response);
  assert.equal(result.status(), 200);
  assert.equal((result.payload() as { attempt?: number }).attempt, 4);
  assert.equal(isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
  assert.deepEqual(conversionUpdate.data, {
    originalConfig: legacy,
    originalConfigStored: true,
    sourceConfigHash: jiraDashboardConfigHash(legacy),
    originalConfigHash: jiraDashboardConfigHash(legacy),
    convertedConfigHash: jiraDashboardConfigHash(settingsWrite.data?.dashboardConfig),
    createdDefinitionIds: [],
    rollbackState: 'AVAILABLE',
    convertedAt: conversionUpdate.data?.convertedAt,
    rolledBackAt: null,
    rollbackFinalizedAt: null,
    attempt: 4,
  });
  assert.equal((settingsWrite.data?.dashboardConfig as { version?: number }).version, 2);
  assert.equal((auditWrite.data?.metadata as { attempt?: number }).attempt, 4);
});
