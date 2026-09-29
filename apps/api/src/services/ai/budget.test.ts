import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { prismaClientProvider } from '../../db.js';
import { reserveAiCall } from './budget.js';

const limits = { userHourly: 2, daily: 10, dailyTokens: 100_000, concurrent: 2, demoIpHourly: 1, demoDaily: 5 };
const request = { feature: 'meeting-drafts', userId: 'u1', clientIp: '10.0.0.1', projectId: 'p1', provider: 'openai', model: 'm', inputChars: 10, isDemo: false };

async function reserve(
  counts: { running?: number; runningChars?: number; today?: number; tokens?: number; byUser?: number; byAddress?: number },
  isDemo = false,
  tokenLimit = 100_000,
) {
  const log: string[] = [];
  let created: any;
  const client: any = {
    $executeRaw: async (strings: TemplateStringsArray) => log.push(strings.join('?')),
    aiUsage: {
      count: async (args: any) => {
        if (args.where.clientIp) return counts.byAddress ?? 0;
        return counts.byUser ?? 0;
      },
      aggregate: async (args: any) =>
        args.where.status === 'RESERVED'
          ? { _count: { _all: counts.running ?? 0 }, _sum: { inputChars: counts.runningChars ?? 0 } }
          : { _count: { _all: counts.today ?? 0 }, _sum: { promptTokens: counts.tokens ?? 0, completionTokens: 0 } },
      create: async (args: any) => {
        created = args.data;
        return { id: 'usage-1' };
      },
    },
  };
  const previous = prismaClientProvider.get;
  prismaClientProvider.get = () => ({ $transaction: async (action: any) => action(client) }) as unknown as PrismaClient;
  try {
    const result = await reserveAiCall({ ...request, isDemo }, { ...limits, dailyTokens: tokenLimit });
    return { result, log, created };
  } finally {
    prismaClientProvider.get = previous;
  }
}

test('a call is reserved under the budget lock when every budget has room', async () => {
  const { result, log, created } = await reserve({});
  assert.deepEqual(result, { ok: true, id: 'usage-1' });
  assert.match(log[0], /pg_advisory_xact_lock\(hashtext\('ai-budget'\)\)/);
  assert.equal(created.inputChars, 10);
});

test('each spent budget refuses the call and reserves nothing', async () => {
  for (const [counts, reason, demo] of [
    [{ running: 2 }, 'concurrent', false],
    [{ today: 10 }, 'daily', false],
    [{ tokens: 95_000 }, 'tokens', false],
    [{ byUser: 2 }, 'user_hourly', false],
    [{ byAddress: 1 }, 'demo_ip', true],
    [{ byUser: 5 }, 'demo_daily', true],
  ] as const) {
    const { result, created } = await reserve(counts, demo);
    assert.deepEqual(result, { ok: false, reason }, reason);
    assert.equal(created, undefined);
  }
});

test('calls still running count at their upper estimate against the token budget', async () => {
  // One call is running: its reserve plus this call's must fit, even though nothing is reported yet.
  const fits = await reserve({ running: 1, runningChars: 0 }, false, 20_020);
  assert.equal(fits.result.ok, true);
  const tooMuch = await reserve({ running: 1, runningChars: 2000 }, false, 20_020);
  assert.deepEqual(tooMuch.result, { ok: false, reason: 'tokens' });
});
