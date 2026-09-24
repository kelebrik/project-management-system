import assert from 'node:assert/strict';
import test from 'node:test';

import type { PrismaClient } from '@prisma/client';
import { PUBLIC_DEMO_USER_ID } from '@pms/shared';
import { prismaClientProvider } from '../db.js';
import { buildAuditFieldChanges, recordAuditEvent } from './audit.js';

test('buildAuditFieldChanges stores only changed normalized field values', () => {
  const changes = buildAuditFieldChanges(
    {
      title: 'Old title',
      dueDate: new Date('2026-07-10T00:00:00.000Z'),
      owner: null,
      unchanged: 'same',
    },
    {
      title: 'New title',
      dueDate: new Date('2026-07-11T00:00:00.000Z'),
      owner: 'PM',
      unchanged: 'same',
    },
    ['title', 'dueDate', 'owner', 'unchanged'],
  );

  assert.deepEqual(
    changes.map((change) => ({
      field: change.field,
      oldText: change.oldText,
      newText: change.newText,
    })),
    [
      { field: 'title', oldText: 'Old title', newText: 'New title' },
      {
        field: 'dueDate',
        oldText: '2026-07-10T00:00:00.000Z',
        newText: '2026-07-11T00:00:00.000Z',
      },
      { field: 'owner', oldText: null, newText: 'PM' },
    ],
  );
});

test('the public demo identity is recorded by name without a user foreign key', async () => {
  const previous = prismaClientProvider.get;
  let data: any;
  prismaClientProvider.get = () =>
    ({
      auditEvent: {
        create: async (args: any) => {
          data = args.data;
          return {};
        },
      },
    }) as unknown as PrismaClient;
  try {
    await recordAuditEvent({
      actor: { id: PUBLIC_DEMO_USER_ID, email: 'public-demo@local.invalid', name: 'Публичная демонстрация' },
      action: 'leave_schedule.leave.create',
      objectType: 'Leave',
      changes: [{ field: 'comment', oldValue: null, newValue: 'Море' }],
    });
    assert.equal(data.actorId, null);
    assert.equal(data.actorName, 'Публичная демонстрация');
    assert.equal(data.changes.create[0].actorId, null);

    await recordAuditEvent({ actor: { id: 'user-1', email: 'a@b.c', name: 'A' }, action: 'x', objectType: 'Y' });
    assert.equal(data.actorId, 'user-1');
  } finally {
    prismaClientProvider.get = previous;
  }
});
