import type { Router } from 'express';
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
      const result = await restoreWbsTombstone({
        tombstoneId: String(req.params.tombstoneId),
        actor: currentUser(req),
        req,
      });
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
