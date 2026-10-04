import assert from 'node:assert/strict';
import test from 'node:test';

import { projectInclude } from './includes.js';

test('project list counts the complete WBS independently of its filtered preview', () => {
  assert.equal(projectInclude._count.select.wbsItems, true);
});
