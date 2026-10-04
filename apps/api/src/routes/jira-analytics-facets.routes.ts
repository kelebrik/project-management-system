import type { Router } from 'express';
import { prisma } from '../db.js';
import { currentUser } from '../server/auth.js';
import { userCanReadProject } from '../server/business-units.js';
import { JiraAggregatePopulationLimitError } from '../services/jira-aggregates-core.js';
import { loadJiraSliceFacets } from '../services/jira-analytics-facets.js';

/** The values the slice bar of «Jira work» offers, from the project's own snapshots; Jira is not asked. */
export function registerJiraAnalyticsFacetRoutes(router: Router) {
  router.get('/projects/:projectId/jira/analytics-facets', async (req, res) => {
    const projectId = String(req.params.projectId);
    if (!currentUser(req) || !(await userCanReadProject(req, projectId))) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    try {
      res.json(await loadJiraSliceFacets(prisma, projectId));
    } catch (error) {
      if (!(error instanceof JiraAggregatePopulationLimitError)) throw error;
      res.status(409).json({ error: error.message });
    }
  });
}
