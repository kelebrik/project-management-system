import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { prismaClientProvider } from '../../db.js';
import type { AiConfig } from '../../services/ai/config.js';
import { AI_JOB_ABANDONED_MS, createAiJobs } from '../../services/ai/jobs.js';
import { AiProviderError } from '../../services/ai/openai.js';
import { createAiKit } from './common.js';

const config: AiConfig = { enabled: true, provider: 'openai', model: 'gpt-x', reasoningEffort: null, apiKey: 'k', baseUrl: new URL('https://api.openai.com/v1/'), timeoutMs: 1000, allowPublicDemo: false, limits: { userHourly: 10, daily: 200, dailyTokens: 1_000_000, concurrent: 3, demoIpHourly: 3, demoDaily: 30 } };

function response() {
  return {
    statusCode: 200, body: undefined as unknown, headersSent: false, writableEnded: false,
    on: () => undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; this.headersSent = true; this.writableEnded = true; return this; },
    end() { this.writableEnded = true; return this; },
  };
}
const request = (prefer: string | null, userId = 'u1', params: Record<string, string> = {}) =>
  ({ params, ip: '127.0.0.1', get: (name: string) => (name.toLowerCase() === 'prefer' ? prefer ?? undefined : undefined), currentUser: { id: userId, role: 'ADMIN', name: 'A', email: 'a@x' } }) as never;

test('a background job answers later, only to its owner, and once', async () => {
  let now = 0;
  const jobs = createAiJobs(() => now);
  let finish!: (value: { status: number; body: unknown }) => void;
  const id = jobs.start('u1', () => new Promise((resolve) => (finish = resolve)));
  assert.deepEqual(jobs.poll('u1', id), { found: true, outcome: null });
  assert.deepEqual(jobs.poll('u2', id), { found: false });
  finish({ status: 200, body: { ok: true } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(jobs.poll('u1', id), { found: true, outcome: { status: 200, body: { ok: true } } });
  assert.deepEqual(jobs.poll('u1', id), { found: false }, 'picked up once');
  assert.equal(jobs.watching(), false, 'no jobs, no timer');

  let aborted = false;
  jobs.start('u1', (signal) => new Promise(() => signal.addEventListener('abort', () => (aborted = true))));
  now += AI_JOB_ABANDONED_MS + 1;
  jobs.start('u1', async () => ({ status: 200, body: {} }));
  assert.equal(aborted, true, 'a job nobody asks about is stopped');

  // A finished answer nobody picks up goes after a while, swept without any new call.
  const left = jobs.start('u1', async () => ({ status: 200, body: {} }));
  await new Promise((resolve) => setImmediate(resolve));
  now += 11 * 60_000;
  jobs.sweep();
  assert.deepEqual(jobs.poll('u1', left), { found: false });
  assert.equal(jobs.cancel('u2', 'missing'), false);
  const cancelled = jobs.start('u1', () => new Promise(() => undefined));
  assert.equal(jobs.watching(), true);
  assert.equal(jobs.cancel('u1', cancelled), true);
  // The abandoned job of before is still running somewhere: cancel what is left and the timer stops.
  for (let index = 0; index < 5 && jobs.size() > 0; index += 1) { now += 11 * 60_000; jobs.sweep(); }
  assert.equal(jobs.watching(), false);
});

test('with Prefer: respond-async an AI call answers 202 at once and its answer is polled; a provider error comes back the same way', async () => {
  const previous = prismaClientProvider.get;
  prismaClientProvider.get = () => ({ auditEvent: { create: async () => ({}) }, auditFieldChange: { createMany: async () => ({}) } }) as unknown as PrismaClient;
  try {
    const kit = createAiKit({ config, reserve: (async () => ({ ok: true, id: 'r1' })) as never, finish: (async () => undefined) as never, jobs: createAiJobs() });
    const context = { config: config as Extract<AiConfig, { enabled: true }>, user: { id: 'u1', role: 'ADMIN' } as never, demo: false, project: { id: 'p1', name: 'P', status: 'ACTIVE' } };
    const call = (run: () => Promise<{ usage: { promptTokens: number; completionTokens: number } }>) => ({ feature: 'wbs-draft', inputChars: 10, failure: 'Не вышло.', run, counters: () => ({}), respond: () => ({ items: [1] }) });

    const started = response();
    await kit.runAiCall(request('respond-async'), started as never, context, call(async () => ({ usage: { promptTokens: 1, completionTokens: 1 } })));
    assert.equal(started.statusCode, 202);
    const { jobId } = started.body as { jobId: string };
    await new Promise((resolve) => setTimeout(resolve, 10));
    const polled = response();
    kit.pollJob(request(null, 'u1', { jobId }), polled as never);
    assert.deepEqual([polled.statusCode, polled.body], [200, { items: [1], provider: 'openai', model: 'gpt-x' }]);

    const failing = response();
    await kit.runAiCall(request('respond-async'), failing as never, context, call(async () => { throw new AiProviderError('Модель не ответила вовремя'); }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const failed = response();
    kit.pollJob(request(null, 'u1', { jobId: (failing.body as { jobId: string }).jobId }), failed as never);
    assert.deepEqual([failed.statusCode, failed.body], [502, { error: 'Модель не ответила вовремя' }]);

    const missing = response();
    kit.cancelJob(request(null, 'u2', { jobId: 'not-mine' }), missing as never);
    assert.equal(missing.statusCode, 404);

    const direct = response();
    await kit.runAiCall(request(null), direct as never, context, call(async () => ({ usage: { promptTokens: 1, completionTokens: 1 } })));
    assert.equal(direct.statusCode, 200, 'without the header the call answers in the request');
  } finally {
    prismaClientProvider.get = previous;
  }
});
