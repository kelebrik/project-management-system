import assert from 'node:assert/strict';
import test from 'node:test';
import { isoMonth, isoWeek } from '@pms/shared';

test('week and month labels of Jira widgets have no «г.» after the year', () => {
  assert.deepEqual(isoWeek(new Date('2026-09-16T12:00:00Z'), 'UTC'), { key: '2026-W38', label: '14 сент. 2026' });
  assert.deepEqual(isoMonth(new Date('2026-10-15T12:00:00Z'), 'UTC'), { key: '2026-10', label: 'октябрь 2026' });
});
