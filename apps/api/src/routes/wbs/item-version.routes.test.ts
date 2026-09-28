import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Router } from 'express';
import { prismaClientProvider } from '../../db.js';
import { registerWbsItemRoutes } from './items.routes.js';

const savedAt = new Date('2026-09-27T10:00:00.000Z');
const row = {
  id: 'w', projectId: 'p', parentId: null, code: '1.1', title: 'Work', type: 'TASK', status: 'IN_PROGRESS',
  owner: 'Иванов', wbsLevel: 2, sortOrder: 10, jiraTicketKey: null, jiraTicketUrl: null,
  startDate: new Date('2026-10-05T00:00:00.000Z'), dueDate: new Date('2026-10-09T00:00:00.000Z'),
  updatedAt: savedAt, createdAt: savedAt,
};

function itemPatch() {
  let handler: Function | undefined;
  const router = {
    post: () => {},
    delete: () => {},
    patch: (path: string, callback: Function) => {
      if (path === '/wbs-items/:itemId') handler = callback;
    },
  };
  registerWbsItemRoutes(router as unknown as Router);
  return handler!;
}

async function send(body: Record<string, unknown>, update: (args: { where: unknown }) => Promise<unknown>) {
  let updates = 0;
  const previous = prismaClientProvider.get;
  prismaClientProvider.get = () =>
    ({
      wbsItem: {
        findUnique: async () => row,
        update: async (args: { where: unknown }) => {
          updates += 1;
          return update(args);
        },
      },
      issue: { findMany: async () => [] },
      project: { findUnique: async () => ({ id: 'p', status: 'ACTIVE' }) },
    }) as unknown as PrismaClient;
  try {
    const res: any = {
      statusCode: 200,
      body: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(value: unknown) {
        this.body = value;
        return this;
      },
    };
    await itemPatch()({ params: { itemId: 'w' }, body, get: () => undefined, header: () => undefined, headers: {} }, res);
    return { res, updates };
  } finally {
    prismaClientProvider.get = previous;
  }
}

const unreachable = async () => {
  throw new Error('the item must not be written');
};

test('an edit based on an older copy of the item is refused before anything is written', async () => {
  const { res, updates } = await send(
    { owner: 'Петров', expectedUpdatedAt: '2026-09-27T09:00:00.000Z' },
    unreachable,
  );
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.itemId, 'w');
  assert.equal(updates, 0);
});

test('an edit that loses the race to another save is refused', async () => {
  const { res, updates } = await send({ owner: 'Петров', expectedUpdatedAt: savedAt.toISOString() }, async (args) => {
    assert.deepEqual(args.where, { id: 'w', updatedAt: savedAt });
    throw new Prisma.PrismaClientKnownRequestError('changed', { code: 'P2025', clientVersion: 'test' });
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.itemId, 'w');
  assert.equal(updates, 1);
});

test('the expected version must be a timestamp', async () => {
  const { res, updates } = await send({ owner: 'Петров', expectedUpdatedAt: 'yesterday' }, unreachable);
  assert.equal(res.statusCode, 400);
  assert.equal(updates, 0);
});
