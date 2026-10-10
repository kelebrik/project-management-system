import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { currentUser } from '../server/auth.js';
import { userCanReadProject } from '../server/business-units.js';
import { isPastHistoryDay, readProjectHistoryPayload } from '../services/project-history.js';
import { readProjectHistory, readProjectHistoryDays } from '../services/project-history-read.js';

const dateSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/** How a project stood on a past day and what changed since, for readers of the project. */
export function createProjectHistoryRouter() {
  const router = Router();

  router.get('/projects/:projectId/history', async (req, res) => {
    const projectId = String(req.params.projectId);
    if (!currentUser(req) || !(await userCanReadProject(req, projectId))) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const parsed = dateSchema.safeParse(req.query);
    if (!parsed.success || !isPastHistoryDay(parsed.data.date)) {
      res.status(400).json({ error: 'Укажите прошедшую дату в формате ГГГГ-ММ-ДД' });
      return;
    }
    const current = await readProjectHistoryPayload(prisma, projectId);
    if (!current) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    res.json(await readProjectHistory(projectId, parsed.data.date, current));
  });

  router.get('/projects/:projectId/history/days', async (req, res) => {
    const projectId = String(req.params.projectId);
    if (!currentUser(req) || !(await userCanReadProject(req, projectId))) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    res.json({ days: await readProjectHistoryDays(projectId) });
  });

  return router;
}
