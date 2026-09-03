import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { createApp } from './app.js';

test('application data requires authentication while both login methods are public', async (t) => {
  const server = createApp().listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const projects = await fetch(`${baseUrl}/api/projects`);
  assert.equal(projects.status, 401);

  const portfolioRoadmap = await fetch(`${baseUrl}/api/projects/portfolio-roadmap`);
  assert.equal(portfolioRoadmap.status, 401);

  const localLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST' });
  assert.equal(localLogin.status, 400);

  const keycloakStatus = await fetch(`${baseUrl}/api/auth/keycloak/status`);
  assert.equal(keycloakStatus.status, 200);
});
