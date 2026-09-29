import assert from 'node:assert/strict';
import test from 'node:test';
import { PUBLIC_DEMO_USER_ID } from '@pms/shared';
import type { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { prismaClientProvider } from '../db.js';
import type { AiConfig } from '../services/ai/config.js';
import { AiProviderError } from '../services/ai/openai.js';
import { createAiRouter } from './ai.routes.js';

const enabled: AiConfig = {
  enabled: true,
  provider: 'openai',
  model: 'gpt-x',
  reasoningEffort: null,
  apiKey: 'k',
  baseUrl: new URL('https://api.openai.com/v1/'),
  timeoutMs: 1000,
  allowPublicDemo: false,
  limits: { userHourly: 10, daily: 200, dailyTokens: 1_000_000, concurrent: 3, demoIpHourly: 3, demoDaily: 30 },
};

type Setup = {
  config?: AiConfig;
  user?: Record<string, unknown> | null;
  apiToken?: Record<string, unknown>;
  project?: Record<string, unknown> | null;
  access?: string | null;
  reserve?: unknown;
  extract?: (input: any) => Promise<unknown>;
  body?: unknown;
};

async function post(setup: Setup) {
  const finished: Array<[string, string, unknown]> = [];
  const audits: any[] = [];
  let extracted: any;
  const router = createAiRouter({
    config: setup.config ?? enabled,
    reserve: (async () => setup.reserve ?? { ok: true, id: 'usage-1' }) as any,
    finish: (async (id: string, status: string, usage: unknown) => {
      finished.push([id, status, usage]);
    }) as any,
    extract: (async (input: any) => {
      extracted = input;
      return (setup.extract ?? (async () => ({ drafts: [{ id: 'ai-0', kind: 'TASK', title: 'Сделать', owner: '', dueDate: '', source: '' }], usage: { promptTokens: 5, completionTokens: 2 } })))(input);
    }) as any,
  });
  const layer = (router.stack as any[]).find((candidate) => candidate.route?.path === '/projects/:projectId/meeting-drafts');
  const previous = prismaClientProvider.get;
  prismaClientProvider.get = () =>
    ({
      project: { findUnique: async () => (setup.project === undefined ? { id: 'p1', name: 'Телевизор', status: 'ACTIVE' } : setup.project) },
      projectAccess: { findUnique: async () => (setup.access ? { level: setup.access } : null) },
      businessUnitMembership: { findFirst: async () => null },
      leaveEmployee: { findMany: async () => [{ name: 'Иванов' }] },
      wbsItem: { findMany: async () => [{ owner: 'Петров' }] },
      auditEvent: { create: async (args: any) => audits.push(args.data) },
      auditFieldChange: { createMany: async () => ({}) },
    }) as unknown as PrismaClient;
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    writableEnded: false,
    headersSent: false,
    on: () => undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(value: unknown) {
      this.body = value;
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
  };
  const req = {
    params: { projectId: 'p1' },
    body: setup.body ?? { text: 'Иванов подготовит смету до 10 октября.' },
    ip: '10.0.0.1',
    currentUser: setup.user === undefined ? { id: 'u1', role: 'PROJECT_MANAGER', email: 'u@x', name: 'U' } : setup.user,
    apiToken: setup.apiToken,
    get: () => undefined,
    header: () => undefined,
    headers: {},
  } as unknown as Request;
  try {
    await layer.route.stack[0].handle(req, res as Response);
  } finally {
    prismaClientProvider.get = previous;
  }
  return { res, finished, audits, extracted };
}

test('only a signed-in user, not an API token, may call the model', async () => {
  const token = await post({ user: null, apiToken: { id: 't1' } });
  assert.equal(token.res.statusCode, 403);
  const both = await post({ apiToken: { id: 't1' } });
  assert.equal(both.res.statusCode, 403);
});

test('without a configured provider the route says so', async () => {
  const { res } = await post({ config: { enabled: false, reason: 'off' } });
  assert.equal(res.statusCode, 503);
});

test('the public demo is refused unless allowed', async () => {
  const previous = { profile: process.env.DEPLOYMENT_PROFILE, demo: process.env.PUBLIC_DEMO_MODE };
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  process.env.PUBLIC_DEMO_MODE = 'true';
  try {
    const demoUser = { id: PUBLIC_DEMO_USER_ID, role: 'PROJECT_MANAGER', email: 'demo', name: 'Demo' };
    const refused = await post({ user: demoUser });
    assert.equal(refused.res.statusCode, 403);
    const allowed = await post({ user: demoUser, config: { ...enabled, allowPublicDemo: true } as AiConfig });
    assert.equal(allowed.res.statusCode, 200);
    // A demo visitor is not told which server setting failed.
    const failed = await post({
      user: demoUser,
      config: { ...enabled, allowPublicDemo: true } as AiConfig,
      extract: async () => {
        throw new AiProviderError('Проверьте AI_API_KEY в настройках сервера.', 401);
      },
    });
    assert.equal(failed.res.statusCode, 502);
    assert.doesNotMatch(failed.res.body.error, /AI_API_KEY/);
  } finally {
    process.env.DEPLOYMENT_PROFILE = previous.profile;
    process.env.PUBLIC_DEMO_MODE = previous.demo;
    if (previous.profile === undefined) delete process.env.DEPLOYMENT_PROFILE;
    if (previous.demo === undefined) delete process.env.PUBLIC_DEMO_MODE;
  }
});

test('the project must exist, be open and be writable by the user', async () => {
  assert.equal((await post({ project: null })).res.statusCode, 404);
  assert.equal((await post({ project: { id: 'p1', name: 'P', status: 'CLOSED' } })).res.statusCode, 423);
  assert.equal((await post({ access: 'VIEW' })).res.statusCode, 403);
  assert.equal((await post({ access: 'EDIT' })).res.statusCode, 200);
  assert.equal((await post({ user: { id: 'a1', role: 'ADMIN', email: 'a', name: 'A' } })).res.statusCode, 200);
});

test('the text is required and limited', async () => {
  assert.equal((await post({ access: 'EDIT', body: { text: '  ' } })).res.statusCode, 400);
  assert.equal((await post({ access: 'EDIT', body: { text: 'x'.repeat(30001) } })).res.statusCode, 400);
});

test('a spent budget is refused before the provider is called', async () => {
  const { res, extracted } = await post({ access: 'EDIT', reserve: { ok: false, reason: 'user_hourly' } });
  assert.equal(res.statusCode, 429);
  assert.equal(extracted, undefined);
});

test('drafts come back with the people list; the audit keeps counters, never the notes', async () => {
  const { res, finished, audits, extracted } = await post({ access: 'EDIT' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.drafts.length, 1);
  assert.deepEqual(extracted.people.sort(), ['Иванов', 'Петров']);
  assert.deepEqual(finished, [['usage-1', 'DONE', { promptTokens: 5, completionTokens: 2 }]]);
  assert.equal(audits.length, 1);
  const stored = JSON.stringify(audits[0]);
  assert.doesNotMatch(stored, /подготовит смету/);
  assert.match(stored, /"drafts":1/);
});

test('a provider failure is reported and still counted', async () => {
  const { res, finished } = await post({
    access: 'EDIT',
    extract: async () => {
      throw Object.assign(new AiProviderError('Модель вернула ошибку 500', 500), { usage: { promptTokens: 7, completionTokens: 0 } });
    },
  });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, 'Модель вернула ошибку 500');
  assert.deepEqual(finished, [['usage-1', 'FAILED', { promptTokens: 7, completionTokens: 0 }]]);
});

test('without a provider the status asks a corporate installation to connect GigaChat', () => {
  const status = (profile: string | undefined) => {
    const previous = process.env.DEPLOYMENT_PROFILE;
    if (profile === undefined) delete process.env.DEPLOYMENT_PROFILE;
    else process.env.DEPLOYMENT_PROFILE = profile;
    try {
      const router = createAiRouter({ config: { enabled: false, reason: 'off' } });
      const layer = (router.stack as any[]).find((candidate) => candidate.route?.path === '/ai/status');
      let body: any;
      layer.route.stack[0].handle({ currentUser: { id: 'u1' } } as unknown as Request, { json: (value: unknown) => (body = value) } as unknown as Response);
      return body;
    } finally {
      if (previous === undefined) delete process.env.DEPLOYMENT_PROFILE;
      else process.env.DEPLOYMENT_PROFILE = previous;
    }
  };
  assert.equal(status('corporate').setup, 'gigachat');
  // No profile means the strict corporate one.
  assert.equal(status(undefined).setup, 'gigachat');
  assert.equal(status('cloud').setup, null);
});
