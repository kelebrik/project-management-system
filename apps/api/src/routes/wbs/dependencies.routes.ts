import type { Router } from 'express';
import { getProjectWbsSnapshot, syncWbsPredecessorFields } from '../../services/wbs.js';
import { recordWbsCommand } from '../../services/wbs-audit.js';
import { recalculateProjectWbsSchedule } from '../../services/wbs-schedule.js';
import {
  rejectStructureWrite,
  respondToStructureRejection,
  runStructureWrite,
  runStructureWriteFor,
  type StructureDb,
} from '../../services/wbs-structure-write.js';
import { emitWebhookEvent } from '../../services/webhooks.js';
import { dependencyLimitExceeded, wouldCreateDependencyCycle } from './helpers.js';
import { wbsDependencySchema } from './schemas.js';

type WbsDependencyRoutesContext = {
  serverErrorMessage: (error: unknown, fallback: string) => string;
};

type WbsDependencyInput = {
  predecessorId: string;
  successorId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: number;
};

/** The project of a link, read in the write's transaction; a missing link is refused. */
function dependencyProject(dependencyId: string) {
  return async (db: StructureDb) => {
    const owner = await db.wbsDependency.findUnique({ where: { id: dependencyId }, select: { projectId: true } });
    if (!owner) rejectStructureWrite(404, 'Связь Структуры не найдена');
    return owner.projectId;
  };
}

/** The checks a new or moved link must pass, read under the project's lock. */
async function assertDependencyAllowed(db: StructureDb, projectId: string, input: WbsDependencyInput, ignoredDependencyId?: string) {
  if (input.predecessorId === input.successorId) {
    rejectStructureWrite(400, 'Связь не может ссылаться на тот же элемент');
  }
  const items = await db.wbsItem.findMany({
    where: {
      projectId,
      id: { in: [input.predecessorId, input.successorId] },
    },
  });
  if (items.length !== 2) {
    rejectStructureWrite(400, 'Оба элемента Структуры должны относиться к проекту');
  }
  if (await dependencyLimitExceeded(projectId, input.successorId, input.predecessorId, ignoredDependencyId, db)) {
    rejectStructureWrite(400, 'У элемента Структуры может быть не больше шести предшественников');
  }
  if (await wouldCreateDependencyCycle(projectId, input.predecessorId, input.successorId, ignoredDependencyId, db)) {
    rejectStructureWrite(400, 'Связь создаст цикл');
  }
}

/** One link per pair: a link of another type between the same rows is replaced. */
async function upsertDependency(db: StructureDb, projectId: string, input: WbsDependencyInput) {
  await db.wbsDependency.deleteMany({
    where: {
      projectId,
      predecessorId: input.predecessorId,
      successorId: input.successorId,
      type: { not: input.type },
    },
  });
  await db.wbsDependency.upsert({
    where: {
      projectId_predecessorId_successorId_type: {
        projectId,
        predecessorId: input.predecessorId,
        successorId: input.successorId,
        type: input.type,
      },
    },
    create: {
      projectId,
      predecessorId: input.predecessorId,
      successorId: input.successorId,
      type: input.type,
      lagDays: input.lagDays,
    },
    update: {
      lagDays: input.lagDays,
    },
  });
}

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

    const projectId = req.params.projectId;
    try {
      const snapshot = await runStructureWrite(projectId, async (db) => {
        await assertDependencyAllowed(db, projectId, parsed.data);
        await upsertDependency(db, projectId, parsed.data);
        await syncWbsPredecessorFields(projectId, db);
        await recalculateProjectWbsSchedule(projectId, {}, db);
        const snapshot = await getProjectWbsSnapshot(projectId, db);
        await recordWbsCommand({
          projectId,
          type: 'UPDATE',
          payload: { action: 'upsert-dependency', dependency: parsed.data },
          afterSnapshot: snapshot,
        }, db);
        return snapshot;
      });
      await emitWebhookEvent({
        eventType: 'wbs.dependency.updated',
        projectId,
        payload: { action: 'upsert-dependency', dependency: parsed.data, snapshot },
      }).catch(() => undefined);

      res.status(201).json(snapshot);
    } catch (error) {
      if (respondToStructureRejection(res, error)) return;
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
      const { dependency, snapshot } = await runStructureWriteFor(dependencyProject(req.params.dependencyId), async (db) => {
        const dependency = await db.wbsDependency.findUnique({
          where: { id: req.params.dependencyId },
        });
        if (!dependency) rejectStructureWrite(404, 'Связь Структуры не найдена');
        await assertDependencyAllowed(db, dependency.projectId, parsed.data, dependency.id);

        await db.wbsDependency.delete({ where: { id: dependency.id } });
        await upsertDependency(db, dependency.projectId, parsed.data);
        await syncWbsPredecessorFields(dependency.projectId, db);
        await recalculateProjectWbsSchedule(dependency.projectId, {}, db);
        const snapshot = await getProjectWbsSnapshot(dependency.projectId, db);
        await recordWbsCommand({
          projectId: dependency.projectId,
          type: 'UPDATE',
          payload: { action: 'move-dependency', dependencyId: dependency.id, dependency: parsed.data },
          beforeSnapshot: dependency,
          afterSnapshot: snapshot,
        }, db);
        return { dependency, snapshot };
      });
      await emitWebhookEvent({
        eventType: 'wbs.dependency.updated',
        projectId: dependency.projectId,
        payload: { action: 'move-dependency', dependencyId: dependency.id, dependency: parsed.data, snapshot },
      }).catch(() => undefined);

      res.json(snapshot);
    } catch (error) {
      if (respondToStructureRejection(res, error)) return;
      console.error(error);
      res.status(500).json({
        error: serverErrorMessage(error, 'Не удалось изменить связь Структуры'),
      });
    }
  });

  router.delete('/wbs-dependencies/:dependencyId', async (req, res) => {
    try {
      const { dependency, snapshot } = await runStructureWriteFor(dependencyProject(req.params.dependencyId), async (db) => {
        const dependency = await db.wbsDependency.findUnique({
          where: { id: req.params.dependencyId },
        });
        if (!dependency) rejectStructureWrite(404, 'Связь Структуры не найдена');

        await db.wbsDependency.delete({ where: { id: dependency.id } });
        await syncWbsPredecessorFields(dependency.projectId, db);
        await recalculateProjectWbsSchedule(dependency.projectId, {}, db);
        const snapshot = await getProjectWbsSnapshot(dependency.projectId, db);
        await recordWbsCommand({
          projectId: dependency.projectId,
          type: 'UPDATE',
          payload: { action: 'delete-dependency', dependencyId: dependency.id },
          beforeSnapshot: dependency,
          afterSnapshot: snapshot,
        }, db);
        return { dependency, snapshot };
      });
      await emitWebhookEvent({
        eventType: 'wbs.dependency.deleted',
        projectId: dependency.projectId,
        payload: { dependency, snapshot },
      }).catch(() => undefined);
      res.json(snapshot);
    } catch (error) {
      if (respondToStructureRejection(res, error)) return;
      throw error;
    }
  });
}
