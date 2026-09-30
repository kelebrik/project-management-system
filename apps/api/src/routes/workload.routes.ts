import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { loadWorkload } from '../services/workload.js';

type WorkloadContext = {
  requireAuth: RequestHandler;
};

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const time = Date.parse(`${value}T00:00:00.000Z`);
    return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
  });

/** The client keeps at most five years loaded; six leave room for rounding to whole weeks. */
const MAX_RANGE_MONTHS = 72;

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

/** The last allowed day: the same date six years on, or the month's last day (29 February). */
function rangeLimit(from: string) {
  const start = toDate(from);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + MAX_RANGE_MONTHS;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay)));
}

function period(req: Request) {
  const from = isoDate.safeParse(req.query.from);
  const to = isoDate.safeParse(req.query.to);
  if (!from.success || !to.success || from.data > to.data || toDate(to.data) > rangeLimit(from.data)) return null;
  return { from: from.data, to: to.data };
}

export function createWorkloadRouter({ requireAuth }: WorkloadContext) {
  const router = Router();

  /** The people directory kept on the leave schedule, for pickers in other modules. */
  router.get('/employees', requireAuth, async (_req, res) => {
    const employees = await prisma.leaveEmployee.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }],
      select: { id: true, name: true, department: true },
    });
    res.json(employees);
  });

  router.get('/workload', requireAuth, async (req, res) => {
    const range = period(req);
    if (!range) {
      res.status(400).json({ error: 'Укажите период from и to в формате ГГГГ-ММ-ДД, не длиннее шести лет' });
      return;
    }
    res.json(await loadWorkload(req, range));
  });

  return router;
}
