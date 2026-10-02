import assert from 'node:assert/strict';
import test from 'node:test';
import { planAppend, type AppendSourceRow } from './wbs-append.js';

const row = (id: string, code: string, parentId: string | null, type = 'TASK', calendarCode = 'RU'): AppendSourceRow => ({ id, code, parentId, wbsLevel: code.split('.').length, type, calendarCode });

const rows = [
  row('p1', '1', null, 'PHASE', 'CN'),
  row('w1', '1.1', 'p1', 'WORK_PACKAGE'),
  row('t1', '1.1.1', 'w1'),
  row('t2', '1.2', 'p1'),
  row('p2', '2', null, 'PHASE'),
];

test('a new row goes after the last row under its parent, numbered after the highest child', () => {
  assert.deepEqual(planAppend(rows, 'p1'), { code: '1.3', level: 2, insertIndex: 4, parentId: 'p1', calendarCode: 'CN' });
  assert.deepEqual(planAppend(rows, 'w1'), { code: '1.1.2', level: 3, insertIndex: 3, parentId: 'w1', calendarCode: 'RU' });
  assert.deepEqual(planAppend(rows, null), { code: '3', level: 1, insertIndex: 5, parentId: null, calendarCode: 'CN' });
  assert.deepEqual(planAppend(rows, 'p2'), { code: '2.1', level: 2, insertIndex: 5, parentId: 'p2', calendarCode: 'RU' });
});

test('a parent must be a phase or a work package of the project, and codes must already follow the order', () => {
  assert.deepEqual(planAppend(rows, 't1'), { problem: 'PARENT_NOT_A_GROUP' });
  assert.deepEqual(planAppend(rows, 'missing'), { problem: 'PARENT_NOT_FOUND' });
  // A gap in the stored codes would be renumbered: refused instead.
  const gapped = [row('p1', '1', null, 'PHASE'), row('t1', '1.1', 'p1'), row('t3', '1.3', 'p1')];
  assert.deepEqual(planAppend(gapped, 'p1'), { problem: 'NOT_CANONICAL' });
});

test('without a free sort number only the rows in the way after the new one move, by as little as needed', async () => {
  const { sortPositionAt } = await import('../routes/wbs/append.routes.js');
  const written: Array<[string, number]> = [];
  const tx = { wbsItem: { update: async ({ where, data }: { where: { id: string }; data: { sortOrder: number } }) => written.push([where.id, data.sortOrder]) } };
  const rows = [{ id: 'a', sortOrder: 0 }, { id: 'b', sortOrder: 1 }, { id: 'c', sortOrder: 2 }, { id: 'd', sortOrder: 3 }, { id: 'e', sortOrder: 40 }];
  const plan = { code: '1.3', level: 2, insertIndex: 2, parentId: 'p', calendarCode: 'RU' };
  assert.equal(await sortPositionAt(tx as never, rows, plan), 2);
  assert.deepEqual(written, [['c', 3], ['d', 4]]);
  written.length = 0;
  // A free number between the neighbours: nothing is written.
  assert.equal(await sortPositionAt(tx as never, [{ id: 'a', sortOrder: 10 }, { id: 'b', sortOrder: 20 }], { ...plan, insertIndex: 1 }), 15);
  assert.deepEqual(written, []);
});
