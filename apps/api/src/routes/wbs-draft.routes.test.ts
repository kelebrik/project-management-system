import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { prismaClientProvider } from '../db.js';
import { createWbsDraftRouter } from './wbs-draft.routes.js';

const draft = [
  { ref: '1', title: 'Разработка', type: 'PHASE', workDays: 0, owner: '', predecessors: [] },
  { ref: '1.1', title: 'Проектирование', type: 'TASK', workDays: 10, owner: 'РП', predecessors: [] },
  { ref: '1.2', title: 'Готово', type: 'MILESTONE', workDays: 0, owner: '', predecessors: ['1.1'] },
];

async function apply({ user = { id: 'u1', role: 'ADMIN', email: 'a@x', name: 'A' } as any, body = { items: draft, draftKey: 'key-12345678', startDate: '2026-10-05' } as any, applied = false, status = 'ACTIVE' } = {}) {
  const created: any[] = [];
  const links: any[] = [];
  const audits: any[] = [];
  let locked = '';
  let id = 0;
  const tx: any = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      locked = `${strings.join('?')}|${values.join(',')}`;
    },
    auditEvent: {
      findFirst: async () => (applied ? { metadata: { draftKey: 'key-12345678', createdIds: ['old1', 'old2'] } } : null),
      create: async (args: any) => audits.push(args.data),
    },
    wbsItem: {
      findMany: async () => [{ code: '1', sortOrder: 10 }, { code: '5.2', sortOrder: 80 }],
      create: async (args: any) => {
        created.push(args.data);
        return { id: `n${++id}` };
      },
    },
    wbsDependency: { create: async (args: any) => links.push(args.data) },
  };
  const previous = prismaClientProvider.get;
  prismaClientProvider.get = () =>
    ({
      project: { findUnique: async () => ({ id: 'p1', status }) },
      projectAccess: { findUnique: async () => null },
      businessUnitMembership: { findFirst: async () => null },
      $transaction: async (action: any) => action(tx),
      // What the schedule recalculation and the snapshot read afterwards.
      wbsItem: { findMany: async () => [], update: async () => ({}) },
      wbsDependency: { findMany: async () => [] },
      projectCalendarOverride: { findMany: async () => [] },
      wbsCommand: { create: async () => ({}) },
    }) as unknown as PrismaClient;
  const res: any = {
    statusCode: 200,
    body: undefined as any,
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
    const router = createWbsDraftRouter();
    const layer = (router.stack as any[]).find((candidate) => candidate.route?.path === '/projects/:projectId/wbs-draft/apply');
    await layer.route.stack[0].handle(
      { params: { projectId: 'p1' }, body, currentUser: user, ip: '1.1.1.1', get: () => undefined, headers: {} } as unknown as Request,
      res as Response,
    );
  } catch (error) {
    res.error = error;
  } finally {
    prismaClientProvider.get = previous;
  }
  return { res, created, links, audits, locked };
}

test('a reviewed draft is added after the existing rows in one locked transaction', async () => {
  const { res, created, links, audits, locked } = await apply();
  assert.equal(res.statusCode, 201, String(res.error ?? JSON.stringify(res.body)));
  assert.match(locked, /pg_advisory_xact_lock/);
  assert.match(locked, /wbs:p1/);
  // The last top row is 5, so the draft starts at 6 and nothing existing is renumbered.
  assert.deepEqual(created.map((row) => row.code), ['6', '6.1', '6.2']);
  assert.deepEqual(created.map((row) => row.sortOrder), [90, 100, 110]);
  assert.equal(created[1].parentId, 'n1');
  assert.equal(created[0].workDays, null);
  assert.equal(created[1].workDays, 10);
  assert.equal(created[2].predecessor1, '6.1');
  assert.deepEqual(links, [{ projectId: 'p1', predecessorId: 'n2', successorId: 'n3', type: 'FS', lagDays: 0 }]);
  assert.equal(audits[0].action, 'wbs_draft.apply');
  assert.equal(audits[0].metadata.draftKey, 'key-12345678');
  assert.deepEqual(audits[0].metadata.createdIds, ['n1', 'n2', 'n3']);
  assert.equal(res.body.replayed, false);
  assert.deepEqual(res.body.createdIds, ['n1', 'n2', 'n3']);
});

test('the same draft key again adds nothing and returns the rows it created', async () => {
  const { res, created, audits } = await apply({ applied: true });
  assert.equal(res.statusCode, 200, String(res.error ?? ''));
  assert.deepEqual(res.body.createdIds, ['old1', 'old2']);
  assert.equal(res.body.replayed, true);
  assert.deepEqual(created, []);
  assert.deepEqual(audits, []);
});

test('the draft needs the right to change an open project, a session and a key', async () => {
  assert.equal((await apply({ user: { id: 'u2', role: 'PROJECT_MANAGER' } })).res.statusCode, 403);
  assert.equal((await apply({ status: 'CLOSED' })).res.statusCode, 423);
  assert.equal((await apply({ user: null })).res.statusCode, 403);
  assert.equal((await apply({ body: { items: draft } })).res.statusCode, 400);
  assert.equal((await apply({ body: { items: [{ ref: 'x', title: '' }], draftKey: 'key-12345678' } })).res.statusCode, 400);
});
