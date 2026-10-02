import { Router } from 'express';
import { registerWbsAppendRoutes } from './wbs/append.routes.js';
import { registerWbsDateDriverRoutes } from './wbs/date-drivers.routes.js';
import { registerWbsDependencyRoutes } from './wbs/dependencies.routes.js';
import { registerWbsItemOrderRoutes } from './wbs/item-order.routes.js';
import { registerWbsItemRoutes } from './wbs/items.routes.js';
import { registerWbsSnapshotRoutes } from './wbs/snapshot.routes.js';
import { wbsWriteQueueMiddleware } from './wbs/write-queue.js';

type WbsRoutesContext = {
  serverErrorMessage: (error: unknown, fallback: string) => string;
};

export function createWbsRouter(context: WbsRoutesContext) {
  const router = Router();

  router.use(wbsWriteQueueMiddleware);
  registerWbsAppendRoutes(router);
  registerWbsItemOrderRoutes(router);
  registerWbsSnapshotRoutes(router);
  registerWbsItemRoutes(router);
  registerWbsDependencyRoutes(router, context);
  registerWbsDateDriverRoutes(router);

  return router;
}
