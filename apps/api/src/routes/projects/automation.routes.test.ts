import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { PUBLIC_DEMO_USER_ID } from '@pms/shared';
import type { Request, Router } from 'express';
import { prismaClientProvider } from '../../db.js';
import { automationProjects, registerProjectAutomationRoutes, scenarioPatchesSchema } from './automation.routes.js';

const request = (role = 'USER', id = 'u') => ({ currentUser: { id, role }, query: { businessUnitId: 'unit' }, params: { projectId: 'p' }, headers: {}, header: () => 'unit' }) as unknown as Request;

test('automation filters historical data by project grants and business unit, admins bypass grants', async (t) => {
  const p = { id: 'p', code: 'TV', name: 'TV' };
  const where: unknown[] = [];
  t.mock.method(prismaClientProvider, 'get', () => ({
    project: { findMany: async (args: { where: Record<string, unknown> }) => {
      where.push(args.where);
      return args.where.businessUnit ? [] : [p, { ...p, id: 'secret' }];
    } },
    projectAccess: { findMany: async () => [{ projectId: 'p', level: 'VIEW' }] },
  }) as unknown as PrismaClient);
  assert.deepEqual((await automationProjects(request())).map((row) => row.id), ['p']);
  assert.ok(where.some((filter) => (filter as { businessUnitId?: string }).businessUnitId === 'unit'));
  assert.equal((await automationProjects(request('ADMIN'))).length, 2);
  assert.equal((await automationProjects(request('PROJECT_MANAGER', PUBLIC_DEMO_USER_ID), undefined, true)).length, 2);
  assert.deepEqual(await automationProjects({} as Request), []);
});

test('scenario schema rejects invalid dates, duplicate works, unbounded or contradictory overrides', () => {
  for (const patches of [
    [{ id: 'a', dueDate: '2026-02-31' }], [{ id: 'a', workDays: 0 }],
    [{ id: 'a', workDays: 2 }, { id: 'a', workDays: 3 }],
    [{ id: 'a', dueDate: '2026-09-10', workDays: 4 }],
    [{ id: 'a', startDate: '2026-10-01', dueDate: '2026-09-10' }],
    Array.from({ length: 21 }, (_, index) => ({ id: String(index), workDays: 2 })),
  ]) assert.equal(scenarioPatchesSchema.safeParse(patches).success, false);
});

test('unauthorized scenario requests cannot read the schedule', async (t) => {
  const handlers = new Map<string, Function>();
  registerProjectAutomationRoutes({ get: (path: string, handler: Function) => handlers.set(path, handler) } as unknown as Router);
  const scheduleRead = t.mock.fn(async () => { throw new Error('must not read'); });
  t.mock.method(prismaClientProvider, 'get', () => ({
    project: { findMany: async () => [] },
    projectAccess: { findMany: async () => [] },
    wbsItem: { findMany: scheduleRead },
  }) as unknown as PrismaClient);
  let status = 200;
  const response = { status: (value: number) => { status = value; return response; }, json: () => {} };
  await handlers.get('/projects/:projectId/automation/scenario')!(request(), response);
  assert.equal(status, 404); assert.equal(scheduleRead.mock.callCount(), 0);
});
