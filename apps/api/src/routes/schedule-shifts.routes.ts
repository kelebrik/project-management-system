import { Router } from 'express';
import { prisma } from '../db.js';
import { readableProjectWhere } from '../server/business-units.js';
import { projectShiftLadders } from '../services/schedule-shifts.js';

/** Why checkpoints moved: the journal of milestone and goal dates, read wherever the project may be read. */
export function createScheduleShiftsRouter() {
  const router = Router();

  router.get('/projects/:projectId/schedule-shifts', async (req, res) => {
    const project = await prisma.project.findFirst({
      where: { id: String(req.params.projectId), ...(await readableProjectWhere(req)) },
      select: { id: true },
    });
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    res.json({ checkpoints: await projectShiftLadders(project.id) });
  });

  return router;
}
