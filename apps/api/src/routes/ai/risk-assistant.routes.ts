import type { Router } from 'express';
import { z } from 'zod';
import { buildRiskAssistantFacts, suggestRisks, type RiskAssistantProject } from '../../services/ai/risk-assistant.js';
import type { AiKit } from './common.js';

const suggestSchema = z.object({ locale: z.enum(['ru', 'en']).default('ru') });

export type RiskAssistantDependencies = {
  suggest?: typeof suggestRisks;
  loadProject: (projectId: string) => Promise<RiskAssistantProject | null>;
  now: () => Date;
};

/**
 * New risks, scores and mitigation plans suggested from the project's slips,
 * overlaps and stale Jira tickets. Nothing is written: the page applies what
 * the user picks through the risk register's own create and update routes.
 */
export function registerRiskAssistant(router: Router, { guard, runAiCall }: AiKit, dependencies: RiskAssistantDependencies) {
  const suggest = dependencies.suggest ?? suggestRisks;
  router.post('/projects/:projectId/ai/risk-suggestions', async (req, res) => {
    const context = await guard(req, res);
    if (!context) return;
    const body = suggestSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Язык ответа: ru или en' });
      return;
    }
    const project = await dependencies.loadProject(context.project.id);
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const facts = buildRiskAssistantFacts(project, dependencies.now());
    await runAiCall(req, res, context, {
      feature: 'risk-suggestions',
      inputChars: facts.text.length,
      failure: 'Модель не смогла подготовить предложения по рискам.',
      run: (signal) => suggest({ config: context.config, facts, locale: body.data.locale, signal }),
      counters: (result) => ({
        newRisks: result.suggestions.newRisks.length,
        scores: result.suggestions.scores.length,
        mitigations: result.suggestions.mitigations.length,
        droppedRefs: result.droppedRefs,
      }),
      respond: (result) => ({ ...result.suggestions, refs: result.refs, droppedRefs: result.droppedRefs }),
    });
  });
}
