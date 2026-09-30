import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { prismaClientProvider } from '../db.js';
import { createScheduleShiftsRouter } from './schedule-shifts.routes.js';

async function setReason({
  body = { shiftIds: ['s1', 's2'], category: 'SUPPLIER', text: 'Поставщик сорвал сроки', raidItemId: 'r1' } as any,
  user = { id: 'u1', role: 'PROJECT_MANAGER', email: 'u@x', name: 'U' } as any,
  access = 'EDIT' as string | null,
  status = 'ACTIVE',
  found = 2,
  raidInProject = true,
} = {}) {
  const updates: any[] = [];
  const audits: any[] = [];
  const previous = prismaClientProvider.get;
  prismaClientProvider.get = () =>
    ({
      project: { findUnique: async () => ({ id: 'p1', status }) },
      projectAccess: { findUnique: async () => (access ? { level: access } : null) },
      businessUnitMembership: { findFirst: async () => null },
      scheduleShift: {
        count: async (args: any) => {
          assert.deepEqual(args.where.projectId, 'p1');
          assert.equal(args.where.kind, 'SHIFT');
          return found;
        },
        updateMany: async (args: any) => updates.push(args),
      },
      raidItem: { findFirst: async (args: any) => (raidInProject && args.where.projectId === 'p1' ? { id: 'r1' } : null) },
      auditEvent: { create: async (args: any) => audits.push(args.data) },
      auditEventChange: { createMany: async () => ({}) },
    }) as unknown as PrismaClient;
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(value: unknown) {
      this.body = value;
      return this;
    },
  };
  try {
    const router = createScheduleShiftsRouter();
    const layer = (router.stack as any[]).find((candidate) => candidate.route?.path === '/projects/:projectId/schedule-shifts/reason');
    await layer.route.stack[0].handle({ params: { projectId: 'p1' }, body, currentUser: user, ip: '1.1.1.1', get: () => undefined, headers: {} } as unknown as Request, res as Response);
  } finally {
    prismaClientProvider.get = previous;
  }
  return { res, updates, audits };
}

test('a reason is set on the moves of this project by someone who may change it', async () => {
  const { res, updates, audits } = await setReason();
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(updates[0].where, { id: { in: ['s1', 's2'] }, projectId: 'p1' });
  assert.equal(updates[0].data.reasonCategory, 'SUPPLIER');
  assert.equal(updates[0].data.reasonText, 'Поставщик сорвал сроки');
  assert.equal(updates[0].data.reasonRaidItemId, 'r1');
  assert.equal(updates[0].data.reasonSetById, 'u1');
  assert.equal(audits[0].action, 'schedule_shift.reason');
  assert.deepEqual(audits[0].metadata, { shifts: 2, category: 'SUPPLIER', raidItemId: 'r1' });
});

test('a reason is refused for other projects, unknown categories, readers, closed projects and guests', async () => {
  assert.equal((await setReason({ found: 1 })).res.statusCode, 400);
  assert.equal((await setReason({ body: { shiftIds: ['s1', 's1'], category: 'OTHER' } })).res.statusCode, 400);
  assert.equal((await setReason({ raidInProject: false })).res.statusCode, 400);
  assert.equal((await setReason({ body: { shiftIds: ['s1'], category: 'WEATHER' } })).res.statusCode, 400);
  assert.equal((await setReason({ access: 'VIEW' })).res.statusCode, 403);
  assert.equal((await setReason({ status: 'CLOSED' })).res.statusCode, 423);
  assert.equal((await setReason({ user: null })).res.statusCode, 401);
  const noRaid = await setReason({ body: { shiftIds: ['s1', 's2'], category: 'ESTIMATE' } });
  assert.equal(noRaid.res.statusCode, 200);
  assert.equal(noRaid.updates[0].data.reasonText, null);
});
