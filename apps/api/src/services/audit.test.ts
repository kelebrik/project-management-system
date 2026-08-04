import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAuditFieldChanges } from './audit.js';

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
