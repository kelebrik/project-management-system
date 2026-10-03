import assert from 'node:assert/strict';
import test from 'node:test';
import { wbsPatchAffectsSchedule } from './schedule-relevance.js';

test('editing text, links, the owner or cost does not recalculate the schedule; dates, status and links between rows do', () => {
  assert.equal(wbsPatchAffectsSchedule({ title: 'Новое название' }), false);
  assert.equal(wbsPatchAffectsSchedule({ owner: 'Анна', comment: 'ждём плату', jiraTicketUrl: null }), false);
  assert.equal(wbsPatchAffectsSchedule({ title: 'x', dueDate: '2026-10-20' }), true);
  assert.equal(wbsPatchAffectsSchedule({ status: 'DONE' }), true);
  assert.equal(wbsPatchAffectsSchedule({ predecessor1: '1.2' }), true);
  assert.equal(wbsPatchAffectsSchedule({ calendarCode: 'CN' }), true);
  assert.equal(wbsPatchAffectsSchedule({ progress: 50 }), true);
  assert.equal(wbsPatchAffectsSchedule({ title: undefined }), false);
});
