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

const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const isProduction = process.env.NODE_ENV === 'production';

function corsOrigin() {
  const origins = webOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (webOrigin === '*') {
    return isProduction ? false : true;
  }

  return origins;
}

export const startedAt = new Date();

export function createApp() {
  const app = express();

  if (isProduction) {
    app.set('trust proxy', 1);
  }

  app.use(express.json({ limit: '5mb' }));
  app.use(
    cors({
      origin: corsOrigin(),
      credentials: true,
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
