import assert from 'node:assert/strict';
import test from 'node:test';

import { runWithWbsWriteQueue } from './write-queue.js';

test('programmatic WBS writes are serialized for one project', async () => {
  const events: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = runWithWbsWriteQueue('project-1', async () => {
    events.push('first:start');
    await firstGate;
    events.push('first:end');
  });
  await Promise.resolve();
  const second = runWithWbsWriteQueue('project-1', async () => {
    events.push('second:start');
    events.push('second:end');
  });
  await Promise.resolve();

  assert.deepEqual(events, ['first:start']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, [
    'first:start',
    'first:end',
    'second:start',
    'second:end',
  ]);
});

test('programmatic WBS writes do not block another project', async () => {
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let secondStarted = false;

  const first = runWithWbsWriteQueue('project-a', () => firstGate);
  const second = runWithWbsWriteQueue('project-b', async () => {
    secondStarted = true;
  });
  await second;
  assert.equal(secondStarted, true);
  releaseFirst();
  await first;
});
