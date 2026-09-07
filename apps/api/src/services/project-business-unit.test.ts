import assert from 'node:assert/strict';
import test from 'node:test';

import { projectBusinessUnitFields } from './project-business-unit.js';

test('project business-unit fields derive the portfolio from the business-unit name', () => {
  assert.deepEqual(
    projectBusinessUnitFields({ id: 'tv-box', name: 'TV&Box' }),
    { businessUnitId: 'tv-box', portfolio: 'TV&Box' },
  );
});
