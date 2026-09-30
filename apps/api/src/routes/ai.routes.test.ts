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

async function post(setup: Setup & { path?: string; report?: unknown; draft?: unknown; prep?: unknown; editable?: boolean }) {
  const finished: Array<[string, string, unknown]> = [];
  const audits: any[] = [];
  let extracted: any;
  const router = createAiRouter({
    config: setup.config ?? enabled,
    reserve: (async () => setup.reserve ?? { ok: true, id: 'usage-1' }) as any,
    finish: (async (id: string, status: string, usage: unknown) => {
      finished.push([id, status, usage]);
    }) as any,
    report: (async (input: any) => {
      extracted = input;
      return setup.report ?? { report: { status: 'AMBER', headline: 'h', summary: 's', done: [], slipped: [], risks: [], decisions: [], next: [] }, usage: { promptTokens: 1, completionTokens: 1 } };
    }) as any,
    draft: (async (input: any) => {
      extracted = input;
      return setup.draft ?? { items: [{ ref: '1', title: 'Фаза', type: 'PHASE', workDays: 0, owner: '', predecessors: [] }], droppedLinks: 2, usage: { promptTokens: 1, completionTokens: 1 } };
    }) as any,
    prepareMeeting: (async (input: any) => {
      extracted = input;
      return (
        setup.prep ?? {
          prep: { agenda: [{ topic: 'Доставка', why: 'Нужно решение', owner: 'Иванов', minutes: 10, refs: ['issue:i1'] }], askWhom: [] },
          refs: { 'issue:i1': { kind: 'issue', id: 'i1', label: 'Кто платит' } },
          droppedRefs: 1,
          usage: { promptTokens: 3, completionTokens: 2 },
        }
      );
    }) as any,
    suggestRisks: (async (input: any) => {
      extracted = input;
      return {
        suggestions: { newRisks: [], scores: [{ riskRef: 'risk:r1', probability: 4, impact: 4, reason: 'r' }], mitigations: [] },
        refs: { 'risk:r1': { kind: 'risk', id: 'r1', label: 'Срыв', type: 'RISK' } },
        droppedRefs: 3,
        usage: { promptTokens: 2, completionTokens: 2 },
      };
    }) as any,
    askProject: (async (input: any) => {
      extracted = input;
      return {
        answer: { answer: 'Мешает стенд', citations: ['issue:i1'], insufficientData: false },
        refs: { 'issue:i1': { kind: 'issue', id: 'i1', label: 'Нет стенда' } },
        droppedRefs: 0,
        usage: { promptTokens: 2, completionTokens: 2 },
      };
    }) as any,
    loadLeaves: (async () => []) as any,
    loadShiftLadders: (async () => [
      { isActiveGoal: true, code: '3', title: 'Запуск', varianceDays: 9, unexplainedDays: 2, reasonDays: { SUPPLIER: 5, NONE: 2 } },
    ]) as any,
    hasEditableProject: async () => setup.editable ?? true,
    loadWorkload: (async () => ({
      projects: [{ id: 'p1', code: 'TV', name: 'Телевизор' }],
      items: [
        { id: 'a', projectId: 'p1', code: '1.1', title: 'Работа', owner: 'Иванов', type: 'TASK', status: 'IN_PROGRESS', startDate: '2026-10-02', dueDate: '2026-10-10', updatedAt: 'v1', startLocked: false, finishLocked: false, startLinks: [], finishLinks: [], lockedByIssue: false },
      ],
      editableProjectIds: ['p1'],
      employees: [{ id: 'e1', name: 'Иванов', department: '' }, { id: 'e2', name: 'Сидорова', department: '' }],
      leaves: [],
      calendarDays: [],
    })) as any,
    suggestRebalance: (async (input: any) => {
      extracted = input;
      return { suggestions: [{ itemId: 'a', newOwner: 'Сидорова', newStartDate: null, newDueDate: null, reason: 'r' }], items: { a: { id: 'a' } }, droppedRefs: 1, usage: { promptTokens: 2, completionTokens: 2 } };
    }) as any,
    loadReportProject: (async () => ({
      name: 'Телевизор', code: 'TV', status: 'ACTIVE', rag: 'GREEN', targetDate: null, scheduleVariance: 0, progress: 0,
      jiraIntegration: null, wbsItems: [], issues: [], raidItems: [], jiraSnapshots: [],
    })) as any,
    extract: (async (input: any) => {
      extracted = input;
      return (setup.extract ?? (async () => ({ drafts: [{ id: 'ai-0', kind: 'TASK', title: 'Сделать', owner: '', dueDate: '', source: '' }], usage: { promptTokens: 5, completionTokens: 2 } })))(input);
    }) as any,
  });
  const layer = (router.stack as any[]).find((candidate) => candidate.route?.path === (setup.path ?? '/projects/:projectId/meeting-drafts'));
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

test('the status report goes through the same checks and keeps only counters in the audit', async () => {
  const path = '/projects/:projectId/ai/status-report';
  assert.equal((await post({ path, user: null, apiToken: { id: 't' } })).res.statusCode, 403);
  assert.equal((await post({ path, access: 'VIEW', body: { periodDays: 7 } })).res.statusCode, 403);
  assert.equal((await post({ path, access: 'EDIT', body: { periodDays: 5 } })).res.statusCode, 400);
  const ok = await post({ path, access: 'EDIT', body: { periodDays: 14, locale: 'en' } });
  assert.equal(ok.res.statusCode, 200);
  assert.equal(ok.res.body.report.status, 'AMBER');
  assert.equal(ok.res.body.periodDays, 14);
  assert.equal(ok.extracted.locale, 'en');
  assert.equal(ok.audits[0].action, 'ai.status_report');
  assert.doesNotMatch(JSON.stringify(ok.audits[0]), /Телевизор/);
});

test('the structure draft needs a description and returns the rows without creating them', async () => {
  const path = '/projects/:projectId/ai/wbs-draft';
  assert.equal((await post({ path, access: 'EDIT', body: { description: 'коротко' } })).res.statusCode, 400);
  const ok = await post({ path, access: 'EDIT', body: { description: 'Запуск телевизора новой серии: пилотная партия, сертификация.' } });
  assert.equal(ok.res.statusCode, 200);
  assert.equal(ok.res.body.items.length, 1);
  assert.equal(ok.res.body.droppedLinks, 2);
  assert.equal(ok.audits[0].action, 'ai.wbs_draft');
  assert.doesNotMatch(JSON.stringify(ok.audits[0]), /пилотная/);
});

test('meeting preparation sends the project facts and keeps only counters in the audit', async () => {
  const { res, audits, extracted } = await post({ path: '/projects/:projectId/ai/meeting-prep', access: 'EDIT', body: { horizonDays: 14, locale: 'en' } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(extracted.locale, 'en');
  assert.match(extracted.facts.text, /"days":14/);
  assert.deepEqual(res.body.agenda[0].refs, ['issue:i1']);
  assert.equal(res.body.refs['issue:i1'].label, 'Кто платит');
  assert.equal(res.body.droppedRefs, 1);
  assert.equal(res.body.horizonDays, 14);
  assert.equal(audits[0].action, 'ai.meeting_prep');
  assert.deepEqual(
    Object.keys(audits[0].metadata).sort(),
    ['completionTokens', 'droppedRefs', 'inputChars', 'model', 'promptTokens', 'provider', 'questions', 'topics'],
  );
  assert.equal((await post({ path: '/projects/:projectId/ai/meeting-prep', access: 'EDIT', body: { horizonDays: 30 } })).res.statusCode, 400);
});

test('risk suggestions go through the same checks and keep only counters in the audit', async () => {
  const { res, audits, extracted } = await post({ path: '/projects/:projectId/ai/risk-suggestions', access: 'EDIT', body: { locale: 'en' } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(extracted.locale, 'en');
  assert.equal(typeof extracted.facts.text, 'string');
  assert.equal(res.body.scores[0].riskRef, 'risk:r1');
  assert.equal(res.body.refs['risk:r1'].type, 'RISK');
  assert.equal(audits[0].action, 'ai.risk_suggestions');
  assert.deepEqual(audits[0].metadata.droppedRefs, 3);
  assert.equal(JSON.stringify(audits[0].metadata).includes('Срыв'), false);
  assert.equal((await post({ path: '/projects/:projectId/ai/risk-suggestions', access: 'VIEW', body: {} })).res.statusCode, 403);
  assert.equal((await post({ path: '/projects/:projectId/ai/risk-suggestions', access: 'EDIT', body: { locale: 'de' } })).res.statusCode, 400);
});

test('a question about the project is answered from its data and only its length is audited', async () => {
  const question = 'Что мешает запуску продукта?';
  const { res, audits, extracted } = await post({ path: '/projects/:projectId/ai/ask', access: 'EDIT', body: { question } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(extracted.question, question);
  assert.equal(extracted.locale, 'ru');
  assert.deepEqual(res.body.citations, ['issue:i1']);
  assert.equal(res.body.refs['issue:i1'].label, 'Нет стенда');
  assert.equal(audits[0].action, 'ai.ask_project');
  assert.equal(audits[0].metadata.questionChars, question.length);
  assert.equal(JSON.stringify(audits[0].metadata).includes('мешает'), false);
  assert.equal((await post({ path: '/projects/:projectId/ai/ask', access: 'EDIT', body: { question: 'Что' } })).res.statusCode, 400);
  assert.equal((await post({ path: '/projects/:projectId/ai/ask', user: null, apiToken: { id: 't' }, body: { question } })).res.statusCode, 403);
});

test('workload rebalancing works across projects, needs one the user may change, and audits counters only', async () => {
  const { res, audits, extracted } = await post({ path: '/ai/workload-rebalance', body: { horizonDays: 60, locale: 'en' } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(extracted.locale, 'en');
  assert.equal(JSON.parse(extracted.facts.text).window.days, 60);
  assert.deepEqual(res.body.suggestions[0], { itemId: 'a', newOwner: 'Сидорова', newStartDate: null, newDueDate: null, reason: 'r' });
  assert.equal(audits[0].action, 'ai.workload_rebalance');
  assert.equal(audits[0].projectId, null);
  assert.equal(audits[0].objectType, 'User');
  assert.deepEqual(Object.keys(audits[0].metadata).sort(), ['completionTokens', 'droppedRefs', 'horizonDays', 'inputChars', 'model', 'promptTokens', 'provider', 'suggestions']);
  assert.equal((await post({ path: '/ai/workload-rebalance', editable: false, body: {} })).res.statusCode, 403);
  assert.equal((await post({ path: '/ai/workload-rebalance', body: { horizonDays: 45 } })).res.statusCode, 400);
  assert.equal((await post({ path: '/ai/workload-rebalance', user: null, apiToken: { id: 't' }, body: {} })).res.statusCode, 403);
});

test('the status report is told how many days of the goal move come from which reason', async () => {
  const { res, extracted } = await post({ path: '/projects/:projectId/ai/status-report', access: 'EDIT', body: { periodDays: 7 } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const facts = JSON.parse(extracted.facts);
  assert.deepEqual(facts.activeGoalShiftDays, { goal: '3 Запуск', varianceDays: 9, beforeJournalDays: 2, byReason: { SUPPLIER: 5, NONE: 2 } });
});
