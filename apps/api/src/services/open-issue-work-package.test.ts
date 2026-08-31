import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWbsRenumberPlan } from './wbs-ordering.js';
import {
  buildIssueWorkPackageOrder,
  planIssueWorkPackagePlacement,
} from './open-issue-work-package.js';

const createdAt = new Date('2026-08-31T00:00:00.000Z');

function item(
  id: string,
  type: 'PHASE' | 'WORK_PACKAGE' | 'MILESTONE' | 'GOAL' | 'TASK',
  sortOrder: number,
  wbsLevel: number,
  parentId: string | null,
) {
  return { id, type, sortOrder, wbsLevel, parentId, code: String(sortOrder), createdAt };
}

test('issue work package is placed before the last direct phase milestone or goal', () => {
  const result = planIssueWorkPackagePlacement([
    item('phase', 'PHASE', 10, 1, null),
    item('task-1', 'TASK', 20, 2, 'phase'),
    item('goal-1', 'GOAL', 30, 2, 'phase'),
    item('task-2', 'TASK', 40, 2, 'phase'),
    item('milestone-2', 'MILESTONE', 50, 2, 'phase'),
    item('next-phase', 'PHASE', 60, 1, null),
  ], 'phase');

  assert.equal(result.insertIndex, 4);
  assert.equal(result.level, 2);
  assert.equal(result.orderedItems[result.insertIndex]?.id, 'milestone-2');
});

test('issue work package is placed at phase end when no milestone or goal exists', () => {
  const result = planIssueWorkPackagePlacement([
    item('phase', 'PHASE', 10, 1, null),
    item('package', 'WORK_PACKAGE', 20, 2, 'phase'),
    item('nested-task', 'TASK', 30, 3, 'package'),
    item('next-phase', 'PHASE', 40, 1, null),
  ], 'phase');

  assert.equal(result.insertIndex, 3);
  assert.equal(result.orderedItems[result.insertIndex]?.id, 'next-phase');
});

test('moving work package is removed before target position is calculated', () => {
  const result = planIssueWorkPackagePlacement([
    item('phase-a', 'PHASE', 10, 1, null),
    item('moving', 'WORK_PACKAGE', 20, 2, 'phase-a'),
    item('moving-task', 'TASK', 30, 3, 'moving'),
    item('phase-b', 'PHASE', 40, 1, null),
    item('goal-b', 'GOAL', 50, 2, 'phase-b'),
  ], 'phase-b', 'moving');

  assert.deepEqual(result.orderedItems.map((candidate) => candidate.id), [
    'phase-a',
    'phase-b',
    'goal-b',
  ]);
  assert.deepEqual(result.movingSubtree.map((candidate) => candidate.id), [
    'moving',
    'moving-task',
  ]);
  assert.equal(result.insertIndex, 2);

  const nextOrder = buildIssueWorkPackageOrder(
    result,
    'phase-b',
    result.movingSubtree[0],
  );
  assert.deepEqual(nextOrder.map((candidate) => candidate.id), [
    'phase-a',
    'phase-b',
    'moving',
    'moving-task',
    'goal-b',
  ]);
  const renumbered = buildWbsRenumberPlan(nextOrder);
  const movedTask = renumbered.normalizedRows.find((row) => row.id === 'moving-task');
  assert.equal(movedTask?.parentId, 'moving');
  assert.equal(movedTask?.level, 3);
});
