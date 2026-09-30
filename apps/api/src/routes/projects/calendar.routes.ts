import type { Router } from 'express';
import { prisma } from '../../db.js';
import { currentUser } from '../../server/auth.js';
import { shiftActor, trackScheduleShifts } from '../../services/schedule-shifts.js';
import { recalculateProjectWbsSchedule } from '../../services/wbs-schedule.js';
import { runWithWbsWriteQueue } from '../wbs/write-queue.js';
import { calendarOverrideSchema, deleteCalendarOverrideSchema } from './schemas.js';
import type { ProjectsRoutesContext } from './types.js';

export function registerProjectCalendarRoutes(
  router: Router,
  { ensureProjectWritable }: ProjectsRoutesContext,
) {
  router.put('/projects/:projectId/calendar-overrides', async (req, res) => {
    const parsed = calendarOverrideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const project = await prisma.project.findUnique({
      where: { id: req.params.projectId },
      select: { id: true },
    });
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }

    const date = new Date(parsed.data.date);
    date.setUTCHours(0, 0, 0, 0);

    // A changed working day moves work, and so checkpoints: queued and journaled like a structure edit.
    const override = await runWithWbsWriteQueue(project.id, () =>
      trackScheduleShifts(
        project.id,
        {
          trigger: 'CALENDAR',
          sourceNote: `${date.toISOString().slice(0, 10)} ${parsed.data.isWorkingDay ? 'working' : 'day off'}`,
          actor: shiftActor(currentUser(req)),
        },
        async () => {
          const saved = await prisma.projectCalendarOverride.upsert({
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
          await recalculateProjectWbsSchedule(project.id);
          return saved;
        },
      ),
    );

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
    const project = await ensureProjectWritable(req.params.projectId, res);
    if (!project) {
      return;
    }

    await runWithWbsWriteQueue(project.id, () =>
      trackScheduleShifts(
        project.id,
        { trigger: 'CALENDAR', sourceNote: `${date.toISOString().slice(0, 10)} reset`, actor: shiftActor(currentUser(req)) },
        async () => {
          await prisma.projectCalendarOverride.deleteMany({
            where: {
              projectId: project.id,
              calendarCode: parsed.data.calendarCode,
              date,
            },
          });
          await recalculateProjectWbsSchedule(project.id);
        },
      ),
    );

    res.status(204).send();
  });
}
