import assert from 'node:assert/strict';
import test from 'node:test';
import { comparePlans, type SnapshotRow } from './plan-snapshots.js';

const row = (id: string, code: string, extra: Partial<SnapshotRow> = {}): SnapshotRow => ({
  id,
  parentId: null,
  code,
  title: `Строка ${code}`,
  type: 'TASK',
  status: 'NOT_STARTED',
  owner: 'Иванов',
  startDate: '2026-10-01',
  dueDate: '2026-10-10',
  baselineDueDate: '2026-10-10',
  progress: 0,
  ...extra,
});

test('a comparison shows moves in days, status and owner changes, added and removed rows, checkpoints first', () => {
  const before = [
    row('a', '1.1'),
    row('m', '1.9', { type: 'MILESTONE', startDate: '2026-10-20', dueDate: '2026-10-20' }),
    row('gone', '1.2'),
    row('same', '1.3'),
  ];
  const after = [
    row('a', '1.1', { dueDate: '2026-10-15', status: 'IN_PROGRESS', owner: 'Петров' }),
    row('m', '1.9', { type: 'MILESTONE', startDate: '2026-10-27', dueDate: '2026-10-27' }),
    row('same', '1.3'),
    row('new', '1.4'),
  ];
  const result = comparePlans(before, after);
  assert.deepEqual(result.changes.map((change) => [change.code, change.checkpoint, change.dueDays, change.statusChanged, change.ownerChanged]), [
    ['1.9', true, 7, false, false],
    ['1.1', false, 5, true, true],
  ]);
  assert.deepEqual(result.added.map((item) => item.code), ['1.4']);
  assert.deepEqual(result.removed.map((item) => item.code), ['1.2']);
  assert.deepEqual(result.summary, { changed: 2, moved: 2, later: 2, earlier: 0, added: 1, removed: 1 });
});

test('rows with new ids are matched by their code, as after a rebuild or an import', () => {
  const result = comparePlans([row('old-id', '2.1')], [row('new-id', '2.1', { dueDate: '2026-10-08' })]);
  assert.deepEqual([result.added, result.removed], [[], []]);
  assert.equal(result.changes[0].dueDays, -2);
  assert.equal(result.summary.earlier, 1);
});
