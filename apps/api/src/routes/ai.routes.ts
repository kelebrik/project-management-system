import { MEETING_DRAFT_LIMITS, PUBLIC_DEMO_USER_ID } from '@pms/shared';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { currentApiToken, currentUser, isPublicDemoMode } from '../server/auth.js';
import { isCloudProfile } from '../server/deployment-profile.js';
import { logEvent } from '../server/logger.js';
import { userCanWriteProject } from '../server/project-access.js';
import { recordAuditEvent } from '../services/audit.js';
import { finishAiCall, reserveAiCall, type AiBudgetRefusal } from '../services/ai/budget.js';
import { readAiConfig, type AiConfig } from '../services/ai/config.js';
import { extractMeetingDrafts } from '../services/ai/meeting-drafts.js';
import { AiProviderError, type AiUsageTokens } from '../services/ai/openai.js';
import { buildReportFacts, writeStatusReport } from '../services/ai/status-report.js';
import { draftWbs, WBS_DRAFT_LIMITS } from '../services/ai/wbs-draft.js';
import { getProjectForOverviewGeneration } from '../services/executive-overview.js';

const REFUSALS: Record<AiBudgetRefusal, string> = {
  concurrent: 'Сейчас модель занята другими запросами. Повторите через минуту.',
  user_hourly: 'Исчерпан лимит обращений к модели на час. Повторите позже.',
  daily: 'Исчерпан суточный лимит обращений к модели.',
  tokens: 'Исчерпан суточный бюджет модели.',
  demo_ip: 'В демо можно обратиться к модели несколько раз в час. Повторите позже.',
  demo_daily: 'Суточный лимит демо исчерпан.',
};

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
  loadReportProject?: (projectId: string) => Promise<Parameters<typeof buildReportFacts>[0] | null>;
  reserve?: typeof reserveAiCall;
  finish?: typeof finishAiCall;
  now?: () => Date;
};

function isDemoVisitor(req: Request) {
  return isPublicDemoMode() && currentUser(req)?.id === PUBLIC_DEMO_USER_ID;
}

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
  const reserve = dependencies.reserve ?? reserveAiCall;
  const finish = dependencies.finish ?? finishAiCall;
  const now = dependencies.now ?? (() => new Date());

  const allowedFor = (req: Request) =>
    config.enabled && Boolean(currentUser(req)) && !currentApiToken(req) && (!isDemoVisitor(req) || config.allowPublicDemo);

  router.get('/ai/status', (req, res) => {
    res.json(
      config.enabled
        ? { enabled: true, provider: config.provider, model: config.model, allowed: allowedFor(req) }
        : // A corporate installation is meant to use GigaChat; until it is connected the page says so.
          { enabled: false, allowed: false, setup: isCloudProfile() ? null : 'gigachat' },
    );
  });

  /**
   * Checks every model call shares: a user session (not an API token), a
   * configured provider, the demo only when allowed, an open project the user
   * may change. Answers the request itself and returns null when one fails.
   */
  const guard = async (req: Request, res: Response) => {
    const user = currentUser(req);
    if (!user || currentApiToken(req)) {
      res.status(403).json({ error: 'Помощь ИИ доступна только из сессии пользователя' });
      return null;
    }
    if (!config.enabled) {
      res.status(503).json({ error: 'Помощь ИИ не настроена' });
      return null;
    }
    const demo = isDemoVisitor(req);
    if (demo && !config.allowPublicDemo) {
      res.status(403).json({ error: 'В публичном демо помощь ИИ выключена' });
      return null;
    }
    const project = await prisma.project.findUnique({ where: { id: String(req.params.projectId) }, select: { id: true, name: true, status: true } });
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return null;
    }
    // This router runs before the shared closed-project guard, so it checks itself.
    if (project.status === 'CLOSED') {
      res.status(423).json({ error: 'Проект закрыт и доступен только для чтения' });
      return null;
    }
    if (!demo && user.role !== 'ADMIN' && !(await userCanWriteProject(user.id, project.id))) {
      res.status(403).json({ error: 'Нет доступа на изменение этого проекта' });
      return null;
    }
    return { config, user, demo, project };
  };

  /**
   * One budgeted model call: reserve a slot, stop the provider when the page
   * goes away, close the reservation with the tokens spent, keep counters (never
   * the text) in the audit log, and turn provider errors into safe messages.
   */
  const runAiCall = async <T extends { usage: AiUsageTokens }>(
    req: Request,
    res: Response,
    context: NonNullable<Awaited<ReturnType<typeof guard>>>,
    call: {
      feature: string;
      inputChars: number;
      failure: string;
      run: (signal: AbortSignal) => Promise<T>;
      counters: (result: T) => Record<string, unknown>;
      respond: (result: T) => unknown;
    },
  ) => {
    const { user, demo, project } = context;
    const reservation = await reserve(
      {
        feature: call.feature,
        userId: user.id,
        clientIp: req.ip ?? null,
        projectId: project.id,
        provider: context.config.provider,
        model: context.config.model,
        inputChars: call.inputChars,
        isDemo: demo,
      },
      context.config.limits,
    );
    if (!reservation.ok) {
      res.status(429).json({ error: REFUSALS[reservation.reason] });
      return;
    }
    // Stop paying for an answer nobody waits for any more.
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });
    try {
      const result = await call.run(abort.signal);
      await finish(reservation.id, 'DONE', result.usage);
      await recordAuditEvent({
        req,
        actor: user,
        action: `ai.${call.feature.replaceAll('-', '_')}`,
        objectType: 'Project',
        objectId: project.id,
        projectId: project.id,
        // Counters only: what was sent and what the model said are never stored.
        metadata: {
          provider: context.config.provider,
          model: context.config.model,
          inputChars: call.inputChars,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          ...call.counters(result),
        },
      });
      res.json({ ...(call.respond(result) as object), provider: context.config.provider, model: context.config.model });
    } catch (error) {
      const usage = (error as { usage?: AiUsageTokens }).usage;
      await finish(reservation.id, 'FAILED', usage).catch(() => undefined);
      if (error instanceof AiProviderError) {
        logEvent('warn', `ai.${call.feature}_failed`, { projectId: project.id, status: error.status ?? null, reason: error.message });
        // The details name server settings; a demo visitor only learns that it failed.
        const message = demo ? `${call.failure} Попробуйте позже.` : error.message;
        if (!res.headersSent && !abort.signal.aborted) res.status(502).json({ error: message });
        return;
      }
      throw error;
    }
  };

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
    const facts = buildReportFacts(project, body.data.periodDays, now());
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

  return router;
}
