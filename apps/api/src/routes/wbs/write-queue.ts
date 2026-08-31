import type { Request, RequestHandler } from 'express';
import { projectIdForWritePath } from '../../server/project-access.js';

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
    const closeAndRelease = () => {
      requestClosed = true;
      release();
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
