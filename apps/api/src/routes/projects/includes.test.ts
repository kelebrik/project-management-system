import assert from 'node:assert/strict';
import test from 'node:test';

import { portfolioRoadmapProjectSelect } from './includes.js';

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
