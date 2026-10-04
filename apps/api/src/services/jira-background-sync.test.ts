import assert from 'node:assert/strict';
import test from 'node:test';
import { backgroundSyncDecision, backgroundSyncMode, backgroundSyncPolicy } from './jira-background-sync.js';

const policy = { ...backgroundSyncPolicy({}), timeZone: 'Europe/Moscow' };
// Moscow is UTC+3: 00:30 UTC is 03:30 local, 09:00 UTC is 12:00 local; 2026-10-05 is a Monday.
const at = (iso: string) => new Date(iso);
const base = { lastSyncedAt: at('2026-10-04T00:00:00Z'), currentRefreshedAt: at('2026-10-05T08:30:00Z'), activeRun: false, lastRun: null };

test('a full sync runs in the night window once a day, only for projects synced before', () => {
  assert.equal(backgroundSyncDecision(base, at('2026-10-05T00:30:00Z'), policy), 'SYNC');
  assert.equal(backgroundSyncDecision({ ...base, lastSyncedAt: at('2026-10-04T23:00:00Z') }, at('2026-10-05T00:30:00Z'), policy), null, 'synced within the last hours');
  assert.equal(backgroundSyncDecision({ ...base, lastSyncedAt: null, currentRefreshedAt: null }, at('2026-10-05T00:30:00Z'), policy), null);
  assert.equal(backgroundSyncDecision(base, at('2026-10-05T04:00:00Z'), policy), null, '07:00 local is past the window and before nothing is stale');
});

test('the current data is refreshed hourly in working time, and nothing is queued while a run is on or soon after a failure', () => {
  assert.equal(backgroundSyncDecision(base, at('2026-10-05T09:00:00Z'), policy), null, 'refreshed half an hour ago');
  assert.equal(backgroundSyncDecision(base, at('2026-10-05T09:31:00Z'), policy), 'CURRENT');
  assert.equal(backgroundSyncDecision(base, at('2026-10-04T09:31:00Z'), policy), null, 'Sunday');
  assert.equal(backgroundSyncDecision(base, at('2026-10-05T19:00:00Z'), policy), null, '22:00 local');
  assert.equal(backgroundSyncDecision({ ...base, activeRun: true }, at('2026-10-05T09:31:00Z'), policy), null);
  assert.equal(backgroundSyncDecision({ ...base, lastRun: { status: 'FAILED', finishedAt: at('2026-10-05T09:00:00Z') } }, at('2026-10-05T09:31:00Z'), policy), null);
  assert.equal(backgroundSyncDecision({ ...base, lastRun: { status: 'FAILED', finishedAt: at('2026-10-05T08:00:00Z') } }, at('2026-10-05T09:31:00Z'), policy), 'CURRENT');
});

test('the mode an administrator picks decides: off queues nothing, current never runs the nightly full sync', () => {
  assert.equal(backgroundSyncMode(undefined), 'current');
  assert.equal(backgroundSyncMode('garbage'), 'current');
  assert.equal(backgroundSyncDecision(base, at('2026-10-05T00:30:00Z'), policy, 'current'), null);
  assert.equal(backgroundSyncDecision(base, at('2026-10-05T09:31:00Z'), policy, 'current'), 'CURRENT');
  assert.equal(backgroundSyncDecision(base, at('2026-10-05T09:31:00Z'), policy, 'off'), null);
});
