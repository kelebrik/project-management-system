import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';

import { externalBaseUrl } from './keycloak-auth.js';

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
