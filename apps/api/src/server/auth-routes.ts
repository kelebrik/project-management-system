import type { Express } from 'express';
import { prisma } from '../db.js';
import { recordAuditEvent } from '../services/audit.js';
import {
  clearSessionCookie,
  currentSessionId,
  currentUser,
  requireAuth,
} from './auth.js';

export function registerAuthRoutes(app: Express) {
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
