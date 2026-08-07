import type { Express } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { loginSchema } from '@pms/shared';
import { prisma } from '../db.js';
import { recordAuditEvent } from '../services/audit.js';
import { logEvent } from './logger.js';
import {
  clearSessionCookie,
  createSession,
  currentSessionId,
  currentUser,
  hashPassword,
  requireAuth,
  safeUser,
  verifyPassword,
} from './auth.js';

const loginWindowMs = 60_000;
const loginIpLimit = 10;
const loginAccountLimit = 30;
const loginAttempts = new Map<string, { count: number; windowStartedAt: number }>();
const dummyPasswordHash =
  'scrypt:pms-login-dummy-v1:eN16oT7WN10c1Y7cQG3XNAgIU0xdvhtnZLpfpu5Xy7XBqzDlEGXIV4fKnUQBLoQrEtYyCYwrkX0FP-kSAzfBOA';

function consumeLoginAttempt(key: string, limit: number, now: number) {
  const attempt = loginAttempts.get(key);
  if (!attempt || now - attempt.windowStartedAt >= loginWindowMs) {
    loginAttempts.set(key, { count: 1, windowStartedAt: now });
    return 0;
  }
  attempt.count += 1;
  if (attempt.count <= limit) return 0;
  return Math.max(1, Math.ceil((loginWindowMs - (now - attempt.windowStartedAt)) / 1000));
}

function loginRetryAfterSeconds(ipAddress: string, email: string) {
  const now = Date.now();
  if (loginAttempts.size > 10_000) {
    for (const [key, attempt] of loginAttempts) {
      if (now - attempt.windowStartedAt >= loginWindowMs) loginAttempts.delete(key);
    }
    while (loginAttempts.size > 10_000) {
      const oldestKey = loginAttempts.keys().next().value;
      if (typeof oldestKey !== 'string') break;
      loginAttempts.delete(oldestKey);
    }
  }
  return Math.max(
    consumeLoginAttempt(`ip:${ipAddress}`, loginIpLimit, now),
    consumeLoginAttempt(`account:${email}`, loginAccountLimit, now),
  );
}

function matchesBootstrapPassword(email: string, password: string) {
  const configuredEmail = process.env.LOCAL_AUTH_EMAIL?.trim().toLowerCase();
  const configuredPassword = process.env.LOCAL_AUTH_BOOTSTRAP_PASSWORD;
  if (!configuredEmail || !configuredPassword || email !== configuredEmail) return false;
  const actual = createHash('sha256').update(password).digest();
  const expected = createHash('sha256').update(configuredPassword).digest();
  return timingSafeEqual(actual, expected);
}

export function registerAuthRoutes(app: Express) {
  app.post('/api/auth/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const ipAddress = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const retryAfterSeconds = loginRetryAfterSeconds(ipAddress, parsed.data.email);
    if (retryAfterSeconds > 0) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ error: 'Слишком много попыток входа. Повторите позже.' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        email: { equals: parsed.data.email, mode: 'insensitive' },
      },
      include: {
        businessUnitMemberships: {
          where: { role: 'ADMIN' },
          select: { businessUnitId: true },
        },
      },
    });

    const databasePasswordValid = await verifyPassword(
      parsed.data.password,
      user?.passwordHash ?? dummyPasswordHash,
    );
    const bootstrapPasswordValid =
      Boolean(user && !user.passwordHash) &&
      matchesBootstrapPassword(parsed.data.email, parsed.data.password);

    if (!user || !user.isActive || (!databasePasswordValid && !bootstrapPasswordValid)) {
      logEvent('warn', 'auth.login_failed', {
        email: parsed.data.email,
        ipAddress,
        knownUser: Boolean(user),
      });
      if (user) {
        await recordAuditEvent({
          req,
          action: 'auth.login_failed',
          objectType: 'User',
          objectId: user.id,
          metadata: { email: parsed.data.email },
        }).catch(() => undefined);
      }
      res.status(401).json({ error: 'Неверный email или пароль' });
      return;
    }

    const lastLoginAt = new Date();
    const passwordHash = bootstrapPasswordValid
      ? await hashPassword(parsed.data.password)
      : undefined;
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt, passwordHash },
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
    res.json({ user: safeUser({ ...user, lastLoginAt }) });
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
}
