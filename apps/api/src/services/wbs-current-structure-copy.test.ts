import assert from 'node:assert/strict';
import test from 'node:test';

import { selectCurrentStructureItems } from './wbs-current-structure-copy.js';

const items = [
  { id: 'phase-1', parentId: null, type: 'PHASE', title: 'Фаза 1' },
  { id: 'task-1', parentId: 'phase-1', type: 'TASK', title: 'Задача 1' },
  { id: 'phase-1-1', parentId: 'phase-1', type: 'PHASE', title: 'Подфаза' },
  { id: 'task-1-1', parentId: 'phase-1-1', type: 'TASK', title: 'Задача 1.1' },
  { id: 'phase-2', parentId: null, type: 'PHASE', title: 'Фаза 2' },
  { id: 'task-2', parentId: 'phase-2', type: 'TASK', title: 'Задача 2' },
];

test('selected current phase includes its complete subtree with relative levels', () => {
  assert.deepEqual(
    selectCurrentStructureItems(items, ['phase-1']).map(({ item, level }) => [
      item.id,
      level,
    ]),
    [
      ['phase-1', 1],
      ['task-1', 2],
      ['phase-1-1', 2],
      ['task-1-1', 3],
    ],
  );
});

test('nested selected phases are copied once under their selected ancestor', () => {
  assert.deepEqual(
    selectCurrentStructureItems(items, ['phase-1', 'phase-1-1']).map(
      ({ item }) => item.id,
    ),
    ['phase-1', 'task-1', 'phase-1-1', 'task-1-1'],
  );
});

test('whole current project copies every root and descendant in source order', () => {
  assert.deepEqual(
    selectCurrentStructureItems(items, null).map(({ item, level }) => [
      item.id,
      level,
    ]),
    [
      ['phase-1', 1],
      ['task-1', 2],
      ['phase-1-1', 2],
      ['task-1-1', 3],
      ['phase-2', 1],
      ['task-2', 2],
    ],
  );
});

test('selection rejects missing, non-phase and duplicate phase ids', () => {
  assert.throws(() => selectCurrentStructureItems(items, ['missing']), /не найдена/);
  assert.throws(() => selectCurrentStructureItems(items, ['task-1']), /не найдена/);
  assert.throws(
    () => selectCurrentStructureItems(items, ['phase-1', 'phase-1']),
    /несколько раз/,
  );
});
