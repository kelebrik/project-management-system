import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';
import {
  anonymousVisitorHash,
  isTrustedPageVisitRequest,
  shouldRecordPageVisit,
} from './page-visits.routes.js';

function request(
  headers: Record<string, string>,
  protocol = 'http',
  host = headers.host,
): Request {
  return {
    protocol,
    host,
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as Request;
}

test('page visit origin check accepts configured origins and silently rejects missing headers', () => {
  const previous = process.env.WEB_ORIGIN;
  process.env.WEB_ORIGIN = 'https://one.example,https://two.example';
  try {
    assert.equal(
      isTrustedPageVisitRequest(request({ origin: 'https://two.example' })),
      true,
    );
    assert.equal(
      isTrustedPageVisitRequest(request({ referer: 'https://one.example/projects' })),
      true,
    );
    assert.equal(isTrustedPageVisitRequest(request({})), false);
    assert.equal(
      isTrustedPageVisitRequest(request({ origin: 'https://attacker.example' })),
      false,
    );
    assert.equal(isTrustedPageVisitRequest(request({ origin: 'null' })), false);
    assert.equal(
      isTrustedPageVisitRequest(
        request({
          origin: 'https://attacker.example',
          'sec-fetch-site': 'same-origin',
        }),
      ),
      true,
    );
    assert.equal(
      isTrustedPageVisitRequest(
        request({
          origin: 'https://attacker.example',
          'sec-fetch-site': 'cross-site',
        }),
      ),
      false,
    );
    assert.equal(
      isTrustedPageVisitRequest(
        request({
          origin: 'https://attacker.example',
          'sec-fetch-site': 'same-site',
        }),
      ),
      false,
    );
  } finally {
    if (previous === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = previous;
  }
});

test('page visit origin check accepts the effective production origin behind a proxy', () => {
  const previous = process.env.WEB_ORIGIN;
  process.env.WEB_ORIGIN = 'http://localhost:5173';
  try {
    assert.equal(
      isTrustedPageVisitRequest(
        request(
          { origin: 'https://tv-dashboard.rnd.dev.sberdevices.ru' },
          'https',
          'tv-dashboard.rnd.dev.sberdevices.ru',
        ),
      ),
      true,
    );
    assert.equal(
      isTrustedPageVisitRequest(
        request(
          { origin: 'https://attacker.example' },
          'https',
          'tv-dashboard.rnd.dev.sberdevices.ru',
        ),
      ),
      false,
    );
    assert.equal(
      isTrustedPageVisitRequest(
        request(
          { referer: 'https://tv-dashboard.rnd.dev.sberdevices.ru/projects/cvte968' },
          'https',
          'tv-dashboard.rnd.dev.sberdevices.ru',
        ),
      ),
      true,
    );
  } finally {
    if (previous === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = previous;
  }
});

test('system administrators are excluded while trusted visitors remain subjects', () => {
  assert.equal(shouldRecordPageVisit('ADMIN', true), false);
  assert.equal(shouldRecordPageVisit('EXECUTIVE_VIEWER', true), true);
  assert.equal(shouldRecordPageVisit('EXECUTIVE_VIEWER', false), false);
  assert.equal(shouldRecordPageVisit(null, true), true);
  assert.equal(shouldRecordPageVisit(null, false), false);
});

test('anonymous visitor hashes are stable without exposing the browser identifier', () => {
  const id = '6f67be66-d901-448a-b3c5-505c73d2989b';
  const hash = anonymousVisitorHash(id);
  assert.equal(hash, anonymousVisitorHash(id));
  assert.notEqual(hash, id);
  assert.equal(hash.length, 64);
});
