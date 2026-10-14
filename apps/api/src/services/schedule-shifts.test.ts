import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShiftLadders, calendarDaysBetween, diffCheckpoints, LADDER_STEPS, lateDaysByReason, needsReason } from './schedule-shifts.js';

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
  // Days by reason count later moves since the baseline, once per operation of this checkpoint.
  assert.deepEqual(milestone.reasonDays, { SUPPLIER: 5, NONE: 3 });
  assert.deepEqual(goal.reasonDays, { NONE: 9 });
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

test('days by reason count one operation once for a checkpoint, by its net move', () => {
  const [ladder] = buildShiftLadders(
    [checkpoint('m', '2026-11-08', '2026-11-01')],
    [
      row('m', 'SHIFT', 'twice', 4, '2026-09-01T10:00:00Z', { reasonCategory: 'CUSTOMER' }),
      row('m', 'SHIFT', 'twice', 1, '2026-09-01T10:00:01Z'),
      row('m', 'SHIFT', 'back', -2, '2026-09-02T10:00:00Z'),
      row('m', 'SHIFT', 'late', 4, '2026-09-03T10:00:00Z'),
    ],
  );
  // The move back takes back the latest move later first. A step whose rows were given different
  // reasons, or a reason only in part, counts as mixed: one reason does not explain the rest.
  assert.deepEqual(ladder.reasonDays, { MIXED: 3, NONE: 4 });
});

test('a date sent far away and brought back counts nothing, and no baseline counts nothing', () => {
  const swing = [
    row('m', 'SHIFT', 'away', 2912, '2026-10-09T07:10:30Z'),
    row('m', 'SHIFT', 'further', 2912, '2026-10-09T07:10:33Z'),
    row('m', 'SHIFT', 'back', -5824, '2026-10-09T07:11:08Z'),
  ];
  // Late by 5 days from before the journal: the swing explains none of them.
  const [withBaseline] = buildShiftLadders([checkpoint('m', '2026-11-06', '2026-11-01')], swing);
  assert.deepEqual(withBaseline.reasonDays, {});
  const [withoutBaseline] = buildShiftLadders([checkpoint('m', '2027-03-24', null)], [...swing, row('m', 'SHIFT', 'late', 30, '2026-10-10T10:00:00Z')]);
  assert.deepEqual(withoutBaseline.reasonDays, {});
});

test('days by reason never pass how late the checkpoint is now', () => {
  const op = (days: number, category: string | null = null) => ({ days, category });
  assert.deepEqual(lateDaysByReason([op(10, 'CUSTOMER'), op(5), op(-7)], 8), { CUSTOMER: 8 });
  // A move back before any move later takes nothing back from the later ones.
  assert.deepEqual(lateDaysByReason([op(-5), op(10, 'CUSTOMER')], 10), { CUSTOMER: 10 });
  // More late days than the checkpoint is late: the oldest are cut.
  assert.deepEqual(lateDaysByReason([op(10, 'CUSTOMER'), op(5, 'SUPPLIER')], 8), { CUSTOMER: 3, SUPPLIER: 5 });
  for (const variance of [null, 0, -3]) assert.deepEqual(lateDaysByReason([op(10, 'CUSTOMER')], variance), {});
});

test('moves back take back later moves folded out of the ladder too', () => {
  const journal = [
    ...Array.from({ length: LADDER_STEPS + 5 }, (_, index) => row('m', 'SHIFT', `op${index}`, 10, new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString())),
    row('m', 'SHIFT', 'back', -(LADDER_STEPS + 5) * 10 + 6, '2026-09-02T00:00:00Z'),
  ];
  const [ladder] = buildShiftLadders([checkpoint('m', '2026-11-07', '2026-11-01')], journal);
  assert.ok(ladder.earlierSteps);
  assert.deepEqual(ladder.reasonDays, { NONE: 6 });
});

// A move of one checkpoint from one date to another, in a session or none.
const move = (checkpointId: string, operationId: string, from: string | null, to: string | null, at: string, extra: Record<string, unknown> = {}) =>
  row(checkpointId, 'SHIFT', operationId, from && to ? calendarDaysBetween(day(from), day(to)) : null, at, { previousDate: from ? day(from) : null, newDate: to ? day(to) : null, ...extra });

test('an editing session is one step of a checkpoint, by its net move', () => {
  const [ladder] = buildShiftLadders(
    [checkpoint('m', '2026-11-08', '2026-11-01')],
    [
      move('m', 'o1', '2026-11-01', '2026-11-10', '2026-10-14T10:00:00Z', { sessionId: 's1' }),
      move('m', 'o2', '2026-11-10', '2026-11-04', '2026-10-14T10:05:00Z', { sessionId: 's1' }),
      move('m', 'o3', '2026-11-04', '2026-11-08', '2026-10-14T10:09:00Z', { sessionId: 's1' }),
    ],
  );
  assert.equal(ladder.steps.length, 1);
  const [step] = ladder.steps;
  assert.deepEqual([step.previousDate, step.newDate, step.deltaDays, step.trigger, step.operations, step.sessionId], ['2026-11-01', '2026-11-08', 7, 'SESSION', 3, 's1']);
  assert.equal(step.shiftIds.length, 3);
  assert.equal(step.needsReason, true);
  assert.deepEqual(ladder.reasonDays, { NONE: 7 });
  assert.deepEqual([ladder.varianceDays, ladder.unexplainedDays], [7, 0]);
});

test('a session that sent a date away and brought it back is no step; one from one person to another is two', () => {
  const [back] = buildShiftLadders(
    [checkpoint('m', '2026-11-01', '2026-11-01')],
    [
      move('m', 'o1', '2026-11-01', '2026-12-01', '2026-10-14T10:00:00Z', { sessionId: 's1' }),
      move('m', 'o2', '2026-12-01', '2026-11-01', '2026-10-14T10:05:00Z', { sessionId: 's1' }),
    ],
  );
  assert.equal(back, undefined, 'nothing moved and nothing is off the baseline');
  const [two] = buildShiftLadders(
    [checkpoint('m', '2026-11-06', '2026-11-01')],
    [
      move('m', 'o1', '2026-11-01', '2026-11-03', '2026-10-14T10:00:00Z', { sessionId: 's1' }),
      move('m', 'o2', '2026-11-03', '2026-11-06', '2026-10-14T10:05:00Z', { sessionId: 's2' }),
    ],
  );
  assert.deepEqual(two!.steps.map((step) => [step.sessionId, step.deltaDays]), [['s1', 2], ['s2', 3]]);
});

test('a date taken away and set again in a session counts by its ends, and is never hidden', () => {
  const [ladder] = buildShiftLadders(
    [checkpoint('m', '2026-11-15', '2026-11-10')],
    [
      move('m', 'o1', '2026-11-10', null, '2026-10-14T10:00:00Z', { sessionId: 's1' }),
      move('m', 'o2', null, '2026-11-15', '2026-10-14T10:05:00Z', { sessionId: 's1' }),
    ],
  );
  assert.deepEqual(ladder.steps.map((step) => step.deltaDays), [5]);
  assert.deepEqual([ladder.varianceDays, ladder.unexplainedDays], [5, 0]);
  assert.deepEqual(ladder.reasonDays, { NONE: 5 });
  // An end without a date leaves the step without a number of days, but shown.
  const [open] = buildShiftLadders(
    [checkpoint('m', '2026-11-15', '2026-11-10')],
    [move('m', 'o1', '2026-11-10', null, '2026-10-14T10:00:00Z', { sessionId: 's1' })],
  );
  assert.deepEqual(open.steps.map((step) => step.deltaDays), [null]);
});

test("rows before sessions stand by their operation; a session's reason is whole, none or mixed", () => {
  const [ladder] = buildShiftLadders(
    [checkpoint('m', '2026-11-12', '2026-11-01')],
    [
      move('m', 'old', '2026-11-01', '2026-11-03', '2026-10-01T10:00:00Z', { reasonCategory: 'SUPPLIER' }),
      move('m', 'o1', '2026-11-03', '2026-11-05', '2026-10-14T10:00:00Z', { sessionId: 's1', reasonCategory: 'CUSTOMER', reasonText: 'Новые требования' }),
      move('m', 'o2', '2026-11-05', '2026-11-07', '2026-10-14T10:05:00Z', { sessionId: 's1', reasonCategory: 'CUSTOMER', reasonText: 'Новые требования' }),
      move('m', 'o3', '2026-11-07', '2026-11-09', '2026-10-15T10:00:00Z', { sessionId: 's2', reasonCategory: 'CUSTOMER' }),
      move('m', 'o4', '2026-11-09', '2026-11-12', '2026-10-15T10:05:00Z', { sessionId: 's2' }),
    ],
  );
  const [old, whole, mixed] = ladder.steps;
  assert.deepEqual([old.sessionId, old.trigger, old.reason?.category, old.needsReason], [null, 'MANUAL_EDIT', 'SUPPLIER', false]);
  assert.deepEqual(whole.reason, { category: 'CUSTOMER', text: 'Новые требования', raidItemId: null });
  assert.equal(whole.needsReason, false);
  // A reason given to part of a session does not explain the rest of it.
  assert.deepEqual([mixed.reason?.category, mixed.needsReason], ['MIXED', true]);
  assert.deepEqual(ladder.reasonDays, { SUPPLIER: 2, CUSTOMER: 4, MIXED: 5 });
});

test("a baseline saved within a session starts the checkpoint's history from it", () => {
  const [ladder] = buildShiftLadders(
    [checkpoint('m', '2026-11-12', '2026-11-10')],
    [
      move('m', 'o1', '2026-11-01', '2026-11-10', '2026-10-14T10:00:00Z', { sessionId: 's1' }),
      row('m', 'BASELINE', 'o2', null, '2026-10-14T10:05:00Z', { sessionId: 's1' }),
      move('m', 'o3', '2026-11-10', '2026-11-12', '2026-10-14T10:09:00Z', { sessionId: 's1' }),
    ],
  );
  assert.deepEqual(ladder.steps.map((step) => [step.deltaDays, step.operations]), [[2, 1]]);
});

test('a step of an open session too large to name by its rows waits for the session to close', () => {
  const rows = Array.from({ length: 51 }, (_, index) =>
    move('m', `o${index}`, index % 2 ? '2026-11-02' : '2026-11-01', index % 2 ? '2026-11-01' : '2026-11-02', new Date(Date.UTC(2026, 9, 14, 10, index)).toISOString(), { sessionId: 's1' }));
  const [open] = buildShiftLadders([checkpoint('m', '2026-11-02', '2026-11-01')], rows, new Set(['s1']));
  assert.deepEqual([open.steps[0].sessionOpen, open.steps[0].reasonEditable], [true, false]);
  const [closed] = buildShiftLadders([checkpoint('m', '2026-11-02', '2026-11-01')], rows);
  assert.deepEqual([closed.steps[0].sessionOpen, closed.steps[0].reasonEditable], [false, true]);
});
