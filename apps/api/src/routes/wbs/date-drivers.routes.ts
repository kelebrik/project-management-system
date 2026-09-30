import type { Router } from 'express';
import { prisma } from '../../db.js';
import { readableProjectWhere } from '../../server/business-units.js';
import { explainWbsItemDates } from '../../services/wbs-schedule/drivers.js';

/** "What holds this date": read-only, wherever the project may be read. */
export function registerWbsDateDriverRoutes(router: Router) {
  router.get('/wbs-items/:itemId/date-drivers', async (req, res) => {
    const target = await prisma.wbsItem.findUnique({ where: { id: String(req.params.itemId) }, select: { projectId: true } });
    const readable = target
      ? await prisma.project.findFirst({ where: { id: target.projectId, ...(await readableProjectWhere(req)) }, select: { id: true } })
      : null;
    if (!target || !readable) {
      res.status(404).json({ error: 'Строка Структуры не найдена' });
      return;
    }
    const [items, dependencies, overrides] = await Promise.all([
      prisma.wbsItem.findMany({
        where: { projectId: target.projectId },
        select: {
          id: true, parentId: true, code: true, title: true, type: true, status: true, startDate: true, dueDate: true,
          forecastStartDate: true, forecastDueDate: true, predecessor1: true, predecessor2: true, predecessor3: true,
          predecessor4: true, predecessor5: true, predecessor6: true, leadLagDays: true, workDays: true, calendarDays: true,
          calendarCode: true, wbsLevel: true, sortOrder: true,
        },
      }),
      prisma.wbsDependency.findMany({ where: { projectId: target.projectId }, select: { predecessorId: true, successorId: true, type: true, lagDays: true } }),
      prisma.projectCalendarOverride.findMany({ where: { projectId: target.projectId }, select: { calendarCode: true, date: true, isWorkingDay: true, description: true } }),
    ]);
    res.json(explainWbsItemDates(items, dependencies, overrides, String(req.params.itemId)));
  });
}
