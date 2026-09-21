import type { Express, Request, Response } from 'express';
import { ipKeyGenerator, rateLimit, type AugmentedRequest } from 'express-rate-limit';
import { loginSchema } from '@pms/shared';
import { prisma } from '../db.js';
import { recordAuditEvent } from '../services/audit.js';
import { logEvent } from './logger.js';
import { deploymentProfile, isCloudProfile } from './deployment-profile.js';
import {
  clearSessionCookie,
  createSession,
  currentSessionId,
  currentUser,
  requireAuth,
  safeUser,
  verifyPassword,
} from './auth.js';

const loginWindowMs = 60_000;
const loginIpLimit = 10;
const loginAccountLimit = 30;
const dummyPasswordHash =
  'scrypt:pms-login-dummy-v1:eN16oT7WN10c1Y7cQG3XNAgIU0xdvhtnZLpfpu5Xy7XBqzDlEGXIV4fKnUQBLoQrEtYyCYwrkX0FP-kSAzfBOA';

function clientAddress(req: Request) {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/**
 * A request that cannot be a sign-in attempt must not consume the login budget:
 * the general `/api` limiter already covers malformed traffic, and letting it
 * count here would let noise lock a legitimate account out.
 */
function isMalformedLogin(req: Request) {
  return !loginSchema.safeParse(req.body).success;
}

/**
 * Every spelling of one address shares a budget, so casing or padding cannot buy
 * extra attempts. A body without a usable address falls back to the caller so the
 * unusable ones do not pile into a single shared bucket.
 */
export function loginAccountKey(body: unknown, fallbackAddress: string) {
  const parsed = loginSchema.safeParse(body);
  return parsed.success
    ? `account:${parsed.data.email.trim().toLowerCase()}`
    : `anonymous:${ipKeyGenerator(fallbackAddress)}`;
}

function rejectRateLimitedLogin(req: Request, res: Response) {
  // Since v8 the package no longer augments the Express request type, so the
  // limiter state is read through its own exported shape.
  const resetTime = (req as AugmentedRequest).rateLimit?.resetTime;
  const remainingMs = resetTime ? resetTime.getTime() - Date.now() : loginWindowMs;
  res.setHeader('Retry-After', String(Math.max(1, Math.ceil(remainingMs / 1000))));
  res.status(429).json({ error: 'Слишком много попыток входа. Повторите позже.' });
}

const loginRateLimitDefaults = {
  windowMs: loginWindowMs,
  skip: isMalformedLogin,
  handler: rejectRateLimitedLogin,
  // The response shape is part of the existing API contract, so the advisory
  // RateLimit headers stay off and Retry-After is set by the handler.
  standardHeaders: false,
  legacyHeaders: false,
} as const;

export function registerAuthRoutes(app: Express) {
  // Local password sign-in exists only on the cloud deployment. The corporate
  // installation authenticates through Keycloak, so the route is never registered
  // there: the request falls through to the authenticated `/api` surface and no
  // password is ever verified.
  if (!isCloudProfile()) {
    logEvent('info', 'auth.local_login_disabled', { profile: deploymentProfile() });
    registerSessionRoutes(app);
    return;
  }

  // Built per registration so that separate apps — in particular separate test
  // apps — never share one another's attempt counters.
  const loginIpRateLimit = rateLimit({ ...loginRateLimitDefaults, limit: loginIpLimit });
  const loginAccountRateLimit = rateLimit({
    ...loginRateLimitDefaults,
    limit: loginAccountLimit,
    keyGenerator: (req) => loginAccountKey(req.body, clientAddress(req)),
  });

  app.post('/api/auth/login', loginIpRateLimit, loginAccountRateLimit, async (req, res) => {
    // Defence in depth: a refactor that registers this route unconditionally
    // must still not expose password sign-in outside the cloud profile.
    if (!isCloudProfile()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const ipAddress = clientAddress(req);
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

    // The dummy hash keeps the cost of an unknown account indistinguishable from
    // a known one, so a wrong email cannot be told apart by response time.
    const databasePasswordValid = await verifyPassword(
      parsed.data.password,
      user?.passwordHash ?? dummyPasswordHash,
    );

    if (!user || !user.isActive || !databasePasswordValid) {
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
    res.json({ user: safeUser({ ...user, lastLoginAt }) });
  });

  registerSessionRoutes(app);
}

/** Session inspection and sign-out work the same way on every deployment profile. */
function registerSessionRoutes(app: Express) {
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
