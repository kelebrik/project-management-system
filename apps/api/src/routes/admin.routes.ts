import { registerDemoDataRoutes } from './admin/demo-data.routes.js';
import { Router } from 'express';
import { registerAdminConfigRoutes } from './admin/config.routes.js';
import { registerBusinessUnitAdminRoutes } from './admin/business-units.routes.js';
import { registerAdminHealthRoutes } from './admin/health.routes.js';
import { registerAdminIntegrationRoutes } from './admin/integrations.routes.js';
import { registerProjectAccessRoutes } from './admin/project-access.routes.js';
import { registerProjectBusinessUnitRoutes } from './admin/project-business-unit.routes.js';
import { registerProjectModuleRoutes } from './admin/project-modules.js';
import type { AdminRoutesContext } from './admin/types.js';
import { registerAdminUserRoutes } from './admin/users.routes.js';
import { registerAdminWbsTombstoneRoutes } from './admin/wbs-tombstones.routes.js';

export function createAdminRouter(context: AdminRoutesContext) {
  const router = Router();

  registerDemoDataRoutes(router, context);
  registerAdminHealthRoutes(router, context);
  registerProjectModuleRoutes(router, context);
  registerAdminConfigRoutes(router, context);
  registerAdminIntegrationRoutes(router, context);
  registerAdminUserRoutes(router, context);
  registerBusinessUnitAdminRoutes(router, context);
  registerProjectAccessRoutes(router, context);
  registerProjectBusinessUnitRoutes(router, context);
  registerAdminWbsTombstoneRoutes(router, context);

  return router;
}
