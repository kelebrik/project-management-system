import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { askProject, ASK_PROJECT_LIMITS, buildAskFacts, type AskLeave, type AskProject } from '../../services/ai/ask-project.js';
import { DAY_MS, utcDay } from '../../services/ai/report-facts.js';
import type { AiKit } from './common.js';

const askSchema = z.object({
  question: z.string().trim().min(5).max(ASK_PROJECT_LIMITS.question),
  locale: z.enum(['ru', 'en']).default('ru'),
});

/** Leaves from a month back to half a year ahead; the facts keep only those of the project's people. */
async function loadLeaves(now: Date): Promise<AskLeave[]> {
  const today = utcDay(now);
  const rows = await prisma.leave.findMany({
    where: {
      endDate: { gte: new Date(today.getTime() - ASK_PROJECT_LIMITS.leaveBackDays * DAY_MS) },
      startDate: { lte: new Date(today.getTime() + ASK_PROJECT_LIMITS.leaveAheadDays * DAY_MS) },
      employee: { isActive: true },
    },
    select: { startDate: true, endDate: true, employee: { select: { name: true } }, type: { select: { name: true } } },
    orderBy: { startDate: 'asc' },
  });
  return rows.map((row) => ({ employee: row.employee.name, type: row.type.name, startDate: row.startDate, endDate: row.endDate }));
}

export type AskProjectDependencies = {
  ask?: typeof askProject;
  loadProject: (projectId: string) => Promise<AskProject | null>;
  loadLeaves?: (now: Date) => Promise<AskLeave[]>;
  now: () => Date;
};

/** One question about the project, answered only from its data, with the rows it relies on. */
export function registerAskProject(router: Router, { guard, runAiCall }: AiKit, dependencies: AskProjectDependencies) {
  const ask = dependencies.ask ?? askProject;
  const leavesFor = dependencies.loadLeaves ?? loadLeaves;
  router.post('/projects/:projectId/ai/ask', async (req, res) => {
    const context = await guard(req, res);
    if (!context) return;
    const body = askSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: `Задайте вопрос от 5 до ${ASK_PROJECT_LIMITS.question} символов` });
      return;
    }
    const now = dependencies.now();
    const [project, leaves] = await Promise.all([dependencies.loadProject(context.project.id), leavesFor(now)]);
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const facts = buildAskFacts(project, leaves, now);
    await runAiCall(req, res, context, {
      feature: 'ask-project',
      inputChars: facts.text.length + body.data.question.length,
      failure: 'Модель не смогла ответить на вопрос.',
      run: (signal) => ask({ config: context.config, facts, question: body.data.question, locale: body.data.locale, signal }),
      // The question itself is text the user typed; the audit keeps only its length.
      counters: (result) => ({
        questionChars: body.data.question.length,
        citations: result.answer.citations.length,
        insufficientData: result.answer.insufficientData,
        droppedRefs: result.droppedRefs,
      }),
      respond: (result) => ({ ...result.answer, refs: result.refs, droppedRefs: result.droppedRefs }),
    });
  });
}
