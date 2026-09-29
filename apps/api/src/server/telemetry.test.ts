import assert from 'node:assert/strict';
import test from 'node:test';

import { PUBLIC_DEMO_USER_ID } from '@pms/shared';
import { createRateLimiter, metricRoute, rateLimitKey } from './telemetry.js';

test('Jira sync active and run status endpoints keep separate bounded metric labels', () => {
  assert.equal(
    metricRoute({ path: '/api/projects/project-1/jira/sync-runs/active' }),
    '/api/projects/:projectId/jira/sync-runs/active',
  );
  assert.equal(
    metricRoute({ path: '/api/projects/project-1/jira/sync-runs/run-secret' }),
    '/api/projects/:projectId/jira/sync-runs/:runId',
  );
});

function limiterRequest(headers: Record<string, string>, extra: Record<string, unknown> = {}) {
  return {
    ip: '10.0.0.7',
    get: (name: string) => headers[name.toLowerCase()],
    ...extra,
  } as any;
}

function limiterResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };
}

test('the limiter counts API tokens, users and anonymous visitors apart', () => {
  assert.equal(rateLimitKey(limiterRequest({ authorization: 'Bearer pms_secret' }, { apiToken: { id: 't1' } })), 'token:t1');
  // A made-up token that attachAuth did not accept is counted by address, not given a fresh bucket.
  assert.equal(rateLimitKey(limiterRequest({ authorization: 'Bearer pms_random1' })), 'ip:10.0.0.7');
  assert.equal(rateLimitKey(limiterRequest({ authorization: 'Bearer pms_random2' })), 'ip:10.0.0.7');
  assert.equal(rateLimitKey(limiterRequest({}, { currentUser: { id: 'u1' } })), 'user:u1');
  // Everyone behind one corporate proxy would share an address; they are counted by user.
  assert.notEqual(rateLimitKey(limiterRequest({}, { currentUser: { id: 'u1' } })), rateLimitKey(limiterRequest({}, { currentUser: { id: 'u2' } })));
  assert.equal(rateLimitKey(limiterRequest({}, { currentUser: { id: PUBLIC_DEMO_USER_ID } })), 'ip:10.0.0.7');
  assert.equal(rateLimitKey(limiterRequest({})), 'ip:10.0.0.7');
});

test('requests over the limit get 429 until the window passes, and old windows are swept', () => {
  let time = 1_000_000;
  const limiter = createRateLimiter({ defaultLimit: 2, now: () => time });
  const run = (extra: Record<string, unknown> = { currentUser: { id: 'u1' } }) => {
    const res = limiterResponse();
    let passed = false;
    limiter(limiterRequest({}, extra), res as any, () => {
      passed = true;
    });
    return { passed, res };
  };
  assert.equal(run().passed, true);
  assert.equal(run().passed, true);
  const refused = run();
  assert.equal(refused.passed, false);
  assert.equal(refused.res.statusCode, 429);
  assert.ok(Number(refused.res.headers['Retry-After']) >= 1);
  // Another user is not affected.
  assert.equal(run({ currentUser: { id: 'u2' } }).passed, true);
  time += 60_000;
  assert.equal(run().passed, true);
  assert.equal(limiter.bucketCount(), 1);
});

test('an API token uses its own per-minute limit', () => {
  const limiter = createRateLimiter({ defaultLimit: 100, now: () => 5 });
  const res = limiterResponse();
  let calls = 0;
  const request = limiterRequest({ authorization: 'Bearer pms_abc' }, { apiToken: { id: 't1', rateLimitPerMinute: 1 } });
  limiter(request, res as any, () => calls++);
  limiter(request, res as any, () => calls++);
  assert.equal(calls, 1);
  assert.equal(res.statusCode, 429);
});
