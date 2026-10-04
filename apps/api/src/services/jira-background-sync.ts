import { JiraSyncRunKind, Prisma, type PrismaClient } from '@prisma/client';
import { isJiraConfigured } from '../jira-client.js';
import { logEvent } from '../server/logger.js';
import { isJiraAccessAllowed } from '../server/deployment-profile.js';
import { automationTimeZone, localMoment } from './automation/time.js';
import { JIRA_HISTORY_CRITICAL_PERCENT, jiraHistoryDatabaseBytes, jiraHistoryStorageBudgetBytes } from './jira-history.js';
import { requestJiraCurrentRefresh } from './jira-current-refresh.js';
import { notifyJiraSyncRunner } from './jira-sync-runtime.js';
import { enqueueJiraSyncRun, JiraSyncFencedError } from './jira-sync-runs.js';

/**
 * Keeps the Jira data of projects fresh without anyone opening the page. An
 * administrator picks the mode in Integrations: off, current (a refresh of
 * the current data every hour or so on working days) or nightly (that and a
 * full sync with history once a night). It only puts runs into the existing
 * queue, which works through them one at a time; Jira is only searched.
 */

export type BackgroundSyncMode = 'off' | 'current' | 'nightly';
export const BACKGROUND_SYNC_SETTING = 'jira.backgroundSync';

export function backgroundSyncMode(value: string | null | undefined): BackgroundSyncMode {
  return value === 'off' || value === 'nightly' ? value : 'current';
}

const TICK_MS = 5 * 60_000;
const HOUR_MS = 3_600_000;
const FAILED_BACKOFF_MS = HOUR_MS;
const FAILED = new Set(['FAILED', 'STOPPED_CAPACITY']);

export type BackgroundSyncPolicy = {
  timeZone: string;
  /** The local hour of the nightly full sync; it may start within three hours of it. */
  nightHour: number;
  refreshMinutes: number;
  /** The working hours of current-data refreshes, from and before. */
  dayFrom: number;
  dayTo: number;
};

export type BackgroundSyncProject = {
  lastSyncedAt: Date | null;
  currentRefreshedAt: Date | null;
  activeRun: boolean;
  lastRun: { status: string; finishedAt: Date | null } | null;
};

export function backgroundSyncPolicy(env: NodeJS.ProcessEnv = process.env): BackgroundSyncPolicy {
  const number = (value: string | undefined, fallback: number, min: number, max: number) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
  };
  return {
    timeZone: automationTimeZone(),
    nightHour: number(env.JIRA_BACKGROUND_SYNC_HOUR, 3, 0, 23),
    refreshMinutes: number(env.JIRA_BACKGROUND_REFRESH_MINUTES, 60, 15, 24 * 60),
    dayFrom: 7,
    dayTo: 21,
  };
}

export function backgroundSyncEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.JIRA_BACKGROUND_SYNC !== 'false' && isJiraAccessAllowed(env) && isJiraConfigured();
}

/** What to queue for one project now: a nightly full sync, a daytime refresh, or nothing. */
export function backgroundSyncDecision(project: BackgroundSyncProject, now: Date, policy: BackgroundSyncPolicy, mode: BackgroundSyncMode = 'nightly'): 'SYNC' | 'CURRENT' | null {
  if (mode === 'off' || project.activeRun) return null;
  if (project.lastRun && FAILED.has(project.lastRun.status) && project.lastRun.finishedAt && now.getTime() - project.lastRun.finishedAt.getTime() < FAILED_BACKOFF_MS) return null;
  const local = localMoment(now, policy.timeZone);
  const sinceNight = (local.hour - policy.nightHour + 24) % 24;
  // A project never synced in full is set up by an administrator first; the night only repeats it.
  // 20 hours, not 24: the window is three hours wide, so a sync never runs twice in one night and never slips out of it.
  if (mode === 'nightly' && project.lastSyncedAt && sinceNight < 3 && now.getTime() - project.lastSyncedAt.getTime() > 20 * HOUR_MS) return 'SYNC';
  const workingTime = local.weekday <= 5 && local.hour >= policy.dayFrom && local.hour < policy.dayTo;
  const refreshedAt = project.currentRefreshedAt ?? project.lastSyncedAt;
  if (workingTime && project.lastSyncedAt && (!refreshedAt || now.getTime() - refreshedAt.getTime() >= policy.refreshMinutes * 60_000)) return 'CURRENT';
  return null;
}

/** One look over all open projects with Jira set up, by one API process at a time. */
export async function runBackgroundSyncTick(database: PrismaClient, now = new Date(), policy = backgroundSyncPolicy()) {
  const setting = await database.systemSetting.findUnique({ where: { key: BACKGROUND_SYNC_SETTING }, select: { value: true } });
  const mode = backgroundSyncMode(setting?.value);
  if (mode === 'off') return [];
  // Several API processes share the database: the one holding the lock looks, the others skip this tick.
  return database.$transaction(
    async (transaction) => {
      const [{ locked }] = await transaction.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext('jira-background-sync')) AS locked`;
      return locked ? queueStaleProjects(database, now, policy, mode) : [];
    },
    { timeout: 4 * 60_000, maxWait: 10_000 },
  );
}

async function queueStaleProjects(database: PrismaClient, now: Date, policy: BackgroundSyncPolicy, mode: BackgroundSyncMode) {
  const projects = await database.project.findMany({
    where: { status: { not: 'CLOSED' }, jiraAnalyticsSettings: { jiraScopeValue: { not: '' } } },
    select: {
      id: true,
      jiraIntegration: { select: { baseUrl: true } },
      jiraAnalyticsSettings: { select: { jiraScopeType: true, jiraScopeValue: true, lastSyncedAt: true, currentProjectionRefreshedAt: true } },
      jiraSyncRuns: { orderBy: { enqueuedAt: 'desc' }, take: 1, select: { status: true, finishedAt: true, jiraBaseUrl: true } },
    },
  });
  let historyFull: boolean | null = null;
  const queued: Array<{ projectId: string; kind: 'SYNC' | 'CURRENT' }> = [];
  for (const project of projects) {
    const settings = project.jiraAnalyticsSettings!;
    const lastRun = project.jiraSyncRuns[0] ?? null;
    const decision = backgroundSyncDecision(
      {
        lastSyncedAt: settings.lastSyncedAt,
        currentRefreshedAt: settings.currentProjectionRefreshedAt,
        activeRun: lastRun?.status === 'QUEUED' || lastRun?.status === 'RUNNING',
        lastRun,
      },
      now,
      policy,
      mode,
    );
    if (!decision) continue;
    try {
      if (decision === 'CURRENT') {
        const answer = await requestJiraCurrentRefresh(database, project.id, null, now);
        if (answer.queued) queued.push({ projectId: project.id, kind: decision });
        continue;
      }
      // History grows with every full sync: stop at the same mark that stops connecting new scopes.
      historyFull ??= ((await jiraHistoryDatabaseBytes(database)) / jiraHistoryStorageBudgetBytes()) * 100 >= JIRA_HISTORY_CRITICAL_PERCENT;
      if (historyFull) continue;
      await enqueueJiraSyncRun(database, {
        projectId: project.id,
        kind: JiraSyncRunKind.SYNC,
        scopeType: settings.jiraScopeType,
        scopeValue: settings.jiraScopeValue,
        jiraBaseUrl: lastRun?.jiraBaseUrl ?? project.jiraIntegration?.baseUrl ?? undefined,
        scopeChanged: false,
        preserveStoredScope: true,
        requestedById: null,
        requestedByRole: 'SYSTEM',
      });
      queued.push({ projectId: project.id, kind: decision });
    } catch (error) {
      // Someone else's run started in between, or the scope changed: the next tick looks again.
      const raced = error instanceof JiraSyncFencedError || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002');
      if (!raced) logEvent('warn', 'jira.background_sync.enqueue_failed', { projectId: project.id, kind: decision, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (queued.length > 0) {
    notifyJiraSyncRunner();
    logEvent('info', 'jira.background_sync.queued', { runs: queued.length, sync: queued.filter((run) => run.kind === 'SYNC').length });
  }
  return queued;
}

export function createJiraBackgroundSync(database: PrismaClient) {
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runBackgroundSyncTick(database);
    } catch (error) {
      logEvent('warn', 'jira.background_sync.tick_failed', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      running = false;
    }
  };
  return {
    start() {
      if (timer || !backgroundSyncEnabled()) return;
      timer = setInterval(() => void tick(), TICK_MS);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
