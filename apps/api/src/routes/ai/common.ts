import { PUBLIC_DEMO_USER_ID } from '@pms/shared';
import type { Request, Response } from 'express';
import { prisma } from '../../db.js';
import { currentApiToken, currentUser, isPublicDemoMode } from '../../server/auth.js';
import { logEvent } from '../../server/logger.js';
import { userCanWriteProject, userProjectAccessLevelMap } from '../../server/project-access.js';
import { recordAuditEvent } from '../../services/audit.js';
import { finishAiCall, reserveAiCall, type AiBudgetRefusal } from '../../services/ai/budget.js';
import type { AiConfig } from '../../services/ai/config.js';
import { AiProviderError, type AiUsageTokens } from '../../services/ai/openai.js';

const REFUSALS: Record<AiBudgetRefusal, string> = {
  concurrent: 'Сейчас модель занята другими запросами. Повторите через минуту.',
  user_hourly: 'Исчерпан лимит обращений к модели на час. Повторите позже.',
  daily: 'Исчерпан суточный лимит обращений к модели.',
  tokens: 'Исчерпан суточный бюджет модели.',
  demo_ip: 'В демо можно обратиться к модели несколько раз в час. Повторите позже.',
  demo_daily: 'Суточный лимит демо исчерпан.',
};

export function isDemoVisitor(req: Request) {
  return isPublicDemoMode() && currentUser(req)?.id === PUBLIC_DEMO_USER_ID;
}

type User = NonNullable<ReturnType<typeof currentUser>>;
type EnabledAiConfig = Extract<AiConfig, { enabled: true }>;
export type AiProjectContext = { config: EnabledAiConfig; user: User; demo: boolean; project: { id: string; name: string; status: string } };
/** A call about the user's own work across projects: nothing ties it to one project. */
export type AiContext = Omit<AiProjectContext, 'project'> & { project: AiProjectContext['project'] | null };

export type AiKitDependencies = {
  config: AiConfig;
  reserve?: typeof reserveAiCall;
  finish?: typeof finishAiCall;
  /** Whether the user may change at least one open project; the cross-project calls need it. */
  hasEditableProject?: (user: User) => Promise<boolean>;
};

async function userHasEditableProject(user: User) {
  const open = await prisma.project.findMany({ where: { status: { not: 'CLOSED' } }, select: { id: true } });
  if (user.role === 'ADMIN') return open.length > 0;
  const levels = await userProjectAccessLevelMap(user.id, open.map((project) => project.id));
  return [...levels.values()].some((level) => level === 'EDIT' || level === 'ADMIN');
}

/**
 * The checks and the budgeted call every AI helper shares. The text goes to an
 * outside provider and costs money, so a call needs a user session (not an API
 * token), a configured provider, the demo only when allowed, and a free slot in
 * the budgets. The model only returns drafts and text: nothing is written here.
 */
export function createAiKit({ config, reserve = reserveAiCall, finish = finishAiCall, hasEditableProject = userHasEditableProject }: AiKitDependencies) {
  const baseGuard = (req: Request, res: Response) => {
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
    return { config, user, demo };
  };

  /** An open project the user may change. Answers the request itself and returns null when a check fails. */
  const guard = async (req: Request, res: Response): Promise<AiProjectContext | null> => {
    const base = baseGuard(req, res);
    if (!base) return null;
    const project = await prisma.project.findUnique({ where: { id: String(req.params.projectId) }, select: { id: true, name: true, status: true } });
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return null;
    }
    // These routes run before the shared closed-project guard, so they check themselves.
    if (project.status === 'CLOSED') {
      res.status(423).json({ error: 'Проект закрыт и доступен только для чтения' });
      return null;
    }
    if (!base.demo && base.user.role !== 'ADMIN' && !(await userCanWriteProject(base.user.id, project.id))) {
      res.status(403).json({ error: 'Нет доступа на изменение этого проекта' });
      return null;
    }
    return { ...base, project };
  };

  /** A call across the user's projects: the user must be able to change at least one open project. */
  const guardWithoutProject = async (req: Request, res: Response): Promise<AiContext | null> => {
    const base = baseGuard(req, res);
    if (!base) return null;
    if (!base.demo && !(await hasEditableProject(base.user))) {
      res.status(403).json({ error: 'Нет проектов, которые вы можете изменять' });
      return null;
    }
    return { ...base, project: null };
  };

  /**
   * One budgeted model call: reserve a slot, stop the provider when the page
   * goes away, close the reservation with the tokens spent, keep counters (never
   * the text) in the audit log, and turn provider errors into safe messages.
   */
  const runAiCall = async <T extends { usage: AiUsageTokens }>(
    req: Request,
    res: Response,
    context: AiContext,
    call: {
      feature: string;
      inputChars: number;
      failure: string;
      run: (signal: AbortSignal) => Promise<T>;
      counters: (result: T) => Record<string, unknown>;
      respond: (result: T) => unknown;
    },
  ) => {
    const { config, user, demo, project } = context;
    const reservation = await reserve(
      {
        feature: call.feature,
        userId: user.id,
        clientIp: req.ip ?? null,
        projectId: project?.id ?? null,
        provider: config.provider,
        model: config.model,
        inputChars: call.inputChars,
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
      const result = await call.run(abort.signal);
      await finish(reservation.id, 'DONE', result.usage);
      await recordAuditEvent({
        req,
        actor: user,
        action: `ai.${call.feature.replaceAll('-', '_')}`,
        objectType: project ? 'Project' : 'User',
        objectId: project?.id ?? user.id,
        projectId: project?.id ?? null,
        // Counters only: what was sent and what the model said are never stored.
        metadata: {
          provider: config.provider,
          model: config.model,
          inputChars: call.inputChars,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          ...call.counters(result),
        },
      });
      res.json({ ...(call.respond(result) as object), provider: config.provider, model: config.model });
    } catch (error) {
      const usage = (error as { usage?: AiUsageTokens }).usage;
      await finish(reservation.id, 'FAILED', usage).catch(() => undefined);
      if (error instanceof AiProviderError) {
        logEvent('warn', `ai.${call.feature}_failed`, { projectId: project?.id ?? null, status: error.status ?? null, reason: error.message });
        // The details name server settings; a demo visitor only learns that it failed.
        const message = demo ? `${call.failure} Попробуйте позже.` : error.message;
        if (!res.headersSent && !abort.signal.aborted) res.status(502).json({ error: message });
        return;
      }
      throw error;
    }
  };

  return { guard, guardWithoutProject, runAiCall };
}

export type AiKit = ReturnType<typeof createAiKit>;
