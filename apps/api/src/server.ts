import cors from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { Prisma, type UserRole } from '@prisma/client';
import {
  bootstrapAdminSchema,
  changeUserPasswordSchema,
  createUserSchema,
  createIssueSchema,
  labels,
  loginSchema,
  projectSchema,
  raidItemSchema,
  updateUserSchema,
  updateIssueSchema,
  wbsItemSchema,
} from '@pms/shared';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { prisma } from './db.js';
import { fetchJiraIssues, isJiraConfigured } from './jira.js';
import {
  getProjectWbsSnapshot,
  levelFromWbsCode,
  levelFromWbsItem,
  renumberProjectWbs,
  syncWbsPredecessorFields,
  wbsItemSnapshotData,
} from './services/wbs.js';
import { recordWbsCommand } from './services/wbs-audit.js';
import { createWbsBaselineFromCurrentPlan } from './services/wbs-baseline.js';
import { calculateProjectCriticalPath } from './services/wbs-critical-path.js';
import { recalculateProjectWbsSchedule } from './services/wbs-schedule.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const authCookieName = process.env.AUTH_COOKIE_NAME ?? 'pms_session';
const sessionDays = Math.max(1, Number(process.env.AUTH_SESSION_DAYS ?? 7));
const authCookieSecure =
  process.env.AUTH_COOKIE_SECURE === 'true' ||
  (process.env.AUTH_COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production');

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

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
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

function currentSessionId(req: Request) {
  return (req as AuthRequest).currentSessionId ?? null;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!currentUser(req)) {
    res.status(401).json({ error: 'Требуется вход в систему' });
    return;
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = currentUser(req);
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

app.use(express.json({ limit: '5mb' }));
app.use(
  cors({
    origin: webOrigin === '*' ? true : webOrigin.split(',').map((origin) => origin.trim()),
    credentials: true,
  }),
);

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

app.use('/api', attachAuth);

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
  if (sessionId) {
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined);
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.status(204).send();
});

app.use('/api', requireAuth);

app.get('/api/users', requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      passwordHash: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json(users.map(userResponse));
});

app.post('/api/users', requireAdmin, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        role: parsed.data.role,
        isActive: parsed.data.isActive,
        passwordHash: hashPassword(parsed.data.password),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        passwordHash: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.status(201).json(userResponse(user));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Пользователь с таким email уже существует' });
      return;
    }
    throw error;
  }
});

app.patch('/api/users/:userId', requireAdmin, async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  if (!userId) {
    res.status(400).json({ error: 'Пользователь не указан' });
    return;
  }

  if (await wouldRemoveLastAdmin(userId, parsed.data)) {
    res.status(400).json({ error: 'Нельзя отключить или понизить последнего администратора' });
    return;
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: parsed.data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        passwordHash: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(userResponse(user));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Пользователь с таким email уже существует' });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }
    throw error;
  }
});

app.post('/api/users/:userId/password', requireAdmin, async (req, res) => {
  const parsed = changeUserPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  if (!userId) {
    res.status(400).json({ error: 'Пользователь не указан' });
    return;
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashPassword(parsed.data.password) },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        passwordHash: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await prisma.userSession.deleteMany({ where: { userId: user.id } });
    res.json(userResponse(user));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }
    throw error;
  }
});

app.get('/api/projects', async (_req, res) => {
  const projects = await prisma.project.findMany({
    orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    include: projectInclude,
  });

  res.json(projects);
});

const projectInclude = {
  jiraIntegration: true,
  _count: {
    select: { tasks: true, issues: true, jiraSnapshots: true },
  },
} satisfies Prisma.ProjectInclude;

const projectDetailsInclude = {
  jiraIntegration: true,
  tasks: { orderBy: { updatedAt: 'desc' } },
  issues: {
    where: { status: { notIn: ['Done', 'Closed', 'Resolved'] } },
    orderBy: [{ severity: 'desc' }, { updatedAt: 'desc' }],
    include: { jiraLinks: { orderBy: { createdAt: 'asc' } } },
  },
  jiraSnapshots: { orderBy: { updatedAt: 'desc' } },
  overviews: { orderBy: { version: 'desc' }, take: 8 },
  milestones: { orderBy: { dueDate: 'asc' } },
  wbsItems: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] },
  wbsDependencies: {
    orderBy: { createdAt: 'asc' },
    include: {
      predecessor: { select: { id: true, code: true, title: true } },
      successor: { select: { id: true, code: true, title: true } },
    },
  },
  calendarOverrides: { orderBy: [{ calendarCode: 'asc' }, { date: 'asc' }] },
  artifacts: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  raidItems: { orderBy: [{ riskScore: 'desc' }, { updatedAt: 'desc' }] },
  changeRequests: { orderBy: [{ updatedAt: 'desc' }] },
} satisfies Prisma.ProjectInclude;

const defaultProjectWbsItems = [
  { code: '1', title: 'Инициация проекта', type: 'PHASE', status: 'IN_PROGRESS', owner: 'РП', startOffset: 0, duration: 14, level: 1 },
  { code: '1.1', title: 'Паспорт проекта', type: 'TASK', status: 'DONE', owner: 'РП', startOffset: 0, duration: 4, level: 2 },
  { code: '1.2', title: 'Команда и роли', type: 'TASK', status: 'DONE', owner: 'Проектный офис', startOffset: 4, duration: 3, level: 2 },
  { code: '1.3', title: 'Старт проекта', type: 'MILESTONE', status: 'DONE', owner: 'Спонсор', startOffset: 7, duration: 0, level: 2 },
  { code: '2', title: 'Планирование', type: 'PHASE', status: 'IN_PROGRESS', owner: 'РП', startOffset: 8, duration: 22, level: 1 },
  { code: '2.1', title: 'Декомпозиция структуры', type: 'TASK', status: 'IN_PROGRESS', owner: 'РП', startOffset: 8, duration: 6, level: 2 },
  { code: '2.1.1', title: 'Уточнение зависимостей', type: 'TASK', status: 'NOT_STARTED', owner: 'Технический лидер', startOffset: 14, duration: 5, level: 3 },
  { code: '2.2', title: 'Базовый план согласован', type: 'MILESTONE', status: 'NOT_STARTED', owner: 'Спонсор', startOffset: 21, duration: 0, level: 2 },
  { code: '3', title: 'Исполнение', type: 'PHASE', status: 'NOT_STARTED', owner: 'Лидер поставки', startOffset: 22, duration: 30, level: 1 },
  { code: '3.1', title: 'Первый пакет работ', type: 'TASK', status: 'NOT_STARTED', owner: 'Лидер команды', startOffset: 22, duration: 10, level: 2 },
] as const;

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

async function createDefaultProjectStructure(projectId: string, projectStartDate: Date) {
  const createdByCode = new Map<string, { id: string }>();
  for (const [index, item] of defaultProjectWbsItems.entries()) {
    const parentCode = item.code.split('.').slice(0, -1).join('.');
    const startDate = addDays(projectStartDate, item.startOffset);
    const dueDate = addDays(startDate, item.duration);
    const created = await prisma.wbsItem.create({
      data: {
        projectId,
        parentId: createdByCode.get(parentCode)?.id ?? null,
        code: item.code,
        title: item.title,
        type: item.type,
        status: item.status,
        owner: item.owner,
        startDate,
        dueDate,
        forecastStartDate: startDate,
        forecastDueDate: dueDate,
        wbsLevel: item.level,
        workDays: item.duration === 0 ? 0 : item.duration + 1,
        calendarDays: item.duration === 0 ? 0 : item.duration + 1,
        calendarCode: index % 3 === 0 ? 'CN' : 'RU',
        progress: item.status === 'DONE' ? 100 : item.status === 'IN_PROGRESS' ? 35 : 0,
        sortOrder: (index + 1) * 10,
      },
      select: { id: true },
    });
    createdByCode.set(item.code, created);
  }

  const dependencies = [
    ['1.1', '1.2'],
    ['1.2', '1.3'],
    ['1.3', '2.1'],
    ['2.1', '2.1.1'],
    ['2.1.1', '2.2'],
    ['2.2', '3.1'],
  ];
  for (const [predecessorCode, successorCode] of dependencies) {
    const predecessor = createdByCode.get(predecessorCode);
    const successor = createdByCode.get(successorCode);
    if (!predecessor || !successor) continue;
    await prisma.wbsDependency.create({
      data: {
        projectId,
        predecessorId: predecessor.id,
        successorId: successor.id,
        type: 'FS',
        lagDays: 0,
      },
    });
  }

  await renumberProjectWbs(projectId);
  await recalculateProjectWbsSchedule(projectId);
}

function sanitizeProjectUiState(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

async function wouldCreateProjectCycle(projectId: string, nextParentId: string | null | undefined) {
  let cursor = nextParentId;
  while (cursor) {
    if (cursor === projectId) {
      return true;
    }
    const parent = await prisma.project.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = parent?.parentId ?? null;
  }
  return false;
}

app.post('/api/projects', async (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (parsed.data.parentId) {
    const parent = await prisma.project.findUnique({
      where: { id: parsed.data.parentId },
    });
    if (!parent) {
      res.status(400).json({ error: 'Родительский проект не найден' });
      return;
    }
  }

  try {
    const project = await prisma.project.create({
      data: {
        ...parsed.data,
        parentId: parsed.data.parentId || null,
        startDate: new Date(parsed.data.startDate),
        targetDate: new Date(parsed.data.targetDate),
        budgetPlanned: parsed.data.budgetPlanned,
        budgetForecast: parsed.data.budgetForecast,
        uiState: sanitizeProjectUiState(parsed.data.uiState),
      },
      include: projectInclude,
    });

    await createDefaultProjectStructure(project.id, project.startDate);

    res.status(201).json(project);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      res.status(409).json({ error: 'Код проекта уже существует' });
      return;
    }
    throw error;
  }
});

app.patch('/api/projects/:projectId', async (req, res) => {
  const parsed = projectSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
  });

  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  if (parsed.data.parentId === project.id) {
    res.status(400).json({ error: 'Проект не может быть своим родителем' });
    return;
  }

  if (parsed.data.parentId) {
    const parent = await prisma.project.findUnique({
      where: { id: parsed.data.parentId },
    });
    if (!parent) {
      res.status(400).json({ error: 'Родительский проект не найден' });
      return;
    }
  }

  const nextParentId = parsed.data.parentId === undefined ? project.parentId : parsed.data.parentId;
  if (await wouldCreateProjectCycle(project.id, nextParentId)) {
    res.status(400).json({ error: 'Проект нельзя перенести под свой дочерний проект' });
    return;
  }

  try {
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        ...parsed.data,
        parentId: parsed.data.parentId === undefined ? undefined : parsed.data.parentId || null,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
        targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : undefined,
        budgetPlanned: parsed.data.budgetPlanned,
        budgetForecast: parsed.data.budgetForecast,
        uiState:
          parsed.data.uiState === undefined
            ? undefined
            : sanitizeProjectUiState(parsed.data.uiState),
      },
    });

    res.json(updated);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      res.status(409).json({ error: 'Код проекта уже существует' });
      return;
    }
    throw error;
  }
});

app.get('/api/projects/:projectId/overview', async (req, res) => {
  const [project, criticalPath] = await Promise.all([
    prisma.project.findUnique({
      where: { id: req.params.projectId },
      include: projectDetailsInclude,
    }),
    calculateProjectCriticalPath(req.params.projectId),
  ]);

  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  res.json({ ...project, criticalPath });
});

const calendarOverrideSchema = z.object({
  calendarCode: z.enum(['RU', 'CN']),
  date: z.string().trim().min(1),
  isWorkingDay: z.boolean(),
  description: z.string().trim().optional().nullable(),
});

app.put('/api/projects/:projectId/calendar-overrides', async (req, res) => {
  const parsed = calendarOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    select: { id: true },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  const date = new Date(parsed.data.date);
  date.setUTCHours(0, 0, 0, 0);

  const override = await prisma.projectCalendarOverride.upsert({
    where: {
      projectId_calendarCode_date: {
        projectId: project.id,
        calendarCode: parsed.data.calendarCode,
        date,
      },
    },
    create: {
      projectId: project.id,
      calendarCode: parsed.data.calendarCode,
      date,
      isWorkingDay: parsed.data.isWorkingDay,
      description: parsed.data.description || null,
    },
    update: {
      isWorkingDay: parsed.data.isWorkingDay,
      description: parsed.data.description || null,
    },
  });

  await recalculateProjectWbsSchedule(project.id);

  res.json(override);
});

app.delete('/api/projects/:projectId/calendar-overrides', async (req, res) => {
  const parsed = z
    .object({
      calendarCode: z.enum(['RU', 'CN']),
      date: z.string().trim().min(1),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const date = new Date(parsed.data.date);
  date.setUTCHours(0, 0, 0, 0);
  await prisma.projectCalendarOverride.deleteMany({
    where: {
      projectId: req.params.projectId,
      calendarCode: parsed.data.calendarCode,
      date,
    },
  });

  await recalculateProjectWbsSchedule(req.params.projectId);

  res.status(204).send();
});

const artifactSchema = z.object({
  title: z.string().trim().min(3),
  type: z.string().trim().min(1),
  owner: z.string().trim().optional().default(''),
  status: z.enum(['Draft', 'In Review', 'Approved', 'Baseline', 'Archived']).default('Draft'),
  url: z.string().trim().url().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
});

app.post('/api/projects/:projectId/artifacts', async (req, res) => {
  const parsed = artifactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
  });

  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  const artifact = await prisma.projectArtifact.create({
    data: {
      projectId: project.id,
      ...parsed.data,
      url: parsed.data.url || null,
      description: parsed.data.description || null,
      owner: parsed.data.owner || 'Не назначен',
    },
  });

  res.status(201).json(artifact);
});

app.patch('/api/project-artifacts/:artifactId', async (req, res) => {
  const parsed = artifactSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const artifact = await prisma.projectArtifact.findUnique({
    where: { id: req.params.artifactId },
  });

  if (!artifact) {
    res.status(404).json({ error: 'Artifact not found' });
    return;
  }

  const updated = await prisma.projectArtifact.update({
    where: { id: artifact.id },
    data: {
      ...parsed.data,
      url: parsed.data.url === undefined ? undefined : parsed.data.url || null,
      description: parsed.data.description === undefined ? undefined : parsed.data.description || null,
      owner: parsed.data.owner === undefined ? undefined : parsed.data.owner || 'Не назначен',
    },
  });

  res.json(updated);
});

app.delete('/api/project-artifacts/:artifactId', async (req, res) => {
  const artifact = await prisma.projectArtifact.findUnique({
    where: { id: req.params.artifactId },
  });

  if (!artifact) {
    res.status(404).json({ error: 'Artifact not found' });
    return;
  }

  await prisma.projectArtifact.delete({
    where: { id: artifact.id },
  });

  res.status(204).send();
});

app.post('/api/projects/:projectId/artifacts/reorder', async (req, res) => {
  const parsed = z
    .object({
      orderedIds: z.array(z.string().trim().min(1)).min(1),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const artifacts = await prisma.projectArtifact.findMany({
    where: { projectId: req.params.projectId },
    select: { id: true },
  });
  const artifactIds = new Set(artifacts.map((artifact) => artifact.id));
  const orderedIds = parsed.data.orderedIds.filter((id) => artifactIds.has(id));

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.projectArtifact.update({
        where: { id },
        data: { sortOrder: index + 1 },
      }),
    ),
  );

  res.json({ ok: true });
});

function calculatedRiskScore(probability: number, impact: number) {
  return probability * impact;
}

function raidPayload(data: z.infer<typeof raidItemSchema>) {
  return {
    ...data,
    owner: data.owner || 'Не назначен',
    riskScore: calculatedRiskScore(data.probability, data.impact),
    mitigationPlan: data.mitigationPlan || null,
    contingencyPlan: data.contingencyPlan || null,
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    validationDate: data.validationDate ? new Date(data.validationDate) : null,
    linkedRiskId: data.linkedRiskId || null,
    dependencyType: data.dependencyType || null,
    predecessor: data.predecessor || null,
    successor: data.successor || null,
    supplier: data.supplier || null,
    jiraTicketKey: data.jiraTicketKey || null,
    jiraTicketUrl: data.jiraTicketUrl || null,
    budgetImpact: data.budgetImpact,
  };
}

async function validateRaidItem(projectId: string, data: z.infer<typeof raidItemSchema>, itemId?: string) {
  const score = calculatedRiskScore(data.probability, data.impact);
  if (data.type === 'RISK' && score >= 15 && !data.owner.trim()) {
    return 'У высокого риска должен быть ответственный';
  }
  if (data.type === 'RISK' && score >= 15 && !data.mitigationPlan?.trim()) {
    return 'У высокого риска должен быть план снижения';
  }
  if (data.linkedRiskId) {
    const linked = await prisma.raidItem.findUnique({ where: { id: data.linkedRiskId } });
    if (!linked || linked.projectId !== projectId || linked.type !== 'RISK' || linked.id === itemId) {
      return 'Связанный риск должен быть риском из того же проекта';
    }
  }
  return null;
}

app.post('/api/projects/:projectId/raid-items', async (req, res) => {
  const parsed = raidItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  const validationError = await validateRaidItem(project.id, parsed.data);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const raidItem = await prisma.raidItem.create({
    data: {
      projectId: project.id,
      ...raidPayload(parsed.data),
    },
  });

  res.status(201).json(raidItem);
});

app.patch('/api/raid-items/:itemId', async (req, res) => {
  const parsed = raidItemSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.raidItem.findUnique({ where: { id: req.params.itemId } });
  if (!existing) {
    res.status(404).json({ error: 'Запись о риске не найдена' });
    return;
  }

  const merged = {
    type: parsed.data.type ?? existing.type,
    title: parsed.data.title ?? existing.title,
    description: parsed.data.description ?? existing.description,
    owner: parsed.data.owner ?? existing.owner,
    status: parsed.data.status ?? existing.status,
    probability: parsed.data.probability ?? existing.probability,
    impact: parsed.data.impact ?? existing.impact,
    mitigationPlan: parsed.data.mitigationPlan === undefined ? existing.mitigationPlan : parsed.data.mitigationPlan,
    contingencyPlan:
      parsed.data.contingencyPlan === undefined ? existing.contingencyPlan : parsed.data.contingencyPlan,
    dueDate: parsed.data.dueDate === undefined ? existing.dueDate?.toISOString().slice(0, 10) : parsed.data.dueDate,
    residualRisk: parsed.data.residualRisk ?? existing.residualRisk,
    validationDate:
      parsed.data.validationDate === undefined
        ? existing.validationDate?.toISOString().slice(0, 10)
        : parsed.data.validationDate,
    linkedRiskId: parsed.data.linkedRiskId === undefined ? existing.linkedRiskId : parsed.data.linkedRiskId,
    dependencyType: parsed.data.dependencyType === undefined ? existing.dependencyType : parsed.data.dependencyType,
    predecessor: parsed.data.predecessor === undefined ? existing.predecessor : parsed.data.predecessor,
    successor: parsed.data.successor === undefined ? existing.successor : parsed.data.successor,
    supplier: parsed.data.supplier === undefined ? existing.supplier : parsed.data.supplier,
    jiraTicketKey: parsed.data.jiraTicketKey === undefined ? existing.jiraTicketKey : parsed.data.jiraTicketKey,
    jiraTicketUrl: parsed.data.jiraTicketUrl === undefined ? existing.jiraTicketUrl : parsed.data.jiraTicketUrl,
    decisionRequired: parsed.data.decisionRequired ?? existing.decisionRequired,
    escalationLevel: parsed.data.escalationLevel ?? existing.escalationLevel,
    scheduleImpactDays: parsed.data.scheduleImpactDays ?? existing.scheduleImpactDays,
    budgetImpact: parsed.data.budgetImpact ?? Number(existing.budgetImpact),
  };

  const validationError = await validateRaidItem(existing.projectId, merged, existing.id);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const updated = await prisma.raidItem.update({
    where: { id: existing.id },
    data: raidPayload(merged),
  });

  res.json(updated);
});

app.delete('/api/raid-items/:itemId', async (req, res) => {
  const existing = await prisma.raidItem.findUnique({ where: { id: req.params.itemId } });
  if (!existing) {
    res.status(404).json({ error: 'Запись о риске не найдена' });
    return;
  }

  await prisma.raidItem.delete({ where: { id: existing.id } });
  res.status(204).send();
});

const changeRequestSchema = z.object({
  type: z.enum(['SCOPE', 'BUDGET', 'SCHEDULE', 'RESOURCE']),
  title: z.string().trim().min(3),
  description: z.string().trim().min(3),
  owner: z.string().trim().min(1),
  status: z.enum(['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'IMPLEMENTED']).default('DRAFT'),
  impactAnalysis: z.string().trim().min(3),
  affectedBaseline: z.string().trim().min(1),
  implementationPlan: z.string().trim().optional().nullable(),
  scheduleImpactDays: z.coerce.number().int().default(0),
  budgetImpact: z.coerce.number().default(0),
  scopeImpact: z.string().trim().optional().nullable(),
  approvalRoute: z.string().trim().min(1).default('Проектный офис -> Спонсор'),
  decisionRequired: z.boolean().default(false),
  dueDate: z.string().trim().optional().nullable(),
});

function changeRequestPayload(data: z.infer<typeof changeRequestSchema>) {
  return {
    ...data,
    implementationPlan: data.implementationPlan || null,
    scopeImpact: data.scopeImpact || null,
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    budgetImpact: data.budgetImpact,
    approvedAt: data.status === 'APPROVED' ? new Date() : undefined,
  };
}

app.post('/api/projects/:projectId/change-requests', async (req, res) => {
  const parsed = changeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  const changeRequest = await prisma.changeRequest.create({
    data: {
      projectId: project.id,
      ...changeRequestPayload(parsed.data),
    },
  });

  res.status(201).json(changeRequest);
});

app.patch('/api/change-requests/:requestId', async (req, res) => {
  const parsed = changeRequestSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.changeRequest.findUnique({ where: { id: req.params.requestId } });
  if (!existing) {
    res.status(404).json({ error: 'Запрос на изменение не найден' });
    return;
  }

  const nextStatus = parsed.data.status ?? existing.status;
  const updated = await prisma.changeRequest.update({
    where: { id: existing.id },
    data: {
      ...parsed.data,
      implementationPlan:
        parsed.data.implementationPlan === undefined ? undefined : parsed.data.implementationPlan || null,
      scopeImpact: parsed.data.scopeImpact === undefined ? undefined : parsed.data.scopeImpact || null,
      dueDate: parsed.data.dueDate === undefined ? undefined : parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      budgetImpact: parsed.data.budgetImpact,
      approvedAt:
        nextStatus === 'APPROVED' && existing.status !== 'APPROVED'
          ? new Date()
          : parsed.data.status && nextStatus !== 'APPROVED'
            ? null
            : undefined,
    },
  });

  if (nextStatus === 'APPROVED' && existing.status !== 'APPROVED') {
    await prisma.project.update({
      where: { id: existing.projectId },
      data: {
        scheduleVariance: { increment: updated.scheduleImpactDays },
        budgetForecast: { increment: updated.budgetImpact },
      },
    });
  }

  res.json(updated);
});

app.delete('/api/change-requests/:requestId', async (req, res) => {
  const existing = await prisma.changeRequest.findUnique({ where: { id: req.params.requestId } });
  if (!existing) {
    res.status(404).json({ error: 'Запрос на изменение не найден' });
    return;
  }

  await prisma.changeRequest.delete({ where: { id: existing.id } });
  res.status(204).send();
});

const milestoneSchema = z.object({
  code: z.string().trim().optional().nullable(),
  title: z.string().trim().min(3),
  dueDate: z.string().trim().min(1),
  status: z.enum(['Planned', 'In Progress', 'At Risk', 'Done', 'Cancelled']).default('Planned'),
  owner: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
});

app.post('/api/projects/:projectId/milestones', async (req, res) => {
  const parsed = milestoneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
  });

  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  const milestone = await prisma.milestone.create({
    data: {
      projectId: project.id,
      code: parsed.data.code || null,
      title: parsed.data.title,
      dueDate: new Date(parsed.data.dueDate),
      status: parsed.data.status,
      owner: parsed.data.owner,
      description: parsed.data.description,
    },
  });

  res.status(201).json(milestone);
});

app.patch('/api/milestones/:milestoneId', async (req, res) => {
  const parsed = milestoneSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const milestone = await prisma.milestone.findUnique({
    where: { id: req.params.milestoneId },
  });

  if (!milestone) {
    res.status(404).json({ error: 'Milestone not found' });
    return;
  }

  const updated = await prisma.milestone.update({
    where: { id: milestone.id },
    data: {
      ...parsed.data,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
    },
  });

  res.json(updated);
});

const wbsInsertAfterSchema = z.object({
  afterItemId: z.string().trim().min(1),
  beforeItemId: z.string().trim().optional().nullable(),
});

const wbsReorderSchema = z.object({
  orderedIds: z.array(z.string().trim().min(1)).min(1),
});

const wbsDependencySnapshotSchema = z.object({
  predecessorId: z.string().trim().min(1),
  successorId: z.string().trim().min(1),
  type: z.enum(['FS', 'SS', 'FF', 'SF']).default('FS'),
  lagDays: z.coerce.number().int().default(0),
});

const wbsSnapshotSchema = z.object({
  wbsItems: z.array(
    wbsItemSchema.extend({
      id: z.string().trim().min(1),
    }),
  ),
  wbsDependencies: z.array(wbsDependencySnapshotSchema).default([]),
});

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

app.use((req, res, next) => {
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
});

async function validateWbsProjectAndParent(
  projectId: string,
  parentId: string | null | undefined,
  jiraTicketUrl: string | null | undefined,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { jiraIntegration: true },
  });

  if (!project) {
    return { error: 'Проект не найден' as const };
  }

  if (parentId) {
    const parent = await prisma.wbsItem.findUnique({
      where: { id: parentId },
    });
    if (!parent || parent.projectId !== project.id) {
      return { error: 'Родительский элемент Структуры не найден в этом проекте' as const };
    }
  }

  if (jiraTicketUrl && !jiraTicketUrl.startsWith('https://')) {
    return { error: 'Ссылка Jira должна начинаться с https://' as const };
  }

  const jiraBaseUrl = project.jiraIntegration?.baseUrl;
  if (jiraBaseUrl && jiraTicketUrl && !jiraTicketUrl.startsWith(jiraBaseUrl)) {
    return { error: `URL Jira должен начинаться с ${jiraBaseUrl}` as const };
  }

  return { project };
}

async function wouldCreateWbsCycle(itemId: string, nextParentId: string | null | undefined) {
  let cursor = nextParentId;
  while (cursor) {
    if (cursor === itemId) {
      return true;
    }
    const parent = await prisma.wbsItem.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = parent?.parentId ?? null;
  }
  return false;
}

app.post('/api/projects/:projectId/wbs-items/insert-after', async (req, res) => {
  const parsed = wbsInsertAfterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.projectId },
      select: { id: true },
    });
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }

    const items = await prisma.wbsItem.findMany({
      where: { projectId: project.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const afterIndex = items.findIndex((item) => item.id === parsed.data.afterItemId);
    if (afterIndex === -1) {
      res.status(404).json({ error: 'Элемент Структуры не найден в этом проекте' });
      return;
    }

    let insertIndex = afterIndex + 1;
    if (parsed.data.beforeItemId) {
      const beforeIndex = items.findIndex((item) => item.id === parsed.data.beforeItemId);
      if (beforeIndex === -1) {
        res.status(404).json({ error: 'Следующий элемент Структуры не найден в этом проекте' });
        return;
      }
      if (beforeIndex > afterIndex) {
        insertIndex = beforeIndex;
      }
    }

    const afterItem = items[afterIndex];
    const beforeItem = items[insertIndex] ?? null;
    const insertedLevel = beforeItem ? levelFromWbsItem(beforeItem) : levelFromWbsItem(afterItem);
    let parentId: string | null = beforeItem?.parentId ?? null;
    if (!beforeItem) {
      for (let index = insertIndex - 1; index >= 0; index -= 1) {
        const candidate = items[index];
        if (levelFromWbsItem(candidate) < insertedLevel) {
          parentId = candidate.id;
          break;
        }
      }
    }

    const temporaryCode = `__insert_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const created = await prisma.$transaction(async (tx) => {
      for (const [index, item] of items.entries()) {
        await tx.wbsItem.update({
          where: { id: item.id },
          data: { sortOrder: (index < insertIndex ? index + 1 : index + 2) * 10 },
        });
      }

      return tx.wbsItem.create({
        data: {
          projectId: project.id,
          parentId,
          code: temporaryCode,
          title: '',
          type: 'TASK',
          status: 'NOT_STARTED',
          owner: '',
          wbsLevel: insertedLevel,
          sortOrder: (insertIndex + 1) * 10,
        },
      });
    });

    await renumberProjectWbs(project.id);
    await recalculateProjectWbsSchedule(project.id);
    const snapshot = await getProjectWbsSnapshot(project.id);
    await recordWbsCommand({
      projectId: project.id,
      type: 'CREATE',
      payload: {
        action: 'insert-after',
        insertedItemId: created.id,
        afterItemId: parsed.data.afterItemId,
        beforeItemId: parsed.data.beforeItemId,
      },
      afterSnapshot: snapshot,
    });
    res.status(201).json({
      insertedItemId: created.id,
      ...snapshot,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Не удалось вставить элемент Структуры',
    });
  }
});

app.post('/api/projects/:projectId/wbs-snapshot/restore', async (req, res) => {
  const parsed = wbsSnapshotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    select: { id: true },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  const snapshotItemIds = new Set(parsed.data.wbsItems.map((item) => item.id));
  if (snapshotItemIds.size !== parsed.data.wbsItems.length) {
    res.status(400).json({ error: 'Снимок Структуры содержит повторяющиеся идентификаторы элементов' });
    return;
  }

  for (const item of parsed.data.wbsItems) {
    if (item.parentId && !snapshotItemIds.has(item.parentId)) {
      res.status(400).json({ error: `Родительский элемент Структуры ${item.parentId} отсутствует в снимке` });
      return;
    }
  }

  for (const dependency of parsed.data.wbsDependencies) {
    if (!snapshotItemIds.has(dependency.predecessorId) || !snapshotItemIds.has(dependency.successorId)) {
      res.status(400).json({ error: 'Связь в снимке Структуры ссылается на отсутствующий элемент' });
      return;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.wbsDependency.deleteMany({ where: { projectId: project.id } });

    const existingItems = await tx.wbsItem.findMany({
      where: { projectId: project.id },
      select: { id: true },
    });

    for (const item of existingItems) {
      await tx.wbsItem.update({
        where: { id: item.id },
        data: {
          parentId: null,
          code: `__restore_${item.id}`,
        },
      });
    }

    await tx.wbsItem.deleteMany({
      where: { projectId: project.id, id: { notIn: [...snapshotItemIds] } },
    });

    for (const item of parsed.data.wbsItems) {
      const data = wbsItemSnapshotData(project.id, item);
      await tx.wbsItem.upsert({
        where: { id: item.id },
        update: data,
        create: data,
      });
    }

    for (const item of parsed.data.wbsItems) {
      await tx.wbsItem.update({
        where: { id: item.id },
        data: { parentId: item.parentId || null },
      });
    }

    for (const dependency of parsed.data.wbsDependencies) {
      await tx.wbsDependency.create({
        data: {
          projectId: project.id,
          predecessorId: dependency.predecessorId,
          successorId: dependency.successorId,
          type: dependency.type,
          lagDays: dependency.lagDays,
        },
      });
    }
  });

  await renumberProjectWbs(project.id);
  await recalculateProjectWbsSchedule(project.id);
  const snapshot = await getProjectWbsSnapshot(project.id);
  await recordWbsCommand({
    projectId: project.id,
    type: 'RESTORE',
    payload: {
      itemCount: parsed.data.wbsItems.length,
      dependencyCount: parsed.data.wbsDependencies.length,
    },
    afterSnapshot: snapshot,
  });

  res.json(snapshot);
});

app.post('/api/projects/:projectId/wbs-items', async (req, res) => {
  const parsed = wbsItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const validation = await validateWbsProjectAndParent(
    req.params.projectId,
    parsed.data.parentId,
    parsed.data.jiraTicketUrl,
  );
  if ('error' in validation) {
    res.status(validation.error === 'Проект не найден' ? 404 : 400).json({ error: validation.error });
    return;
  }

  const item = await prisma.wbsItem.create({
    data: {
      projectId: validation.project.id,
      parentId: parsed.data.parentId || null,
      code: parsed.data.code,
      title: parsed.data.title,
      type: parsed.data.type,
      status: parsed.data.status,
      owner: parsed.data.owner,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      baselineStartDate: parsed.data.baselineStartDate
        ? new Date(parsed.data.baselineStartDate)
        : parsed.data.startDate
          ? new Date(parsed.data.startDate)
          : null,
      baselineDueDate: parsed.data.baselineDueDate
        ? new Date(parsed.data.baselineDueDate)
        : parsed.data.dueDate
          ? new Date(parsed.data.dueDate)
          : null,
      forecastStartDate: parsed.data.forecastStartDate
        ? new Date(parsed.data.forecastStartDate)
        : parsed.data.startDate
          ? new Date(parsed.data.startDate)
          : null,
      forecastDueDate: parsed.data.forecastDueDate
        ? new Date(parsed.data.forecastDueDate)
        : parsed.data.dueDate
          ? new Date(parsed.data.dueDate)
          : null,
      wbsLevel: parsed.data.wbsLevel ?? null,
      predecessor1: parsed.data.predecessor1 || null,
      predecessor2: parsed.data.predecessor2 || null,
      predecessor3: parsed.data.predecessor3 || null,
      predecessor4: parsed.data.predecessor4 || null,
      predecessor5: parsed.data.predecessor5 || null,
      predecessor6: parsed.data.predecessor6 || null,
      leadLagDays: parsed.data.leadLagDays,
      workDays: parsed.data.workDays ?? null,
      calendarDays: parsed.data.calendarDays ?? null,
      excelStartDate: parsed.data.excelStartDate
        ? new Date(parsed.data.excelStartDate)
        : parsed.data.startDate
          ? new Date(parsed.data.startDate)
          : null,
      excelEndDate: parsed.data.excelEndDate
        ? new Date(parsed.data.excelEndDate)
        : parsed.data.dueDate
          ? new Date(parsed.data.dueDate)
          : null,
      planWorkDays: parsed.data.planWorkDays ?? null,
      planCalendarDays: parsed.data.planCalendarDays ?? null,
      calendarCode: parsed.data.calendarCode,
      templateColor: parsed.data.templateColor || null,
      priority: parsed.data.priority || null,
      plannedCost: parsed.data.plannedCost,
      forecastCost: parsed.data.forecastCost,
      progress: parsed.data.progress,
      jiraTicketKey: parsed.data.jiraTicketKey || null,
      jiraTicketUrl: parsed.data.jiraTicketUrl || null,
      description: parsed.data.description || null,
      sortOrder: parsed.data.sortOrder,
    },
  });
  await recordWbsCommand({
    projectId: validation.project.id,
    type: 'CREATE',
    payload: { itemId: item.id, item },
  });

  await recalculateProjectWbsSchedule(validation.project.id);
  const snapshot = await getProjectWbsSnapshot(validation.project.id);
  res.status(201).json({ item, ...snapshot });
});

app.patch('/api/wbs-items/:itemId', async (req, res) => {
  const parsed = wbsItemSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.wbsItem.findUnique({
    where: { id: req.params.itemId },
  });

  if (!existing) {
    res.status(404).json({ error: 'Элемент Структуры не найден' });
    return;
  }

  if (parsed.data.parentId === existing.id) {
    res.status(400).json({ error: 'Элемент Структуры не может быть своим родителем' });
    return;
  }

  const nextParentId = parsed.data.parentId === undefined ? existing.parentId : parsed.data.parentId;
  const nextJiraUrl = parsed.data.jiraTicketUrl === undefined ? existing.jiraTicketUrl : parsed.data.jiraTicketUrl;
  const validation = await validateWbsProjectAndParent(existing.projectId, nextParentId, nextJiraUrl);
  if ('error' in validation) {
    res.status(validation.error === 'Проект не найден' ? 404 : 400).json({ error: validation.error });
    return;
  }

  if (await wouldCreateWbsCycle(existing.id, nextParentId)) {
    res.status(400).json({ error: 'Элемент Структуры нельзя перенести под свой дочерний элемент' });
    return;
  }

  const updated = await prisma.wbsItem.update({
    where: { id: existing.id },
    data: {
      parentId: parsed.data.parentId === undefined ? undefined : parsed.data.parentId || null,
      code: undefined,
      title: parsed.data.title,
      type: parsed.data.type,
      status: parsed.data.status,
      owner: parsed.data.owner,
      startDate:
        parsed.data.startDate === undefined
          ? undefined
          : parsed.data.startDate
            ? new Date(parsed.data.startDate)
            : null,
      dueDate:
        parsed.data.dueDate === undefined ? undefined : parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      baselineStartDate:
        parsed.data.baselineStartDate === undefined
          ? undefined
          : parsed.data.baselineStartDate
            ? new Date(parsed.data.baselineStartDate)
            : null,
      baselineDueDate:
        parsed.data.baselineDueDate === undefined
          ? undefined
          : parsed.data.baselineDueDate
            ? new Date(parsed.data.baselineDueDate)
            : null,
      forecastStartDate:
        parsed.data.forecastStartDate === undefined
          ? undefined
          : parsed.data.forecastStartDate
            ? new Date(parsed.data.forecastStartDate)
            : null,
      forecastDueDate:
        parsed.data.forecastDueDate === undefined
          ? undefined
          : parsed.data.forecastDueDate
            ? new Date(parsed.data.forecastDueDate)
            : null,
      wbsLevel: parsed.data.wbsLevel === undefined ? undefined : parsed.data.wbsLevel ?? null,
      predecessor1: parsed.data.predecessor1 === undefined ? undefined : parsed.data.predecessor1 || null,
      predecessor2: parsed.data.predecessor2 === undefined ? undefined : parsed.data.predecessor2 || null,
      predecessor3: parsed.data.predecessor3 === undefined ? undefined : parsed.data.predecessor3 || null,
      predecessor4: parsed.data.predecessor4 === undefined ? undefined : parsed.data.predecessor4 || null,
      predecessor5: parsed.data.predecessor5 === undefined ? undefined : parsed.data.predecessor5 || null,
      predecessor6: parsed.data.predecessor6 === undefined ? undefined : parsed.data.predecessor6 || null,
      leadLagDays: parsed.data.leadLagDays,
      workDays: parsed.data.workDays === undefined ? undefined : parsed.data.workDays ?? null,
      calendarDays: parsed.data.calendarDays === undefined ? undefined : parsed.data.calendarDays ?? null,
      excelStartDate:
        parsed.data.excelStartDate === undefined
          ? undefined
          : parsed.data.excelStartDate
            ? new Date(parsed.data.excelStartDate)
            : null,
      excelEndDate:
        parsed.data.excelEndDate === undefined
          ? undefined
          : parsed.data.excelEndDate
            ? new Date(parsed.data.excelEndDate)
            : null,
      planWorkDays: parsed.data.planWorkDays === undefined ? undefined : parsed.data.planWorkDays ?? null,
      planCalendarDays:
        parsed.data.planCalendarDays === undefined ? undefined : parsed.data.planCalendarDays ?? null,
      calendarCode: parsed.data.calendarCode,
      templateColor: parsed.data.templateColor === undefined ? undefined : parsed.data.templateColor || null,
      priority: parsed.data.priority === undefined ? undefined : parsed.data.priority || null,
      plannedCost: parsed.data.plannedCost,
      forecastCost: parsed.data.forecastCost,
      progress: parsed.data.progress,
      jiraTicketKey: parsed.data.jiraTicketKey === undefined ? undefined : parsed.data.jiraTicketKey || null,
      jiraTicketUrl: parsed.data.jiraTicketUrl === undefined ? undefined : parsed.data.jiraTicketUrl || null,
      description: parsed.data.description === undefined ? undefined : parsed.data.description || null,
      sortOrder: parsed.data.sortOrder,
    },
  });
  await recordWbsCommand({
    projectId: existing.projectId,
    type: 'UPDATE',
    payload: { itemId: existing.id, patch: parsed.data },
    beforeSnapshot: existing,
    afterSnapshot: updated,
  });

  await recalculateProjectWbsSchedule(existing.projectId);
  const snapshot = await getProjectWbsSnapshot(existing.projectId);
  res.json({ item: updated, ...snapshot });
});

app.post('/api/projects/:projectId/wbs-items/renumber', async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    select: { id: true },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  const updatedCount = await renumberProjectWbs(project.id);
  await recalculateProjectWbsSchedule(project.id);
  const snapshot = await getProjectWbsSnapshot(project.id);
  await recordWbsCommand({
    projectId: project.id,
    type: 'BULK_UPDATE',
    payload: { action: 'renumber', updatedCount },
    afterSnapshot: snapshot,
  });
  res.json({
    updatedCount,
    ...snapshot,
  });
});

app.post('/api/projects/:projectId/wbs-baseline', async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    select: { id: true },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  const baseline = await createWbsBaselineFromCurrentPlan(project.id);

  const snapshot = await getProjectWbsSnapshot(project.id);
  await recordWbsCommand({
    projectId: project.id,
    type: 'BASELINE',
    payload: {
      action: 'set-baseline-from-current-structure',
      baselineId: baseline.id,
      version: baseline.version,
    },
    afterSnapshot: snapshot,
  });
  res.json(snapshot);
});

app.post('/api/projects/:projectId/wbs-items/reorder', async (req, res) => {
  const parsed = wbsReorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    select: { id: true },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  const items = await prisma.wbsItem.findMany({
    where: { projectId: project.id },
    select: { id: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  const existingIds = new Set(items.map((item) => item.id));
  const orderedIds = parsed.data.orderedIds.filter((id, index, ids) => existingIds.has(id) && ids.indexOf(id) === index);
  const submittedIds = new Set(orderedIds);
  const missingIds = items.map((item) => item.id).filter((id) => !submittedIds.has(id));
  const nextIds = [...orderedIds, ...missingIds];

  await prisma.$transaction(
    nextIds.map((id, index) =>
      prisma.wbsItem.update({
        where: { id },
        data: { sortOrder: (index + 1) * 10 },
      }),
    ),
  );

  await renumberProjectWbs(project.id);
  await recalculateProjectWbsSchedule(project.id);
  const snapshot = await getProjectWbsSnapshot(project.id);
  await recordWbsCommand({
    projectId: project.id,
    type: 'MOVE',
    payload: { orderedIds: parsed.data.orderedIds },
    afterSnapshot: snapshot,
  });

  res.json(snapshot);
});

app.delete('/api/wbs-items/:itemId', async (req, res) => {
  const existing = await prisma.wbsItem.findUnique({
    where: { id: req.params.itemId },
  });

  if (!existing) {
    res.status(404).json({ error: 'Элемент Структуры не найден' });
    return;
  }

  const projectItems = await prisma.wbsItem.findMany({
    where: { projectId: existing.projectId },
    select: { id: true, parentId: true, code: true, wbsLevel: true },
  });
  const childrenByParent = new Map<string, typeof projectItems>();
  for (const item of projectItems) {
    if (!item.parentId) continue;
    childrenByParent.set(item.parentId, [...(childrenByParent.get(item.parentId) ?? []), item]);
  }
  const descendantUpdates: Array<{ id: string; wbsLevel: number }> = [];
  const collectDescendants = (parentId: string) => {
    for (const child of childrenByParent.get(parentId) ?? []) {
      const currentLevel = child.wbsLevel ?? levelFromWbsCode(child.code);
      descendantUpdates.push({ id: child.id, wbsLevel: Math.max(1, currentLevel - 1) });
      collectDescendants(child.id);
    }
  };
  collectDescendants(existing.id);

  await prisma.$transaction(async (tx) => {
    await tx.wbsItem.updateMany({
      where: { parentId: existing.id },
      data: {
        parentId: existing.parentId,
      },
    });

    for (const descendant of descendantUpdates) {
      await tx.wbsItem.update({
        where: { id: descendant.id },
        data: { wbsLevel: descendant.wbsLevel },
      });
    }

    await tx.wbsDependency.deleteMany({
      where: {
        OR: [{ predecessorId: existing.id }, { successorId: existing.id }],
      },
    });

    await tx.wbsItem.delete({
      where: { id: existing.id },
    });
  });

  await renumberProjectWbs(existing.projectId);
  await recalculateProjectWbsSchedule(existing.projectId);
  const snapshot = await getProjectWbsSnapshot(existing.projectId);
  await recordWbsCommand({
    projectId: existing.projectId,
    type: 'DELETE',
    payload: { itemId: existing.id, code: existing.code, title: existing.title },
    beforeSnapshot: existing,
    afterSnapshot: snapshot,
  });

  res.json(snapshot);
});

const wbsDependencySchema = z.object({
  predecessorId: z.string().trim().min(1),
  successorId: z.string().trim().min(1),
  type: z.enum(['FS', 'SS', 'FF', 'SF']).default('FS'),
  lagDays: z.coerce.number().int().default(0),
});

async function wouldCreateDependencyCycle(
  projectId: string,
  predecessorId: string,
  successorId: string,
  ignoredDependencyId?: string,
) {
  const dependencies = await prisma.wbsDependency.findMany({
    where: {
      projectId,
      ...(ignoredDependencyId ? { id: { not: ignoredDependencyId } } : {}),
    },
    select: { predecessorId: true, successorId: true },
  });
  const graph = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const next = graph.get(dependency.predecessorId) ?? [];
    next.push(dependency.successorId);
    graph.set(dependency.predecessorId, next);
  }
  graph.set(predecessorId, [...(graph.get(predecessorId) ?? []), successorId]);

  const seen = new Set<string>();
  const stack = [successorId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    if (current === predecessorId) return true;
    seen.add(current);
    stack.push(...(graph.get(current) ?? []));
  }
  return false;
}

async function dependencyLimitExceeded(
  projectId: string,
  successorId: string,
  predecessorId: string,
  ignoredDependencyId?: string,
) {
  const dependencies = await prisma.wbsDependency.findMany({
    where: {
      projectId,
      successorId,
      ...(ignoredDependencyId ? { id: { not: ignoredDependencyId } } : {}),
    },
    select: { predecessorId: true },
  });
  const uniquePredecessors = new Set(dependencies.map((dependency) => dependency.predecessorId));
  uniquePredecessors.add(predecessorId);
  return uniquePredecessors.size > 6;
}

app.post('/api/projects/:projectId/wbs-dependencies', async (req, res) => {
  const parsed = wbsDependencySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    if (parsed.data.predecessorId === parsed.data.successorId) {
      res.status(400).json({ error: 'Связь не может ссылаться на тот же элемент' });
      return;
    }

    const items = await prisma.wbsItem.findMany({
      where: {
        projectId: req.params.projectId,
        id: { in: [parsed.data.predecessorId, parsed.data.successorId] },
      },
    });
    if (items.length !== 2) {
      res.status(400).json({ error: 'Оба элемента Структуры должны относиться к проекту' });
      return;
    }

    if (await dependencyLimitExceeded(req.params.projectId, parsed.data.successorId, parsed.data.predecessorId)) {
      res.status(400).json({ error: 'У элемента Структуры может быть не больше шести предшественников' });
      return;
    }

    if (await wouldCreateDependencyCycle(req.params.projectId, parsed.data.predecessorId, parsed.data.successorId)) {
      res.status(400).json({ error: 'Связь создаст цикл' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.wbsDependency.deleteMany({
        where: {
          projectId: req.params.projectId,
          predecessorId: parsed.data.predecessorId,
          successorId: parsed.data.successorId,
          type: { not: parsed.data.type },
        },
      });
      await tx.wbsDependency.upsert({
        where: {
          projectId_predecessorId_successorId_type: {
            projectId: req.params.projectId,
            predecessorId: parsed.data.predecessorId,
            successorId: parsed.data.successorId,
            type: parsed.data.type,
          },
        },
        create: {
          projectId: req.params.projectId,
          ...parsed.data,
        },
        update: {
          lagDays: parsed.data.lagDays,
        },
      });
    });
    await syncWbsPredecessorFields(req.params.projectId);
    await recalculateProjectWbsSchedule(req.params.projectId);
    const snapshot = await getProjectWbsSnapshot(req.params.projectId);
    await recordWbsCommand({
      projectId: req.params.projectId,
      type: 'UPDATE',
      payload: { action: 'upsert-dependency', dependency: parsed.data },
      afterSnapshot: snapshot,
    });

    res.status(201).json(snapshot);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: serverErrorMessage(error, 'Не удалось создать связь Структуры'),
    });
  }
});

app.patch('/api/wbs-dependencies/:dependencyId', async (req, res) => {
  const parsed = wbsDependencySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const dependency = await prisma.wbsDependency.findUnique({
      where: { id: req.params.dependencyId },
    });
    if (!dependency) {
      res.status(404).json({ error: 'Связь Структуры не найдена' });
      return;
    }
    if (parsed.data.predecessorId === parsed.data.successorId) {
      res.status(400).json({ error: 'Связь не может ссылаться на тот же элемент' });
      return;
    }

    const items = await prisma.wbsItem.findMany({
      where: {
        projectId: dependency.projectId,
        id: { in: [parsed.data.predecessorId, parsed.data.successorId] },
      },
    });
    if (items.length !== 2) {
      res.status(400).json({ error: 'Оба элемента Структуры должны относиться к проекту' });
      return;
    }
    if (
      await dependencyLimitExceeded(
        dependency.projectId,
        parsed.data.successorId,
        parsed.data.predecessorId,
        dependency.id,
      )
    ) {
      res.status(400).json({ error: 'У элемента Структуры может быть не больше шести предшественников' });
      return;
    }
    if (
      await wouldCreateDependencyCycle(
        dependency.projectId,
        parsed.data.predecessorId,
        parsed.data.successorId,
        dependency.id,
      )
    ) {
      res.status(400).json({ error: 'Связь создаст цикл' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.wbsDependency.delete({ where: { id: dependency.id } });
      await tx.wbsDependency.deleteMany({
        where: {
          projectId: dependency.projectId,
          predecessorId: parsed.data.predecessorId,
          successorId: parsed.data.successorId,
          type: { not: parsed.data.type },
        },
      });
      await tx.wbsDependency.upsert({
        where: {
          projectId_predecessorId_successorId_type: {
            projectId: dependency.projectId,
            predecessorId: parsed.data.predecessorId,
            successorId: parsed.data.successorId,
            type: parsed.data.type,
          },
        },
        create: {
          projectId: dependency.projectId,
          predecessorId: parsed.data.predecessorId,
          successorId: parsed.data.successorId,
          type: parsed.data.type,
          lagDays: parsed.data.lagDays,
        },
        update: {
          lagDays: parsed.data.lagDays,
        },
      });
    });
    await syncWbsPredecessorFields(dependency.projectId);
    await recalculateProjectWbsSchedule(dependency.projectId);
    const snapshot = await getProjectWbsSnapshot(dependency.projectId);
    await recordWbsCommand({
      projectId: dependency.projectId,
      type: 'UPDATE',
      payload: { action: 'move-dependency', dependencyId: dependency.id, dependency: parsed.data },
      beforeSnapshot: dependency,
      afterSnapshot: snapshot,
    });

    res.json(snapshot);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: serverErrorMessage(error, 'Не удалось изменить связь Структуры'),
    });
  }
});

app.delete('/api/wbs-dependencies/:dependencyId', async (req, res) => {
  const dependency = await prisma.wbsDependency.findUnique({
    where: { id: req.params.dependencyId },
  });

  if (!dependency) {
    res.status(404).json({ error: 'Связь Структуры не найдена' });
    return;
  }

  await prisma.wbsDependency.delete({ where: { id: dependency.id } });
  await syncWbsPredecessorFields(dependency.projectId);
  await recalculateProjectWbsSchedule(dependency.projectId);
  const snapshot = await getProjectWbsSnapshot(dependency.projectId);
  await recordWbsCommand({
    projectId: dependency.projectId,
    type: 'UPDATE',
    payload: { action: 'delete-dependency', dependencyId: dependency.id },
    beforeSnapshot: dependency,
    afterSnapshot: snapshot,
  });
  res.json(snapshot);
});

app.get('/api/projects/:projectId/open-issues', async (req, res) => {
  const issues = await prisma.issue.findMany({
    where: {
      projectId: req.params.projectId,
      status: { notIn: ['Done', 'Closed', 'Resolved'] },
    },
    orderBy: [{ decisionRequired: 'desc' }, { severity: 'desc' }, { updatedAt: 'desc' }],
    include: { jiraLinks: { orderBy: { createdAt: 'asc' } } },
  });

  res.json(issues);
});

const jiraIntegrationSchema = z.object({
  baseUrl: z.string().trim().url(),
  boardUrl: z.string().trim().url(),
  projectKey: z.string().trim().min(1),
  issuesJql: z.string().trim().min(1),
  openIssuesJql: z.string().trim().min(1),
});

app.put('/api/projects/:projectId/jira-integration', async (req, res) => {
  const parsed = jiraIntegrationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
  });

  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  const integration = await prisma.jiraIntegration.upsert({
    where: { projectId: project.id },
    create: {
      projectId: project.id,
      ...parsed.data,
      syncStatus: 'CONFIGURED',
    },
    update: {
      ...parsed.data,
      syncStatus: 'CONFIGURED',
    },
  });

  res.json(integration);
});

app.post('/api/projects/:projectId/open-issues', async (req, res) => {
  const parsed = createIssueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    include: { jiraIntegration: true },
  });

  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  const primaryJiraKey = parsed.data.jiraTicketKey?.trim() || null;
  const primaryJiraUrl = parsed.data.jiraTicketUrl?.trim() || null;
  const jiraLinks = [
    ...parsed.data.jiraLinks,
    ...(primaryJiraKey && primaryJiraUrl
      ? [{ jiraKey: primaryJiraKey, jiraUrl: primaryJiraUrl }]
      : []),
  ]
    .map((link) => ({
      jiraKey: link.jiraKey?.trim() ?? '',
      jiraUrl: link.jiraUrl?.trim() ?? '',
    }))
    .filter((link) => link.jiraKey && link.jiraUrl)
    .filter(
      (link, index, allLinks) =>
        allLinks.findIndex((candidate) => candidate.jiraKey === link.jiraKey) === index,
    );

  const invalidUrl = [primaryJiraUrl, ...jiraLinks.map((link) => link.jiraUrl)].find(
    (url) => url && !isValidUrl(url),
  );
  if (invalidUrl) {
    res.status(400).json({ error: `Некорректный Jira URL: ${invalidUrl}` });
    return;
  }

  const jiraBaseUrl = project.jiraIntegration?.baseUrl;
  const invalidLink = jiraLinks.find((link) => jiraBaseUrl && !link.jiraUrl.startsWith(jiraBaseUrl));
  if (jiraBaseUrl && invalidLink) {
    res.status(400).json({ error: `URL Jira должен начинаться с ${jiraBaseUrl}` });
    return;
  }

  const issue = await prisma.issue.create({
    data: {
      projectId: project.id,
      source: jiraLinks.length > 0 ? 'JIRA' : 'INTERNAL',
      title: parsed.data.title,
      severity: parsed.data.severity,
      status: 'Open',
      owner: parsed.data.owner,
      impact: parsed.data.impact,
      decisionRequired: parsed.data.decisionRequired,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      initialDueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      jiraTicketKey: primaryJiraKey ?? jiraLinks[0]?.jiraKey ?? null,
      jiraTicketUrl: primaryJiraUrl ?? jiraLinks[0]?.jiraUrl ?? null,
      jiraLinks: {
        create: jiraLinks.map((link) => ({
          jiraKey: link.jiraKey,
          jiraUrl: link.jiraUrl,
        })),
      },
    },
    include: { jiraLinks: { orderBy: { createdAt: 'asc' } } },
  });

  res.status(201).json(issue);
});

app.patch('/api/open-issues/:issueId', async (req, res) => {
  const parsed = updateIssueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const issue = await prisma.issue.findUnique({
    where: { id: req.params.issueId },
  });

  if (!issue) {
    res.status(404).json({ error: 'Открытый вопрос не найден' });
    return;
  }

  const nextDueDate =
    parsed.data.dueDate === undefined
      ? undefined
      : parsed.data.dueDate
        ? new Date(parsed.data.dueDate)
        : null;
  const nextInitialDueDate =
    parsed.data.dueDate === undefined || issue.initialDueDate
      ? undefined
      : issue.dueDate ?? nextDueDate;
  const nextJiraUrl =
    parsed.data.jiraTicketUrl === undefined
      ? undefined
      : parsed.data.jiraTicketUrl?.trim() || null;
  if (nextJiraUrl && !isValidUrl(nextJiraUrl)) {
    res.status(400).json({ error: `Некорректный Jira URL: ${nextJiraUrl}` });
    return;
  }

  const updated = await prisma.issue.update({
    where: { id: issue.id },
    data: {
      ...parsed.data,
      dueDate: nextDueDate,
      initialDueDate: nextInitialDueDate,
      jiraTicketKey:
        parsed.data.jiraTicketKey === undefined
          ? undefined
          : parsed.data.jiraTicketKey?.trim() || null,
      jiraTicketUrl: nextJiraUrl,
    },
    include: { jiraLinks: { orderBy: { createdAt: 'asc' } } },
  });

  res.json(updated);
});

const issueJiraLinkSchema = z.object({
  jiraKey: z.string().trim().min(1),
  jiraUrl: z.string().trim().url(),
});

app.post('/api/open-issues/:issueId/jira-links', async (req, res) => {
  const parsed = issueJiraLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const issue = await prisma.issue.findUnique({
    where: { id: req.params.issueId },
    include: { project: { include: { jiraIntegration: true } } },
  });

  if (!issue) {
    res.status(404).json({ error: 'Открытый вопрос не найден' });
    return;
  }

  const jiraBaseUrl = issue.project.jiraIntegration?.baseUrl;
  if (jiraBaseUrl && !parsed.data.jiraUrl.startsWith(jiraBaseUrl)) {
    res.status(400).json({ error: `URL Jira должен начинаться с ${jiraBaseUrl}` });
    return;
  }

  const link = await prisma.issueJiraLink.upsert({
    where: {
      issueId_jiraKey: {
        issueId: issue.id,
        jiraKey: parsed.data.jiraKey,
      },
    },
    create: {
      issueId: issue.id,
      jiraKey: parsed.data.jiraKey,
      jiraUrl: parsed.data.jiraUrl,
    },
    update: {
      jiraUrl: parsed.data.jiraUrl,
    },
  });

  if (!issue.jiraTicketKey || !issue.jiraTicketUrl) {
    await prisma.issue.update({
      where: { id: issue.id },
      data: {
        source: 'JIRA',
        jiraTicketKey: parsed.data.jiraKey,
        jiraTicketUrl: parsed.data.jiraUrl,
      },
    });
  }

  res.status(201).json(link);
});

app.delete('/api/open-issues/:issueId/jira-links/:linkId', async (req, res) => {
  const link = await prisma.issueJiraLink.findUnique({
    where: { id: req.params.linkId },
  });

  if (!link || link.issueId !== req.params.issueId) {
    res.status(404).json({ error: 'Связь Jira не найдена' });
    return;
  }

  await prisma.issueJiraLink.delete({
    where: { id: link.id },
  });

  const remainingLinks = await prisma.issueJiraLink.findMany({
    where: { issueId: req.params.issueId },
    orderBy: { createdAt: 'asc' },
  });

  await prisma.issue.update({
    where: { id: req.params.issueId },
    data: {
      source: remainingLinks.length > 0 ? 'JIRA' : 'INTERNAL',
      jiraTicketKey: remainingLinks[0]?.jiraKey ?? null,
      jiraTicketUrl: remainingLinks[0]?.jiraUrl ?? null,
    },
  });

  res.status(204).send();
});

const updateTaskJiraSchema = z.object({
  jiraTicketKey: z.string().trim().min(1).optional().nullable(),
  jiraTicketUrl: z.string().trim().url().optional().nullable(),
});

app.patch('/api/tasks/:taskId/jira-link', async (req, res) => {
  const parsed = updateTaskJiraSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const task = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    include: { project: { include: { jiraIntegration: true } } },
  });

  if (!task) {
    res.status(404).json({ error: 'Задача не найдена' });
    return;
  }

  const jiraBaseUrl = task.project.jiraIntegration?.baseUrl;
  if (jiraBaseUrl && parsed.data.jiraTicketUrl && !parsed.data.jiraTicketUrl.startsWith(jiraBaseUrl)) {
    res.status(400).json({ error: `URL Jira должен начинаться с ${jiraBaseUrl}` });
    return;
  }

  const updated = await prisma.task.update({
    where: { id: req.params.taskId },
    data: parsed.data,
  });

  res.json(updated);
});

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function daysSince(value: Date | null | undefined) {
  if (!value) return null;
  return Math.floor((Date.now() - value.getTime()) / 86_400_000);
}

function severityRank(severity: string) {
  return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[severity] ?? 0;
}

function raidSeverity(score: number) {
  if (score >= 20) return 'CRITICAL';
  if (score >= 15) return 'HIGH';
  if (score >= 8) return 'MEDIUM';
  return 'LOW';
}

function ragLabel(rag: string) {
  if (rag === 'RED') return 'Критично';
  if (rag === 'AMBER') return 'Под риском';
  return 'В норме';
}

function severityLabel(severity: string) {
  return (
    {
      CRITICAL: 'Критичная',
      HIGH: 'Высокая',
      MEDIUM: 'Средняя',
      LOW: 'Низкая',
    }[severity] ?? severity
  );
}

function wbsStatusLabel(status: string) {
  return labels.wbsStatus[status as keyof typeof labels.wbsStatus] ?? status;
}

function raidTypeLabel(type: string) {
  return labels.raidType[type as keyof typeof labels.raidType] ?? type;
}

function overviewTone(value: 'green' | 'amber' | 'red' | 'neutral') {
  return value;
}

function generateExecutiveSummary(project: Awaited<ReturnType<typeof getProjectForOverviewGeneration>>) {
  if (!project) {
    throw new Error('Проект не найден');
  }

  const criticalIssues = project.issues.filter((issue) => issue.severity === 'CRITICAL');
  const decisionIssues = project.issues.filter((issue) => issue.decisionRequired);
  const activeRaidItems = project.raidItems.filter((item) => !['CLOSED', 'VALIDATED'].includes(item.status));
  const highRaidItems = activeRaidItems.filter((item) => item.type === 'RISK' && item.riskScore >= 15);
  const activeProblems = activeRaidItems.filter((item) => item.type === 'DEPENDENCY');
  const activeAssumptions = activeRaidItems.filter((item) => item.type === 'ASSUMPTION');
  const topIssue = [...project.issues].sort(
    (left, right) => severityRank(right.severity) - severityRank(left.severity),
  )[0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const wbsMilestones = project.wbsItems
    .filter((item) => item.type === 'MILESTONE')
    .sort(
      (left, right) =>
        (left.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (right.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) ||
        left.sortOrder - right.sortOrder,
    );
  const nextMilestone = wbsMilestones.find((milestone) => milestone.status !== 'DONE');
  const completedWbs = project.wbsItems.filter((item) => item.status === 'DONE').length;
  const blockedWbs = project.wbsItems.filter((item) => item.status === 'BLOCKED').length;
  const atRiskWbs = project.wbsItems.filter((item) => item.status === 'AT_RISK').length;
  const missingWbsDates = project.wbsItems.filter((item) => !item.startDate || !item.dueDate).length;
  const overdueMilestones = wbsMilestones.filter(
    (milestone) => milestone.status !== 'DONE' && milestone.dueDate && milestone.dueDate.getTime() < today.getTime(),
  ).length;
  const jiraSyncAge = daysSince(project.jiraIntegration?.lastSyncedAt);
  const staleJiraIssues = project.jiraSnapshots.filter((issue) => daysSince(issue.updatedAt) !== null && Number(daysSince(issue.updatedAt)) > 7);
  const artifactBaselineCount = project.artifacts.filter((artifact) =>
    ['Approved', 'Baseline'].includes(artifact.status),
  ).length;
  const scheduleText =
    project.scheduleVariance > 0
      ? `отклонение по срокам +${project.scheduleVariance} дней`
      : project.scheduleVariance < 0
        ? `опережение графика ${Math.abs(project.scheduleVariance)} дней`
        : 'отклонений по срокам нет';

  const executiveSummary = [
    `${project.name} находится в статусе ${ragLabel(project.rag)}.`,
    `Готовность составляет ${project.progress}%, ${scheduleText}.`,
    criticalIssues.length > 0
      ? `Критических открытых проблем: ${criticalIssues.length}; ключевая проблема: ${topIssue?.title}.`
      : topIssue
        ? `Ключевая открытая проблема: ${topIssue.title}.`
        : 'Критических открытых проблем не зафиксировано.',
    nextMilestone
      ? `Ближайшая веха: ${nextMilestone.title}, срок ${isoDate(nextMilestone.dueDate) ?? 'не задан'}, статус ${wbsStatusLabel(nextMilestone.status)}.`
      : 'Ближайшие вехи не заданы.',
    activeRaidItems.length > 0
      ? `В реестре рисков и проблем активно ${activeRaidItems.length} записей, высоких рисков: ${highRaidItems.length}, проблем: ${activeProblems.length}.`
      : 'Активных записей о рисках и проблемах нет.',
    decisionIssues.length > 0
      ? `Для руководства требуется ${decisionIssues.length} решение(й) по открытым вопросам.`
      : 'Новых решений от руководства сейчас не требуется.',
  ].join(' ');

  const kpis = [
    {
      label: 'Статус',
      value: ragLabel(project.rag),
      secondary: project.rag === 'RED' ? 'Критично' : project.rag === 'AMBER' ? 'Под риском' : 'В норме',
      tone: overviewTone(project.rag === 'RED' ? 'red' : project.rag === 'AMBER' ? 'amber' : 'green'),
      source: `Паспорт проекта ${project.code}`,
    },
    {
      label: 'Прогресс',
      value: `${project.progress}%`,
      secondary: `${completedWbs}/${project.wbsItems.length || 0} элементов Структуры сделано`,
      tone: overviewTone(project.progress >= 80 ? 'green' : project.progress >= 45 ? 'amber' : 'neutral'),
      source: 'Базовый план Структуры',
    },
    {
      label: 'Сроки',
      value: `${project.scheduleVariance > 0 ? '+' : ''}${project.scheduleVariance} дней`,
      secondary: overdueMilestones > 0 ? `${overdueMilestones} просроченных вех` : 'отклонение от базового плана',
      tone: overviewTone(project.scheduleVariance > 10 || overdueMilestones > 0 ? 'red' : project.scheduleVariance > 0 ? 'amber' : 'green'),
      source: 'План-график проекта',
    },
    {
      label: 'Открытые вопросы',
      value: String(project.issues.length),
      secondary: `${criticalIssues.length} критичных / ${decisionIssues.length} решений`,
      tone: overviewTone(criticalIssues.length > 0 ? 'red' : decisionIssues.length > 0 ? 'amber' : 'green'),
      source: 'Реестр открытых вопросов',
    },
    {
      label: 'Риски и проблемы',
      value: `${activeRaidItems.length}`,
      secondary: `${highRaidItems.length} высоких рисков / ${activeProblems.length} проблем / ${activeAssumptions.length} допущений`,
      tone: overviewTone(highRaidItems.length > 0 || activeProblems.length > 0 ? 'red' : activeAssumptions.length > 0 ? 'amber' : 'green'),
      source: 'Риски и проблемы',
    },
    {
      label: 'Вехи',
      value: String(wbsMilestones.length),
      secondary: overdueMilestones > 0 ? `${overdueMilestones} просрочено` : 'по данным Структуры',
      tone: overviewTone(overdueMilestones > 0 ? 'red' : wbsMilestones.length > 0 ? 'green' : 'neutral'),
      source: 'Структура',
    },
  ];

  const qualityGates = [
    {
      name: 'Актуальность данных проекта',
      status: !project.jiraIntegration ? 'WARN' : jiraSyncAge === null || jiraSyncAge > 3 ? 'WARN' : 'OK',
      detail: !project.jiraIntegration
        ? 'Интеграция Jira не настроена'
        : jiraSyncAge === null
          ? 'Jira еще не синхронизировалась'
          : `Давность синхронизации Jira: ${jiraSyncAge} дн.`,
      source: 'Интеграция Jira',
    },
    {
      name: 'Полнота плана',
      status: project.wbsItems.length === 0 || missingWbsDates > 0 ? 'WARN' : 'OK',
      detail:
        missingWbsDates > 0
          ? `${missingWbsDates} элемент(ов) Структуры без дат старта и срока`
          : `${project.wbsItems.length} элемент(ов) Структуры с календарными данными`,
      source: 'Структура',
    },
    {
      name: 'Контроль блокеров',
      status: criticalIssues.length > 0 || blockedWbs > 0 ? 'BLOCKED' : decisionIssues.length > 0 || atRiskWbs > 0 ? 'WARN' : 'OK',
      detail: `${criticalIssues.length} критичных вопросов, ${blockedWbs} проваленных элементов Структуры, ${decisionIssues.length} решений требуется`,
      source: 'Открытые вопросы + Структура',
    },
    {
      name: 'Управленческие подтверждения',
      status: artifactBaselineCount > 0 ? 'OK' : 'WARN',
      detail: `${artifactBaselineCount} одобренных артефактов или базовых планов в реестре проекта`,
      source: 'Реестр артефактов',
    },
    {
      name: 'Дисциплина управления рисками',
      status: highRaidItems.some((item) => !item.mitigationPlan) ? 'BLOCKED' : highRaidItems.length > 0 ? 'WARN' : 'OK',
      detail: `${highRaidItems.length} высоких рисков, ${activeProblems.length} активных проблем, ${activeAssumptions.length} допущений`,
      source: 'Риски и проблемы',
    },
  ];

  const risks = [
    ...project.issues.slice(0, 5).map((issue) => ({
      title: issue.title,
      severity: severityLabel(issue.severity),
      owner: issue.owner,
      impact: issue.impact,
      dueDate: isoDate(issue.dueDate),
      source:
        issue.jiraLinks.length > 0
          ? issue.jiraLinks.map((link) => link.jiraKey).join(', ')
          : 'Реестр открытых вопросов',
    })),
    ...activeRaidItems
      .filter((item) => item.type === 'RISK')
      .slice(0, Math.max(0, 5 - Math.min(project.issues.length, 5)))
      .map((item) => ({
        title: item.title,
        severity: severityLabel(raidSeverity(item.riskScore)),
        owner: item.owner,
        impact: `${item.description} Сроки: ${item.scheduleImpactDays} дн. План действий: ${
          item.mitigationPlan ?? 'не задан'
        }`,
        dueDate: isoDate(item.dueDate),
        source: `Оценка риска ${item.riskScore}`,
      })),
    ...project.wbsItems
      .filter((item) => item.status === 'BLOCKED' || item.status === 'AT_RISK')
      .slice(0, Math.max(0, 5 - Math.min(project.issues.length + highRaidItems.length, 5)))
      .map((item) => ({
        title: `${item.code} ${item.title}`,
        severity: severityLabel(item.status === 'BLOCKED' ? 'HIGH' : 'MEDIUM'),
        owner: item.owner,
        impact: item.description ?? 'Элемент Структуры требует внимания руководства',
        dueDate: isoDate(item.dueDate),
        source: 'Структура',
      })),
  ];

  const nextSteps = [
    ...decisionIssues.slice(0, 3).map((issue) => ({
      title: `Принять управленческое решение: ${issue.title}`,
      owner: issue.owner,
      dueDate: isoDate(issue.dueDate),
      source: 'Реестр открытых вопросов',
    })),
    ...wbsMilestones
      .filter((milestone) => milestone.status !== 'DONE')
      .slice(0, 3)
      .map((milestone) => ({
        title: `Подготовить веху: ${milestone.title}`,
        owner: milestone.owner,
        dueDate: isoDate(milestone.dueDate),
        source: 'Вехи',
      })),
    ...staleJiraIssues.slice(0, 2).map((issue) => ({
      title: `Обновить статус Jira: ${issue.issueKey}`,
      owner: issue.assignee ?? 'Проектная команда',
      dueDate: isoDate(issue.updatedAt),
      source: 'Снимок Jira',
    })),
  ].slice(0, 6);

  const decisions = decisionIssues.slice(0, 5).map((issue) => ({
    title: issue.title,
    impactIfApproved: issue.impact,
    impactIfDelayed: `Сохраняется риск по ответственному ${issue.owner}; срок решения: ${
      isoDate(issue.dueDate) ?? 'не задан'
    }`,
    deadline: isoDate(issue.dueDate),
    source: issue.jiraLinks.length > 0 ? issue.jiraLinks.map((link) => link.jiraKey).join(', ') : 'Реестр открытых вопросов',
  }));

  const evidence = [
    {
      metric: 'Статус проекта',
      source: `Проект ${project.code} / индикатор ${ragLabel(project.rag)}`,
    },
    {
      metric: 'Отклонение сроков',
      source: `Снимок плана проекта / ${project.scheduleVariance} дн.`,
    },
    {
      metric: 'Структура',
      source: `${project.wbsItems.length} элементов / ${project.wbsItems.filter((item) => item.status === 'DONE').length} сделано`,
    },
    {
      metric: 'Открытые вопросы',
      source: `${project.issues.length} открытых вопросов в едином реестре`,
    },
    {
      metric: 'Снимок Jira',
      source: `${project.jiraSnapshots.length} синхронизированных задач Jira`,
    },
    {
      metric: 'Вехи',
      source: `${wbsMilestones.length} вех проекта из Структуры`,
    },
    {
      metric: 'Артефакты',
      source: `${project.artifacts.length} артефактов проекта / ${artifactBaselineCount} одобрено или зафиксировано как базовый план`,
    },
    {
      metric: 'Риски',
      source: `${activeRaidItems.length} активных записей о рисках / ${highRaidItems.length} высоких рисков`,
    },
    {
      metric: 'Риски и проблемы',
      source: `${activeRaidItems.length} активных записей / ${highRaidItems.length} высоких рисков / ${activeProblems.length} проблем`,
    },
    ...project.issues.slice(0, 3).map((issue) => ({
      metric: issue.title,
      source:
        issue.jiraLinks.length > 0
          ? issue.jiraLinks.map((link) => `${link.jiraKey}: ${link.jiraUrl}`).join('; ')
          : `${issue.source === 'JIRA' ? 'Jira' : 'Внутренний'} вопрос, ответственный ${issue.owner}`,
    })),
  ];

  return { executiveSummary, kpis, qualityGates, risks, nextSteps, decisions, evidence };
}

async function getProjectForOverviewGeneration(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      jiraIntegration: true,
      issues: {
        where: { status: { notIn: ['Done', 'Closed', 'Resolved'] } },
        orderBy: [{ decisionRequired: 'desc' }, { severity: 'desc' }, { updatedAt: 'desc' }],
        include: { jiraLinks: { orderBy: { createdAt: 'asc' } } },
      },
      jiraSnapshots: { orderBy: { updatedAt: 'desc' } },
      milestones: { orderBy: { dueDate: 'asc' } },
      wbsItems: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] },
      wbsDependencies: {
        orderBy: { createdAt: 'asc' },
        include: {
          predecessor: { select: { id: true, code: true, title: true } },
          successor: { select: { id: true, code: true, title: true } },
        },
      },
      artifacts: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      raidItems: { orderBy: [{ riskScore: 'desc' }, { updatedAt: 'desc' }] },
      changeRequests: { orderBy: [{ updatedAt: 'desc' }] },
      overviews: { orderBy: { version: 'desc' }, take: 1 },
    },
  });
}

app.post('/api/projects/:projectId/executive-overviews/generate', async (req, res) => {
  const project = await getProjectForOverviewGeneration(req.params.projectId);

  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  const latestVersion = project.overviews[0]?.version ?? 0;
  const generated = generateExecutiveSummary(project);
  const overview = await prisma.executiveOverview.create({
    data: {
      projectId: project.id,
      version: latestVersion + 1,
      status: 'GENERATED',
      generatedAt: new Date(),
      executiveSummary: generated.executiveSummary,
      kpis: generated.kpis,
      qualityGates: generated.qualityGates,
      risks: generated.risks,
      nextSteps: generated.nextSteps,
      decisions: generated.decisions,
      evidence: generated.evidence,
    },
  });

  res.status(201).json(overview);
});

const overviewTransitionSchema = z.object({
  status: z.enum(['PM_REVIEW', 'APPROVED']),
  approvedBy: z.string().trim().optional().nullable(),
});

app.post('/api/executive-overviews/:overviewId/status', async (req, res) => {
  const parsed = overviewTransitionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const overview = await prisma.executiveOverview.findUnique({
    where: { id: req.params.overviewId },
  });

  if (!overview) {
    res.status(404).json({ error: 'Executive overview not found' });
    return;
  }

  if (overview.status === 'PUBLISHED') {
    res.status(400).json({ error: 'Published overview cannot change workflow status' });
    return;
  }

  const updated = await prisma.executiveOverview.update({
    where: { id: overview.id },
    data:
      parsed.data.status === 'PM_REVIEW'
        ? {
            status: 'PM_REVIEW',
            reviewRequestedAt: new Date(),
          }
        : {
            status: 'APPROVED',
            approvedAt: new Date(),
            approvedBy: parsed.data.approvedBy || 'Проектный офис',
          },
  });

  res.json(updated);
});

app.post('/api/executive-overviews/:overviewId/publish', async (req, res) => {
  const overview = await prisma.executiveOverview.findUnique({
    where: { id: req.params.overviewId },
  });

  if (!overview) {
    res.status(404).json({ error: 'Executive overview not found' });
    return;
  }

  if (overview.status !== 'APPROVED') {
    res.status(400).json({ error: 'Executive overview must be approved before publication' });
    return;
  }

  const published = await prisma.executiveOverview.update({
    where: { id: overview.id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });

  res.json(published);
});

app.post('/api/projects/:projectId/jira/sync', async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    include: { jiraIntegration: true },
  });

  if (!project?.jiraIntegration) {
    res.status(404).json({ error: 'Интеграция Jira не настроена для этого проекта' });
    return;
  }

  if (!isJiraConfigured()) {
    res.status(400).json({
      error: 'Переменные окружения Jira не настроены',
      required: ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'],
    });
    return;
  }

  try {
    const issues = await fetchJiraIssues(project.jiraIntegration.issuesJql);
    await prisma.$transaction([
      ...issues.map((issue) =>
        prisma.jiraIssueSnapshot.upsert({
          where: {
            projectId_issueKey: {
              projectId: project.id,
              issueKey: issue.key,
            },
          },
          update: {
            issueUrl: issue.url,
            summary: issue.summary,
            status: issue.status,
            priority: issue.priority,
            assignee: issue.assignee,
            issueType: issue.issueType,
            sprint: issue.sprint,
            updatedAt: issue.updatedAt,
            syncedAt: new Date(),
          },
          create: {
            projectId: project.id,
            issueKey: issue.key,
            issueUrl: issue.url,
            summary: issue.summary,
            status: issue.status,
            priority: issue.priority,
            assignee: issue.assignee,
            issueType: issue.issueType,
            sprint: issue.sprint,
            updatedAt: issue.updatedAt,
          },
        }),
      ),
      prisma.jiraIntegration.update({
        where: { id: project.jiraIntegration.id },
        data: { syncStatus: 'OK', lastSyncedAt: new Date() },
      }),
    ]);

    res.json({ synced: issues.length });
  } catch (error) {
    await prisma.jiraIntegration.update({
      where: { id: project.jiraIntegration.id },
      data: { syncStatus: 'ERROR' },
    });
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Не удалось синхронизировать Jira',
    });
  }
});

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
  console.error(error);
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
  console.log(`API listening on ${port}`);
});
