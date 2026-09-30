import assert from 'node:assert/strict';
import test from 'node:test';
import { applyScheduleUpdates, calculateWbsScheduleUpdates } from './calculate.js';
import { explainWbsItemDates } from './drivers.js';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const item = (id: string, code: string, extra: Record<string, unknown>) => ({
  id,
  code,
  title: `Строка ${code}`,
  parentId: null as string | null,
  type: 'TASK' as const,
  status: 'NOT_STARTED' as const,
  startDate: null as Date | null,
  dueDate: null as Date | null,
  predecessor1: null as string | null,
  predecessor2: null,
  predecessor3: null,
  predecessor4: null,
  predecessor5: null,
  predecessor6: null,
  leadLagDays: 0,
  workDays: null as number | null,
  calendarDays: null,
  calendarCode: 'RU' as const,
  sortOrder: 0,
  ...extra,
});

// A phase with two tasks and a milestone; 13 October is a holiday.
const overrides = [{ calendarCode: 'RU' as const, date: day('2026-10-13'), isWorkingDay: false, description: 'Праздник' }];
const raw = [
  item('p', '1', { type: 'PHASE', sortOrder: 1 }),
  item('a', '1.1', { parentId: 'p', startDate: day('2026-10-05'), dueDate: day('2026-10-09'), workDays: 5, sortOrder: 2 }),
  item('b', '1.2', { parentId: 'p', startDate: day('2026-10-05'), workDays: 3, predecessor1: '1.1', sortOrder: 3 }),
  item('c', '1.3', { parentId: 'p', startDate: day('2026-10-05'), workDays: 2, predecessor1: '1.1', sortOrder: 4 }),
  item('m', '2', { type: 'MILESTONE', predecessor1: '1.2', sortOrder: 5 }),
];
const dependencies = [
  { predecessorId: 'a', successorId: 'b', type: 'FS' as const, lagDays: 0 },
  { predecessorId: 'a', successorId: 'c', type: 'SS' as const, lagDays: 2 },
  { predecessorId: 'b', successorId: 'm', type: 'FS' as const, lagDays: 0 },
];
// Settle the plan with the real calculation, as the saved dates would be.
const items = applyScheduleUpdates(raw, calculateWbsScheduleUpdates(raw, dependencies, overrides)) as typeof raw;
const explain = (id: string) => explainWbsItemDates(items, dependencies, overrides, id)!;

test('a task starts when its finish-to-start predecessor ends and spans the holiday', () => {
  const b = explain('b');
  assert.equal(b.kind, 'TASK');
  assert.deepEqual([b.startDate, b.dueDate], ['2026-10-12', '2026-10-15']);
  assert.equal(b.start.setBy, 'LINK');
  assert.deepEqual(b.start.links.map((link) => [link.code, link.type, link.date, link.binding]), [['1.1', 'FS', '2026-10-12', true]]);
  assert.equal(b.finish.setBy, 'DURATION');
  assert.equal(b.finish.durationWorkDays, 3);
  assert.deepEqual(b.finish.daysOff, { count: 1, weekends: 0, other: 1, listed: [{ date: '2026-10-13', weekend: false, description: 'Праздник' }] });
  assert.equal(b.consistent, true);
});

test('a start-to-start link with a lag, and a row without links set by hand', () => {
  const c = explain('c');
  assert.deepEqual(c.start.links.map((link) => [link.type, link.lagDays, link.date, link.binding]), [['SS', 2, '2026-10-07', true]]);
  const a = explain('a');
  assert.equal(a.start.setBy, 'MANUAL');
  assert.deepEqual(a.finish.daysOff, { count: 0, weekends: 0, other: 0, listed: [] });
});

test('a milestone follows its link; a phase follows its earliest and latest children', () => {
  const m = explain('m');
  assert.deepEqual([m.kind, m.dueDate, m.start.setBy, m.consistent], ['CHECKPOINT', '2026-10-16', 'LINK', true]);
  const p = explain('p');
  assert.equal(p.kind, 'SUMMARY');
  assert.deepEqual([p.children?.earliest?.code, p.children?.latest?.code], ['1.1', '1.2']);
  assert.equal(p.consistent, true);
});

test('saved dates that the links would move are reported as not recalculated', () => {
  const stale = items.map((row) => (row.id === 'b' ? { ...row, startDate: day('2026-10-06'), dueDate: day('2026-10-08') } : row));
  const b = explainWbsItemDates(stale, dependencies, overrides, 'b')!;
  assert.equal(b.consistent, false);
  assert.equal(b.start.links[0].binding, false);
  assert.equal(explainWbsItemDates(items, dependencies, overrides, 'missing'), null);
});

test('a linked row without saved dates is not consistent, and a holiday of another calendar is not named', () => {
  const blank = items.map((row) => (row.id === 'b' ? { ...row, startDate: null, dueDate: null } : row));
  assert.equal(explainWbsItemDates(blank, dependencies, overrides, 'b')!.consistent, false);
  const cnOnly = [{ calendarCode: 'CN' as const, date: day('2026-10-14'), isWorkingDay: false, description: 'Китайский праздник' }];
  const b = explainWbsItemDates(items, dependencies, [...overrides, ...cnOnly], 'b')!;
  assert.deepEqual(b.finish.daysOff.listed.map((entry) => entry.description), ['Праздник']);
});
