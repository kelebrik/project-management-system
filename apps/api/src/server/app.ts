import compression from 'compression';
import cors from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.js';
import { isJiraConfigured } from '../jira.js';
import { openApiDocument } from '../openapi.js';
import { createAdminRouter } from '../routes/admin.routes.js';
import { createBusinessUnitsRouter } from '../routes/business-units.routes.js';
import { createIssuesRouter } from '../routes/issues.routes.js';
import { createPageVisitsRouter } from '../routes/page-visits.routes.js';
import { createProjectsRouter } from '../routes/projects.routes.js';
import { createRisksRouter } from '../routes/risks.routes.js';
import { createSavedViewsRouter } from '../routes/saved-views.routes.js';
import { createReportsRouter } from '../routes/reports.routes.js';
import { createPagesRouter } from '../routes/pages.routes.js';
import { createPageVersionsRouter } from '../routes/pages-versions.routes.js';
import { createProjectViewRouter } from '../routes/project-view.routes.js';
import { createLeaveScheduleRouter } from '../routes/leave-schedule.routes.js';
import { createAiRouter } from '../routes/ai.routes.js';
import { createScheduleShiftsRouter } from '../routes/schedule-shifts.routes.js';
import { createDecisionsRouter } from '../routes/decisions.routes.js';
import { createPlanSnapshotsRouter } from '../routes/plan-snapshots.routes.js';
import { createLessonsRouter } from '../routes/lessons.routes.js';
import { createRaciRouter } from '../routes/raci.routes.js';
import { createMyWorkRouter } from '../routes/my-work.routes.js';
import { createWbsDraftRouter } from '../routes/wbs-draft.routes.js';
import { createWbsImportRouter } from '../routes/wbs-import.routes.js';
import { createAutomationRulesRouter, createNotificationsRouter } from '../routes/automation-rules.routes.js';
import { createWorkloadRouter } from '../routes/workload.routes.js';
import { createWorkloadAllocationsRouter } from '../routes/workload-allocations.routes.js';
import { createMyJiraRouter } from '../routes/my-jira.routes.js';
import { createSearchRouter } from '../routes/search.routes.js';
import { createWbsRouter } from '../routes/wbs.routes.js';
import { attachAuth, currentUser, requireAdmin, requireAuth, userResponse, wouldRemoveLastAdmin } from './auth.js';
import { businessUnitReadMiddleware } from './business-units.js';
import { registerAuthRoutes } from './auth-routes.js';
import { serverErrorMessage } from './errors.js';
import { registerKeycloakAuthRoutes } from './keycloak-auth.js';
import { logEvent } from './logger.js';
import { writePermissionMiddleware } from './permissions.js';
import { ensureEntityProjectWritable, ensureProjectWritable, registerClosedProjectWriteGuards } from './project-write-guards.js';
import { httpMetricsMiddleware, metricsHandler, rateLimitMiddleware } from './telemetry.js';
import { isCloudProfile, LEGACY_TRUST_PROXY_HOPS, trustProxyHops } from './deployment-profile.js';

const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const isProduction = process.env.NODE_ENV === 'production';

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

/**
 * Origins that may call the API with the user's cookie: the configured list.
 * "*" never means any site, since requests carry credentials: in production
 * it allows none, elsewhere only pages served from this machine.
 */
export function corsOrigin(value = webOrigin, production = isProduction): cors.CorsOptions['origin'] {
  if (value.trim() === '*') {
    if (production) return false;
    return (origin, callback) => callback(null, origin === undefined || LOCAL_ORIGIN.test(origin));
  }
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin && origin !== '*');
}

/**
 * Compresses what compresses well (JSON, HTML, scripts). Skipped when the caller
 * asks with x-no-compression, for event streams, which must reach the browser
 * as they are written, and for file downloads.
 */
export function shouldCompress(req: Request, res: Response) {
  if (req.headers['x-no-compression']) return false;
  const type = String(res.getHeader('Content-Type') ?? '');
  // Downloads are sent as octet-stream and are mostly zip-based already (xlsx, docx).
  if (type.startsWith('text/event-stream') || type.startsWith('application/octet-stream')) return false;
  return compression.filter(req, res);
}

/**
 * Loads the cloud-only routes when the folder is there; the corporate build does
 * not ship it and runs without them. The path is a variable so that the build
 * does not require the file.
 */
async function loadCloudRoutes(router: express.Router) {
  const modulePath = '../cloudOnly/index.js';
  try {
    const cloud = (await import(modulePath)) as { registerCloudRoutes?: (router: express.Router) => void };
    cloud.registerCloudRoutes?.(router);
    return Boolean(cloud.registerCloudRoutes);
  } catch {
    return false;
  }
}

export const startedAt = new Date();

export function createApp() {
  const app = express();

  // Outside production nothing proxies the application, so the socket address is
  // already the caller. In production the value has to match the deployment.
  app.set('trust proxy', isProduction ? (trustProxyHops() ?? LEGACY_TRUST_PROXY_HOPS) : 0);

  // A project list or Structure snapshot is several megabytes of JSON; compressed it is a tenth of that.
  app.use(compression({ threshold: 1024, filter: shouldCompress }));
  app.use('/api/projects/:projectId/artifact-table', express.json({ limit: '4mb' }));
  app.use(express.json({ limit: '5mb' }));
  app.use(
    cors({
      origin: corsOrigin(),
      credentials: true,
      // The page reads which journal operation a structure edit made and whether it needs a reason.
      exposedHeaders: ['X-Schedule-Shift-Operation-Id', 'X-Schedule-Shift-Reason-Needed'],
    }),
  );
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(httpMetricsMiddleware);

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`select 1`;
      res.json({ ok: true, database: 'ok', jiraConfigured: isJiraConfigured() });
    } catch {
      res.status(503).json({
        ok: false,
        database: 'unavailable',
        jiraConfigured: isJiraConfigured(),
      });
    }
  });

  app.get('/api/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`select 1`;
      res.json({
        ok: true,
        database: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        startedAt,
      });
    } catch {
      res.status(503).json({
        ok: false,
        database: 'unavailable',
        uptimeSeconds: Math.floor(process.uptime()),
        startedAt,
      });
    }
  });

  app.get('/api/metrics', metricsHandler);
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });

  app.use('/api', attachAuth);
  app.use('/api', rateLimitMiddleware);

  registerAuthRoutes(app);
  registerKeycloakAuthRoutes(app);

  app.use('/api', requireAuth);

  app.use('/api', createPageVisitsRouter({ currentUser, requireAdmin }));

  app.use('/api', createBusinessUnitsRouter());
  app.use('/api', businessUnitReadMiddleware);
  app.use('/api', createSearchRouter());
  app.use('/api', createSavedViewsRouter({ currentUser, requireAuth }));
  app.use('/api', createProjectViewRouter());
  // Routes of the cloud build (apps/api/src/cloudOnly), before write checks: anyone signed in may report a problem.
  const cloudRouter = express.Router();
  app.use('/api', cloudRouter);
  app.locals.cloudRoutesReady = isCloudProfile() ? loadCloudRoutes(cloudRouter) : Promise.resolve(false);

  app.use('/api', writePermissionMiddleware);

  app.use(
    '/api',
    createAdminRouter({
      requireAdmin,
      currentUser,
      wouldRemoveLastAdmin,
      userResponse,
      startedAt,
    }),
  );

  app.use('/api', createLeaveScheduleRouter({ requireAuth, currentUser }));
  app.use('/api', createWorkloadRouter({ requireAuth }));
  app.use('/api', createWorkloadAllocationsRouter());
  app.use('/api', createAiRouter());
  app.use('/api', createWbsDraftRouter());
  app.use('/api', createScheduleShiftsRouter());
  app.use('/api', createDecisionsRouter());
  app.use('/api', createPlanSnapshotsRouter());
  app.use('/api', createLessonsRouter());
  app.use('/api', createRaciRouter());
  app.use('/api', createMyWorkRouter());
  app.use('/api', createMyJiraRouter());
  app.use('/api', createWbsImportRouter());
  app.use('/api', createAutomationRulesRouter());
  app.use('/api', createNotificationsRouter());
  app.use('/api', createReportsRouter());
  app.use('/api', createPagesRouter());
  app.use('/api', createPageVersionsRouter());

  registerClosedProjectWriteGuards(app);

  app.use(
    '/api',
    createProjectsRouter({
      requireAdmin,
      currentUser,
      ensureProjectWritable,
      ensureEntityProjectWritable,
    }),
  );

  app.use('/api', createRisksRouter());
  app.use('/api', createWbsRouter({ serverErrorMessage }));
  app.use('/api', createIssuesRouter());

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/api')) {
      next(error);
      return;
    }
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error && typeof error === 'object' && 'status' in error && error.status === 413) {
      res.status(413).json({ error: 'Request body too large' });
      return;
    }
    logEvent('error', 'api.error', {
      path: req.path,
      method: req.method,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ error: serverErrorMessage(error, 'Внутренняя ошибка API') });
  });

  return app;
}
