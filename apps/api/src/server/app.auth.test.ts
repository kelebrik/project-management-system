import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createApp } from './app.js';

async function withApp(profile: string | undefined, run: (baseUrl: string) => Promise<void>) {
  const previous = process.env.DEPLOYMENT_PROFILE;
  if (profile === undefined) delete process.env.DEPLOYMENT_PROFILE;
  else process.env.DEPLOYMENT_PROFILE = profile;
  const server = createApp().listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    if (previous === undefined) delete process.env.DEPLOYMENT_PROFILE;
    else process.env.DEPLOYMENT_PROFILE = previous;
  }
}

test('the cloud profile keeps application data private while both login methods stay public', async () => {
  await withApp('cloud', async (baseUrl) => {
    const projects = await fetch(`${baseUrl}/api/projects`);
    assert.equal(projects.status, 401);

    const portfolioRoadmap = await fetch(`${baseUrl}/api/projects/portfolio-roadmap`);
    assert.equal(portfolioRoadmap.status, 401);

    // 400 rather than 401 proves the route is reachable without a session.
    const localLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST' });
    assert.equal(localLogin.status, 400);

    const keycloakStatus = await fetch(`${baseUrl}/api/auth/keycloak/status`);
    assert.equal(keycloakStatus.status, 200);
  });
});

test('local password sign-in is unreachable outside the cloud profile', async () => {
  for (const profile of ['corporate', undefined]) {
    await withApp(profile, async (baseUrl) => {
      // The route is not registered, so the request is stopped by the shared
      // `/api` authentication guard instead of reaching password verification.
      const localLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST' });
      assert.equal(
        localLogin.status,
        401,
        `profile ${String(profile)} must not accept a password sign-in attempt`,
      );

      // Keycloak remains the way in.
      const keycloakStatus = await fetch(`${baseUrl}/api/auth/keycloak/status`);
      assert.equal(keycloakStatus.status, 200);
    });
  }
});
