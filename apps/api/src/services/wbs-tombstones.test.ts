import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeWbsTombstoneCalendarCode } from './wbs-tombstones.js';

test('WBS tombstone restore preserves the combined calendar', () => {
  assert.equal(normalizeWbsTombstoneCalendarCode('RU_CN'), 'RU_CN');
  assert.equal(normalizeWbsTombstoneCalendarCode('CN'), 'CN');
  assert.equal(normalizeWbsTombstoneCalendarCode('unknown'), 'RU');
});
