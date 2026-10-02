import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, RequestHandler, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { prismaClientProvider } from '../db.js';
import { createWorkloadRouter } from './workload.routes.js';

const requireAuth: RequestHandler = (_req, res) => {
  res.sendStatus(401);
};

function route(path: string) {
  const router = createWorkloadRouter({ requireAuth });
  const layer = (router.stack as any[]).find((candidate) => candidate.route?.methods.get && candidate.route.path === path);
  assert.ok(layer, path);
  return layer.route;
}

async function call(
  path: string,
  query: Record<string, string>,
  client: Record<string, unknown>,
  user: Record<string, unknown> = { id: 'u1', role: 'VIEWER' },
) {
  const previous = prismaClientProvider.get;
  prismaClientProvider.get = () =>
    ({
      businessUnit: { findFirst: async () => null },
      wbsDependency: { findMany: async () => [] },
      issue: { findMany: async () => [] },
      projectAccess: { findMany: async () => [] },
      project: { findMany: async () => [] },
      projectCalendarOverride: { findMany: async () => [] },
      ...client,
    }) as unknown as PrismaClient;
  try {
    const res: any = {
      statusCode: 200,
      body: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    };
    await route(path).stack[1].handle(
      { query, get: () => undefined, header: () => undefined, headers: {}, currentUser: user } as unknown as Request,
      res as unknown as Response,
    );
    return res;
  } finally {
    prismaClientProvider.get = previous;
  }
}

const empty = {
  leaveEmployee: { findMany: async () => [] },
  leave: { findMany: async () => [] },
  leaveCalendarDay: { findMany: async () => [] },
};

test('both routes need a signed-in user', () => {
  assert.equal(route('/employees').stack[0].handle, requireAuth);
  assert.equal(route('/workload').stack[0].handle, requireAuth);
});

test('the period must be valid and at most six calendar years long', async () => {
  for (const query of [
    { from: '2026-07-01', to: 'bad' },
    { from: '2026-07-10', to: '2026-07-01' },
    { from: '2026-02-31', to: '2026-03-10' },
    { from: '2026-01-01', to: '2032-01-02' },
    // Six years from 29 February end on 28 February, not 1 March.
    { from: '2024-02-29', to: '2030-03-01' },
  ]) {
    const res = await call('/workload', query, empty);
    assert.equal(res.statusCode, 400, JSON.stringify(query));
  }
  for (const query of [
    { from: '2026-01-01', to: '2032-01-01' },
    { from: '2024-02-29', to: '2030-02-28' },
  ]) {
    const ok = await call('/workload', query, { ...empty, wbsItem: { findMany: async () => [] } });
    assert.equal(ok.statusCode, 200, JSON.stringify(query));
  }
});

test('only dated leaf work with an owner in open projects is returned', async () => {
  let where: any;
  const project = { id: 'p1', code: 'TV', name: 'Телевизор' };
  const res = await call(
    '/workload',
    { from: '2026-07-01', to: '2026-07-31' },
    {
      ...empty,
      wbsItem: {
        findMany: async (args: any) => {
          // The second query reads every item of the projects for their predecessors.
          if (!args.where.children) return [];
          where = args.where;
          return [
            {
              id: 'w1', projectId: 'p1', code: '1.1', title: 'Задача', owner: ' Иванов ', type: 'TASK', status: 'IN_PROGRESS',
              startDate: new Date('2026-07-06T00:00:00.000Z'), dueDate: new Date('2026-07-10T00:00:00.000Z'), project,
              updatedAt: new Date('2026-07-01T10:00:00.000Z'),
            },
            {
              id: 'w2', projectId: 'p1', code: '1.2', title: 'Пусто', owner: '   ', type: 'TASK', status: 'NOT_STARTED',
              startDate: new Date('2026-07-06T00:00:00.000Z'), dueDate: new Date('2026-07-10T00:00:00.000Z'), project,
            },
          ];
        },
      },
    },
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(where.type, { in: ['TASK', 'WORK_PACKAGE', 'DELIVERABLE'] });
  assert.deepEqual(where.status, { not: 'CANCELLED' });
  assert.deepEqual(where.children, { none: {} });
  assert.deepEqual(where.project.status, { not: 'CLOSED' });
  assert.equal(where.startDate.lte.toISOString(), '2026-07-31T00:00:00.000Z');
  assert.equal(where.dueDate.gte.toISOString(), '2026-07-01T00:00:00.000Z');
  assert.deepEqual(res.body.items.map((item: any) => [item.id, item.owner, item.startDate]), [['w1', 'Иванов', '2026-07-06']]);
  assert.deepEqual(res.body.projects, [project]);
  assert.equal(res.body.items[0].updatedAt, '2026-07-01T10:00:00.000Z');
  assert.deepEqual(res.body.editableProjectIds, []);
});

function leaf(id: string, projectId: string, code: string, extra: Record<string, unknown> = {}) {
  return {
    id, projectId, code, title: id, owner: 'Иванов', type: 'TASK', status: 'IN_PROGRESS',
    startDate: new Date('2026-07-06T00:00:00.000Z'), dueDate: new Date('2026-07-10T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T10:00:00.000Z'), leadLagDays: 0,
    predecessor1: null, predecessor2: null, predecessor3: null, predecessor4: null, predecessor5: null, predecessor6: null,
    project: { id: projectId, code: projectId.toUpperCase(), name: projectId },
    ...extra,
  };
}

test('work says which dates its links set, whether an issue manages it and where the user may edit', async () => {
  const items = [
    leaf('fs', 'p1', '1.2', { predecessor1: '1.1' }),
    leaf('ff', 'p1', '1.3'),
    leaf('free', 'p1', '1.4'),
    // A code in the predecessor field that names nothing does not lock anything.
    leaf('dangling', 'p1', '1.5', { predecessor1: '9.9' }),
    leaf('issue', 'p2', '1.1'),
  ];
  const all = [...items, leaf('head', 'p1', '1.1')];
  let issueWhere: any;
  const client = {
    ...empty,
    wbsItem: { findMany: async (args: any) => (args.where.children ? items : all) },
    wbsDependency: { findMany: async () => [
      { projectId: 'p1', predecessorId: 'head', successorId: 'ff', type: 'FF', lagDays: 0 },
    ] },
    issue: { findMany: async (args: any) => {
      issueWhere = args.where;
      return [{ workPackageId: 'issue' }];
    } },
    projectAccess: { findMany: async () => [{ projectId: 'p1', level: 'EDIT' }, { projectId: 'p2', level: 'VIEW' }] },
  };
  const res = await call('/workload', { from: '2026-07-01', to: '2026-07-31' }, client);
  assert.equal(res.statusCode, 200);
  const byId = new Map(res.body.items.map((item: any) => [item.id, item]));
  const flags = (id: string) => {
    const item: any = byId.get(id);
    return [item.startLocked, item.finishLocked, item.lockedByIssue];
  };
  assert.deepEqual(flags('fs'), [true, false, false]);
  assert.deepEqual(flags('ff'), [false, true, false]);
  assert.deepEqual(flags('free'), [false, false, false]);
  assert.deepEqual(flags('dangling'), [false, false, false]);
  assert.deepEqual(flags('issue'), [false, false, true]);
  // The links are named, so the planner can say why a date is fixed.
  assert.deepEqual((byId.get('ff') as any).finishLinks, [{ code: '1.1', title: 'head', type: 'FF', lagDays: 0 }]);
  assert.deepEqual((byId.get('fs') as any).startLinks, [{ code: '1.1', title: 'head', type: 'FS', lagDays: 0 }]);
  assert.deepEqual(issueWhere.status, { notIn: ['Done', 'Closed', 'Resolved'] });
  assert.deepEqual(res.body.editableProjectIds, ['p1']);

  const admin = await call('/workload', { from: '2026-07-01', to: '2026-07-31' }, client, { id: 'a1', role: 'ADMIN' });
  assert.deepEqual(admin.body.editableProjectIds.sort(), ['p1', 'p2']);
});

test('the directory lists active people for pickers', async () => {
  let where: any;
  const res = await call('/employees', {}, {
    leaveEmployee: {
      findMany: async (args: any) => {
        where = args.where;
        return [{ id: 'e1', name: 'Иванов', department: 'Разработка' }];
      },
    },
  });
  assert.deepEqual(where, { isActive: true });
  assert.deepEqual(res.body, [{ id: 'e1', name: 'Иванов', department: 'Разработка' }]);
});
