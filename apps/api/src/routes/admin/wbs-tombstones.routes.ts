import type { Router } from 'express';
import { prisma } from '../../db.js';
import { shiftActor, trackScheduleShifts } from '../../services/schedule-shifts.js';
import { runWithWbsWriteQueue } from '../wbs/write-queue.js';
import {
  restoreWbsTombstone,
  WbsTombstoneRestoreError,
} from '../../services/wbs-tombstones.js';
import type { AdminRoutesContext } from './types.js';

export function registerAdminWbsTombstoneRoutes(
  router: Router,
  context: AdminRoutesContext,
) {
  const { currentUser, requireAdmin } = context;

  router.post('/admin/wbs-tombstones/:tombstoneId/restore', requireAdmin, async (req, res) => {
    try {
      const tombstoneId = String(req.params.tombstoneId);
      const restore = () => restoreWbsTombstone({ tombstoneId, actor: currentUser(req), req });
      const tombstone = await prisma.wbsTombstone.findUnique({ where: { id: tombstoneId }, select: { projectId: true } });
      // Restored rows come back under new ids: their old history stays as it was, and only what the restore moves is journaled.
      const result = tombstone
        ? await runWithWbsWriteQueue(tombstone.projectId, () =>
            trackScheduleShifts(tombstone.projectId, { trigger: 'RESTORE_DELETED', actor: shiftActor(currentUser(req)) }, restore),
          )
        : await restore();
      res.json(result);
    } catch (error) {
      if (error instanceof WbsTombstoneRestoreError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      console.error(error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Не удалось восстановить элементы Структуры',
      });
    }
  });
}
