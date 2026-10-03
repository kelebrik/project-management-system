import type { Router } from 'express';
import { registerProblemReportRoutes } from './problem-reports.js';

/**
 * Routes of the cloud build only. The corporate build does not ship this
 * folder: the application loads it when it is there and runs without it.
 */
export function registerCloudRoutes(router: Router) {
  registerProblemReportRoutes(router);
}
