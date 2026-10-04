import { Router } from 'express';
import { z } from 'zod';
import { readableProjectWhere } from '../server/business-units.js';
import { decodeJiraSlice } from '@pms/shared';
import { JiraPortfolioLimitError, loadJiraPortfolio } from '../services/jira-portfolio.js';
import { loadPortfolioReport } from '../services/portfolio-reports.js';

const querySchema = z.object({
  horizon: z.coerce.number().int().refine((value) => [14, 28, 56].includes(value)).default(28),
  period: z.coerce.number().int().refine((value) => [7, 30, 90].includes(value)).default(30),
});

const jiraQuerySchema = z.object({
  period: z.coerce.number().int().refine((value) => [7, 30, 90].includes(value)).default(30),
  slice: z.string().max(20_000).optional(),
});

/** Reports across projects; each person sees only the projects they may read. */
export function createReportsRouter() {
  const router = Router();
  router.get('/reports/portfolio', async (req, res) => {
    const query = querySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: 'Горизонт: 14, 28 или 56 дней; период: 7, 30 или 90 дней' });
      return;
    }
    res.json(await loadPortfolioReport(await readableProjectWhere(req), { horizonDays: query.data.horizon, periodDays: query.data.period }));
  });
  /** Jira work per project across the portfolio, from the projects' own snapshots; Jira is not asked. */
  router.get('/reports/jira-portfolio', async (req, res) => {
    const query = jiraQuerySchema.safeParse(req.query);
    const slice = query.success && query.data.slice ? decodeJiraSlice(query.data.slice) : null;
    if (!query.success || (query.data.slice && !slice)) {
      res.status(400).json({ error: 'Период: 7, 30 или 90 дней; срез — в формате ссылки' });
      return;
    }
    try {
      res.json(await loadJiraPortfolio(await readableProjectWhere(req), { periodDays: query.data.period, slice }));
    } catch (error) {
      if (!(error instanceof JiraPortfolioLimitError)) throw error;
      res.status(409).json({ error: error.message });
    }
  });
  return router;
}
