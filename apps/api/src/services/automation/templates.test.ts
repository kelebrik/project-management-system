import assert from 'node:assert/strict';
import test from 'node:test';
import { blockerEvents, exhaustedFloat, jiraDoneEvents, listed, newlyExhausted, shiftEvents, type ShiftSource } from './templates.js';
import { localMoment, localWeekStart } from './time.js';

const shift = (id: string, checkpointId: string, deltaDays: number | null, createdAt: string, kind = 'SHIFT'): ShiftSource => ({
  id,
  kind,
  checkpointId,
  checkpointCode: '2.1',
  checkpointTitle: 'Веха',
  deltaDays,
  newDate: null,
  baselineDate: null,
  reasonCategory: null,
  createdAt: new Date(createdAt),
});

test('local time follows the zone, not the server', () => {
  assert.deepEqual(localMoment(new Date('2026-10-02T09:30:00Z'), 'Europe/Moscow'), { date: '2026-10-02', weekday: 5, hour: 12 });
  assert.deepEqual(localMoment(new Date('2026-10-01T22:30:00Z'), 'Europe/Moscow'), { date: '2026-10-02', weekday: 5, hour: 1 });
  assert.equal(localWeekStart('2026-10-04'), '2026-09-28');
  assert.equal(localWeekStart('2026-10-05'), '2026-10-05');
});

test('a checkpoint moved later fires once a local day, for its biggest move', () => {
  const day = (at: Date) => localMoment(at, 'Europe/Moscow').date;
  const events = shiftEvents(
    [shift('a', 'm1', 2, '2026-10-01T08:00:00Z'), shift('b', 'm1', 5, '2026-10-01T09:00:00Z'), shift('c', 'm1', 4, '2026-10-01T22:00:00Z'), shift('d', 'm2', -7, '2026-10-01T08:00:00Z'), shift('e', 'm3', 9, '2026-10-01T08:00:00Z', 'BASELINE')],
    3,
    day,
  );
  assert.deepEqual(events.map((event) => [event.dedupeKey, event.shift.id]), [['shift:m1:2026-10-01', 'b'], ['shift:m1:2026-10-02', 'c']]);
});

test('check-ins that are off track or name a blocker become events, one per row, person and week', () => {
  const base = { id: 'x', wbsItemId: 'w', userId: 'u', personName: 'Петров', weekStart: new Date('2026-09-28T00:00:00Z') };
  const events = blockerEvents([
    { ...base, confidence: 'OFF_TRACK', blocker: '' },
    { ...base, wbsItemId: 'w2', confidence: 'ON_TRACK', blocker: 'Нет стенда' },
    { ...base, wbsItemId: 'w3', confidence: 'AT_RISK', blocker: '  ' },
  ]);
  assert.deepEqual(events.map((event) => event.dedupeKey), ['checkin:w:u:2026-09-28', 'checkin:w2:u:2026-09-28']);
});

test('float: the first look remembers, later looks report only rows that newly ran out', () => {
  const rows = exhaustedFloat([
    { id: 'a', code: '1', title: 'Фаза', type: 'PHASE', status: 'IN_PROGRESS', totalFloatWorkDays: 0 },
    { id: 'b', code: '1.1', title: 'Задача', type: 'TASK', status: 'IN_PROGRESS', totalFloatWorkDays: 0 },
    { id: 'c', code: '1.2', title: 'Готово', type: 'TASK', status: 'DONE', totalFloatWorkDays: -2 },
    { id: 'd', code: '1.3', title: 'Запас', type: 'TASK', status: 'NOT_STARTED', totalFloatWorkDays: 3 },
    { id: 'e', code: '1.4', title: 'Опоздание', type: 'MILESTONE', status: 'NOT_STARTED', totalFloatWorkDays: -1 },
  ]);
  assert.deepEqual(rows.map((row) => row.id), ['b', 'e']);
  assert.deepEqual(newlyExhausted(undefined, rows), { fresh: [], ids: ['b', 'e'] });
  assert.deepEqual(newlyExhausted(['b'], rows).fresh.map((row) => row.id), ['e']);
});

test('Jira done proposals come from actionable rows only, once per ticket version', () => {
  const row = { id: 'w', code: '1.1', title: 'Задача', jiraKey: 'TV-1', proposedStatus: 'DONE', actionable: true, expectedUpdatedAt: 'a', expectedJiraUpdatedAt: '2026-10-01T00:00:00.000Z' };
  assert.deepEqual(
    jiraDoneEvents([row, { ...row, id: 'x', actionable: false }, { ...row, id: 'y', proposedStatus: 'IN_PROGRESS' }]).map((event) => event.dedupeKey),
    ['jira:w:2026-10-01T00:00:00.000Z'],
  );
  assert.deepEqual(listed(Array.from({ length: 12 }, (_, index) => index)), { rows: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], more: 2 });
});
