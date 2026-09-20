import assert from 'node:assert/strict';
import test from 'node:test';
import express, { type Express } from 'express';

import { registerAuthRoutes } from './auth-routes.js';

function registeredPaths(profile: string | undefined) {
  const previous = process.env.DEPLOYMENT_PROFILE;
  if (profile === undefined) delete process.env.DEPLOYMENT_PROFILE;
  else process.env.DEPLOYMENT_PROFILE = profile;
  try {
    const app: Express = express();
    registerAuthRoutes(app);
    return app.router.stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
  } finally {
    if (previous === undefined) delete process.env.DEPLOYMENT_PROFILE;
    else process.env.DEPLOYMENT_PROFILE = previous;
  }
}

test('the cloud profile exposes local password sign-in', () => {
  const paths = registeredPaths('cloud');
  assert.ok(paths.includes('POST /api/auth/login'));
  assert.ok(paths.includes('GET /api/auth/me'));
  assert.ok(paths.includes('POST /api/auth/logout'));
});

test('the corporate profile does not register a password sign-in route at all', () => {
  const paths = registeredPaths('corporate');
  assert.equal(
    paths.includes('POST /api/auth/login'),
    false,
    'password sign-in must not reach the corporate deployment, Keycloak is the only way in',
  );
  // Session inspection and sign-out still have to work behind Keycloak.
  assert.ok(paths.includes('GET /api/auth/me'));
  assert.ok(paths.includes('POST /api/auth/logout'));
});

test('a missing or unknown profile keeps password sign-in unregistered', () => {
  for (const profile of [undefined, '', 'staging', 'CLOUD']) {
    assert.equal(
      registeredPaths(profile).includes('POST /api/auth/login'),
      false,
      `profile ${JSON.stringify(profile)} must not expose password sign-in`,
    );
  }
});
