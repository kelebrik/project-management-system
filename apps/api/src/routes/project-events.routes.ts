import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '../db.js';
import { currentUser } from '../server/auth.js';
import { projectIdForWritePath } from '../server/project-access.js';
import { userCanReadProject } from '../server/business-units.js';
import {
  liveSectionForWrite,
  publishProjectLiveEvent,
  subscribeProjectLiveEvents,
  type ProjectLiveEvent,
} from '../services/project-live-events.js';
import { noteProjectWrite } from '../services/project-history.js';

export const LIVE_HEARTBEAT_MS = 25_000;
const CLIENT_ID = /^[A-Za-z0-9-]{8,64}$/;

// Rows the write checks leave to role permissions still belong to a project the live view must name.
const LIVE_ONLY_ENTITIES: Array<{ pattern: RegExp; resolve: (id: string) => Promise<string | null> }> = [
  { pattern: /^\/decisions\/([^/]+)/, resolve: async (id) => (await prisma.decision.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null },
  { pattern: /^\/lessons\/([^/]+)/, resolve: async (id) => (await prisma.lesson.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null },
  { pattern: /^\/plan-snapshots\/([^/]+)/, resolve: async (id) => (await prisma.planSnapshot.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null },
];

export async function projectIdForLiveWrite(path: string) {
  const projectId = await projectIdForWritePath(path);
  if (projectId) return projectId;
  for (const entity of LIVE_ONLY_ENTITIES) {
    const match = path.match(entity.pattern);
    if (match?.[1]) return entity.resolve(match[1]);
  }
  return null;
}

/**
 * Tells the project's open pages that someone changed it: the project is
 * worked out before the handler runs (a deleted row cannot name it after),
 * the event is sent once the response succeeded, so a failed or rolled back
 * write sends nothing.
 */
export function projectLiveEventsMiddleware(req: Request, res: Response, next: NextFunction) {
  const section = liveSectionForWrite(req.method, req.path);
  if (!section) {
    next();
    return;
  }
  const header = req.get('x-pms-client');
  const clientId = header && CLIENT_ID.test(header) ? header : null;
  projectIdForLiveWrite(req.path)
    .catch(() => null)
    .then((projectId) => {
      if (projectId) {
        res.on('finish', () => {
          if (res.statusCode >= 400) return;
          const user = currentUser(req);
          publishProjectLiveEvent({ projectId, section, actorId: user?.id ?? null, actorName: user?.name ?? null, clientId });
          // The project's history captures this day's new state once the writes settle.
          noteProjectWrite(projectId);
        });
      }
      next();
    });
}

export function createProjectEventsRouter(options: { heartbeatMs?: number; canRead?: typeof userCanReadProject } = {}) {
  const router = Router();
  const heartbeatMs = options.heartbeatMs ?? LIVE_HEARTBEAT_MS;
  const canRead = options.canRead ?? userCanReadProject;

  router.get('/projects/:projectId/events', async (req, res) => {
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Требуется вход в систему' });
      return;
    }
    // A client gone while access was being checked must not leave a listener behind.
    let closed = false;
    req.on('close', () => {
      closed = true;
    });
    if (!(await canRead(req, req.params.projectId))) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    if (closed || req.destroyed) return;
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      // nginx and the ingress would otherwise hold events back in a buffer.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write(`retry: 5000\n\n`);
    const send = (event: ProjectLiveEvent) => {
      res.write(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
    };
    const unsubscribe = subscribeProjectLiveEvents(req.params.projectId, send);
    // A comment now and then keeps proxies from closing a quiet stream.
    const heartbeat = setInterval(() => res.write(`: heartbeat\n\n`), heartbeatMs);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return router;
}
