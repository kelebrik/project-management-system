import type { Router } from 'express';
import { z } from 'zod';
import { buildMeetingPrepFacts, prepareMeeting, type MeetingPrepProject } from '../../services/ai/meeting-prep.js';
import type { AiKit } from './common.js';

const prepSchema = z.object({
  horizonDays: z.union([z.literal(7), z.literal(14)]).default(7),
  locale: z.enum(['ru', 'en']).default('ru'),
});

export type MeetingPrepDependencies = {
  prepare?: typeof prepareMeeting;
  loadProject: (projectId: string) => Promise<MeetingPrepProject | null>;
  now: () => Date;
};

/** An agenda for the next team meeting and whom to ask what; nothing is saved. */
export function registerMeetingPrep(router: Router, { guard, runAiCall }: AiKit, dependencies: MeetingPrepDependencies) {
  const prepare = dependencies.prepare ?? prepareMeeting;
  router.post('/projects/:projectId/ai/meeting-prep', async (req, res) => {
    const context = await guard(req, res);
    if (!context) return;
    const body = prepSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Горизонт подготовки: 7 или 14 дней' });
      return;
    }
    const project = await dependencies.loadProject(context.project.id);
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const facts = buildMeetingPrepFacts(project, body.data.horizonDays, dependencies.now());
    await runAiCall(req, res, context, {
      feature: 'meeting-prep',
      inputChars: facts.text.length,
      failure: 'Модель не смогла подготовить повестку.',
      run: (signal) => prepare({ config: context.config, facts, locale: body.data.locale, signal }),
      counters: (result) => ({ topics: result.prep.agenda.length, questions: result.prep.askWhom.length, droppedRefs: result.droppedRefs }),
      respond: (result) => ({ ...result.prep, refs: result.refs, droppedRefs: result.droppedRefs, horizonDays: body.data.horizonDays }),
    });
  });
}
