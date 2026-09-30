import type { Request, Router } from 'express';
import { z } from 'zod';
import { buildRebalanceFacts, REBALANCE_HORIZONS, suggestRebalance } from '../../services/ai/workload-rebalance.js';
import { DAY_MS, day, utcDay } from '../../services/ai/report-facts.js';
import { loadWorkload, type WorkloadSnapshot } from '../../services/workload.js';
import type { AiKit } from './common.js';

const rebalanceSchema = z.object({
  horizonDays: z.union([z.literal(REBALANCE_HORIZONS[0]), z.literal(REBALANCE_HORIZONS[1]), z.literal(REBALANCE_HORIZONS[2])]).default(30),
  locale: z.enum(['ru', 'en']).default('ru'),
});

export type WorkloadRebalanceDependencies = {
  suggest?: typeof suggestRebalance;
  loadWorkload?: (req: Request, range: { from: string; to: string }) => Promise<WorkloadSnapshot>;
  now: () => Date;
};

/**
 * Who should take which work, and when, to remove overloads and work on leave
 * in the next days, across the projects the user may change. Nothing is
 * written: the workload page applies what the user picks with its own edits.
 */
export function registerWorkloadRebalance(router: Router, { guardWithoutProject, runAiCall }: AiKit, dependencies: WorkloadRebalanceDependencies) {
  const suggest = dependencies.suggest ?? suggestRebalance;
  const load = dependencies.loadWorkload ?? loadWorkload;
  router.post('/ai/workload-rebalance', async (req, res) => {
    const context = await guardWithoutProject(req, res);
    if (!context) return;
    const body = rebalanceSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Горизонт: 30, 60 или 90 дней' });
      return;
    }
    const now = dependencies.now();
    const today = utcDay(now);
    const snapshot = await load(req, { from: day(today)!, to: day(new Date(today.getTime() + (body.data.horizonDays - 1) * DAY_MS))! });
    const facts = buildRebalanceFacts(snapshot, body.data.horizonDays, now);
    if (facts.items.size === 0) {
      res.json({ suggestions: [], items: {}, droppedRefs: 0, horizonDays: body.data.horizonDays, nothingToMove: true });
      return;
    }
    await runAiCall(req, res, context, {
      feature: 'workload-rebalance',
      inputChars: facts.text.length,
      failure: 'Модель не смогла предложить перераспределение.',
      run: (signal) => suggest({ config: context.config, facts, locale: body.data.locale, signal }),
      counters: (result) => ({ horizonDays: body.data.horizonDays, suggestions: result.suggestions.length, droppedRefs: result.droppedRefs }),
      respond: (result) => ({ suggestions: result.suggestions, items: result.items, droppedRefs: result.droppedRefs, horizonDays: body.data.horizonDays }),
    });
  });
}
