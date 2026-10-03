import { Router } from 'express';
import { z } from 'zod';
import { readableProjectWhere } from '../server/business-units.js';
import { loadPortfolioReport } from '../services/portfolio-reports.js';

const querySchema = z.object({
  horizon: z.coerce.number().int().refine((value) => [14, 28, 56].includes(value)).default(28),
  period: z.coerce.number().int().refine((value) => [7, 30, 90].includes(value)).default(30),
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
  return router;
}
