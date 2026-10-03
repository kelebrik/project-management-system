import assert from 'node:assert/strict';
import test from 'node:test';
import { sharedUiStateUpdate } from './crud.routes.js';

test('a project change keeps the old shared view fields and takes only shared content', () => {
  const current = { wbsColumnOrder: ['level', 'structure', 'owner'], ganttWbsWidth: 360, passportRows: [{ id: 'a' }] };
  const incoming = { wbsColumnOrder: ['level'], ganttWbsWidth: 500, passportRows: [{ id: 'b' }], milestoneLabelLayout: null };
  assert.deepEqual(sharedUiStateUpdate(current, incoming), {
    wbsColumnOrder: ['level', 'structure', 'owner'],
    ganttWbsWidth: 360,
    passportRows: [{ id: 'b' }],
    milestoneLabelLayout: null,
  });
  assert.deepEqual(sharedUiStateUpdate(null, { sidebarCollapsed: true }), {});
});
