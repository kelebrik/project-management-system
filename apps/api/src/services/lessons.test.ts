import assert from 'node:assert/strict';
import test from 'node:test';
import { draftLessons } from './lessons.js';

const facts = {
  goal: { code: '3', title: 'Запуск', varianceDays: 12, unexplainedDays: 2, reasonDays: { SUPPLIER: 5, NONE: 3, ESTIMATE: 2 } },
  problems: [{ id: 'p1', title: 'Нет стенда', status: 'CLOSED', mitigationPlan: 'Арендовали', contingencyPlan: null }],
  breachedRisks: [{ id: 'r1', title: 'Срыв поставки', mitigationPlan: null }],
  criticalIssues: [
    { id: 'i1', title: 'Кто платит', severity: 'CRITICAL', closedDelayDays: 4 },
    { id: 'i2', title: 'Вовремя', severity: 'HIGH', closedDelayDays: null },
  ],
  decisions: [{ id: 'd1', title: 'Доставка', decision: 'Платит заказчик' }],
};

test('the draft names every source: goal moves by reason, problems, risks, issues and decisions', () => {
  const drafts = draftLessons(facts, new Set());
  assert.deepEqual(drafts.map((draft) => [draft.sourceRef, draft.category]), [
    ['shift:SUPPLIER', 'SUPPLIER'],
    ['shift:NONE', 'OTHER'],
    ['shift:ESTIMATE', 'ESTIMATE'],
    ['shift:BEFORE', 'OTHER'],
    ['raid:p1', 'OTHER'],
    ['raid:r1', 'TECHNICAL'],
    ['issue:i1', 'OTHER'],
    ['decision:d1', 'GOOD_PRACTICE'],
  ]);
  assert.equal(drafts[0].title, 'Сдвиг цели «3 Запуск»: 5 дн.');
  assert.match(drafts[1].recommendation, /Называть причину/);
  assert.equal(drafts[4].text, 'Что делали: Арендовали');
  assert.match(drafts[6].text, /4 календ/);
});

test('drafts already saved as lessons are not offered again', () => {
  const drafts = draftLessons(facts, new Set(['shift:SUPPLIER', 'decision:d1']));
  assert.equal(drafts.some((draft) => draft.sourceRef === 'shift:SUPPLIER' || draft.sourceRef === 'decision:d1'), false);
  assert.deepEqual(draftLessons({ goal: null, problems: [], breachedRisks: [], criticalIssues: [], decisions: [] }, new Set()), []);
});

test('the draft speaks the page language', () => {
  const [first] = draftLessons(facts, new Set(), 'en');
  assert.equal(first.title, 'Goal "3 Запуск" moved: 5 days');
});
