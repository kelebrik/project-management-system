import cors from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { Prisma, type UserRole } from '@prisma/client';
import {
  bootstrapAdminSchema,
  loginSchema,
} from '@pms/shared';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './db.js';
import { isJiraConfigured } from './jira.js';
import { openApiDocument } from './openapi.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createProjectsRouter } from './routes/projects.routes.js';
import { createRisksRouter } from './routes/risks.routes.js';
import { createIssuesRouter } from './routes/issues.routes.js';
import { createSavedViewsRouter } from './routes/saved-views.routes.js';
import { createSearchRouter } from './routes/search.routes.js';
import { createWbsRouter } from './routes/wbs.routes.js';
import { recordAuditEvent } from './services/audit.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const authCookieName = process.env.AUTH_COOKIE_NAME ?? 'pms_session';
const sessionDays = Math.max(1, Number(process.env.AUTH_SESSION_DAYS ?? 7));
const authCookieSecure =
  process.env.AUTH_COOKIE_SECURE === 'true' ||
  (process.env.AUTH_COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production');
const metricsToken = process.env.METRICS_TOKEN ?? '';
const defaultRateLimitPerMinute = Math.max(10, Number(process.env.RATE_LIMIT_PER_MINUTE ?? 600));
const startedAt = new Date();
const requestMetrics = {
  total: 0,
  errors: 0,
  byRoute: new Map<string, number>(),
};
const rateLimitBuckets = new Map<string, { windowStart: number; count: number }>();

type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
};

type AuthRequest = Request & {
  currentUser?: CurrentUser;
  currentSessionId?: string;
  apiToken?: {
    id: string;
    name: string;
    scopes: string[];
    rateLimitPerMinute: number;
  };
};

type PermissionName = string;

const legacyPermissionFallbacks: Record<string, string[]> = {
  'project.create': ['project.write'],
  'project.update': ['project.write'],
  'project.close': ['project.write'],
  'project.delete': ['project.write'],
  'wbs.create': ['wbs.write'],
  'wbs.update': ['wbs.write'],
  'wbs.delete': ['wbs.write'],
  'wbs.move': ['wbs.write'],
  'wbs.baseline': ['wbs.write'],
  'wbs.dependency': ['wbs.write'],
  'issue.create': ['issue.write'],
  'issue.update': ['issue.write'],
  'issue.close': ['issue.write'],
  'issue.delete': ['issue.write'],
  'raid.create': ['raid.write'],
  'raid.update': ['raid.write'],
  'raid.close': ['raid.write'],
  'raid.delete': ['raid.write'],
  'overview.generate': ['overview.publish'],
  'overview.export': ['overview.publish'],
  'admin.users': ['admin.manage'],
  'admin.roles': ['admin.manage'],
  'admin.dictionaries': ['admin.manage'],
  'admin.templates': ['admin.manage'],
  'admin.rag': ['admin.manage'],
  'admin.workflow': ['admin.manage'],
  'admin.jira': ['admin.manage'],
  'admin.health': ['admin.manage'],
  'admin.backup': ['admin.manage'],
  'admin.config': ['admin.manage'],
  'admin.audit': ['admin.manage'],
  'admin.integrations': ['admin.manage', 'admin.config'],
};

function serverErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('40P01') || message.includes('deadlock detected')) {
    return `${fallback}: конфликт параллельного сохранения. Повторите действие`;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `${fallback}: ${error.code}`;
  }
  return error instanceof Error ? error.message : fallback;
}

function safeUser(user: CurrentUser): CurrentUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
  };
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(password, salt, 64).toString('base64url');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, passwordHash: string | null) {
  if (!passwordHash) return false;
  const [scheme, salt, expectedHash] = passwordHash.split(':');
  if (scheme !== 'scrypt' || !salt || !expectedHash) return false;
  const expected = Buffer.from(expectedHash, 'base64url');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function hashApiToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function apiTokenScopes(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readCookie(req: Request, name: string) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const item of header.split(';')) {
    const [rawName, ...rawValue] = item.trim().split('=');
    if (rawName === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }
  return null;
}

function sessionCookie(token: string, expiresAt: Date) {
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const parts = [
    `${authCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${expiresAt.toUTCString()}`,
    'SameSite=Lax',
  ];
  if (authCookieSecure) parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie() {
  const parts = [
    `${authCookieName}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'SameSite=Lax',
  ];
  if (authCookieSecure) parts.push('Secure');
  return parts.join('; ');
}

async function createSession(userId: string, req: Request, res: Response) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      userAgent: req.get('user-agent') ?? null,
      ipAddress: req.ip,
    },
  });
  res.setHeader('Set-Cookie', sessionCookie(token, expiresAt));
}

async function attachAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.get('authorization') ?? '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch?.[1]?.startsWith('pms_')) {
      const rawToken = bearerMatch[1].trim();
      const apiToken = await prisma.apiToken.findUnique({
        where: { tokenHash: hashApiToken(rawToken) },
      });
      const isExpired = apiToken?.expiresAt && apiToken.expiresAt.getTime() <= Date.now();
      if (apiToken && apiToken.isActive && !isExpired) {
        (req as AuthRequest).apiToken = {
          id: apiToken.id,
          name: apiToken.name,
          scopes: apiTokenScopes(apiToken.scopes),
          rateLimitPerMinute: apiToken.rateLimitPerMinute,
        };
        await prisma.apiToken
          .update({
            where: { id: apiToken.id },
            data: { lastUsedAt: new Date() },
          })
          .catch(() => undefined);
        next();
        return;
      }
    }

    const token = readCookie(req, authCookieName);
    if (!token) {
      next();
      return;
    }

    const session = await prisma.userSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true },
    });

    if (!session) {
      next();
      return;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await prisma.userSession.delete({ where: { id: session.id } }).catch(() => undefined);
      next();
      return;
    }

    if (!session.user.isActive) {
      next();
      return;
    }

    const authReq = req as AuthRequest;
    authReq.currentSessionId = session.id;
    authReq.currentUser = safeUser(session.user);
    next();
  } catch (error) {
    next(error);
  }
}

function currentUser(req: Request) {
  return (req as AuthRequest).currentUser ?? null;
}

function currentApiToken(req: Request) {
  return (req as AuthRequest).apiToken ?? null;
}

function currentSessionId(req: Request) {
  return (req as AuthRequest).currentSessionId ?? null;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!currentUser(req) && !currentApiToken(req)) {
    res.status(401).json({ error: 'Требуется вход в систему' });
    return;
  }
  next();
}

function requireAuthForWrites(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  requireAuth(req, res, next);
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = currentUser(req);
  const apiToken = currentApiToken(req);
  if (!user && apiToken && apiTokenHasPermission(apiToken, 'admin.config')) {
    next();
    return;
  }
  if (!user) {
    res.status(401).json({ error: 'Требуется вход в систему' });
    return;
  }
  if (user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Недостаточно прав' });
    return;
  }
  next();
}

async function userHasPermission(user: CurrentUser, permission: PermissionName) {
  if (user.role === 'ADMIN') {
    return true;
  }
  const permissionCandidates = [permission, ...(legacyPermissionFallbacks[permission] ?? [])];
  const record = await prisma.rolePermission
    .findFirst({
      where: {
        role: user.role,
        permission: { in: permissionCandidates },
        enabled: true,
      },
      select: { enabled: true },
    })
    .catch(() => null);

  return record?.enabled ?? false;
}

function apiTokenHasPermission(token: AuthRequest['apiToken'], permission: PermissionName) {
  if (!token) return false;
  const namespace = permission.split('.')[0];
  const permissionCandidates = [permission, ...(legacyPermissionFallbacks[permission] ?? [])];
  return (
    token.scopes.includes('*') ||
    token.scopes.includes(`${namespace}.*`) ||
    permissionCandidates.some((candidate) => token.scopes.includes(candidate))
  );
}

async function ensureProjectWritable(projectId: string, res: Response) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, status: true },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return null;
  }
  if (project.status === 'CLOSED') {
    res.status(423).json({
      error: 'Проект закрыт и доступен только для чтения',
    });
    return null;
  }
  return project;
}

async function ensureEntityProjectWritable(
  projectId: string,
  res: Response,
  notFoundMessage = 'Проект не найден',
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, status: true },
  });
  if (!project) {
    res.status(404).json({ error: notFoundMessage });
    return false;
  }
  if (project.status === 'CLOSED') {
    res.status(423).json({
      error: 'Проект закрыт и доступен только для чтения',
    });
    return false;
  }
  return true;
}

async function hasConfiguredAdmin() {
  const count = await prisma.user.count({
    where: {
      role: 'ADMIN',
      isActive: true,
      passwordHash: { not: null },
    },
  });
  return count > 0;
}

async function wouldRemoveLastAdmin(userId: string, data: { role?: UserRole; isActive?: boolean }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true, passwordHash: true },
  });
  if (!user || user.role !== 'ADMIN' || !user.isActive || !user.passwordHash) {
    return false;
  }
  const nextRole = data.role ?? user.role;
  const nextIsActive = data.isActive ?? user.isActive;
  if (nextRole === 'ADMIN' && nextIsActive) {
    return false;
  }
  const otherAdmins = await prisma.user.count({
    where: {
      id: { not: userId },
      role: 'ADMIN',
      isActive: true,
      passwordHash: { not: null },
    },
  });
  return otherAdmins === 0;
}

function userResponse(user: CurrentUser & { createdAt?: Date; updatedAt?: Date; passwordHash?: string | null }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    hasPassword: Boolean(user.passwordHash),
  };
}

function logEvent(level: 'info' | 'warn' | 'error', event: string, payload: Record<string, unknown> = {}) {
  const line = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...payload,
  };
  const serialized = JSON.stringify(line);
  if (level === 'error') {
    console.error(serialized);
  } else if (level === 'warn') {
    console.warn(serialized);
  } else {
    console.log(serialized);
  }
}

function metricRoute(req: Request) {
  if (req.path.startsWith('/api/projects/') && req.path.endsWith('/overview')) {
    return '/api/projects/:projectId/overview';
  }
  if (req.path.startsWith('/api/projects/')) {
    return req.path.replace(/\/api\/projects\/[^/]+/, '/api/projects/:projectId');
  }
  if (req.path.startsWith('/api/wbs-items/')) return '/api/wbs-items/:itemId';
  if (req.path.startsWith('/api/wbs-dependencies/')) return '/api/wbs-dependencies/:dependencyId';
  if (req.path.startsWith('/api/open-issues/')) return '/api/open-issues/:issueId';
  if (req.path.startsWith('/api/raid-items/')) return '/api/raid-items/:itemId';
  if (req.path.startsWith('/api/executive-overviews/')) return '/api/executive-overviews/:overviewId';
  return req.path;
}

function rateLimitKey(req: Request) {
  const authHeader = req.get('authorization') ?? '';
  if (authHeader.startsWith('Bearer pms_')) {
    return `token:${hashApiToken(authHeader.slice('Bearer '.length).trim()).slice(0, 16)}`;
  }
  return `ip:${req.ip}`;
}

function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith('/api')) {
    next();
    return;
  }
  const now = Date.now();
  const windowMs = 60_000;
  const authReq = req as AuthRequest;
  const limit = authReq.apiToken?.rateLimitPerMinute ?? defaultRateLimitPerMinute;
  const key = rateLimitKey(req);
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    rateLimitBuckets.set(key, { windowStart: now, count: 1 });
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - 1)));
    next();
    return;
  }
  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  if (bucket.count > limit) {
    res.status(429).json({ error: 'Превышен лимит запросов' });
    return;
  }
  next();
}

app.use(express.json({ limit: '5mb' }));
app.use(
  cors({
    origin: webOrigin === '*' ? true : webOrigin.split(',').map((origin) => origin.trim()),
    credentials: true,
  }),
);

app.use((req, res, next) => {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    if (!req.path.startsWith('/api')) return;
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    const route = metricRoute(req);
    requestMetrics.total += 1;
    if (res.statusCode >= 500) requestMetrics.errors += 1;
    requestMetrics.byRoute.set(route, (requestMetrics.byRoute.get(route) ?? 0) + 1);
    logEvent(res.statusCode >= 500 ? 'error' : 'info', 'http.request', {
      method: req.method,
      path: route,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      requestId: req.get('x-request-id') ?? null,
      userAgent: req.get('user-agent') ?? null,
      ipAddress: req.ip,
    });
  });
  next();
});

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

app.get('/api/metrics', (_req, res) => {
  if (metricsToken) {
    const auth = _req.get('authorization') ?? '';
    const queryToken = typeof _req.query.token === 'string' ? _req.query.token : '';
    if (auth !== `Bearer ${metricsToken}` && queryToken !== metricsToken) {
      res.status(401).type('text/plain').send('unauthorized\n');
      return;
    }
  }

  const routeMetrics = [...requestMetrics.byRoute.entries()]
    .map(([route, count]) => `pms_http_requests_by_route_total{route="${route.replaceAll('"', '\\"')}"} ${count}`)
    .join('\n');
  res.type('text/plain').send(
    [
      '# HELP pms_uptime_seconds Application uptime in seconds',
      '# TYPE pms_uptime_seconds gauge',
      `pms_uptime_seconds ${Math.floor(process.uptime())}`,
      '# HELP pms_http_requests_total Total API requests handled by this process',
      '# TYPE pms_http_requests_total counter',
      `pms_http_requests_total ${requestMetrics.total}`,
      '# HELP pms_http_errors_total Total API requests with HTTP 5xx status',
      '# TYPE pms_http_errors_total counter',
      `pms_http_errors_total ${requestMetrics.errors}`,
      '# HELP pms_jira_configured Jira integration environment/configuration flag',
      '# TYPE pms_jira_configured gauge',
      `pms_jira_configured ${isJiraConfigured() ? 1 : 0}`,
      '# HELP pms_http_requests_by_route_total Total API requests by normalized route',
      '# TYPE pms_http_requests_by_route_total counter',
      routeMetrics,
      '',
    ].join('\n'),
  );
});

app.get('/api/openapi.json', (_req, res) => {
  res.json(openApiDocument);
});

app.use('/api', attachAuth);
app.use('/api', rateLimitMiddleware);

app.get('/api/auth/setup-status', async (_req, res) => {
  res.json({ needsSetup: !(await hasConfiguredAdmin()) });
});

app.post('/api/auth/bootstrap', async (req, res) => {
  const parsed = bootstrapAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (await hasConfiguredAdmin()) {
    res.status(409).json({ error: 'Администратор уже настроен' });
    return;
  }

  const passwordHash = hashPassword(parsed.data.password);
  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: parsed.data.name,
          role: 'ADMIN',
          isActive: true,
          passwordHash,
          lastLoginAt: new Date(),
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
        },
      })
    : await prisma.user.create({
        data: {
          email: parsed.data.email,
          name: parsed.data.name,
          role: 'ADMIN',
          isActive: true,
          passwordHash,
          lastLoginAt: new Date(),
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
        },
      });

  await createSession(user.id, req, res);
  await recordAuditEvent({
    req,
    actor: user,
    action: 'auth.bootstrap_admin',
    objectType: 'User',
    objectId: user.id,
    afterValue: user,
  });
  res.status(201).json({ user });
});

app.post('/api/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      passwordHash: true,
      lastLoginAt: true,
    },
  });

  if (!user || !user.isActive || !verifyPassword(parsed.data.password, user.passwordHash)) {
    res.status(401).json({ error: 'Неверный email или пароль' });
    return;
  }

  const lastLoginAt = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt },
  });
  await createSession(user.id, req, res);
  await recordAuditEvent({
    req,
    actor: user,
    action: 'auth.login',
    objectType: 'User',
    objectId: user.id,
    metadata: { lastLoginAt },
  });
  res.json({
    user: safeUser({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt,
    }),
  });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: currentUser(req) });
});

app.post('/api/auth/logout', async (req, res) => {
  const sessionId = currentSessionId(req);
  const user = currentUser(req);
  if (sessionId) {
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined);
  }
  if (user) {
    await recordAuditEvent({
      req,
      actor: user,
      action: 'auth.logout',
      objectType: 'User',
      objectId: user.id,
    });
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.status(204).send();
});

app.use('/api', createSearchRouter());
app.use('/api', createSavedViewsRouter({ currentUser, requireAuth }));

app.use('/api', requireAuthForWrites);

function writePermissionForPath(pathname: string, method: string): PermissionName | null {
  if (
    pathname.startsWith('/admin/integrations') ||
    pathname.startsWith('/admin/api-tokens') ||
    pathname.startsWith('/admin/webhooks')
  ) {
    return 'admin.integrations';
  }
  if (pathname.startsWith('/admin/role-permissions')) {
    return 'admin.roles';
  }
  if (pathname.startsWith('/admin/dictionary-items')) {
    return 'admin.dictionaries';
  }
  if (pathname.startsWith('/admin/system-settings')) {
    return 'admin.jira';
  }
  if (pathname.startsWith('/admin/config/import')) {
    return 'admin.config';
  }
  if (pathname.startsWith('/admin')) {
    return 'admin.config';
  }
  if (pathname.startsWith('/users')) {
    return 'admin.users';
  }
  if (pathname.startsWith('/wbs-items') || pathname.startsWith('/wbs-dependencies')) {
    if (pathname.startsWith('/wbs-dependencies')) {
      return 'wbs.dependency';
    }
    if (method === 'DELETE') {
      return 'wbs.delete';
    }
    return 'wbs.update';
  }
  if (pathname.startsWith('/open-issues') || pathname.startsWith('/tasks')) {
    if (method === 'DELETE') {
      return 'issue.delete';
    }
    return 'issue.update';
  }
  if (pathname.startsWith('/raid-items') || pathname.startsWith('/change-requests')) {
    if (method === 'DELETE') {
      return 'raid.delete';
    }
    return 'raid.update';
  }
  if (pathname.startsWith('/executive-overviews')) {
    return 'overview.publish';
  }
  if (!pathname.startsWith('/projects')) {
    return null;
  }
  if (
    pathname.includes('/wbs-items') ||
    pathname.includes('/wbs-dependencies') ||
    pathname.includes('/wbs-snapshot') ||
    pathname.includes('/wbs-baseline') ||
    pathname.includes('/calendar-overrides')
  ) {
    if (pathname.includes('/wbs-baseline')) {
      return 'wbs.baseline';
    }
    if (pathname.includes('/wbs-dependencies')) {
      return 'wbs.dependency';
    }
    if (method === 'POST') {
      return 'wbs.create';
    }
    if (method === 'DELETE') {
      return 'wbs.delete';
    }
    return 'wbs.update';
  }
  if (pathname.includes('/open-issues')) {
    if (method === 'POST') {
      return 'issue.create';
    }
    if (method === 'DELETE') {
      return 'issue.delete';
    }
    if (pathname.includes('/close')) {
      return 'issue.close';
    }
    return 'issue.update';
  }
  if (pathname.includes('/raid-items') || pathname.includes('/change-requests')) {
    if (method === 'POST') {
      return 'raid.create';
    }
    if (method === 'DELETE') {
      return 'raid.delete';
    }
    if (pathname.includes('/status-updates') || pathname.includes('/close')) {
      return 'raid.close';
    }
    return 'raid.update';
  }
  if (pathname.includes('/executive-overviews')) {
    return 'overview.publish';
  }
  if (pathname.endsWith('/close')) {
    return 'project.close';
  }
  if (pathname === '/projects' && method === 'POST') {
    return 'project.create';
  }
  if (method === 'DELETE') {
    return 'project.delete';
  }
  return 'project.update';
}

app.use('/api', async (req, res, next) => {
  if (isReadRequest(req)) {
    next();
    return;
  }
  const requiredPermission = writePermissionForPath(req.path, req.method);
  if (!requiredPermission) {
    next();
    return;
  }
  const user = currentUser(req);
  const apiToken = currentApiToken(req);
  if (!user && !apiToken) {
    res.status(401).json({ error: 'Требуется вход в систему' });
    return;
  }
  if (apiToken && apiTokenHasPermission(apiToken, requiredPermission)) {
    next();
    return;
  }
  if (!user || !(await userHasPermission(user, requiredPermission))) {
    res.status(403).json({ error: 'Недостаточно прав' });
    return;
  }
  next();
});

app.use(
  '/api',
  createAdminRouter({
    requireAdmin,
    currentUser,
    hashPassword,
    wouldRemoveLastAdmin,
    userResponse,
    startedAt,
  }),
);

function isReadRequest(req: Request) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
}

app.use('/api/projects/:projectId', async (req, res, next) => {
  if (isReadRequest(req)) {
    next();
    return;
  }
  const project = await ensureProjectWritable(req.params.projectId, res);
  if (!project) return;
  next();
});

app.use('/api/project-artifacts/:artifactId', async (req, res, next) => {
  if (isReadRequest(req)) {
    next();
    return;
  }
  const artifact = await prisma.projectArtifact.findUnique({
    where: { id: req.params.artifactId },
    select: { projectId: true },
  });
  if (!artifact) {
    res.status(404).json({ error: 'Artifact not found' });
    return;
  }
  if (!(await ensureEntityProjectWritable(artifact.projectId, res))) return;
  next();
});

app.use('/api/raid-items/:itemId', async (req, res, next) => {
  if (isReadRequest(req)) {
    next();
    return;
  }
  const item = await prisma.raidItem.findUnique({
    where: { id: req.params.itemId },
    select: { projectId: true },
  });
  if (!item) {
    res.status(404).json({ error: 'Запись о риске не найдена' });
    return;
  }
  if (!(await ensureEntityProjectWritable(item.projectId, res))) return;
  next();
});

app.use('/api/change-requests/:requestId', async (req, res, next) => {
  if (isReadRequest(req)) {
    next();
    return;
  }
  const request = await prisma.changeRequest.findUnique({
    where: { id: req.params.requestId },
    select: { projectId: true },
  });
  if (!request) {
    res.status(404).json({ error: 'Запрос на изменение не найден' });
    return;
  }
  if (!(await ensureEntityProjectWritable(request.projectId, res))) return;
  next();
});

app.use('/api/milestones/:milestoneId', async (req, res, next) => {
  if (isReadRequest(req)) {
    next();
    return;
  }
  const milestone = await prisma.milestone.findUnique({
    where: { id: req.params.milestoneId },
    select: { projectId: true },
  });
  if (!milestone) {
    res.status(404).json({ error: 'Milestone not found' });
    return;
  }
  if (!(await ensureEntityProjectWritable(milestone.projectId, res))) return;
  next();
});

app.use('/api/wbs-items/:itemId', async (req, res, next) => {
  if (isReadRequest(req)) {
    next();
    return;
  }
  const item = await prisma.wbsItem.findUnique({
    where: { id: req.params.itemId },
    select: { projectId: true },
  });
  if (!item) {
    res.status(404).json({ error: 'Элемент Структуры не найден' });
    return;
  }
  if (!(await ensureEntityProjectWritable(item.projectId, res))) return;
  next();
});

app.use('/api/wbs-dependencies/:dependencyId', async (req, res, next) => {
  if (isReadRequest(req)) {
    next();
    return;
  }
  const dependency = await prisma.wbsDependency.findUnique({
    where: { id: req.params.dependencyId },
    select: { projectId: true },
  });
  if (!dependency) {
    res.status(404).json({ error: 'Связь Структуры не найдена' });
    return;
  }
  if (!(await ensureEntityProjectWritable(dependency.projectId, res))) return;
  next();
});

app.use('/api/open-issues/:issueId', async (req, res, next) => {
  if (isReadRequest(req)) {
    next();
    return;
  }
  const issue = await prisma.issue.findUnique({
    where: { id: req.params.issueId },
    select: { projectId: true },
  });
  if (!issue) {
    res.status(404).json({ error: 'Открытый вопрос не найден' });
    return;
  }
  if (!(await ensureEntityProjectWritable(issue.projectId, res))) return;
  next();
});

app.use('/api/tasks/:taskId', async (req, res, next) => {
  if (isReadRequest(req)) {
    next();
    return;
  }
  const task = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    select: { projectId: true },
  });
  if (!task) {
    res.status(404).json({ error: 'Задача не найдена' });
    return;
  }
  if (!(await ensureEntityProjectWritable(task.projectId, res))) return;
  next();
});

app.use('/api/executive-overviews/:overviewId', async (req, res, next) => {
  if (isReadRequest(req)) {
    next();
    return;
  }
  const overview = await prisma.executiveOverview.findUnique({
    where: { id: req.params.overviewId },
    select: { projectId: true },
  });
  if (!overview) {
    res.status(404).json({ error: 'Executive overview not found' });
    return;
  }
  if (!(await ensureEntityProjectWritable(overview.projectId, res))) return;
  next();
});

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDist = path.resolve(__dirname, '../../web/dist');

app.use(express.static(webDist));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(webDist, 'index.html'));
});

app.listen(port, () => {
  logEvent('info', 'api.listen', { port });
});
