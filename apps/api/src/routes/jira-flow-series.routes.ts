import { decodeJiraSlice, jiraAnalyticsTimeZones } from '@pms/shared';
import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { currentUser } from '../server/auth.js';
import { userCanReadProject } from '../server/business-units.js';
import { JiraAggregatePopulationLimitError } from '../services/jira-aggregates-core.js';
import { JIRA_FLOW_STEPS, loadJiraFlowSeries } from '../services/jira-flow-series.js';

const flowQuerySchema = z.object({
  periodDays: z.coerce.number().refine((value) => [30, 90, 180, 365].includes(value)).default(90),
  step: z.enum(JIRA_FLOW_STEPS).default('week'),
  metric: z.enum(['count', 'storyPoints']).default('count'),
  timeZone: z.enum(jiraAnalyticsTimeZones).default('Europe/Moscow'),
  slice: z.string().max(20_000).optional(),
});

/** Created, resolved, open work and its status categories over time, for readers of the project; Jira is not asked. */
export function registerJiraFlowSeriesRoutes(router: Router) {
  router.get('/projects/:projectId/jira/flow-series', async (req, res) => {
    const projectId = String(req.params.projectId);
    if (!currentUser(req) || !(await userCanReadProject(req, projectId))) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const parsed = flowQuerySchema.safeParse(req.query);
    const slice = parsed.success && parsed.data.slice ? decodeJiraSlice(parsed.data.slice) : null;
    if (!parsed.success || (parsed.data.slice && !slice)) {
      res.status(400).json({ error: 'Укажите период 30, 90, 180 или 365 дней, шаг day, week или month и метрику count или storyPoints' });
      return;
    }
    try {
      res.json(await loadJiraFlowSeries(prisma, projectId, { ...parsed.data, slice }));
    } catch (error) {
      if (!(error instanceof JiraAggregatePopulationLimitError)) throw error;
      res.status(409).json({ error: error.message });
    }
  });
}
