import assert from 'node:assert/strict';
import test from 'node:test';
import { historyDayEnd, historyDayKey, isPastHistoryDay } from './project-history.js';
import { compareRows, stateFromJournal, structureFromCommands } from './project-history-read.js';

test('days are Moscow days: 21:00 UTC is already the next day there', () => {
  assert.equal(historyDayKey(new Date('2026-10-09T20:59:59.000Z')), '2026-10-09');
  assert.equal(historyDayKey(new Date('2026-10-09T21:00:00.000Z')), '2026-10-10');
  assert.equal(historyDayEnd('2026-10-09').toISOString(), '2026-10-09T20:59:59.999Z');
});

const end = new Date('2026-10-05T20:59:59.999Z');
const event = (action: string, at: string, beforeValue: unknown, afterValue: unknown) => ({ objectId: 'x', action, createdAt: new Date(at), beforeValue, afterValue });

test('an object at the end of a day comes from its journal, or from its row only when provably unchanged', () => {
  const current = { id: 'x', title: 'now', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z' };
  // The last change by then wins.
  assert.deepEqual(stateFromJournal([event('raid_item.update', '2026-10-04T10:00:00Z', { title: 'a' }, { title: 'b' }), event('raid_item.update', '2026-10-07T10:00:00Z', { title: 'b' }, { title: 'now' })], current, end), { state: { title: 'b' }, known: true });
  // No change by then: the state before the first change after.
  assert.deepEqual(stateFromJournal([event('raid_item.update', '2026-10-07T10:00:00Z', { title: 'old' }, { title: 'now' })], current, end), { state: { title: 'old' }, known: true });
  // Created after the day, or deleted by then: not there.
  assert.deepEqual(stateFromJournal([event('raid_item.create', '2026-10-07T10:00:00Z', null, { title: 'now' })], current, end), { state: null, known: true });
  assert.deepEqual(stateFromJournal([event('raid_item.delete', '2026-10-03T10:00:00Z', { title: 'gone' }, null)], undefined, end), { state: null, known: true });
  // No journal: the row only if it was last updated by then; otherwise unknown, never guessed.
  assert.equal(stateFromJournal([], { ...current, updatedAt: '2026-10-02T00:00:00.000Z' }, end).state?.title, 'now');
  assert.deepEqual(stateFromJournal([], current, end), { state: null, known: false });
});

test('the structure is the last full snapshot by then plus the single and partial rows after it', () => {
  const commands = [
    { type: 'MOVE', createdAt: new Date('2026-10-01T10:00:00Z'), payload: {}, afterSnapshot: { wbsItems: [{ id: 'a', code: '1', title: 'A', dueDate: '2026-11-01T00:00:00.000Z' }, { id: 'b', code: '2', title: 'B' }], wbsDependencies: [{ predecessorId: 'a', successorId: 'b' }] } },
    { type: 'UPDATE', createdAt: new Date('2026-10-02T10:00:00Z'), payload: {}, afterSnapshot: { id: 'b', code: '2', title: 'B renamed' } },
    { type: 'BULK_UPDATE', createdAt: new Date('2026-10-03T10:00:00Z'), payload: { automaticSchedule: true }, afterSnapshot: [{ id: 'a', dueDate: '2026-11-05T00:00:00.000Z' }] },
    { type: 'CREATE', createdAt: new Date('2026-10-04T10:00:00Z'), payload: { item: { id: 'c', code: '3', title: 'C' } }, afterSnapshot: null },
    { type: 'UPDATE', createdAt: new Date('2026-10-07T10:00:00Z'), payload: {}, afterSnapshot: { id: 'a', title: 'after the day' } },
  ];
  const structure = structureFromCommands(commands, end)!;
  const byId = new Map(structure.rows.map((row) => [row.id, row]));
  assert.equal(byId.get('b')?.title, 'B renamed');
  assert.equal(byId.get('a')?.dueDate, '2026-11-05T00:00:00.000Z');
  assert.equal(byId.get('a')?.title, 'A');
  assert.ok(byId.has('c'));
  assert.equal(structure.dependencies.length, 1);
  assert.equal(structureFromCommands(commands.slice(1), end), null, 'no full snapshot by then: unknown');
});

test('rows compare by id: a reused code is a new row, changed fields are listed as days', () => {
  const comparison = compareRows(
    [{ id: 'a', code: '1', title: 'A', dueDate: '2026-11-01T00:00:00.000Z' }, { id: 'old', code: '2', title: 'Old' }],
    [{ id: 'a', code: '1', title: 'A', dueDate: '2026-11-05T00:00:00.000Z' }, { id: 'new', code: '2', title: 'New' }],
    ['code', 'title', 'dueDate'],
  );
  assert.deepEqual(comparison.changed, [{ id: 'a', label: '1 A', fields: [{ field: 'dueDate', then: '2026-11-01', now: '2026-11-05' }] }]);
  assert.deepEqual(comparison.added.map((row) => row.id), ['new']);
  assert.deepEqual(comparison.removed.map((row) => row.id), ['old']);
});

test('only real past calendar days are asked for', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  assert.equal(isPastHistoryDay('2026-10-09', now), true);
  assert.equal(isPastHistoryDay('2026-10-10', now), true);
  assert.equal(isPastHistoryDay('2026-10-11', now), false);
  assert.equal(isPastHistoryDay('2026-02-31', now), false);
  assert.equal(isPastHistoryDay('2026-13-01', now), false);
  assert.equal(isPastHistoryDay('10.10.2026', now), false);
});
