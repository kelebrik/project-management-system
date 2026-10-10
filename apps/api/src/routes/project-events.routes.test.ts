import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { liveSectionForWrite, projectLiveListenerCount, publishProjectLiveEvent } from '../services/project-live-events.js';
import { createProjectEventsRouter } from './project-events.routes.js';

test('a successful write names the part of the project it touched; reads and personal views name nothing', () => {
  assert.equal(liveSectionForWrite('PATCH', '/wbs-items/item-1'), 'structure');
  assert.equal(liveSectionForWrite('POST', '/projects/p1/open-issues'), 'issues');
  assert.equal(liveSectionForWrite('DELETE', '/projects/p1/risks/r1'), 'raid');
  assert.equal(liveSectionForWrite('PATCH', '/projects/p1'), 'project');
  for (const path of ['/projects/p1/wbs-draft/apply', '/projects/p1/wbs-import/apply', '/projects/p1/wbs-snapshot', '/projects/p1/wbs-baseline']) {
    assert.equal(liveSectionForWrite('POST', path), 'structure', path);
  }
  assert.equal(liveSectionForWrite('PATCH', '/lessons/l1'), 'lessons');
  assert.equal(liveSectionForWrite('POST', '/decisions/d1/answer'), 'decisions');
  assert.equal(liveSectionForWrite('GET', '/projects/p1/open-issues'), null);
  assert.equal(liveSectionForWrite('POST', '/projects/p1/jira/semantic-aggregates/query-batch'), null);
  assert.equal(liveSectionForWrite('POST', '/projects/p1/jira/semantic-aggregates/preview'), null);
  assert.equal(liveSectionForWrite('PATCH', '/projects/p1/ui-state'), null);
  // Queued Jira runs say nothing yet; the runner reports when the data is in.
  assert.equal(liveSectionForWrite('POST', '/projects/p1/jira/sync'), null);
  assert.equal(liveSectionForWrite('POST', '/projects/p1/jira/current-refresh'), null);
});

async function withServer(user: { id: string; name: string } | null, canRead: boolean | (() => Promise<boolean>), run: (url: string) => Promise<void>) {
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { currentUser: unknown }).currentUser = user;
    next();
  });
  app.use('/api', createProjectEventsRouter({ heartbeatMs: 50, canRead: typeof canRead === 'function' ? canRead : async () => canRead }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('the stream refuses people who cannot read the project', async () => {
  await withServer(null, true, async (url) => {
    assert.equal((await fetch(`${url}/api/projects/p1/events`)).status, 401);
  });
  await withServer({ id: 'u1', name: 'Анна' }, false, async (url) => {
    assert.equal((await fetch(`${url}/api/projects/p1/events`)).status, 404);
  });
});

test('the stream sends changes of its project only, keeps the line alive, and lets go when closed', async () => {
  await withServer({ id: 'u1', name: 'Анна' }, true, async (url) => {
    const controller = new AbortController();
    const response = await fetch(`${url}/api/projects/live-p1/events`, { signal: controller.signal });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    assert.equal(response.headers.get('x-accel-buffering'), 'no');
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const readUntil = async (pattern: RegExp) => {
      while (!pattern.test(text)) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
      }
    };
    await readUntil(/retry: 5000/);
    assert.equal(projectLiveListenerCount('live-p1'), 1);
    publishProjectLiveEvent({ projectId: 'other-project', section: 'raid', actorId: 'u2', actorName: 'Иван', clientId: null });
    publishProjectLiveEvent({ projectId: 'live-p1', section: 'structure', actorId: 'u2', actorName: 'Иван', clientId: 'tab-12345678' });
    await readUntil(/event: change\ndata: .*\n\n/);
    const data = JSON.parse(text.match(/event: change\ndata: (.*)\n\n/)![1]!);
    assert.equal(data.section, 'structure');
    assert.equal(data.clientId, 'tab-12345678');
    assert.doesNotMatch(text, /other-project/);
    await readUntil(/: heartbeat/);
    controller.abort();
    await reader.cancel().catch(() => undefined);
    // The server notices the closed connection and drops the listener.
    for (let attempt = 0; attempt < 50 && projectLiveListenerCount('live-p1') > 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(projectLiveListenerCount('live-p1'), 0);
  });
});

test('a client gone while access is checked leaves no listener behind', { timeout: 5_000 }, async () => {
  let release: (value: boolean) => void = () => undefined;
  const pending = new Promise<boolean>((resolve) => { release = resolve; });
  await withServer({ id: 'u1', name: 'Анна' }, () => pending, async (url) => {
    const controller = new AbortController();
    const request = fetch(`${url}/api/projects/live-gone/events`, { signal: controller.signal }).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 50));
    controller.abort();
    await request;
    await new Promise((resolve) => setTimeout(resolve, 50));
    release(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(projectLiveListenerCount('live-gone'), 0);
  });
});
