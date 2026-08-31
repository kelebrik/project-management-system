import assert from 'node:assert/strict';
import test from 'node:test';

import { invalidIssueLinkedWbsReorder } from './item-order.routes.js';

const linkedIssue = {
  title: 'Вопрос выпуска',
  phaseId: 'phase-1',
  workPackageId: 'package-1',
};

function item(id: string, type: string, level: number) {
  return { id, type, wbsLevel: level, code: String(level) };
}

test('unrelated WBS drag may cross a linked work package while preserving its phase', () => {
  const items = [
    item('phase-1', 'PHASE', 1),
    item('package-1', 'WORK_PACKAGE', 2),
    item('phase-2', 'PHASE', 1),
    item('task-2', 'TASK', 2),
  ];

  assert.equal(invalidIssueLinkedWbsReorder(
    items,
    ['task-2', 'phase-1', 'package-1', 'phase-2'],
    undefined,
    undefined,
    [linkedIssue],
  ), undefined);
});

test('WBS reorder rejects an indirect reparenting of a linked work package', () => {
  const items = [
    item('phase-1', 'PHASE', 1),
    item('task-1', 'TASK', 2),
    item('package-1', 'WORK_PACKAGE', 2),
  ];

  assert.equal(invalidIssueLinkedWbsReorder(
    items,
    items.map((candidate) => candidate.id),
    { 'task-1': 1 },
    undefined,
    [linkedIssue],
  )?.title, linkedIssue.title);
});

test('WBS reorder rejects type and level changes for linked phase/package rows', () => {
  const items = [
    item('phase-1', 'PHASE', 1),
    item('package-1', 'WORK_PACKAGE', 2),
  ];
  const ids = items.map((candidate) => candidate.id);

  assert.equal(invalidIssueLinkedWbsReorder(
    items,
    ids,
    { 'phase-1': 2 },
    undefined,
    [linkedIssue],
  )?.title, linkedIssue.title);
  assert.equal(invalidIssueLinkedWbsReorder(
    items,
    ids,
    undefined,
    { 'package-1': 'TASK' },
    [linkedIssue],
  )?.title, linkedIssue.title);
});
