import assert from 'node:assert/strict';
import test from 'node:test';
import { addDays, dueSoonWork, incompleteRisks, milestonesAtRisk, notSeenBefore, overdueIssues, pendingChanges, waitingDecisions } from './watch-templates.js';

const day = (value: string) => new Date(`${value}T09:00:00.000Z`);

test('a decision waiting for approval long enough fires once per request', () => {
  const rows = waitingDecisions(
    [
      { id: 'd1', title: 'Поставщик', status: 'PENDING_APPROVAL', approverUserId: 'u1', approverName: 'Мария', requestedAt: day('2026-10-01'), createdAt: day('2026-09-28') },
      { id: 'd2', title: 'Свежее', status: 'PENDING_APPROVAL', approverUserId: null, approverName: null, requestedAt: day('2026-10-03'), createdAt: day('2026-10-03') },
      { id: 'd3', title: 'Отвечено', status: 'APPROVED', approverUserId: null, approverName: null, requestedAt: day('2026-09-01'), createdAt: day('2026-09-01') },
    ],
    '2026-10-04',
    3,
  );
  assert.deepEqual(rows.map((row) => [row.decision.id, row.waited, row.dedupeKey]), [['d1', 3, 'decision:d1:2026-10-01']]);
});

test('risks without an owner or a date are picked, and only new ones after the first run', () => {
  const risks = incompleteRisks([
    { id: 'r1', title: 'Без владельца', type: 'RISK', status: 'OPEN', owner: ' ', dueDate: day('2026-11-01') },
    { id: 'r2', title: 'Без срока', type: 'RISK', status: 'OPEN', owner: 'Иван', dueDate: null },
    { id: 'r3', title: 'Полный', type: 'RISK', status: 'OPEN', owner: 'Иван', dueDate: day('2026-11-01') },
    { id: 'r4', title: 'Закрыт', type: 'RISK', status: 'CLOSED', owner: '', dueDate: null },
    { id: 'p1', title: 'Проблема', type: 'DEPENDENCY', status: 'OPEN', owner: '', dueDate: null },
  ]);
  assert.deepEqual(risks.map((risk) => risk.id), ['r1', 'r2']);
  assert.deepEqual(notSeenBefore(undefined, risks).fresh.map((risk) => risk.id), ['r1', 'r2']);
  assert.deepEqual(notSeenBefore(['r1'], risks).fresh.map((risk) => risk.id), ['r2']);
});

test('an issue past its date by more than the grace days fires once per date', () => {
  const issues = [
    { id: 'i1', title: 'Плата', status: 'Open', owner: 'Иван', dueDate: day('2026-10-01') },
    { id: 'i2', title: 'Закрыт', status: 'Done', owner: '', dueDate: day('2026-09-01') },
    { id: 'i3', title: 'Без срока', status: 'Open', owner: '', dueDate: null },
  ];
  assert.deepEqual(overdueIssues(issues, '2026-10-04', 0).map((row) => [row.issue.id, row.late, row.dedupeKey]), [['i1', 3, 'issue:i1:2026-10-01']]);
  assert.equal(overdueIssues(issues, '2026-10-04', 3).length, 0);
});

test('work not started and due within the next days is picked, today included', () => {
  const rows = dueSoonWork(
    [
      { id: 'w1', code: '1.1', title: 'Сегодня', status: 'NOT_STARTED', owner: 'Анна', dueDate: day('2026-10-04') },
      { id: 'w2', code: '1.2', title: 'Через 3 дня', status: 'NOT_STARTED', owner: 'Анна', dueDate: day('2026-10-07') },
      { id: 'w3', code: '1.3', title: 'Позже', status: 'NOT_STARTED', owner: 'Анна', dueDate: day('2026-10-10') },
      { id: 'w4', code: '1.4', title: 'Идёт', status: 'IN_PROGRESS', owner: 'Анна', dueDate: day('2026-10-05') },
    ],
    '2026-10-04',
    3,
  );
  assert.deepEqual(rows.map((row) => row.row.id), ['w1', 'w2']);
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
});

test('a milestone close ahead with work not started or behind is at risk', () => {
  const feeders: Record<string, Array<{ id: string; status: string; progress: number }>> = {
    m1: [{ id: 'a', status: 'NOT_STARTED', progress: 0 }, { id: 'b', status: 'DONE', progress: 100 }],
    m2: [{ id: 'c', status: 'IN_PROGRESS', progress: 80 }],
    m3: [{ id: 'd', status: 'IN_PROGRESS', progress: 10 }],
  };
  const rows = milestonesAtRisk(
    [
      { id: 'm1', code: '2', title: 'Образцы', type: 'MILESTONE', status: 'NOT_STARTED', dueDate: day('2026-10-08') },
      { id: 'm2', code: '3', title: 'Готово к сроку', type: 'MILESTONE', status: 'NOT_STARTED', dueDate: day('2026-10-09') },
      { id: 'm3', code: '4', title: 'Далеко', type: 'GOAL', status: 'NOT_STARTED', dueDate: day('2026-12-01') },
    ],
    (id) => feeders[id] ?? [],
    '2026-10-04',
    7,
    50,
  );
  assert.deepEqual(rows.map((row) => [row.milestone.id, row.lagging, row.dedupeKey]), [['m1', 1, 'milestone:m1:2026-10-08']]);
});

test('a change request left open and untouched fires once per status', () => {
  const rows = pendingChanges(
    [
      { id: 'c1', title: 'Новый срок', status: 'SUBMITTED', updatedAt: day('2026-09-25') },
      { id: 'c2', title: 'Свежий', status: 'DRAFT', updatedAt: day('2026-10-03') },
      { id: 'c3', title: 'Одобрен', status: 'APPROVED', updatedAt: day('2026-09-01') },
    ],
    '2026-10-04',
    5,
  );
  assert.deepEqual(rows.map((row) => [row.change.id, row.idle, row.dedupeKey]), [['c1', 9, 'change:c1:SUBMITTED']]);
});
