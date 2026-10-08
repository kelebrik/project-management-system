import type { Router } from 'express';
import { prisma } from '../../db.js';
import { auditEventsOrderBy, auditEventsQuerySchema, auditEventsWhere } from './audit-events.js';
import { pruneExpiredWbsTombstones } from '../../services/wbs-tombstones.js';
import { adminBackupStatus, adminSystemHealth } from './system.js';
import type { AdminRoutesContext } from './types.js';

export function registerAdminHealthRoutes(router: Router, context: AdminRoutesContext) {
  const { requireAdmin, startedAt } = context;

  router.get('/audit-events', requireAdmin, async (req, res) => {
    const parsed = auditEventsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    await pruneExpiredWbsTombstones();
    const query = parsed.data;
    const cursor = query.before
      ? await prisma.auditEvent.findUnique({
          where: { id: query.before },
          select: { id: true, createdAt: true },
        })
      : null;
    if (query.before && !cursor) {
      res.status(400).json({ error: 'Событие, от которого продолжается журнал, не найдено' });
      return;
    }
    const events = await prisma.auditEvent.findMany({
      where: auditEventsWhere(query, cursor),
      orderBy: auditEventsOrderBy,
      take: query.limit,
      include: {
        changes: { orderBy: { createdAt: 'asc' } },
        wbsTombstone: true,
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
