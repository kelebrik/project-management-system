import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

import compression from 'compression';
import express from 'express';

import { createApp, shouldCompress } from './app.js';

type RawResponse = { headers: http.IncomingHttpHeaders; body: Buffer };

async function withServer(app: express.Express, run: (get: (path: string, headers?: Record<string, string>) => Promise<RawResponse>) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await run(
      (path, headers = {}) =>
        new Promise<RawResponse>((resolve, reject) => {
          http
            .get({ host: '127.0.0.1', port: address.port, path, headers }, (res) => {
              const chunks: Buffer[] = [];
              res.on('data', (chunk: Buffer) => chunks.push(chunk));
              res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
            })
            .on('error', reject);
        }),
    );
  } finally {
    server.close();
  }
}

// The OpenAPI document is large JSON served without a database.
test('API JSON is gzipped for a caller that accepts it, and the body is intact', async () => {
  await withServer(createApp(), async (get) => {
    const plain = await get('/api/openapi.json');
    assert.equal(plain.headers['content-encoding'], undefined);
    const zipped = await get('/api/openapi.json', { 'Accept-Encoding': 'gzip' });
    assert.equal(zipped.headers['content-encoding'], 'gzip');
    assert.match(String(zipped.headers.vary), /Accept-Encoding/);
    assert.ok(zipped.body.length < plain.body.length / 3);
    assert.deepEqual(gunzipSync(zipped.body), plain.body);
  });
});

test('x-no-compression turns compression off', async () => {
  await withServer(createApp(), async (get) => {
    const response = await get('/api/openapi.json', { 'Accept-Encoding': 'gzip', 'x-no-compression': '1' });
    assert.equal(response.headers['content-encoding'], undefined);
    assert.doesNotThrow(() => JSON.parse(response.body.toString('utf8')));
  });
});

test('files, event streams and already compressed bodies are passed through as they are', async () => {
  const app = express();
  app.use(compression({ threshold: 1024, filter: shouldCompress }));
  const big = 'x'.repeat(50_000);
  app.get('/file', (_req, res) => res.type('application/octet-stream').send(Buffer.from(big)));
  app.get('/events', (_req, res) => res.type('text/event-stream').send(big));
  app.get('/zipped', (_req, res) => res.set('Content-Encoding', 'br').type('application/json').send(Buffer.from(big)));
  await withServer(app, async (get) => {
    for (const path of ['/file', '/events']) {
      const response = await get(path, { 'Accept-Encoding': 'gzip' });
      assert.equal(response.headers['content-encoding'], undefined, path);
      assert.equal(response.body.length, big.length, path);
    }
    const zipped = await get('/zipped', { 'Accept-Encoding': 'gzip' });
    assert.equal(zipped.headers['content-encoding'], 'br');
    assert.equal(zipped.body.length, big.length);
  });
});
