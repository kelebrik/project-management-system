import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShiftLadders, calendarDaysBetween, diffCheckpoints, LADDER_STEPS, needsReason } from './schedule-shifts.js';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const point = (id: string, due: string | null, baseline: string | null, type = 'MILESTONE') => ({
  id,
  code: `1.${id}`,
  title: `Веха ${id}`,
  type,
  dueDate: due ? day(due) : null,
  baselineDueDate: baseline ? day(baseline) : null,
});
const meta = { projectId: 'p1', operationId: 'op1', source: { code: '2.4', title: 'Прошивка' } };

test('a diff journals moved dates, first dates without days, and baseline changes as markers', () => {
  const before = new Map([
    ['a', point('a', '2026-11-01', '2026-11-01')],
    ['b', point('b', null, null)],
    ['c', point('c', '2026-12-01', '2026-11-20')],
    ['gone', point('gone', '2026-12-01', null)],
  ]);
  const after = new Map([
    ['a', point('a', '2026-11-06', '2026-11-01')],
    ['b', point('b', '2026-11-10', null)],
    ['c', point('c', '2026-12-01', '2026-12-01')],
    ['new', point('new', '2026-12-01', null)],
  ]);
  const rows = diffCheckpoints(before, after, { trigger: 'MANUAL_EDIT', sourceItemId: 'w24', actor: { id: 'u1', name: 'Иванов' } }, meta);
  assert.deepEqual(rows.map((row) => [row.checkpointId, row.kind, row.deltaDays]), [
    ['a', 'SHIFT', 5],
    ['b', 'SHIFT', null],
    ['c', 'BASELINE', null],
  ]);
  assert.equal(rows[0].sourceCode, '2.4');
  assert.equal(rows[0].actorName, 'Иванов');
  assert.equal(rows[0].operationId, 'op1');
  assert.equal(needsReason(rows[0]), true);
  assert.equal(needsReason(rows[1]), false);
});

test('days are counted in UTC calendar days across daylight saving changes', () => {
  assert.equal(calendarDaysBetween(day('2026-03-28'), day('2026-03-30')), 2);
  assert.equal(calendarDaysBetween(new Date('2026-10-24T23:30:00.000Z'), day('2026-10-26')), 2);
  assert.equal(calendarDaysBetween(day('2026-11-06'), day('2026-11-01')), -5);
});

test('a move earlier, or later but still before the baseline, needs no reason', () => {
  assert.equal(needsReason({ kind: 'SHIFT', deltaDays: -3, newDate: day('2026-11-01'), baselineDate: day('2026-10-20') }), false);
  assert.equal(needsReason({ kind: 'SHIFT', deltaDays: 3, newDate: day('2026-10-10'), baselineDate: day('2026-10-20') }), false);
  assert.equal(needsReason({ kind: 'SHIFT', deltaDays: 3, newDate: day('2026-10-10'), baselineDate: null }), false);
});

const checkpoint = (id: string, due: string, baseline: string | null, extra: Record<string, unknown> = {}) => ({
  ...point(id, due, baseline),
  status: 'IN_PROGRESS',
  sortOrder: 10,
  ...extra,
});
let seq = 0;
const row = (checkpointId: string, kind: string, operationId: string, deltaDays: number | null, at: string, extra: Record<string, unknown> = {}) => ({
  id: `s${++seq}`,
  kind,
  checkpointId,
  operationId,
  createdAt: new Date(at),
  previousDate: null,
  newDate: day('2026-11-20'),
  deltaDays,
  baselineDate: day('2026-11-01'),
  trigger: 'MANUAL_EDIT',
  sourceItemId: null,
  sourceCode: null,
  sourceTitle: null,
  sourceIssueId: null,
  sourceNote: null,
  actorName: null,
  reasonCategory: null,
  reasonText: null,
  reasonRaidItemId: null,
  ...extra,
});

test('each checkpoint counts steps from its own baseline; the rest is what the journal does not explain', () => {
  const ladders = buildShiftLadders(
    [
      checkpoint('m', '2026-11-13', '2026-11-01'),
      checkpoint('g', '2026-12-10', '2026-12-01', { type: 'GOAL', sortOrder: 20 }),
      checkpoint('same', '2026-11-01', '2026-11-01'),
      checkpoint('done', '2026-12-30', '2026-12-01', { status: 'DONE' }),
    ],
    [
      row('m', 'SHIFT', 'o1', 4, '2026-09-01T10:00:00Z'),
      // A baseline saved for m only: its history restarts; the shift of that same operation is part of the new plan.
      row('m', 'BASELINE', 'o2', null, '2026-09-10T10:00:00Z'),
      row('m', 'SHIFT', 'o2', 2, '2026-09-10T10:00:00Z'),
      row('m', 'SHIFT', 'o3', 5, '2026-09-20T10:00:00Z', { reasonCategory: 'SUPPLIER' }),
      row('m', 'SHIFT', 'o4', 3, '2026-09-25T10:00:00Z', { newDate: day('2026-11-13') }),
      row('g', 'SHIFT', 'o1', 9, '2026-09-01T10:00:00Z'),
    ],
  );
  assert.deepEqual(ladders.map((ladder) => ladder.id), ['g', 'm']);
  const [goal, milestone] = ladders;
  assert.equal(goal.isActiveGoal, true);
  assert.deepEqual([goal.varianceDays, goal.unexplainedDays], [9, 0]);
  assert.deepEqual(milestone.steps.map((step) => step.deltaDays), [5, 3]);
  assert.deepEqual([milestone.varianceDays, milestone.unexplainedDays], [12, 4]);
  assert.deepEqual(milestone.steps[0].reason, { category: 'SUPPLIER', text: null, raidItemId: null });
  assert.equal(milestone.steps[0].needsReason, false);
  assert.equal(milestone.steps[1].needsReason, true);
});

test('long histories fold the older steps into one line', () => {
  const journal = Array.from({ length: LADDER_STEPS + 5 }, (_, index) =>
    row('m', 'SHIFT', `op${index}`, 1, new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString()),
  );
  const [ladder] = buildShiftLadders([checkpoint('m', '2026-12-05', '2026-11-01')], journal);
  assert.equal(ladder.steps.length, LADDER_STEPS);
  assert.deepEqual(ladder.earlierSteps, { count: 5, deltaDays: 5 });
  assert.equal(ladder.unexplainedDays, 34 - 35);
});
