import { randomUUID } from 'node:crypto';

/**
 * AI calls that outlive a request. A reasoning model can think longer than a
 * proxy keeps a request open (Cloudflare closes it at about 100 seconds), so
 * the page asks for the call to run in the background, gets a job id at once
 * and polls for the answer. Jobs live in this process only: a restart loses
 * them and the page says the call was interrupted.
 */

export type AiJobOutcome = { status: number; body: unknown };
type AiJob = { id: string; userId: string; abort: AbortController; outcome: AiJobOutcome | null; createdAt: number; polledAt: number };

/** A job nobody asks about for this long is stopped: the page was closed. */
export const AI_JOB_ABANDONED_MS = 60_000;
/** A finished answer is kept this long for the page to pick up. */
export const AI_JOB_KEPT_MS = 10 * 60_000;
export const AI_JOB_POLL_AFTER_MS = 1_500;

export function createAiJobs(now: () => number = Date.now) {
  const jobs = new Map<string, AiJob>();
  let timer: NodeJS.Timeout | null = null;

  const sweep = () => {
    const at = now();
    for (const job of jobs.values()) {
      if (!job.outcome && at - job.polledAt > AI_JOB_ABANDONED_MS) job.abort.abort();
      if (job.outcome && at - job.polledAt > AI_JOB_KEPT_MS) jobs.delete(job.id);
      if (!job.outcome && at - job.createdAt > AI_JOB_KEPT_MS) jobs.delete(job.id);
    }
    stopIfIdle();
  };
  /** Nothing left to look after: the timer stops until the next job. */
  function stopIfIdle() {
    if (jobs.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  }
  /** Answers nobody picks up are dropped on a timer too, not only when someone calls. */
  const watch = () => {
    if (timer) return;
    timer = setInterval(sweep, AI_JOB_ABANDONED_MS);
    timer.unref();
  };

  return {
    /** Starts a job for a user; `run` gets the job's signal and returns what the request would have answered. */
    start(userId: string, run: (signal: AbortSignal) => Promise<AiJobOutcome>) {
      sweep();
      const job: AiJob = { id: randomUUID(), userId, abort: new AbortController(), outcome: null, createdAt: now(), polledAt: now() };
      jobs.set(job.id, job);
      watch();
      void run(job.abort.signal)
        .then((outcome) => {
          job.outcome = outcome;
        })
        .catch(() => {
          job.outcome = { status: 500, body: { error: 'Не удалось выполнить запрос к модели' } };
        });
      return job.id;
    },
    /** The job's state for its owner only; someone else's job is "not found". */
    poll(userId: string, id: string): { found: false } | { found: true; outcome: AiJobOutcome | null } {
      sweep();
      const job = jobs.get(id);
      if (!job || job.userId !== userId) return { found: false };
      job.polledAt = now();
      if (job.outcome) {
        jobs.delete(id);
        stopIfIdle();
      }
      return { found: true, outcome: job.outcome };
    },
    cancel(userId: string, id: string) {
      const job = jobs.get(id);
      if (!job || job.userId !== userId) return false;
      job.abort.abort();
      jobs.delete(id);
      stopIfIdle();
      return true;
    },
    size: () => jobs.size,
    watching: () => timer !== null,
    sweep,
  };
}

export type AiJobs = ReturnType<typeof createAiJobs>;
