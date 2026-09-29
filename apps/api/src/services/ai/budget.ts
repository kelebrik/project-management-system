import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import type { AiLimits } from './config.js';
import type { AiUsageTokens } from './openai.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** A reservation older than this is treated as finished even if its request never closed it. */
const STALE_RESERVATION_MS = 5 * 60_000;
/**
 * Upper estimate of the tokens one call may spend before it reports usage:
 * the answer cap, the instructions, and the notes at two characters a token.
 */
export const MAX_COMPLETION_TOKENS = 8000;
const PROMPT_OVERHEAD_TOKENS = 2000;
export function estimatedCallTokens(inputChars: number) {
  return MAX_COMPLETION_TOKENS + PROMPT_OVERHEAD_TOKENS + Math.ceil(inputChars / 2);
}

export type AiBudgetRefusal = 'concurrent' | 'user_hourly' | 'daily' | 'tokens' | 'demo_ip' | 'demo_daily';

export type AiCallRequest = {
  feature: string;
  userId: string | null;
  clientIp: string | null;
  projectId: string | null;
  provider: string;
  model: string;
  inputChars: number;
  isDemo: boolean;
};

/**
 * Reserves one AI call against the budgets, or says which budget is spent.
 * Runs under a transaction-wide advisory lock, so parallel requests on any
 * number of instances cannot both take the last slot. Every reserved call
 * counts, including failed and cancelled ones: the provider may have billed it.
 */
export async function reserveAiCall(request: AiCallRequest, limits: AiLimits, now = new Date()) {
  return prisma.$transaction(async (client: Prisma.TransactionClient) => {
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ai-budget'))`;
    const since = (ms: number) => new Date(now.getTime() - ms);
    const refuse = (reason: AiBudgetRefusal) => ({ ok: false as const, reason });

    const running = await client.aiUsage.aggregate({
      where: { status: 'RESERVED', createdAt: { gt: since(STALE_RESERVATION_MS) } },
      _count: { _all: true },
      _sum: { inputChars: true },
    });
    if (running._count._all >= limits.concurrent) return refuse('concurrent');
    const today = await client.aiUsage.aggregate({
      where: { createdAt: { gt: since(DAY_MS) } },
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true },
    });
    if (today._count._all >= limits.daily) return refuse('daily');
    // Calls still running have not reported their tokens yet: count them, and
    // this one, at their upper estimate so parallel calls cannot overshoot.
    const spent = (today._sum.promptTokens ?? 0) + (today._sum.completionTokens ?? 0);
    const pending =
      running._count._all * (MAX_COMPLETION_TOKENS + PROMPT_OVERHEAD_TOKENS) + Math.ceil((running._sum.inputChars ?? 0) / 2);
    if (spent + pending + estimatedCallTokens(request.inputChars) > limits.dailyTokens) return refuse('tokens');
    if (request.isDemo) {
      // Every anonymous visitor is the same demo user, so the address is what tells them apart.
      const byAddress = await client.aiUsage.count({ where: { clientIp: request.clientIp, createdAt: { gt: since(HOUR_MS) } } });
      if (byAddress >= limits.demoIpHourly) return refuse('demo_ip');
      const byDemo = await client.aiUsage.count({ where: { userId: request.userId, createdAt: { gt: since(DAY_MS) } } });
      if (byDemo >= limits.demoDaily) return refuse('demo_daily');
    } else {
      const byUser = await client.aiUsage.count({ where: { userId: request.userId, createdAt: { gt: since(HOUR_MS) } } });
      if (byUser >= limits.userHourly) return refuse('user_hourly');
    }
    const row = await client.aiUsage.create({
      data: {
        feature: request.feature,
        userId: request.userId,
        clientIp: request.clientIp,
        projectId: request.projectId,
        provider: request.provider,
        model: request.model,
        inputChars: request.inputChars,
      },
      select: { id: true },
    });
    return { ok: true as const, id: row.id };
  });
}

/** Closes a reservation with what the provider reported spending. */
export async function finishAiCall(id: string, status: 'DONE' | 'FAILED', usage?: Partial<AiUsageTokens>) {
  await prisma.aiUsage.update({
    where: { id },
    data: {
      status,
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
      finishedAt: new Date(),
    },
  });
}
