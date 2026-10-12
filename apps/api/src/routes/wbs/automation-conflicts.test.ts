import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Router } from 'express';
import { prismaClientProvider } from '../../db.js';
import { registerWbsItemRoutes } from './items.routes.js';

const now = new Date();
const row = { id: 'w', code: '1', title: 'Work', type: 'TASK', status: 'NOT_STARTED', parentId: null, wbsLevel: 1, sortOrder: 10, jiraTicketKey: 'TV-1', jiraTicketUrl: null, updatedAt: now, createdAt: now, startDate: null, dueDate: null };

for (const failure of ['stale-work', 'retired-jira', 'stale-jira', 'concurrent-work', 'serialization'] as const) {
  test(`reconciliation fails closed on ${failure}`, async (t) => {
    let bulk: Function | undefined;
    const router = { post: () => {}, delete: () => {}, patch: (path: string, handler: Function) => { if (path.endsWith('/bulk')) bulk = handler; } };
    registerWbsItemRoutes(router as unknown as Router);
    let writes = 0; let transactions = 0;
    // Every check, the stale ones included, runs in the transaction that holds the project's lock.
    const db = {
      $executeRaw: async () => 0,
      $queryRaw: async () => [],
      project: { findUnique: async () => ({ id: 'p', jiraIntegration: null }) },
      issue: { findMany: async () => [] },
      jiraIssueSnapshot: { findUnique: async () => ({ updatedAt: now, syncedAt: failure === 'stale-jira' ? new Date(0) : now, retiredAt: failure === 'retired-jira' ? now : null }) },
      wbsItem: {
        findMany: async () => [row],
        update: async (args: { where: unknown }) => {
          writes++;
          assert.deepEqual(args.where, { id: 'w', updatedAt: now });
          throw new Prisma.PrismaClientKnownRequestError('changed', { code: 'P2025', clientVersion: 'test' });
        },
      },
    };
    const transaction = async (callback: Function, options: { isolationLevel: string }) => {
      transactions++;
      assert.equal(options.isolationLevel, 'Serializable');
      if (failure === 'serialization') throw new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: 'test' });
      return callback(db);
    };
    t.mock.method(prismaClientProvider, 'get', () => ({
      $transaction: transaction,
    }) as unknown as PrismaClient);
    let status = 200;
    const res = { status: (value: number) => { status = value; return res; }, json: () => {} };
    await bulk!({ params: { projectId: 'p' }, body: { items: [{ id: 'w', patch: { status: 'DONE' }, expectedUpdatedAt: failure === 'stale-work' ? new Date(0).toISOString() : now.toISOString(), expectedJira: { key: 'TV-1', updatedAt: now.toISOString() } }] } }, res);
    assert.equal(status, 409);
    assert.equal(transactions, 1);
    assert.equal(writes, failure === 'concurrent-work' ? 1 : 0);
  });
}
