import type { Router } from 'express';
import { prisma } from '../../db.js';
import { milestoneSchema } from './schemas.js';

export function registerProjectMilestonesRoutes(router: Router) {
  router.post('/projects/:projectId/milestones', async (req, res) => {
    const parsed = milestoneSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const project = await prisma.project.findUnique({
      where: { id: req.params.projectId },
    });

    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }

    const milestone = await prisma.milestone.create({
      data: {
        projectId: project.id,
        code: parsed.data.code || null,
        title: parsed.data.title,
        dueDate: new Date(parsed.data.dueDate),
        status: parsed.data.status,
        owner: parsed.data.owner,
        description: parsed.data.description,
      },
    });

    res.status(201).json(milestone);
  });

  router.patch('/milestones/:milestoneId', async (req, res) => {
    const parsed = milestoneSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const milestone = await prisma.milestone.findUnique({
      where: { id: req.params.milestoneId },
    });

    if (!milestone) {
      res.status(404).json({ error: 'Milestone not found' });
      return;
    }

    const updated = await prisma.milestone.update({
      where: { id: milestone.id },
      data: {
        ...parsed.data,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      },
    });

    res.json(updated);
  });
}
