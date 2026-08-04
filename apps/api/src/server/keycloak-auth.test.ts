import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';

import { externalBaseUrl, keycloakUserRole } from './keycloak-auth.js';

test('first Keycloak user becomes the system administrator', () => {
  assert.equal(keycloakUserRole(null, 0), 'ADMIN');
  assert.equal(keycloakUserRole('EXECUTIVE_VIEWER', 0), 'ADMIN');
});

test('later Keycloak users keep their provisioned role or get the viewer role', () => {
  assert.equal(keycloakUserRole('PROJECT_MANAGER', 1), 'PROJECT_MANAGER');
  assert.equal(keycloakUserRole(null, 1), 'EXECUTIVE_VIEWER');
});

function requestWithHeaders(headers: Record<string, string>, protocol = 'http') {
  return {
    protocol,
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
}

test('external Keycloak callback URL uses https even behind an http proxy hop', () => {
  const previousPublicUrl = process.env.PUBLIC_APP_URL;
  const previousBaseUrl = process.env.APP_BASE_URL;
  delete process.env.PUBLIC_APP_URL;
  delete process.env.APP_BASE_URL;
  try {
    const baseUrl = externalBaseUrl(
      requestWithHeaders({
        host: 'nt-starosfw-tvmanagement-adv-msk01.sberdevices.ru',
        'x-forwarded-proto': 'http',
      }),
    );

    assert.equal(
      baseUrl,
      'https://nt-starosfw-tvmanagement-adv-msk01.sberdevices.ru',
    );
  } finally {
    if (previousPublicUrl === undefined) {
      delete process.env.PUBLIC_APP_URL;
    } else {
      process.env.PUBLIC_APP_URL = previousPublicUrl;
    }
    if (previousBaseUrl === undefined) {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = previousBaseUrl;
    }
  }
});
