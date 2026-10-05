import { MEETING_DRAFT_LIMITS } from '@pms/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { currentApiToken, currentUser } from '../server/auth.js';
import { isCloudProfile } from '../server/deployment-profile.js';
import { logEvent } from '../server/logger.js';
import { readAiConfig, type AiConfig } from '../services/ai/config.js';
import { extractMeetingDrafts } from '../services/ai/meeting-drafts.js';
import { buildReportFacts, writeStatusReport } from '../services/ai/status-report.js';
import { draftWbs, WBS_DRAFT_LIMITS } from '../services/ai/wbs-draft.js';
import { getProjectForOverviewGeneration } from '../services/executive-overview.js';
import { projectShiftLadders } from '../services/schedule-shifts.js';
import { createAiKit, isDemoVisitor, type AiKitDependencies } from './ai/common.js';
import { registerMeetingPrep, type MeetingPrepDependencies } from './ai/meeting-prep.routes.js';
import { registerRiskAssistant, type RiskAssistantDependencies } from './ai/risk-assistant.routes.js';
import { registerAskProject, type AskProjectDependencies } from './ai/ask-project.routes.js';
import { registerWorkloadRebalance, type WorkloadRebalanceDependencies } from './ai/workload-rebalance.routes.js';
import type { AskProject } from '../services/ai/ask-project.js';
import type { RiskAssistantProject } from '../services/ai/risk-assistant.js';
import type { MeetingPrepProject } from '../services/ai/meeting-prep.js';

const bodySchema = z.object({ text: z.string().trim().min(1).max(MEETING_DRAFT_LIMITS.text) });
const reportSchema = z.object({
  periodDays: z.union([z.literal(7), z.literal(14), z.literal(30)]).default(7),
  locale: z.enum(['ru', 'en']).default('ru'),
});
const wbsDraftSchema = z.object({ description: z.string().trim().min(20).max(WBS_DRAFT_LIMITS.description) });

type Dependencies = {
  config?: AiConfig;
  extract?: typeof extractMeetingDrafts;
  report?: typeof writeStatusReport;
  draft?: typeof draftWbs;
  loadReportProject?: (projectId: string) => Promise<(Parameters<typeof buildReportFacts>[0] & MeetingPrepProject & RiskAssistantProject & AskProject) | null>;
  reserve?: AiKitDependencies['reserve'];
  finish?: AiKitDependencies['finish'];
  hasEditableProject?: AiKitDependencies['hasEditableProject'];
  prepareMeeting?: MeetingPrepDependencies['prepare'];
  suggestRisks?: RiskAssistantDependencies['suggest'];
  askProject?: AskProjectDependencies['ask'];
  loadLeaves?: AskProjectDependencies['loadLeaves'];
  loadShiftLadders?: typeof projectShiftLadders;
  suggestRebalance?: WorkloadRebalanceDependencies['suggest'];
  loadWorkload?: WorkloadRebalanceDependencies['loadWorkload'];
  now?: () => Date;
};

/**
 * AI helpers: meeting notes to drafts, a status report, a draft structure. The
 * text goes to an outside provider and costs money, so a call needs a user
 * session (not an API token), the right to change the project, and a free slot
 * in the budgets; the public demo is refused unless allowed. The model only
 * returns drafts and text: nothing is created here.
 */
export function createAiRouter(dependencies: Dependencies = {}) {
  const router = Router();
  let config = dependencies.config;
  if (!config) {
    const read = readAiConfig();
    config = read.config;
    for (const warning of read.warnings) logEvent('warn', 'ai.config', { warning });
  }
  const extract = dependencies.extract ?? extractMeetingDrafts;
  const report = dependencies.report ?? writeStatusReport;
  const draft = dependencies.draft ?? draftWbs;
  const loadReportProject = dependencies.loadReportProject ?? getProjectForOverviewGeneration;
  const kit = createAiKit({ config, reserve: dependencies.reserve, finish: dependencies.finish, hasEditableProject: dependencies.hasEditableProject });
  const { guard, runAiCall } = kit;
  const now = dependencies.now ?? (() => new Date());
  const loadShiftLadders = dependencies.loadShiftLadders ?? projectShiftLadders;

  const allowedFor = (req: Request) =>
    config.enabled && Boolean(currentUser(req)) && !currentApiToken(req) && (!isDemoVisitor(req) || config.allowPublicDemo);

  // Background calls: the page polls for the answer and may stop waiting.
  router.get('/ai/jobs/:jobId', kit.pollJob);
  router.delete('/ai/jobs/:jobId', kit.cancelJob);

  router.get('/ai/status', (req, res) => {
    res.json(
      config.enabled
        ? { enabled: true, provider: config.provider, model: config.model, allowed: allowedFor(req) }
        : // A corporate installation is meant to use GigaChat; until it is connected the page says so.
          { enabled: false, allowed: false, setup: isCloudProfile() ? null : 'gigachat' },
    );
  });

  router.post('/projects/:projectId/meeting-drafts', async (req, res) => {
    const context = await guard(req, res);
    if (!context) return;
    const body = bodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: `Вставьте текст протокола, не длиннее ${MEETING_DRAFT_LIMITS.text} символов` });
      return;
    }
    const [employees, owners] = await Promise.all([
      prisma.leaveEmployee.findMany({ where: { isActive: true }, select: { name: true } }),
      prisma.wbsItem.findMany({ where: { projectId: context.project.id, owner: { not: '' } }, select: { owner: true }, distinct: ['owner'] }),
    ]);
    const people = [...new Set([...employees.map((row) => row.name), ...owners.map((row) => row.owner.trim())].filter(Boolean))];
    await runAiCall(req, res, context, {
      feature: 'meeting-drafts',
      inputChars: body.data.text.length,
      failure: 'Модель не смогла подготовить черновики.',
      run: (signal) =>
        extract({ config: context.config, notes: body.data.text, today: now().toISOString().slice(0, 10), projectName: context.project.name, people, signal }),
      counters: (result) => ({ drafts: result.drafts.length }),
      respond: (result) => ({ drafts: result.drafts }),
    });
  });

  router.post('/projects/:projectId/ai/status-report', async (req, res) => {
    const context = await guard(req, res);
    if (!context) return;
    const body = reportSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Период отчета: 7, 14 или 30 дней' });
      return;
    }
    const project = await loadReportProject(context.project.id);
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const goal = (await loadShiftLadders(context.project.id).catch(() => [])).find((ladder) => ladder.isActiveGoal);
    const goalShifts = goal
      ? { goal: `${goal.code} ${goal.title}`, varianceDays: goal.varianceDays, beforeJournalDays: goal.unexplainedDays, byReason: goal.reasonDays }
      : null;
    const facts = buildReportFacts(project, body.data.periodDays, now(), goalShifts);
    await runAiCall(req, res, context, {
      feature: 'status-report',
      inputChars: facts.length,
      failure: 'Модель не смогла подготовить отчет.',
      run: (signal) => report({ config: context.config, facts, locale: body.data.locale, signal }),
      counters: () => ({ periodDays: body.data.periodDays }),
      respond: (result) => ({ report: result.report, periodDays: body.data.periodDays, generatedAt: now().toISOString() }),
    });
  });

  router.post('/projects/:projectId/ai/wbs-draft', async (req, res) => {
    const context = await guard(req, res);
    if (!context) return;
    const body = wbsDraftSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: `Опишите проект, не длиннее ${WBS_DRAFT_LIMITS.description} символов` });
      return;
    }
    await runAiCall(req, res, context, {
      feature: 'wbs-draft',
      inputChars: body.data.description.length,
      failure: 'Модель не смогла подготовить черновик.',
      run: (signal) => draft({ config: context.config, description: body.data.description, today: now().toISOString().slice(0, 10), signal }),
      counters: (result) => ({ rows: result.items.length, droppedLinks: result.droppedLinks }),
      respond: (result) => ({ items: result.items, droppedLinks: result.droppedLinks }),
    });
  });

  registerMeetingPrep(router, kit, { prepare: dependencies.prepareMeeting, loadProject: loadReportProject, now });
  registerRiskAssistant(router, kit, { suggest: dependencies.suggestRisks, loadProject: loadReportProject, now });
  registerAskProject(router, kit, { ask: dependencies.askProject, loadProject: loadReportProject, loadLeaves: dependencies.loadLeaves, now });
  registerWorkloadRebalance(router, kit, { suggest: dependencies.suggestRebalance, loadWorkload: dependencies.loadWorkload, now });

  return router;
}
