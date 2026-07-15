import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { prisma } from '../db.js';

const authCookieName = process.env.AUTH_COOKIE_NAME ?? 'pms_session';
const sessionDays = Math.max(1, Number(process.env.AUTH_SESSION_DAYS ?? 7));
const authCookieSecure =
  process.env.AUTH_COOKIE_SECURE === 'true' ||
  (process.env.AUTH_COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production');

export const AUTH_COOKIE_SECURE = authCookieSecure;
export const AUTH_SESSION_DAYS = sessionDays;

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  businessUnitAdminIds: string[];
};

type SafeUserSource = Omit<CurrentUser, 'businessUnitAdminIds'> & {
  businessUnitAdminIds?: string[];
  businessUnitMemberships?: Array<{ businessUnitId: string }>;
};

export type AuthRequest = Request & {
  currentUser?: CurrentUser;
  currentSessionId?: string;
  apiToken?: {
    id: string;
    name: string;
    scopes: string[];
    rateLimitPerMinute: number;
  };
};

export type PermissionName = string;

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
  'admin.health': ['admin.manage'],
  'admin.backup': ['admin.manage'],
  'admin.config': ['admin.manage'],
  'admin.audit': ['admin.manage'],
  'admin.modules': ['admin.manage', 'admin.config'],
  'admin.integrations': ['admin.manage', 'admin.config'],
};

export function safeUser(user: SafeUserSource): CurrentUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    businessUnitAdminIds:
      user.businessUnitAdminIds ??
      user.businessUnitMemberships?.map((membership) => membership.businessUnitId) ??
      [],
  };
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(password, salt, 64).toString('base64url');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, passwordHash: string | null) {
  if (!passwordHash) return false;
  const [scheme, salt, expectedHash] = passwordHash.split(':');
  if (scheme !== 'scrypt' || !salt || !expectedHash) return false;
  const expected = Buffer.from(expectedHash, 'base64url');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function hashApiToken(token: string) {
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

export function clearSessionCookie() {
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

export async function createSession(userId: string, req: Request, res: Response) {
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

export async function attachAuth(req: Request, _res: Response, next: NextFunction) {
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
      include: {
        user: {
          include: {
            businessUnitMemberships: {
              where: { role: 'ADMIN' },
              select: { businessUnitId: true },
            },
          },
        },
      },
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

export function currentUser(req: Request) {
  return (req as AuthRequest).currentUser ?? null;
}

export function currentApiToken(req: Request) {
  return (req as AuthRequest).apiToken ?? null;
}

export function currentSessionId(req: Request) {
  return (req as AuthRequest).currentSessionId ?? null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!currentUser(req) && !currentApiToken(req)) {
    res.status(401).json({ error: 'Требуется вход в систему' });
    return;
  }
  next();
}

export function requireAuthForWrites(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  requireAuth(req, res, next);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
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

export async function userHasPermission(user: CurrentUser, permission: PermissionName) {
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

export function apiTokenHasPermission(token: AuthRequest['apiToken'], permission: PermissionName) {
  if (!token) return false;
  const namespace = permission.split('.')[0];
  const permissionCandidates = [permission, ...(legacyPermissionFallbacks[permission] ?? [])];
  return (
    token.scopes.includes('*') ||
    token.scopes.includes(`${namespace}.*`) ||
    permissionCandidates.some((candidate) => token.scopes.includes(candidate))
  );
}

export async function hasConfiguredAdmin() {
  const count = await prisma.user.count({
    where: {
      role: 'ADMIN',
      isActive: true,
      passwordHash: { not: null },
    },
  });
  return count > 0;
}

export async function wouldRemoveLastAdmin(userId: string, data: { role?: UserRole; isActive?: boolean }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || user.role !== 'ADMIN' || !user.isActive) {
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
    },
  });
  return otherAdmins === 0;
}

export function userResponse(
  user: SafeUserSource & { createdAt?: Date; updatedAt?: Date; passwordHash?: string | null },
) {
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
