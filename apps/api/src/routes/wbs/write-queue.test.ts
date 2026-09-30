import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { prismaClientProvider } from '../../db.js';
import { runWithWbsWriteQueue, shiftContextForRequest, wbsWriteQueueMiddleware } from './write-queue.js';

test('programmatic WBS writes are serialized for one project', async () => {
  const events: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = runWithWbsWriteQueue('project-1', async () => {
    events.push('first:start');
    await firstGate;
    events.push('first:end');
  });
  await Promise.resolve();
  const second = runWithWbsWriteQueue('project-1', async () => {
    events.push('second:start');
    events.push('second:end');
  });
  await Promise.resolve();

  assert.deepEqual(events, ['first:start']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, [
    'first:start',
    'first:end',
    'second:start',
    'second:end',
  ]);
});

test('programmatic WBS writes do not block another project', async () => {
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let secondStarted = false;

  const first = runWithWbsWriteQueue('project-a', () => firstGate);
  const second = runWithWbsWriteQueue('project-b', async () => {
    secondStarted = true;
  });
  await second;
  assert.equal(secondStarted, true);
  releaseFirst();
  await first;
});


test('a structure write is named for the journal by its route', () => {
  const ctx = (method: string, path: string, body: unknown = {}) => shiftContextForRequest({ method, path, body } as Request);
  assert.deepEqual(ctx('PATCH', '/wbs-items/w1'), { trigger: 'MANUAL_EDIT', sourceItemId: 'w1' });
  assert.deepEqual(ctx('PATCH', '/projects/p1/wbs-items/bulk', { items: [{ id: 'w2' }] }), { trigger: 'BULK_EDIT', sourceItemId: 'w2' });
  assert.deepEqual(ctx('PATCH', '/projects/p1/wbs-items/bulk', { items: [{ id: 'a' }, { id: 'b' }] }), { trigger: 'BULK_EDIT', sourceItemId: null });
  assert.deepEqual(ctx('POST', '/projects/p1/wbs-dependencies'), { trigger: 'LINKS' });
  assert.deepEqual(ctx('POST', '/projects/p1/wbs-snapshot/restore'), { trigger: 'RESTORE' });
  assert.deepEqual(ctx('POST', '/projects/p1/wbs-baseline'), { trigger: 'BASELINE' });
  assert.deepEqual(ctx('DELETE', '/wbs-items/w1'), { trigger: 'STRUCTURE' });
  assert.deepEqual(ctx('POST', '/projects/p1/wbs-items/reorder'), { trigger: 'STRUCTURE' });
});

function fakeResponse() {
  const res = new EventEmitter() as EventEmitter & Record<string, any>;
  res.statusCode = 200;
  res.headersSent = false;
  res.headers = {} as Record<string, string>;
  res.ended = false;
  res.setHeader = (name: string, value: string) => {
    res.headers[name] = value;
  };
  res.end = () => {
    res.ended = true;
    res.headersSent = true;
    res.emit('finish');
    return res;
  };
  return res;
}

function mockJournal() {
  let due = '2026-11-01';
  const created: any[] = [];
  const previous = prismaClientProvider.get;
  prismaClientProvider.get = () =>
    ({
      wbsItem: {
        findMany: async () => [
          { id: 'm1', code: '1.5', title: 'Веха', type: 'MILESTONE', dueDate: new Date(`${due}T00:00:00Z`), baselineDueDate: new Date('2026-11-01T00:00:00Z') },
        ],
        findUnique: async () => ({ code: '1.2', title: 'Задача' }),
      },
      scheduleShift: { createMany: async (args: any) => created.push(...args.data) },
    }) as unknown as PrismaClient;
  return { move: (next: string) => (due = next), created, restore: () => (prismaClientProvider.get = previous) };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test('the answer waits for the journal, names the operation and says a reason is needed', async () => {
  const journal = mockJournal();
  try {
    const res = fakeResponse();
    const req = { method: 'PATCH', path: '/projects/p9/wbs-items/bulk', body: { items: [{ id: 'w2' }] }, currentUser: { id: 'u1', name: 'Иванов' } };
    await new Promise<void>((resolve) => wbsWriteQueueMiddleware(req as unknown as Request, res as unknown as Response, (() => resolve()) as NextFunction));
    journal.move('2026-11-06');
    res.end();
    // The body is held until the journal is written.
    assert.equal(res.ended, false);
    await tick();
    assert.equal(res.ended, true);
    assert.equal(journal.created.length, 1);
    assert.deepEqual([journal.created[0].trigger, journal.created[0].deltaDays, journal.created[0].actorName, journal.created[0].sourceCode], ['BULK_EDIT', 5, 'Иванов', '1.2']);
    assert.equal(res.headers['X-Schedule-Shift-Operation-Id'], journal.created[0].operationId);
    assert.equal(res.headers['X-Schedule-Shift-Reason-Needed'], '1');
  } finally {
    journal.restore();
  }
});

test('a client that leaves does not free the queue while its write still runs', async () => {
  const journal = mockJournal();
  try {
    const first = fakeResponse();
    const request = (res: ReturnType<typeof fakeResponse>) =>
      new Promise<void>((resolve) =>
        wbsWriteQueueMiddleware({ method: 'PATCH', path: '/projects/p8/wbs-items/bulk', body: {} } as unknown as Request, res as unknown as Response, (() => resolve()) as NextFunction),
      );
    await request(first);
    first.emit('close');
    let secondStarted = false;
    const second = fakeResponse();
    void request(second).then(() => {
      secondStarted = true;
    });
    await tick();
    assert.equal(secondStarted, false);
    first.end();
    await tick();
    assert.equal(secondStarted, true);
    second.end();
    await tick();
  } finally {
    journal.restore();
  }
});
