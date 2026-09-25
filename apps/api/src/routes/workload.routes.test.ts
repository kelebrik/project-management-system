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

async function call(path: string, query: Record<string, string>, client: Record<string, unknown>) {
  const previous = prismaClientProvider.get;
  prismaClientProvider.get = () =>
    ({
      businessUnit: { findFirst: async () => null },
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
      { query, get: () => undefined, header: () => undefined, headers: {}, currentUser: { id: 'u1' } } as unknown as Request,
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
          where = args.where;
          return [
            {
              id: 'w1', projectId: 'p1', code: '1.1', title: 'Задача', owner: ' Иванов ', type: 'TASK', status: 'IN_PROGRESS',
              startDate: new Date('2026-07-06T00:00:00.000Z'), dueDate: new Date('2026-07-10T00:00:00.000Z'), project,
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
