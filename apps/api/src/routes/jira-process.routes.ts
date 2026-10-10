import { decodeJiraSlice } from '@pms/shared';
import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { currentUser } from '../server/auth.js';
import { userCanReadProject } from '../server/business-units.js';
import { JiraAggregateEventLimitError, JiraAggregatePopulationLimitError } from '../services/jira-aggregates-core.js';
import { loadJiraProcessMining } from '../services/jira-process-mining.js';

const processQuerySchema = z.object({
  periodDays: z.coerce.number().refine((value) => [30, 90, 180, 365].includes(value)).default(90),
  slice: z.string().max(20_000).optional(),
});

/** Where the project's Jira work goes and waits, for readers of the project; Jira is not asked. */
export function registerJiraProcessRoutes(router: Router) {
  router.get('/projects/:projectId/jira/process', async (req, res) => {
    const projectId = String(req.params.projectId);
    if (!currentUser(req) || !(await userCanReadProject(req, projectId))) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const parsed = processQuerySchema.safeParse(req.query);
    const slice = parsed.success && parsed.data.slice ? decodeJiraSlice(parsed.data.slice) : null;
    if (!parsed.success || (parsed.data.slice && !slice)) {
      res.status(400).json({ error: 'Укажите период 30, 90, 180 или 365 дней' });
      return;
    }
    try {
      res.json(await loadJiraProcessMining(prisma, projectId, { periodDays: parsed.data.periodDays, slice }));
    } catch (error) {
      if (!(error instanceof JiraAggregatePopulationLimitError) && !(error instanceof JiraAggregateEventLimitError)) throw error;
      res.status(409).json({ error: error.message });
    }
  });
}
