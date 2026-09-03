import assert from 'node:assert/strict';
import test from 'node:test';

import { portfolioRoadmapProjectSelect } from './includes.js';

test('portfolio roadmap query includes scheduled rows from every WBS hierarchy level', () => {
  assert.equal(
    JSON.stringify(portfolioRoadmapProjectSelect.wbsItems.where).includes('type'),
    false,
  );
  assert.deepEqual(portfolioRoadmapProjectSelect.wbsItems.where, {
    OR: [
      { startDate: { not: null } },
      { dueDate: { not: null } },
      { forecastStartDate: { not: null } },
      { forecastDueDate: { not: null } },
    ],
  });
  assert.deepEqual(Object.keys(portfolioRoadmapProjectSelect.wbsItems.select).sort(), [
    'code',
    'dueDate',
    'forecastDueDate',
    'forecastStartDate',
    'id',
    'parentId',
    'progress',
    'startDate',
    'status',
    'title',
    'type',
  ]);
});
