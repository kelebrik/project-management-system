import { randomUUID } from 'node:crypto';

import { JiraSyncRunStatus, type PrismaClient } from '@prisma/client';

import {
  captureJiraReadOnlyRequestSummary,
  jiraReadOnlyRequestSummaryForError,
} from '../jira.js';
import { logEvent } from '../server/logger.js';
import { redactJiraHistoryError } from './jira-history.js';
import { runJiraSyncPipeline } from './jira-sync-pipeline.js';
import { registerJiraSyncRunnerWake } from './jira-sync-runtime.js';
import {
  claimNextJiraSyncRun,
  completeJiraSyncRun,
  failJiraSyncRun,
  heartbeatJiraSyncRun,
  JIRA_SYNC_HEARTBEAT_MS,
  JiraSyncCapacityError,
  JiraSyncDeadlineError,
  JiraSyncFencedError,
  pauseJiraSyncRun,
  reapExpiredJiraSyncRuns,
  releaseJiraSyncRunOnShutdown,
  type ClaimedJiraSyncRun,
} from './jira-sync-runs.js';

const EMPTY_REQUEST_SUMMARY = {
  count: 0,
  durationMsTotal: 0,
  durationMsMax: 0,
  byRoute: {},
  byStatusClass: {},
};

export function jiraSyncRunnerFailureAction(
  error: unknown,
  stopping: boolean,
  aborted: boolean,
) {
  if (stopping && aborted) return 'SHUTDOWN' as const;
  if (error instanceof JiraSyncFencedError) return 'FENCED' as const;
  if (error instanceof JiraSyncDeadlineError) return 'PAUSE_DEADLINE' as const;
  if (error instanceof JiraSyncCapacityError) return 'STOP_CAPACITY' as const;
  return 'FAIL' as const;
}

export async function settleJiraSyncRunnerTask(
  task: Promise<void>,
  onError: (error: unknown) => void,
) {
  try {
    await task;
  } catch (error) {
    onError(error);
  }
}

export function jiraSyncHeartbeatFailureAction(error: unknown) {
  return error instanceof JiraSyncFencedError ? 'FATAL' as const : 'RETRY' as const;
}

export function jiraSyncRunnerLogMessage(error: unknown) {
  return redactJiraHistoryError(error instanceof Error ? error.message : String(error));
}

function positiveEnvInt(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function createJiraSyncRunner(prisma: PrismaClient) {
  const workerId = `${process.pid}:${randomUUID()}`;
  const concurrency = Math.min(4, positiveEnvInt('JIRA_SYNC_RUNNER_CONCURRENCY', 1));
  const pollMs = positiveEnvInt('JIRA_SYNC_RUNNER_POLL_MS', 5_000);
  const shutdownGraceMs = positiveEnvInt('JIRA_SYNC_SHUTDOWN_GRACE_MS', 20_000);
  const active = new Map<string, {
    run: ClaimedJiraSyncRun;
    controller: AbortController;
    promise: Promise<void>;
  }>();
  let timer: NodeJS.Timeout | null = null;
  let stopping = false;
  let pumping = false;

  const execute = async (run: ClaimedJiraSyncRun, controller: AbortController) => {
    let progress = { phase: 'DISCOVERY', done: 0, total: 0, unit: 'issues' };
    let heartbeatError: unknown = null;
    let heartbeatTask: Promise<void> | null = null;
    const startHeartbeat = () => {
      if (heartbeatTask) return;
      heartbeatTask = heartbeatJiraSyncRun(prisma, run, progress)
        .catch((error) => {
          if (jiraSyncHeartbeatFailureAction(error) === 'FATAL') {
            heartbeatError = error;
            controller.abort();
            return;
          }
          logEvent('warn', 'jira.sync.heartbeat_retry', {
            projectId: run.projectId,
            runId: run.id,
            message: jiraSyncRunnerLogMessage(error),
          });
        })
        .finally(() => {
          heartbeatTask = null;
        });
    };
    const heartbeat = setInterval(startHeartbeat, JIRA_SYNC_HEARTBEAT_MS);
    heartbeat.unref();
    try {
      const captured = await captureJiraReadOnlyRequestSummary(() => runJiraSyncPipeline(run, {
        prisma,
        signal: controller.signal,
        onProgress(next) {
          progress = next;
        },
      }));
      if (heartbeatError) throw heartbeatError;
      await completeJiraSyncRun(prisma, run, {
        status: captured.result.status === 'SUCCEEDED_WITH_RETRIES'
          ? JiraSyncRunStatus.SUCCEEDED_WITH_RETRIES
          : JiraSyncRunStatus.SUCCEEDED,
        result: captured.result.result,
        requestSummary: captured.summary,
        discoveredIssueCount: captured.result.discoveredIssueCount,
        hydratedIssueCount: captured.result.hydratedIssueCount,
        versionsCreated: captured.result.versionsCreated,
        retriesQueued: captured.result.retriesQueued,
      });
    } catch (error) {
      const requestSummary = jiraReadOnlyRequestSummaryForError(error) ?? EMPTY_REQUEST_SUMMARY;
      const action = jiraSyncRunnerFailureAction(error, stopping, controller.signal.aborted);
      if (action === 'SHUTDOWN') {
        await releaseJiraSyncRunOnShutdown(prisma, run).catch(() => undefined);
      } else if (action === 'FENCED') {
        logEvent('warn', 'jira.sync.fenced', { projectId: run.projectId, runId: run.id });
      } else if (action === 'PAUSE_DEADLINE') {
        await pauseJiraSyncRun(prisma, run, requestSummary);
      } else if (action === 'STOP_CAPACITY') {
        await failJiraSyncRun(
          prisma,
          run,
          error,
          'CAPACITY_LIMIT',
          JiraSyncRunStatus.STOPPED_CAPACITY,
          requestSummary,
        );
      } else {
        await failJiraSyncRun(prisma, run, error, 'SYNC_FAILED', JiraSyncRunStatus.FAILED, requestSummary);
      }
      if (action !== 'FENCED' && action !== 'SHUTDOWN') {
        logEvent('error', 'jira.sync.failed', {
          projectId: run.projectId,
          runId: run.id,
          kind: run.kind,
          message: jiraSyncRunnerLogMessage(error),
        });
      }
    } finally {
      clearInterval(heartbeat);
      await heartbeatTask;
    }
  };

  const pump = async () => {
    if (pumping || stopping) return;
    pumping = true;
    try {
      await reapExpiredJiraSyncRuns(prisma);
      while (!stopping && active.size < concurrency) {
        const run = await claimNextJiraSyncRun(prisma, workerId);
        if (!run) break;
        const controller = new AbortController();
        const promise = settleJiraSyncRunnerTask(execute(run, controller), (error) => {
          logEvent('error', 'jira.sync.runner_task_rejected', {
            projectId: run.projectId,
            runId: run.id,
            message: jiraSyncRunnerLogMessage(error),
          });
        }).finally(() => {
          active.delete(run.id);
          if (!stopping) void pump();
        });
        active.set(run.id, { run, controller, promise });
      }
    } catch (error) {
      logEvent('error', 'jira.sync.runner_failed', {
        message: jiraSyncRunnerLogMessage(error),
      });
    } finally {
      pumping = false;
    }
  };

  return {
    start() {
      if (timer || stopping) return;
      registerJiraSyncRunnerWake(() => void pump());
      timer = setInterval(() => void pump(), pollMs);
      timer.unref();
      void pump();
    },
    wake() {
      void pump();
    },
    async stop() {
      stopping = true;
      registerJiraSyncRunnerWake(null);
      if (timer) clearInterval(timer);
      timer = null;
      for (const item of active.values()) item.controller.abort();
      const settled = Promise.allSettled([...active.values()].map((item) => item.promise));
      await Promise.race([
        settled,
        new Promise<void>((resolve) => setTimeout(resolve, shutdownGraceMs)),
      ]);
      await Promise.allSettled([...active.values()].map((item) =>
        releaseJiraSyncRunOnShutdown(prisma, item.run)));
    },
  };
}
