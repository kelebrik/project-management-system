import type { Request, RequestHandler, Response } from 'express';
import { currentUser } from '../../server/auth.js';
import { projectIdForWritePath } from '../../server/project-access.js';
import { beginScheduleShiftTracking, type ShiftContext, type ShiftTracking } from '../../services/schedule-shifts.js';

/** If a handler never answers after the client left, the queue is freed anyway after this long. */
const ABANDONED_REQUEST_RELEASE_MS = 120_000;

const wbsWriteQueues = new Map<string, Promise<void>>();

function acquireWbsWriteQueue(queueKey: string) {
  const previous = wbsWriteQueues.get(queueKey) ?? Promise.resolve();
  let release: (() => void) | null = null;
  let releaseRequested = false;
  const current = previous
    .catch(() => undefined)
    .then(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
          if (releaseRequested) resolve();
        }),
    );
  wbsWriteQueues.set(queueKey, current);
  void current.finally(() => {
    if (wbsWriteQueues.get(queueKey) === current) {
      wbsWriteQueues.delete(queueKey);
    }
  });

  return {
    wait: previous.catch(() => undefined),
    release: () => {
      releaseRequested = true;
      release?.();
    },
  };
}

export async function runWithWbsWriteQueue<T>(
  projectId: string,
  operation: () => Promise<T>,
) {
  const queued = acquireWbsWriteQueue(`project:${projectId}`);
  await queued.wait;
  try {
    return await operation();
  } finally {
    queued.release();
  }
}

function isWbsWriteRequest(req: Request) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return false;
  return [
    '/wbs-items',
    '/wbs-dependencies',
    '/wbs-snapshot',
    '/wbs-baseline',
  ].some((segment) => req.path.includes(segment));
}

/**
 * What a structure write is, for the schedule shift journal: an edit of one
 * row (the row is the source), a bulk edit, a change of rows or their order,
 * of links, an undo or redo, or a baseline save.
 */
export function shiftContextForRequest(req: Pick<Request, 'method' | 'path' | 'body'>): Omit<ShiftContext, 'actor'> {
  const single = req.path.match(/^\/wbs-items\/([^/]+)$/);
  if (req.method === 'PATCH' && single) return { trigger: 'MANUAL_EDIT', sourceItemId: single[1] };
  if (req.method === 'PATCH' && /\/wbs-items\/bulk$/.test(req.path)) {
    const items = Array.isArray((req.body as { items?: unknown })?.items) ? ((req.body as { items: Array<{ id?: unknown }> }).items) : [];
    return { trigger: 'BULK_EDIT', sourceItemId: items.length === 1 && typeof items[0]?.id === 'string' ? items[0].id : null };
  }
  if (req.path.includes('/wbs-dependencies')) return { trigger: 'LINKS' };
  if (req.path.includes('/wbs-snapshot')) return { trigger: 'RESTORE' };
  if (req.path.includes('/wbs-baseline')) return { trigger: 'BASELINE' };
  return { trigger: 'STRUCTURE' };
}

/**
 * Journals the operation around a queued handler: the checkpoint dates are
 * taken before it runs, and when it answers the answer waits until the journal
 * is written, then the queue is freed. The answer names the operation, so the
 * page can ask for a reason when a checkpoint moved past its baseline.
 */
function holdAnswerForJournal(res: Response, tracking: ShiftTracking | null, release: () => void) {
  const end = res.end.bind(res) as (...args: unknown[]) => Response;
  let ending = false;
  res.end = ((...args: unknown[]) => {
    if (ending) return end(...args);
    ending = true;
    void (async () => {
      const journal = tracking ? await tracking.finish() : null;
      if (journal && !res.headersSent) {
        res.setHeader('X-Schedule-Shift-Operation-Id', journal.operationId);
        res.setHeader('X-Schedule-Shift-Reason-Needed', String(journal.reasonNeeded));
      }
      try {
        end(...args);
      } finally {
        release();
      }
    })();
    return res;
  }) as Response['end'];
}

async function wbsQueueKey(req: Request) {
  const projectMatch = req.path.match(/^\/projects\/([^/]+)\//);
  if (projectMatch) return `project:${projectMatch[1]}`;
  const projectId = await projectIdForWritePath(req.path);
  return projectId ? `project:${projectId}` : 'global';
}

export const wbsWriteQueueMiddleware: RequestHandler = (req, res, next) => {
  if (!isWbsWriteRequest(req)) {
    next();
    return;
  }

  const queuedAt = process.hrtime.bigint();
  let requestClosed = false;
  const markRequestClosed = () => {
    requestClosed = true;
  };
  res.once('close', markRequestClosed);

  void (async () => {
    const queueKey = await wbsQueueKey(req);
    if (requestClosed) return;

    const queued = acquireWbsWriteQueue(queueKey);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      queued.release();
    };
    let handlerStarted = false;
    const closeAndRelease = () => {
      requestClosed = true;
      // Before the handler runs, the place in the queue is simply given up. Once it
      // runs, the queue is held until it answers, so the next write never overlaps
      // its writes; a handler that never answers is let go after a while.
      if (!handlerStarted) release();
      else setTimeout(release, ABANDONED_REQUEST_RELEASE_MS).unref();
    };
    res.off('close', markRequestClosed);
    res.once('finish', release);
    res.once('close', closeAndRelease);

    try {
      await queued.wait;
      if (requestClosed) {
        release();
        return;
      }
      const queueWaitMs = Number(process.hrtime.bigint() - queuedAt) / 1_000_000;
      res.setHeader('Server-Timing', `wbs-queue;dur=${queueWaitMs.toFixed(1)}`);
      const projectId = queueKey.startsWith('project:') ? queueKey.slice('project:'.length) : null;
      const user = currentUser(req);
      const tracking = projectId
        ? await beginScheduleShiftTracking(projectId, {
            ...shiftContextForRequest(req),
            actor: user ? { id: user.id, name: user.name, email: user.email } : null,
          })
        : null;
      if (requestClosed) {
        release();
        return;
      }
      holdAnswerForJournal(res, tracking, release);
      handlerStarted = true;
      next();
    } catch (error) {
      release();
      if (!requestClosed) next(error);
    }
  })().catch((error) => {
    res.off('close', markRequestClosed);
    if (!requestClosed) next(error);
  });
};
