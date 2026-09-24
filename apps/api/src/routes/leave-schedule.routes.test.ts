import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, RequestHandler, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { prismaClientProvider } from '../db.js';
import { createLeaveScheduleRouter } from './leave-schedule.routes.js';

const requireAdmin: RequestHandler = (_req, res) => {
  res.sendStatus(403);
};

function route(method: 'get' | 'post' | 'patch' | 'delete' | 'put', path: string) {
  const router = createLeaveScheduleRouter({ requireAdmin, currentUser: () => ({ id: 'admin-1' }) });
  const layer = (router.stack as any[]).find(
    (candidate) => candidate.route?.methods[method] && candidate.route.path === path,
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} is registered`);
  return layer.route;
}

function response() {
  return {
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
    end() {
      return this;
    },
  };
}

async function call(
  method: 'get' | 'post' | 'patch' | 'delete' | 'put',
  path: string,
  request: Partial<Request>,
  client: Record<string, unknown>,
) {
  const previous = prismaClientProvider.get;
  const prismaClient: Record<string, unknown> = {
    auditEvent: { create: async () => ({}) },
    $executeRaw: async () => 0,
    ...client,
  };
  prismaClient.$transaction = async (action: (tx: unknown) => unknown) => action(prismaClient);
  prismaClientProvider.get = () => prismaClient as unknown as PrismaClient;
  try {
    const res = response();
    await route(method, path).stack[1].handle(
      { params: {}, query: {}, body: {}, get: () => undefined, ...request } as Request,
      res as unknown as Response,
    );
    return res;
  } finally {
    prismaClientProvider.get = previous;
  }
}

const leaveRow = {
  id: 'leave-1',
  employeeId: 'emp-1',
  typeId: 'leave-type-vacation',
  startDate: new Date('2026-07-06T00:00:00.000Z'),
  endDate: new Date('2026-07-17T00:00:00.000Z'),
  comment: '',
};

const knownPeopleAndTypes = {
  leaveEmployee: { findUnique: async () => ({ id: 'emp-1', isActive: true }) },
  leaveType: { findUnique: async () => ({ id: 'leave-type-vacation', isActive: true }) },
};

test('every leave schedule route sits behind the administrator middleware', () => {
  const router = createLeaveScheduleRouter({ requireAdmin, currentUser: () => null });
  const routes = (router.stack as any[]).filter((layer) => layer.route);
  assert.ok(routes.length >= 11);
  for (const layer of routes) {
    assert.equal(layer.route.stack[0].handle, requireAdmin, layer.route.path);
  }
});

test('the schedule needs a valid period', async () => {
  const res = await call('get', '/leave-schedule', { query: { from: '2026-07-01', to: 'bad' } }, {});
  assert.equal(res.statusCode, 400);
});

test('the schedule returns calendar dates as plain days', async () => {
  const res = await call(
    'get',
    '/leave-schedule',
    { query: { from: '2026-07-01', to: '2026-07-31' } },
    {
      leaveEmployee: { findMany: async () => [] },
      leaveType: { findMany: async () => [] },
      leave: { findMany: async () => [leaveRow] },
      leaveCalendarDay: {
        findMany: async () => [
          { date: new Date('2026-06-12T00:00:00.000Z'), isWorkingDay: false, description: 'День России' },
        ],
      },
    },
  );
  const body = res.body as any;
  assert.equal(res.statusCode, 200);
  assert.deepEqual(body.leaves[0], {
    id: 'leave-1',
    employeeId: 'emp-1',
    typeId: 'leave-type-vacation',
    startDate: '2026-07-06',
    endDate: '2026-07-17',
    comment: '',
  });
  assert.equal(body.calendarDays[0].date, '2026-06-12');
});

test('a leave that ends before it starts is rejected', async () => {
  const res = await call(
    'post',
    '/leave-schedule/leaves',
    {
      body: { employeeId: 'emp-1', typeId: 'leave-type-vacation', startDate: '2026-07-10', endDate: '2026-07-01' },
    },
    knownPeopleAndTypes,
  );
  assert.equal(res.statusCode, 400);
});

test('a leave that overlaps another leave of the same person is rejected', async () => {
  let created = false;
  const res = await call(
    'post',
    '/leave-schedule/leaves',
    {
      body: { employeeId: 'emp-1', typeId: 'leave-type-vacation', startDate: '2026-07-15', endDate: '2026-07-20' },
    },
    {
      ...knownPeopleAndTypes,
      leave: {
        findFirst: async () => leaveRow,
        create: async () => {
          created = true;
        },
      },
    },
  );
  assert.equal(res.statusCode, 409);
  assert.equal(created, false);
  assert.match(String((res.body as any).error), /2026-07-06/);
});

test('a leave is stored with whole days and the author', async () => {
  let data: any;
  const res = await call(
    'post',
    '/leave-schedule/leaves',
    {
      body: {
        employeeId: 'emp-1',
        typeId: 'leave-type-vacation',
        startDate: '2026-08-03',
        endDate: '2026-08-07',
        comment: ' Море ',
      },
    },
    {
      ...knownPeopleAndTypes,
      leave: {
        findFirst: async () => null,
        create: async (args: any) => {
          data = args.data;
          return { id: 'leave-2', ...args.data };
        },
      },
    },
  );
  assert.equal(res.statusCode, 201);
  assert.equal(data.startDate.toISOString(), '2026-08-03T00:00:00.000Z');
  assert.equal(data.comment, 'Море');
  assert.equal(data.createdById, 'admin-1');
  assert.equal((res.body as any).endDate, '2026-08-07');
});

test('editing a leave ignores its own dates when looking for overlaps', async () => {
  let where: any;
  const res = await call(
    'patch',
    '/leave-schedule/leaves/:leaveId',
    { params: { leaveId: 'leave-1' }, body: { endDate: '2026-07-20' } },
    {
      ...knownPeopleAndTypes,
      leave: {
        findUnique: async () => leaveRow,
        findFirst: async (args: any) => {
          where = args.where;
          return null;
        },
        update: async (args: any) => ({ ...leaveRow, ...args.data }),
      },
    },
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(where.id, { not: 'leave-1' });
  assert.equal((res.body as any).endDate, '2026-07-20');
});

test('a person with leaves is archived instead of deleted', async () => {
  let deleted = false;
  const res = await call(
    'delete',
    '/leave-schedule/employees/:employeeId',
    { params: { employeeId: 'emp-1' } },
    {
      leaveEmployee: {
        findUnique: async () => ({ id: 'emp-1', _count: { leaves: 2 } }),
        update: async () => ({}),
        delete: async () => {
          deleted = true;
        },
      },
    },
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { archived: true });
  assert.equal(deleted, false);
});

test('leave type colours must be hex', async () => {
  const res = await call('post', '/leave-schedule/types', { body: { name: 'Учёба', color: 'green' } }, {});
  assert.equal(res.statusCode, 400);
});

test('calendar days that do not exist are rejected instead of rolling over', async () => {
  const res = await call(
    'post',
    '/leave-schedule/leaves',
    {
      body: { employeeId: 'emp-1', typeId: 'leave-type-vacation', startDate: '2026-02-27', endDate: '2026-02-31' },
    },
    knownPeopleAndTypes,
  );
  assert.equal(res.statusCode, 400);
});

test('an archived person gets no new leaves but keeps editable history', async () => {
  const archived = {
    ...knownPeopleAndTypes,
    leaveEmployee: { findUnique: async () => ({ id: 'emp-1', isActive: false }) },
  };
  const created = await call(
    'post',
    '/leave-schedule/leaves',
    { body: { employeeId: 'emp-1', typeId: 'leave-type-vacation', startDate: '2026-08-03', endDate: '2026-08-07' } },
    { ...archived, leave: { findFirst: async () => null, create: async () => ({}) } },
  );
  assert.equal(created.statusCode, 400);

  const edited = await call(
    'patch',
    '/leave-schedule/leaves/:leaveId',
    { params: { leaveId: 'leave-1' }, body: { comment: 'Уточнение' } },
    {
      ...archived,
      leave: {
        findUnique: async () => leaveRow,
        findFirst: async () => null,
        update: async (args: any) => ({ ...leaveRow, ...args.data }),
      },
    },
  );
  assert.equal(edited.statusCode, 200);
});

test('the overlap check and the write run under a per-person lock', async () => {
  const steps: string[] = [];
  await call(
    'post',
    '/leave-schedule/leaves',
    { body: { employeeId: 'emp-1', typeId: 'leave-type-vacation', startDate: '2026-08-03', endDate: '2026-08-07' } },
    {
      ...knownPeopleAndTypes,
      $executeRaw: async () => {
        steps.push('lock');
        return 0;
      },
      leave: {
        findFirst: async () => {
          steps.push('check');
          return null;
        },
        create: async (args: any) => {
          steps.push('create');
          return { id: 'leave-3', ...args.data };
        },
      },
    },
  );
  assert.deepEqual(steps, ['lock', 'check', 'create']);
});
