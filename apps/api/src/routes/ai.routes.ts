import { MEETING_DRAFT_LIMITS, PUBLIC_DEMO_USER_ID } from '@pms/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { currentApiToken, currentUser, isPublicDemoMode } from '../server/auth.js';
import { logEvent } from '../server/logger.js';
import { userCanWriteProject } from '../server/project-access.js';
import { recordAuditEvent } from '../services/audit.js';
import { finishAiCall, reserveAiCall, type AiBudgetRefusal } from '../services/ai/budget.js';
import { readAiConfig, type AiConfig } from '../services/ai/config.js';
import { extractMeetingDrafts } from '../services/ai/meeting-drafts.js';
import { AiProviderError } from '../services/ai/openai.js';

const REFUSALS: Record<AiBudgetRefusal, string> = {
  concurrent: 'Сейчас модель обрабатывает другие протоколы. Повторите через минуту.',
  user_hourly: 'Исчерпан лимит разборов протоколов на час. Повторите позже.',
  daily: 'Исчерпан суточный лимит разборов протоколов.',
  tokens: 'Исчерпан суточный бюджет модели.',
  demo_ip: 'В демо можно разобрать несколько протоколов в час. Повторите позже.',
  demo_daily: 'Суточный лимит демо исчерпан.',
};

const bodySchema = z.object({ text: z.string().trim().min(1).max(MEETING_DRAFT_LIMITS.text) });

type Dependencies = {
  config?: AiConfig;
  extract?: typeof extractMeetingDrafts;
  reserve?: typeof reserveAiCall;
  finish?: typeof finishAiCall;
  now?: () => Date;
};

function isDemoVisitor(req: Request) {
  return isPublicDemoMode() && currentUser(req)?.id === PUBLIC_DEMO_USER_ID;
}

/**
 * AI helpers. The text goes to an outside provider and costs money, so a call
 * needs a user session (not an API token), the right to change the project,
 * and a free slot in the budgets; the public demo is refused unless allowed.
 * The model only returns drafts: nothing is created here.
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
  const reserve = dependencies.reserve ?? reserveAiCall;
  const finish = dependencies.finish ?? finishAiCall;
  const now = dependencies.now ?? (() => new Date());

  const allowedFor = (req: Request) =>
    config.enabled && Boolean(currentUser(req)) && !currentApiToken(req) && (!isDemoVisitor(req) || config.allowPublicDemo);

  router.get('/ai/status', (req, res) => {
    res.json(
      config.enabled
        ? { enabled: true, provider: config.provider, model: config.model, allowed: allowedFor(req) }
        : { enabled: false, allowed: false },
    );
  });

  router.post('/projects/:projectId/meeting-drafts', async (req, res) => {
    const user = currentUser(req);
    if (!user || currentApiToken(req)) {
      res.status(403).json({ error: 'Разбор протокола доступен только из сессии пользователя' });
      return;
    }
    if (!config.enabled) {
      res.status(503).json({ error: 'ИИ-разбор протоколов не настроен' });
      return;
    }
    const demo = isDemoVisitor(req);
    if (demo && !config.allowPublicDemo) {
      res.status(403).json({ error: 'В публичном демо ИИ-разбор протоколов выключен' });
      return;
    }
    const body = bodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: `Вставьте текст протокола, не длиннее ${MEETING_DRAFT_LIMITS.text} символов` });
      return;
    }
    const projectId = String(req.params.projectId);
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, status: true } });
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    if (project.status === 'CLOSED') {
      res.status(423).json({ error: 'Проект закрыт и доступен только для чтения' });
      return;
    }
    if (!demo && user.role !== 'ADMIN' && !(await userCanWriteProject(user.id, project.id))) {
      res.status(403).json({ error: 'Нет доступа на изменение этого проекта' });
      return;
    }

    const [employees, owners] = await Promise.all([
      prisma.leaveEmployee.findMany({ where: { isActive: true }, select: { name: true } }),
      prisma.wbsItem.findMany({ where: { projectId: project.id, owner: { not: '' } }, select: { owner: true }, distinct: ['owner'] }),
    ]);
    const people = [...new Set([...employees.map((row) => row.name), ...owners.map((row) => row.owner.trim())].filter(Boolean))];

    const reservation = await reserve(
      {
        feature: 'meeting-drafts',
        userId: user.id,
        clientIp: req.ip ?? null,
        projectId: project.id,
        provider: config.provider,
        model: config.model,
        inputChars: body.data.text.length,
        isDemo: demo,
      },
      config.limits,
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
      const { drafts, usage } = await extract({
        config,
        notes: body.data.text,
        today: now().toISOString().slice(0, 10),
        projectName: project.name,
        people,
        signal: abort.signal,
      });
      await finish(reservation.id, 'DONE', usage);
      await recordAuditEvent({
        req,
        actor: user,
        action: 'ai.meeting_drafts',
        objectType: 'Project',
        objectId: project.id,
        projectId: project.id,
        // Counters only: the notes and the model's answer are never stored.
        metadata: {
          provider: config.provider,
          model: config.model,
          inputChars: body.data.text.length,
          drafts: drafts.length,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
        },
      });
      res.json({ drafts, provider: config.provider, model: config.model });
    } catch (error) {
      const usage = (error as { usage?: { promptTokens: number; completionTokens: number } }).usage;
      await finish(reservation.id, 'FAILED', usage).catch(() => undefined);
      if (error instanceof AiProviderError) {
        logEvent('warn', 'ai.meeting_drafts_failed', { projectId: project.id, status: error.status ?? null, reason: error.message });
        // The details name server settings; a demo visitor only learns that it failed.
        const message = demo ? 'Модель не смогла подготовить черновики. Попробуйте позже.' : error.message;
        if (!res.headersSent && !abort.signal.aborted) res.status(502).json({ error: message });
        return;
      }
      throw error;
    }
  });

  return router;
}
