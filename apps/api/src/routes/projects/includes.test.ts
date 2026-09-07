import assert from 'node:assert/strict';
import test from 'node:test';

import { portfolioRoadmapProjectSelect, projectInclude } from './includes.js';

test('project list counts the complete WBS independently of its filtered preview', () => {
  assert.equal(projectInclude._count.select.wbsItems, true);
});

test('portfolio roadmap query includes the complete WBS hierarchy for work-group rollups', () => {
  assert.equal(
    'where' in portfolioRoadmapProjectSelect.wbsItems,
    false,
  );
  assert.deepEqual(Object.keys(portfolioRoadmapProjectSelect.wbsItems.select).sort(), [
    'code',
    'dueDate',
    'forecastDueDate',
    'forecastStartDate',
    'id',
    'parentId',
    'progress',
    'sortOrder',
    'startDate',
    'status',
    'title',
    'type',
  ]);
});
