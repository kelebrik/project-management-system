import assert from 'node:assert/strict';
import test from 'node:test';
import { missingCheckIns, selectMyWork, weekStartOf } from './my-work.js';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const item = (id: string, owner: string, startDate: string | null, dueDate: string | null, status = 'IN_PROGRESS') => ({
  id,
  projectId: 'p',
  code: id,
  title: `Работа ${id}`,
  owner,
  status,
  startDate: startDate ? day(startDate) : null,
  dueDate: dueDate ? day(dueDate) : null,
  project: { code: 'TV', name: 'Телевизор' },
});

test('weeks start on Monday in the teams\' time zone', () => {
  // 23:30 UTC on Sunday is already 02:30 on Monday in Moscow.
  assert.equal(weekStartOf(new Date('2026-10-04T23:30:00Z'), 'Europe/Moscow').toISOString().slice(0, 10), '2026-10-05');
  assert.equal(weekStartOf(new Date('2026-10-04T20:00:00Z'), 'Europe/Moscow').toISOString().slice(0, 10), '2026-09-28');
  assert.equal(weekStartOf(new Date('2026-10-04T23:30:00Z'), 'UTC').toISOString().slice(0, 10), '2026-09-28');
  assert.equal(weekStartOf(new Date('2026-10-04T11:00:00Z'), 'Pacific/Kiritimati').toISOString().slice(0, 10), '2026-10-05');
});

test('my work is my unfinished rows, overdue or within four weeks, soonest first, whatever the spelling', () => {
  const now = new Date('2026-10-01T10:00:00Z');
  const rows = selectMyWork(
    [
      item('late', 'Алёна Зуева', '2026-09-01', '2026-09-20'),
      item('soon', 'алена  зуева', '2026-10-20', '2026-10-25'),
      item('far', 'Алёна Зуева', '2026-12-01', '2026-12-10'),
      item('due-soon', 'Алёна Зуева', '2026-12-01', '2026-10-10'),
      item('done', 'Алёна Зуева', '2026-09-01', '2026-09-05', 'DONE'),
      item('other', 'Петров', '2026-10-02', '2026-10-03'),
    ],
    'Алена Зуева',
    now,
  );
  assert.deepEqual(rows.map((row) => [row.id, row.overdue]), [['late', true], ['due-soon', false], ['soon', false]]);
});

test('people with work but no check-in this week are listed once', () => {
  assert.deepEqual(missingCheckIns(['Петров', 'Алёна Зуева', 'петров', 'Сидоров'], ['алена зуева']), ['Петров', 'Сидоров']);
});
