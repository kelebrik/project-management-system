import { Router } from 'express';
import { registerProjectArtifactsRoutes } from './projects/artifacts.routes.js';
import { registerProjectCalendarRoutes } from './projects/calendar.routes.js';
import { registerProjectCrudRoutes } from './projects/crud.routes.js';
import { registerProjectMilestonesRoutes } from './projects/milestones.routes.js';
import { registerProjectOverviewRoutes } from './projects/overview.routes.js';
import type { ProjectsRoutesContext } from './projects/types.js';

export function createProjectsRouter(context: ProjectsRoutesContext) {
  const router = Router();

  registerProjectCrudRoutes(router, context);
  registerProjectOverviewRoutes(router, context);
  registerProjectCalendarRoutes(router, context);
  registerProjectArtifactsRoutes(router, context);
  registerProjectMilestonesRoutes(router);

  return router;
}
