import type { Router } from 'express';
import { currentUser } from '../../server/auth.js';
import { shiftActor, trackScheduleShifts } from '../../services/schedule-shifts.js';
import { recalculateProjectWbsSchedule } from '../../services/wbs-schedule.js';
import { rejectStructureWrite, respondToStructureRejection, runStructureWrite } from '../../services/wbs-structure-write.js';
import { runWithWbsWriteQueue } from '../wbs/write-queue.js';
import { calendarOverrideSchema, deleteCalendarOverrideSchema } from './schemas.js';
import type { ProjectsRoutesContext } from './types.js';

export function registerProjectCalendarRoutes(
  router: Router,
  _context: ProjectsRoutesContext,
) {
  router.put('/projects/:projectId/calendar-overrides', async (req, res) => {
    const parsed = calendarOverrideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const projectId = req.params.projectId;
    const date = new Date(parsed.data.date);
    date.setUTCHours(0, 0, 0, 0);

    // A changed working day moves work, and so checkpoints: queued and journaled like a structure edit.
    let override;
    try {
      override = await runWithWbsWriteQueue(projectId, () =>
        trackScheduleShifts(
          projectId,
          {
            trigger: 'CALENDAR',
            sourceNote: `${date.toISOString().slice(0, 10)} ${parsed.data.isWorkingDay ? 'working' : 'day off'}`,
            actor: shiftActor(currentUser(req)),
            answer: res,
          },
          () => runStructureWrite(projectId, async (db) => {
            const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
            if (!project) rejectStructureWrite(404, 'Проект не найден');
            const saved = await db.projectCalendarOverride.upsert({
              where: {
                projectId_calendarCode_date: {
                  projectId: project.id,
                  calendarCode: parsed.data.calendarCode,
                  date,
                },
              },
              create: {
                projectId: project.id,
                calendarCode: parsed.data.calendarCode,
                date,
                isWorkingDay: parsed.data.isWorkingDay,
                description: parsed.data.description || null,
              },
              update: {
                isWorkingDay: parsed.data.isWorkingDay,
                description: parsed.data.description || null,
              },
            });
            await recalculateProjectWbsSchedule(project.id, {}, db);
            return saved;
          }),
        ),
      );
    } catch (error) {
      if (respondToStructureRejection(res, error)) return;
      throw error;
    }

    res.json(override);
  });

  router.delete('/projects/:projectId/calendar-overrides', async (req, res) => {
    const parsed = deleteCalendarOverrideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const date = new Date(parsed.data.date);
    date.setUTCHours(0, 0, 0, 0);
    const projectId = req.params.projectId;

    try {
      await runWithWbsWriteQueue(projectId, () =>
        trackScheduleShifts(
          projectId,
          { trigger: 'CALENDAR', sourceNote: `${date.toISOString().slice(0, 10)} reset`, actor: shiftActor(currentUser(req)), answer: res },
          () => runStructureWrite(projectId, async (db) => {
            const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, status: true } });
            if (!project) rejectStructureWrite(404, 'Проект не найден');
            if (project.status === 'CLOSED') rejectStructureWrite(423, 'Проект закрыт и доступен только для чтения');
            await db.projectCalendarOverride.deleteMany({
              where: {
                projectId: project.id,
                calendarCode: parsed.data.calendarCode,
                date,
              },
            });
            await recalculateProjectWbsSchedule(project.id, {}, db);
          }),
        ),
      );
    } catch (error) {
      if (respondToStructureRejection(res, error)) return;
      throw error;
    }

    res.status(204).send();
  });
}
