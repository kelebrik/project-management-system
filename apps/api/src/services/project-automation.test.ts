import assert from 'node:assert/strict';
import test from 'node:test';
import type { Issue, JiraIssueSnapshot, WbsDependency, WbsItem } from '@prisma/client';
import { predecessorGraph, projectInsights, scheduleScenario } from './project-automation.js';
import { commandChanges, journalChange } from './weekly-brief.js';
import { parseMeetingNotes } from '@pms/shared';

const now = new Date('2026-09-08T12:00:00Z');
function work(id: string, patch: Partial<WbsItem> = {}): WbsItem {
  return { id, code: id, title: id, parentId: null, type: 'TASK', status: 'NOT_STARTED', owner: 'Анна',
    startDate: new Date('2026-09-07'), dueDate: new Date('2026-09-08'), forecastStartDate: new Date('2026-09-07'), forecastDueDate: new Date('2026-09-08'),
    predecessor1: null, predecessor2: null, predecessor3: null, predecessor4: null, predecessor5: null, predecessor6: null,
    workDays: 2, calendarDays: 2, calendarCode: 'RU', leadLagDays: 0, sortOrder: 1, updatedAt: now, ...patch } as WbsItem;
}
const edge = (from: string, to: string): WbsDependency => ({ id: `${from}-${to}`, predecessorId: from, successorId: to, type: 'FS', lagDays: 0 } as WbsDependency);
function insights(items: WbsItem[], dependencies: WbsDependency[] = [], snapshots: JiraIssueSnapshot[] = [], issues: Issue[] = []) {
  return projectInsights({ code: 'TV', items, dependencies, snapshots, issues, risks: [], milestones: [] }, now);
}

test('readiness follows field predecessors ahead of dependency rows and reports dangling links', () => {
  const items = [work('done', { status: 'DONE' }), work('pending'), work('goal', { type: 'GOAL', predecessor1: 'done' })];
  const result = insights(items, [edge('pending', 'goal')]);
  assert.equal(result.readiness[0].state, 'ready');
  assert.deepEqual(result.readiness[0].remaining, []);
  const unknown = insights([work('goal', { type: 'GOAL', predecessor1: 'missing' })]);
  assert.equal(unknown.readiness[0].state, 'unknown');
  assert.match(unknown.readiness[0].warnings.join(' '), /missing/);
});

test('readiness includes unresolved issue linked to upstream work and handles cycles', () => {
  const items = [work('a', { status: 'DONE' }), work('g', { type: 'MILESTONE', predecessor1: 'a' })];
  const result = insights(items, [], [], [{ id: 'issue', workPackageId: 'a', title: 'Поставка', status: 'Open' } as Issue]);
  assert.equal(result.readiness[0].state, 'blocked');
  assert.equal(result.readiness[0].blockers[0].id, 'issue');
  const cycle = insights([work('a', { predecessor1: 'g' }), work('g', { type: 'GOAL', predecessor1: 'a' })]);
  assert.match(cycle.readiness[0].warnings.join(' '), /Цикл/);
});

test('reconciliation uses only current fresh snapshots and never guesses unknown statuses', () => {
  const item = work('a', { jiraTicketKey: 'TV-1' });
  const snapshot = { issueKey: 'TV-1', status: 'Done', assignee: 'Иван', syncedAt: now, updatedAt: now, retiredAt: null } as JiraIssueSnapshot;
  const row = insights([item], [], [snapshot]).reconciliation[0];
  assert.equal(row.proposedStatus, 'DONE'); assert.equal(row.proposedOwner, 'Иван'); assert.equal(row.actionable, true);
  assert.equal(insights([item], [], [{ ...snapshot, retiredAt: now }]).reconciliation[0].actionable, false);
  assert.equal(insights([item], [], [{ ...snapshot, status: 'CUSTOM FLOW' }]).reconciliation[0].proposedStatus, null);
  assert.equal(insights([item], [], [{ ...snapshot, syncedAt: new Date('2026-09-01') }]).reconciliation[0].actionable, false);
});

test('scenario merges changed rows, propagates duration and leaves source untouched', () => {
  const items = [work('a'), work('b', { predecessor1: 'a', sortOrder: 2 })];
  const saved = JSON.stringify(items);
  const result = scheduleScenario('TV', items, [], [], [{ id: 'a', workDays: 5 }]);
  assert.equal(JSON.stringify(items), saved);
  assert.ok(result.changes.some((row) => row.id === 'a'));
  assert.ok(result.changes.some((row) => row.id === 'b'));
  assert.notEqual(result.beforeFinish, result.afterFinish);
  const unchanged = scheduleScenario('TV', items, [], [], []);
  assert.equal(unchanged.changes.length, 0);
  assert.equal(unchanged.schedule.items.length, items.length);
  for (const change of result.changes) {
    assert.deepEqual(result.schedule.items.find((item) => item.id === change.id), { id: change.id, startDate: change.afterStart, dueDate: change.afterFinish });
  }
  assert.ok(result.schedule.floatById.length > 0);
});

test('scenario rejects cycles and checkpoint overrides', () => {
  assert.throws(() => scheduleScenario('TV', [work('a', { predecessor1: 'b' }), work('b', { predecessor1: 'a' })], [], [], []), /цикл/);
  assert.throws(() => scheduleScenario('TV', [work('g', { type: 'GOAL' })], [], [], [{ id: 'g', workDays: 5 }]), /конечных работ/);
  assert.deepEqual(predecessorGraph([work('a')], []).predecessors.get('a'), []);
});

test('brief extracts allowlisted WBS deltas and never returns configuration fields', () => {
  const changes = commandChanges({ id: 'c', projectId: 'p', type: 'UPDATE', createdAt: now, payload: {}, beforeSnapshot: { id: 'w', title: 'Плата', dueDate: '2026-09-10', password: 'old-secret' }, afterSnapshot: { id: 'w', title: 'Плата', dueDate: '2026-09-15', password: 'new-secret' } }, 'TV', { name: 'Анна' });
  assert.equal(changes.length, 1); assert.equal(changes[0].fieldKey, 'WbsItem.dueDate');
  assert.deepEqual(changes[0].after, { text: '2026-09-15' });
  assert.doesNotMatch(JSON.stringify(changes), /secret/);
  assert.equal(journalChange({ id: 'e', projectId: 'p', objectId: 'w', objectType: 'Project', field: 'password', oldText: 'secret', newText: 'new-secret', createdAt: now }, 'TV', { name: 'Анна' }, { text: 'Проект' }), null);
});

test('brief reports identifiers instead of display text so the web can localize it', () => {
  const change = journalChange({ id: 'e', projectId: 'p', objectId: 'i', objectType: 'Issue', field: 'status', oldText: 'Open', newText: null, createdAt: now }, 'TV', { token: 'unknown' }, { token: 'deletedIssue' });
  assert.ok(change);
  assert.equal(change.fieldKey, 'Issue.status');
  assert.deepEqual(change.before, { text: 'Open' });
  assert.deepEqual(change.after, { token: 'empty' });
  assert.deepEqual(change.actor, { token: 'unknown' });
  assert.deepEqual(change.title, { token: 'deletedIssue' });
});

test('meeting parser keeps missing fields blank, validates dates, preserves evidence and caps rows', () => {
  const rows = parseMeetingNotes('Задача: Проверить плату; Ответственный: Анна; Срок: 20.09.2026\nРиск: Задержка поставки\nВопрос: Уточнить; Срок: 2026-02-31');
  assert.deepEqual(rows.map((row) => row.kind), ['TASK', 'RISK', 'ISSUE']);
  assert.equal(rows[0].title, 'Проверить плату'); assert.equal(rows[0].owner, 'Анна'); assert.equal(rows[0].dueDate, '2026-09-20');
  assert.equal(rows[1].owner, ''); assert.equal(rows[1].dueDate, ''); assert.equal(rows[2].dueDate, '');
  assert.match(rows[0].source, /Ответственный/);
  assert.equal(parseMeetingNotes(Array(30).fill('Задача: Проверить').join('\n')).length, 20);
});


test('brief distinguishes creation/deletion from one-sided whole-plan snapshots', () => {
  const base = { id: 'c', projectId: 'p', createdAt: now, beforeSnapshot: null, afterSnapshot: null, payload: {} };
  const a = { id: 'a', title: 'Existing' }; const b = { id: 'b', title: 'New' };
  assert.deepEqual(commandChanges({ ...base, type: 'CREATE', payload: { item: b, itemId: 'b' } }, 'TV', { name: 'A' })[0].title, { text: 'New' });
  assert.equal(commandChanges({ ...base, type: 'CREATE', payload: { insertedItemId: 'b' }, afterSnapshot: { wbsItems: [a, b] } }, 'TV', { name: 'A' }).length, 1);
  const deleted = commandChanges({ ...base, type: 'DELETE', beforeSnapshot: [b], afterSnapshot: { wbsItems: [a] } }, 'TV', { name: 'A' });
  assert.equal(deleted.length, 1); assert.deepEqual(deleted[0].after, { token: 'deleted' });
  for (const type of ['MOVE', 'BASELINE', 'BULK_UPDATE', 'RESTORE', 'UPDATE']) {
    assert.deepEqual(commandChanges({ ...base, type, afterSnapshot: { wbsItems: [a, b] } }, 'TV', { name: 'A' }), []);
  }
});


test('scenario start constraint shifts linked work and downstream work without resizing', () => {
  const items = [work('a'), work('b', { predecessor1: 'a', sortOrder: 2 }), work('c', { predecessor1: 'b', sortOrder: 3 })];
  const result = scheduleScenario('TV', items, [], [], [{ id: 'b', startDate: '2026-09-21' }]);
  const shifted = result.changes.find((row) => row.id === 'b')!;
  assert.equal(shifted.afterStart, '2026-09-21'); assert.equal(shifted.afterFinish, '2026-09-22');
  assert.ok(result.changes.some((row) => row.id === 'c'));
  assert.ok(!result.warnings.some((value) => value.includes('устойчивого')));
  const resized = scheduleScenario('TV', items, [], [], [{ id: 'b', dueDate: '2026-09-25' }]);
  assert.equal(resized.changes.find((row) => row.id === 'b')?.afterFinish, '2026-09-25');
});

test('scenario warns on unresolved references and fingerprints only scheduling data', () => {
  const items = [work('a'), work('b', { predecessor1: 'missing' })];
  const original = scheduleScenario('TV', items, [], [], []);
  assert.match(original.warnings.join(' '), /missing/);
  const renamed = scheduleScenario('TV', items.map((item) => ({ ...item, title: 'Renamed', owner: 'Other', updatedAt: new Date(0) })), [], [], []);
  assert.equal(original.fingerprint, renamed.fingerprint);
});

test('dependency records never masquerade as WBS existence changes', () => {
  const command = { id: 'c', projectId: 'p', createdAt: now, type: 'UPDATE', payload: { action: 'move-dependency' }, beforeSnapshot: { id: 'dependency', predecessorId: 'a', successorId: 'b' }, afterSnapshot: { wbsItems: [{ id: 'a', title: 'Work' }] } };
  assert.deepEqual(commandChanges(command, 'TV', { name: 'A' }), []);
});
