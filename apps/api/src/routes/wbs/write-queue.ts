import type { Request, RequestHandler } from 'express';

let wbsWriteQueue: Promise<void> = Promise.resolve();

function isWbsWriteRequest(req: Request) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return false;
  return [
    '/wbs-items',
    '/wbs-dependencies',
    '/wbs-snapshot',
    '/wbs-baseline',
  ].some((segment) => req.path.includes(segment));
}

export const wbsWriteQueueMiddleware: RequestHandler = (req, res, next) => {
  if (!isWbsWriteRequest(req)) {
    next();
    return;
  }

  const previous = wbsWriteQueue;
  let release!: () => void;
  wbsWriteQueue = previous
    .catch(() => undefined)
    .then(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

  void previous
    .catch(() => undefined)
    .then(() => {
      let released = false;
      const done = () => {
        if (released) return;
        released = true;
        release();
      };

      res.once('finish', done);
      res.once('close', done);
      next();
    });
};
