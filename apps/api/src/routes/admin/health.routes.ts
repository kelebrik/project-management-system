import type { Router } from 'express';
import { prisma } from '../../db.js';
import { adminBackupStatus, adminSystemHealth } from './system.js';
import type { AdminRoutesContext } from './types.js';

export function registerAdminHealthRoutes(router: Router, context: AdminRoutesContext) {
  const { requireAdmin, startedAt } = context;

  router.get('/audit-events', requireAdmin, async (req, res) => {
    const take = Math.min(200, Math.max(1, Number(req.query.limit ?? 100)));
    const events = await prisma.auditEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        changes: { orderBy: { createdAt: 'asc' } },
      },
    });
    res.json(events);
  });

  router.get('/admin/system-health', requireAdmin, async (_req, res) => {
    res.json(await adminSystemHealth(startedAt));
  });

  router.get('/admin/backup-status', requireAdmin, async (_req, res) => {
    res.json(await adminBackupStatus());
  });
}
