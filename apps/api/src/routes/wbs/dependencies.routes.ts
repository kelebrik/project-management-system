import type { Router } from 'express';
import { prisma } from '../../db.js';
import { getProjectWbsSnapshot, syncWbsPredecessorFields } from '../../services/wbs.js';
import { recordWbsCommand } from '../../services/wbs-audit.js';
import { recalculateProjectWbsSchedule } from '../../services/wbs-schedule.js';
import { emitWebhookEvent } from '../../services/webhooks.js';
import { dependencyLimitExceeded, wouldCreateDependencyCycle } from './helpers.js';
import { wbsDependencySchema } from './schemas.js';

type WbsDependencyRoutesContext = {
  serverErrorMessage: (error: unknown, fallback: string) => string;
};

export function registerWbsDependencyRoutes(
  router: Router,
  { serverErrorMessage }: WbsDependencyRoutesContext,
) {
  router.post('/projects/:projectId/wbs-dependencies', async (req, res) => {
    const parsed = wbsDependencySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      if (parsed.data.predecessorId === parsed.data.successorId) {
        res.status(400).json({ error: 'Связь не может ссылаться на тот же элемент' });
        return;
      }

      const items = await prisma.wbsItem.findMany({
        where: {
          projectId: req.params.projectId,
          id: { in: [parsed.data.predecessorId, parsed.data.successorId] },
        },
      });
      if (items.length !== 2) {
        res.status(400).json({ error: 'Оба элемента Структуры должны относиться к проекту' });
        return;
      }

      if (await dependencyLimitExceeded(req.params.projectId, parsed.data.successorId, parsed.data.predecessorId)) {
        res.status(400).json({ error: 'У элемента Структуры может быть не больше шести предшественников' });
        return;
      }

      if (await wouldCreateDependencyCycle(req.params.projectId, parsed.data.predecessorId, parsed.data.successorId)) {
        res.status(400).json({ error: 'Связь создаст цикл' });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.wbsDependency.deleteMany({
          where: {
            projectId: req.params.projectId,
            predecessorId: parsed.data.predecessorId,
            successorId: parsed.data.successorId,
            type: { not: parsed.data.type },
          },
        });
        await tx.wbsDependency.upsert({
          where: {
            projectId_predecessorId_successorId_type: {
              projectId: req.params.projectId,
              predecessorId: parsed.data.predecessorId,
              successorId: parsed.data.successorId,
              type: parsed.data.type,
            },
          },
          create: {
            projectId: req.params.projectId,
            ...parsed.data,
          },
          update: {
            lagDays: parsed.data.lagDays,
          },
        });
      });
      await syncWbsPredecessorFields(req.params.projectId);
      await recalculateProjectWbsSchedule(req.params.projectId);
      const snapshot = await getProjectWbsSnapshot(req.params.projectId);
      await recordWbsCommand({
        projectId: req.params.projectId,
        type: 'UPDATE',
        payload: { action: 'upsert-dependency', dependency: parsed.data },
        afterSnapshot: snapshot,
      });
      await emitWebhookEvent({
        eventType: 'wbs.dependency.updated',
        projectId: req.params.projectId,
        payload: { action: 'upsert-dependency', dependency: parsed.data, snapshot },
      }).catch(() => undefined);

      res.status(201).json(snapshot);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: serverErrorMessage(error, 'Не удалось создать связь Структуры'),
      });
    }
  });

  router.patch('/wbs-dependencies/:dependencyId', async (req, res) => {
    const parsed = wbsDependencySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const dependency = await prisma.wbsDependency.findUnique({
        where: { id: req.params.dependencyId },
      });
      if (!dependency) {
        res.status(404).json({ error: 'Связь Структуры не найдена' });
        return;
      }
      if (parsed.data.predecessorId === parsed.data.successorId) {
        res.status(400).json({ error: 'Связь не может ссылаться на тот же элемент' });
        return;
      }

      const items = await prisma.wbsItem.findMany({
        where: {
          projectId: dependency.projectId,
          id: { in: [parsed.data.predecessorId, parsed.data.successorId] },
        },
      });
      if (items.length !== 2) {
        res.status(400).json({ error: 'Оба элемента Структуры должны относиться к проекту' });
        return;
      }
      if (
        await dependencyLimitExceeded(
          dependency.projectId,
          parsed.data.successorId,
          parsed.data.predecessorId,
          dependency.id,
        )
      ) {
        res.status(400).json({ error: 'У элемента Структуры может быть не больше шести предшественников' });
        return;
      }
      if (
        await wouldCreateDependencyCycle(
          dependency.projectId,
          parsed.data.predecessorId,
          parsed.data.successorId,
          dependency.id,
        )
      ) {
        res.status(400).json({ error: 'Связь создаст цикл' });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.wbsDependency.delete({ where: { id: dependency.id } });
        await tx.wbsDependency.deleteMany({
          where: {
            projectId: dependency.projectId,
            predecessorId: parsed.data.predecessorId,
            successorId: parsed.data.successorId,
            type: { not: parsed.data.type },
          },
        });
        await tx.wbsDependency.upsert({
          where: {
            projectId_predecessorId_successorId_type: {
              projectId: dependency.projectId,
              predecessorId: parsed.data.predecessorId,
              successorId: parsed.data.successorId,
              type: parsed.data.type,
            },
          },
          create: {
            projectId: dependency.projectId,
            predecessorId: parsed.data.predecessorId,
            successorId: parsed.data.successorId,
            type: parsed.data.type,
            lagDays: parsed.data.lagDays,
          },
          update: {
            lagDays: parsed.data.lagDays,
          },
        });
      });
      await syncWbsPredecessorFields(dependency.projectId);
      await recalculateProjectWbsSchedule(dependency.projectId);
      const snapshot = await getProjectWbsSnapshot(dependency.projectId);
      await recordWbsCommand({
        projectId: dependency.projectId,
        type: 'UPDATE',
        payload: { action: 'move-dependency', dependencyId: dependency.id, dependency: parsed.data },
        beforeSnapshot: dependency,
        afterSnapshot: snapshot,
      });
      await emitWebhookEvent({
        eventType: 'wbs.dependency.updated',
        projectId: dependency.projectId,
        payload: { action: 'move-dependency', dependencyId: dependency.id, dependency: parsed.data, snapshot },
      }).catch(() => undefined);

      res.json(snapshot);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: serverErrorMessage(error, 'Не удалось изменить связь Структуры'),
      });
    }
  });

  router.delete('/wbs-dependencies/:dependencyId', async (req, res) => {
    const dependency = await prisma.wbsDependency.findUnique({
      where: { id: req.params.dependencyId },
    });

    if (!dependency) {
      res.status(404).json({ error: 'Связь Структуры не найдена' });
      return;
    }

    await prisma.wbsDependency.delete({ where: { id: dependency.id } });
    await syncWbsPredecessorFields(dependency.projectId);
    await recalculateProjectWbsSchedule(dependency.projectId);
    const snapshot = await getProjectWbsSnapshot(dependency.projectId);
    await recordWbsCommand({
      projectId: dependency.projectId,
      type: 'UPDATE',
      payload: { action: 'delete-dependency', dependencyId: dependency.id },
      beforeSnapshot: dependency,
      afterSnapshot: snapshot,
    });
    await emitWebhookEvent({
      eventType: 'wbs.dependency.deleted',
      projectId: dependency.projectId,
      payload: { dependency, snapshot },
    }).catch(() => undefined);
    res.json(snapshot);
  });
}
