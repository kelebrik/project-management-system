import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createApp } from './app.js';
import { loginAccountKey } from './auth-routes.js';

// Sign-in is only registered on the cloud profile, so every case here runs there.
// These tests run without a database, so a request that gets past the limiters
// fails inside the handler; that is why they assert on 429 rather than on 401.
async function withLoginApp(run: (post: (body: unknown) => Promise<Response>) => Promise<void>) {
  const previous = process.env.DEPLOYMENT_PROFILE;
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    await run((body) =>
      fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  } finally {
    server.close();
    if (previous === undefined) delete process.env.DEPLOYMENT_PROFILE;
    else process.env.DEPLOYMENT_PROFILE = previous;
  }
}

const credentials = (email: string) => ({ email, password: 'wrong-password-for-rate-limit' });

test('a single address gets ten sign-in attempts per minute', async () => {
  await withLoginApp(async (post) => {
    // Distinct accounts, so only the address budget can be the one that trips.
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await post(credentials(`ip-probe-${attempt}@example.invalid`));
      assert.notEqual(response.status, 429, `attempt ${attempt} must still be allowed`);
    }

    const blocked = await post(credentials('ip-probe-11@example.invalid'));
    assert.equal(blocked.status, 429);
    assert.deepEqual(await blocked.json(), { error: 'Слишком много попыток входа. Повторите позже.' });

    const retryAfter = Number(blocked.headers.get('Retry-After'));
    assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60, `Retry-After was ${retryAfter}`);
  });
});

test('a malformed body does not consume the sign-in budget', async () => {
  await withLoginApp(async (post) => {
    for (let attempt = 1; attempt <= 15; attempt += 1) {
      const response = await post({ email: 'not-an-email', password: '' });
      assert.equal(response.status, 400, `attempt ${attempt} must be rejected as invalid, not rate limited`);
    }

    // Fifteen malformed attempts is beyond the budget, yet it is still untouched.
    const wellFormed = await post(credentials('after-malformed@example.invalid'));
    assert.notEqual(wellFormed.status, 429);
  });
});

test('every spelling of one address shares a single account budget', () => {
  const canonical = loginAccountKey(credentials('account@example.invalid'), '203.0.113.7');
  for (const spelling of ['Account@Example.invalid', 'ACCOUNT@EXAMPLE.INVALID', '  account@example.invalid  ']) {
    assert.equal(loginAccountKey(credentials(spelling), '203.0.113.7'), canonical, spelling);
  }
  assert.equal(canonical, 'account:account@example.invalid');
});

test('a body without a usable address falls back to the caller, not a shared bucket', () => {
  const first = loginAccountKey({ email: 'not-an-email' }, '203.0.113.7');
  const second = loginAccountKey({}, '203.0.113.8');
  assert.notEqual(first, second, 'unusable bodies from different callers must not share a budget');
  assert.match(first, /^anonymous:/);
  // IPv6 callers are grouped by subnet rather than by single address.
  assert.notEqual(loginAccountKey({}, '2001:db8::1'), loginAccountKey({}, '2001:db9::1'));
});
