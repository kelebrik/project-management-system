import assert from 'node:assert/strict';
import test from 'node:test';
import { corsOrigin } from './app.js';
import { bearerToken } from './auth.js';

test('a bearer token is read without a regular expression, in linear time', () => {
  assert.equal(bearerToken('Bearer pms_abc'), 'pms_abc');
  assert.equal(bearerToken('bearer \t pms_abc  '), 'pms_abc');
  assert.equal(bearerToken('BEARER pms_abc'), 'pms_abc');
  for (const header of [undefined, '', 'Bearer', 'Bearer ', 'Bearerpms_abc', 'Basic pms_abc', 'Token pms_abc']) assert.equal(bearerToken(header), null, String(header));
  const started = process.hrtime.bigint();
  assert.equal(bearerToken(`Bearer${' '.repeat(100_000)}\n${' '.repeat(100_000)}x`), 'x');
  assert.ok(Number(process.hrtime.bigint() - started) / 1e6 < 200);
});

test('CORS never lets any site call the API with the user\'s cookie', async () => {
  assert.deepEqual(corsOrigin('https://a.example, https://b.example', true), ['https://a.example', 'https://b.example']);
  assert.deepEqual(corsOrigin('https://a.example,*', true), ['https://a.example']);
  assert.equal(corsOrigin('*', true), false);
  const local = corsOrigin('*', false);
  assert.equal(typeof local, 'function');
  const allows = (origin: string | undefined) =>
    new Promise<unknown>((resolve) => (local as (origin: string | undefined, callback: (error: Error | null, allow?: unknown) => void) => void)(origin, (_error, allow) => resolve(allow)));
  assert.equal(await allows('http://localhost:5173'), true);
  assert.equal(await allows('http://127.0.0.1:3000'), true);
  assert.equal(await allows(undefined), true);
  assert.equal(await allows('https://evil.example'), false);
  assert.equal(await allows('http://localhost.evil.example'), false);
});
