import type { Request, RequestHandler } from 'express';

const wbsWriteQueues = new Map<string, Promise<void>>();

function isWbsWriteRequest(req: Request) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return false;
  return [
    '/wbs-items',
    '/wbs-dependencies',
    '/wbs-snapshot',
    '/wbs-baseline',
  ].some((segment) => req.path.includes(segment));
}

function wbsQueueKey(req: Request) {
  const headerProjectId = req.get('x-wbs-project-id');
  if (headerProjectId) return `project:${headerProjectId}`;

  const projectMatch = req.path.match(/^\/projects\/([^/]+)\//);
  if (projectMatch) return `project:${projectMatch[1]}`;

  const itemMatch = req.path.match(/^\/wbs-items\/([^/]+)$/);
  return itemMatch ? `item:${itemMatch[1]}` : 'global';
}

export const wbsWriteQueueMiddleware: RequestHandler = (req, res, next) => {
  if (!isWbsWriteRequest(req)) {
    next();
    return;
  }

  const queueKey = wbsQueueKey(req);
  const previous = wbsWriteQueues.get(queueKey) ?? Promise.resolve();
  let release!: () => void;
  const current = previous
    .catch(() => undefined)
    .then(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
  wbsWriteQueues.set(queueKey, current);

  void previous
    .catch(() => undefined)
    .then(() => {
      let released = false;
      const done = () => {
        if (released) return;
        released = true;
        release();
        if (wbsWriteQueues.get(queueKey) === current) {
          wbsWriteQueues.delete(queueKey);
        }
      };

      res.once('finish', done);
      res.once('close', done);
      next();
    });
};
