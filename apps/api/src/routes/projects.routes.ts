import { registerArtifactFileRoutes } from './projects/artifact-files.routes.js';
import { registerArtifactTableRoutes } from './projects/artifact-table.routes.js';
import { Router } from 'express';
import { registerProjectAutomationRoutes } from './projects/automation.routes.js';
import { registerProjectArtifactsRoutes } from './projects/artifacts.routes.js';
import { registerProjectBusinessRequirementsRoutes } from './projects/business-requirements.routes.js';
import { registerProjectCalendarRoutes } from './projects/calendar.routes.js';
import { registerProjectCrudRoutes } from './projects/crud.routes.js';
import { registerProjectMilestonesRoutes } from './projects/milestones.routes.js';
import { registerProjectOverviewRoutes } from './projects/overview.routes.js';
import type { ProjectsRoutesContext } from './projects/types.js';

export function createProjectsRouter(context: ProjectsRoutesContext) {
  const router = Router();

  registerProjectCrudRoutes(router, context);
  registerProjectAutomationRoutes(router);
  registerProjectOverviewRoutes(router, context);
  registerProjectCalendarRoutes(router, context);
  registerProjectArtifactsRoutes(router, context);
  registerArtifactTableRoutes(router, context);
  registerArtifactFileRoutes(router, context);
  registerProjectBusinessRequirementsRoutes(router, context);
  registerProjectMilestonesRoutes(router);

  return router;
}
