import type { Express } from 'express';
import { bootstrapAdminSchema, loginSchema } from '@pms/shared';
import { prisma } from '../db.js';
import { recordAuditEvent } from '../services/audit.js';
import {
  clearSessionCookie,
  createSession,
  currentSessionId,
  currentUser,
  hasConfiguredAdmin,
  hashPassword,
  requireAuth,
  safeUser,
  verifyPassword,
} from './auth.js';
import { isKeycloakEnabled } from './keycloak-auth.js';
import { ensureDefaultBusinessUnitMembership } from './business-units.js';

export function registerAuthRoutes(app: Express) {
  app.get('/api/auth/setup-status', async (_req, res) => {
    res.json({ needsSetup: !isKeycloakEnabled() && !(await hasConfiguredAdmin()) });
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

    await ensureDefaultBusinessUnitMembership(user.id, user.role);

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
}
