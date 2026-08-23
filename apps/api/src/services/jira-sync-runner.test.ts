import assert from 'node:assert/strict';
import test from 'node:test';

import {
  jiraSyncRunnerFailureAction,
  jiraSyncHeartbeatFailureAction,
  jiraSyncRunnerLogMessage,
  settleJiraSyncRunnerTask,
} from './jira-sync-runner.js';
import {
  JiraSyncCapacityError,
  JiraSyncDeadlineError,
  JiraSyncFencedError,
} from './jira-sync-runs.js';

test('runner releases an aborted shutdown before classifying a fence loss', () => {
  assert.equal(jiraSyncRunnerFailureAction(new JiraSyncFencedError(), true, true), 'SHUTDOWN');
  assert.equal(jiraSyncRunnerFailureAction(new JiraSyncFencedError(), false, true), 'FENCED');
  assert.equal(jiraSyncRunnerFailureAction(new JiraSyncDeadlineError('deadline'), false, false), 'PAUSE_DEADLINE');
  assert.equal(jiraSyncRunnerFailureAction(new JiraSyncCapacityError('capacity'), false, false), 'STOP_CAPACITY');
  assert.equal(jiraSyncRunnerFailureAction(new Error('database'), false, false), 'FAIL');
});

test('runner task wrapper consumes and reports a finisher rejection', async () => {
  const failure = new Error('finisher failed');
  let reported: unknown = null;
  await assert.doesNotReject(settleJiraSyncRunnerTask(
    Promise.reject(failure),
    (error) => { reported = error; },
  ));
  assert.equal(reported, failure);
});

test('heartbeat only aborts a worker after a real fence loss', () => {
  assert.equal(jiraSyncHeartbeatFailureAction(new JiraSyncFencedError()), 'FATAL');
  assert.equal(jiraSyncHeartbeatFailureAction(new Error('transaction timeout')), 'RETRY');
});

test('runner log messages redact database and Jira credentials', () => {
  const message = jiraSyncRunnerLogMessage(
    new Error('postgresql://user:secret@db.example/pms Authorization: Bearer token-value'),
  );
  assert.doesNotMatch(message, /secret|token-value/u);
  assert.match(message, /\*\*\*/u);
});
