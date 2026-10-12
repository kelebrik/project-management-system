import type { Router } from 'express';
import {
  getProjectWbsSnapshot,
  levelFromWbsItem,
  recalculateProjectWbsHierarchyStatuses,
  renumberProjectWbs,
} from '../../services/wbs.js';
import {
  invalidIssueLinkedWbsPlan,
  WbsIssueLinkViolationError,
} from '../../services/wbs-issue-links.js';
import { recordWbsCommand } from '../../services/wbs-audit.js';
import {
  createWbsBaselineFromCurrentPlan,
  updateSelectedWbsBaselineFromCurrentPlan,
} from '../../services/wbs-baseline.js';
import { recalculateProjectWbsSchedule } from '../../services/wbs-schedule.js';
import { bulkUpdateWbsItems } from '../../services/wbs-bulk-write.js';
import {
  rejectStructureWrite,
  respondToStructureRejection,
  runStructureWrite,
} from '../../services/wbs-structure-write.js';
import { emitWebhookEvent } from '../../services/webhooks.js';
import { currentUser } from '../../server/auth.js';
import { wbsBaselineSchema, wbsInsertAfterSchema, wbsReorderSchema } from './schemas.js';

type LinkedIssueReorderItem = {
  id: string;
  code: string;
  type: string;
  wbsLevel: number | null;
};

type LinkedIssueReorderReference = {
  title: string;
  phaseId: string | null;
  workPackageId: string | null;
};

export function invalidIssueLinkedWbsReorder(
  items: LinkedIssueReorderItem[],
  nextIds: string[],
  levelsById: Record<string, number> | undefined,
  typesById: Record<string, string> | undefined,
  linkedIssues: LinkedIssueReorderReference[],
) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const proposedItems = nextIds.map((itemId) => {
    const item = itemsById.get(itemId)!;
    return {
      ...item,
      type: typesById?.[itemId] ?? item.type,
      wbsLevel: levelsById?.[itemId] ?? item.wbsLevel,
    };
  });
  const invalidIssue = invalidIssueLinkedWbsPlan(proposedItems, linkedIssues);
  if (invalidIssue) return invalidIssue;
  return linkedIssues.find((issue) => {
    const currentPhase = issue.phaseId ? itemsById.get(issue.phaseId) : null;
    const requestedPhaseLevel = issue.phaseId ? levelsById?.[issue.phaseId] : undefined;
    const phaseLevelChanged = requestedPhaseLevel !== undefined
      && (!currentPhase || requestedPhaseLevel !== levelFromWbsItem(currentPhase));
    return issue.phaseId && phaseLevelChanged;
  });
}

export function registerWbsItemOrderRoutes(router: Router) {
  router.post('/projects/:projectId/wbs-items/insert-after', async (req, res) => {
    const parsed = wbsInsertAfterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const projectId = req.params.projectId;
    try {
      const { created, snapshot } = await runStructureWrite(projectId, async (db) => {
        const project = await db.project.findUnique({
          where: { id: projectId },
          select: { id: true },
        });
        if (!project) rejectStructureWrite(404, 'Проект не найден');

        const items = await db.wbsItem.findMany({
          where: { projectId: project.id },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        });
        const afterIndex = items.findIndex((item) => item.id === parsed.data.afterItemId);
        if (afterIndex === -1) {
          rejectStructureWrite(404, 'Элемент Структуры не найден в этом проекте');
        }

        let insertIndex = afterIndex + 1;
        if (parsed.data.beforeItemId) {
          const beforeIndex = items.findIndex((item) => item.id === parsed.data.beforeItemId);
          if (beforeIndex === -1) {
            rejectStructureWrite(404, 'Следующий элемент Структуры не найден в этом проекте');
          }
          if (beforeIndex > afterIndex) {
            insertIndex = beforeIndex;
          }
        }

        const afterItem = items[afterIndex];
        const beforeItem = items[insertIndex] ?? null;
        const insertedLevel = beforeItem ? levelFromWbsItem(beforeItem) : levelFromWbsItem(afterItem);
        let parentId: string | null = beforeItem?.parentId ?? null;
        if (!beforeItem) {
          for (let index = insertIndex - 1; index >= 0; index -= 1) {
            const candidate = items[index];
            if (levelFromWbsItem(candidate) < insertedLevel) {
              parentId = candidate.id;
              break;
            }
          }
        }

        // Rows keep steps of ten with a gap at the insertion point; only rows whose order moves are written.
        const shiftedRows = items
          .map((item, index) => ({ id: item.id, sortOrder: (index < insertIndex ? index + 1 : index + 2) * 10, current: item.sortOrder }))
          .filter((row) => row.sortOrder !== row.current)
          .map(({ id, sortOrder }) => ({ id, sortOrder }));
        await bulkUpdateWbsItems(db, project.id, shiftedRows, ['sortOrder']);

        const temporaryCode = `__insert_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const created = await db.wbsItem.create({
          data: {
            projectId: project.id,
            parentId,
            code: temporaryCode,
            title: '',
            type: 'TASK',
            status: 'NOT_STARTED',
            owner: '',
            wbsLevel: insertedLevel,
            effortPercent: 0,
            sortOrder: (insertIndex + 1) * 10,
          },
        });

        await renumberProjectWbs(project.id, db);
        await recalculateProjectWbsSchedule(project.id, {}, db);
        await recalculateProjectWbsHierarchyStatuses(project.id, db);
        const snapshot = await getProjectWbsSnapshot(project.id, db);
        await recordWbsCommand({
          projectId: project.id,
          type: 'CREATE',
          payload: {
            action: 'insert-after',
            insertedItemId: created.id,
            afterItemId: parsed.data.afterItemId,
            beforeItemId: parsed.data.beforeItemId,
          },
          afterSnapshot: snapshot,
        }, db);
        return { created, snapshot };
      });
      await emitWebhookEvent({
        eventType: 'wbs.item.created',
        projectId,
        payload: { action: 'insert-after', itemId: created.id, snapshot },
      }).catch(() => undefined);
      res.status(201).json({
        insertedItemId: created.id,
        ...snapshot,
      });
    } catch (error) {
      if (respondToStructureRejection(res, error)) return;
      console.error(error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Не удалось вставить элемент Структуры',
      });
    }
  });

  router.post('/projects/:projectId/wbs-items/renumber', async (req, res) => {
    const projectId = req.params.projectId;
    try {
      const { updatedCount, snapshot } = await runStructureWrite(projectId, async (db) => {
        const project = await db.project.findUnique({
          where: { id: projectId },
          select: { id: true },
        });
        if (!project) rejectStructureWrite(404, 'Проект не найден');

        const updatedCount = await renumberProjectWbs(project.id, db);
        await recalculateProjectWbsSchedule(project.id, {}, db);
        await recalculateProjectWbsHierarchyStatuses(project.id, db);
        const snapshot = await getProjectWbsSnapshot(project.id, db);
        await recordWbsCommand({
          projectId: project.id,
          type: 'BULK_UPDATE',
          payload: { action: 'renumber', updatedCount },
          afterSnapshot: snapshot,
        }, db);
        return { updatedCount, snapshot };
      });
      res.json({
        updatedCount,
        ...snapshot,
      });
    } catch (error) {
      if (respondToStructureRejection(res, error)) return;
      if (error instanceof WbsIssueLinkViolationError) {
        res.status(409).json({ error: error.message });
        return;
      }
      throw error;
    }
  });

  router.post('/projects/:projectId/wbs-baseline', async (req, res) => {
    const parsed = wbsBaselineSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const selectedItemIds = parsed.data.itemIds;
    if (selectedItemIds && currentUser(req)?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Выборочное обновление базового плана доступно только администратору' });
      return;
    }

    const projectId = req.params.projectId;
    try {
      const result = await runStructureWrite(projectId, async (db) => {
        const project = await db.project.findUnique({
          where: { id: projectId },
          select: { id: true },
        });
        if (!project) rejectStructureWrite(404, 'Проект не найден');

        if (selectedItemIds) {
          const result = await updateSelectedWbsBaselineFromCurrentPlan(project.id, selectedItemIds, db);
          if (result.missingItemIds.length > 0) {
            rejectStructureWrite(400, 'Некоторые выбранные элементы Структуры не найдены в проекте', {
              missingItemIds: result.missingItemIds,
            });
          }
          const snapshot = await getProjectWbsSnapshot(project.id, db);
          await recordWbsCommand({
            projectId: project.id,
            type: 'BASELINE',
            payload: {
              action: 'update-selected-baseline-from-current-dates',
              itemIds: selectedItemIds,
              updatedCount: result.updatedCount,
            },
            afterSnapshot: snapshot,
          }, db);
          return { updatedCount: result.updatedCount, snapshot };
        }

        const baseline = await createWbsBaselineFromCurrentPlan(project.id, db);
        const snapshot = await getProjectWbsSnapshot(project.id, db);
        await recordWbsCommand({
          projectId: project.id,
          type: 'BASELINE',
          payload: {
            action: 'set-baseline-from-current-structure',
            baselineId: baseline.id,
            version: baseline.version,
          },
          afterSnapshot: snapshot,
        }, db);
        return { snapshot };
      });
      res.json('updatedCount' in result ? { updatedCount: result.updatedCount, ...result.snapshot } : result.snapshot);
    } catch (error) {
      if (respondToStructureRejection(res, error)) return;
      throw error;
    }
  });

  router.post('/projects/:projectId/wbs-items/reorder', async (req, res) => {
    const parsed = wbsReorderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const projectId = req.params.projectId;
    try {
      const snapshot = await runStructureWrite(projectId, async (db) => {
        const project = await db.project.findUnique({
          where: { id: projectId },
          select: { id: true },
        });
        if (!project) rejectStructureWrite(404, 'Проект не найден');

        const items = await db.wbsItem.findMany({
          where: { projectId: project.id },
          select: { id: true, code: true, type: true, wbsLevel: true, sortOrder: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        });
        const existingIds = new Set(items.map((item) => item.id));
        const orderedIds = parsed.data.orderedIds.filter(
          (id, index, ids) => existingIds.has(id) && ids.indexOf(id) === index,
        );
        const submittedIds = new Set(orderedIds);
        const missingIds = items.map((item) => item.id).filter((id) => !submittedIds.has(id));
        const nextIds = [...orderedIds, ...missingIds];

        const linkedIssues = await db.issue.findMany({
          where: {
            projectId: project.id,
            status: { notIn: ['Done', 'Closed', 'Resolved'] },
            OR: [
              { phaseId: { not: null } },
              { workPackageId: { not: null } },
            ],
          },
          select: { title: true, phaseId: true, workPackageId: true },
        });
        const invalidLinkedIssue = invalidIssueLinkedWbsReorder(
          items,
          nextIds,
          parsed.data.levelsById,
          parsed.data.typesById,
          linkedIssues,
        );
        if (invalidLinkedIssue) {
          rejectStructureWrite(409, `Изменение нарушает связь пакета работ с открытым вопросом «${invalidLinkedIssue.title}»; измените фазу в реестре вопросов`);
        }

        const itemsById = new Map(items.map((item) => [item.id, item]));
        const movedRows = nextIds
          .map((id, index) => {
            const item = itemsById.get(id)!;
            return {
              id,
              sortOrder: (index + 1) * 10,
              wbsLevel: parsed.data.levelsById?.[id] || item.wbsLevel,
              type: parsed.data.typesById?.[id] || item.type,
            };
          })
          .filter((row) => {
            const item = itemsById.get(row.id)!;
            return row.sortOrder !== item.sortOrder || row.wbsLevel !== item.wbsLevel || row.type !== item.type;
          });
        await bulkUpdateWbsItems(db, project.id, movedRows, ['sortOrder', 'wbsLevel', 'type']);

        await renumberProjectWbs(project.id, db);
        await recalculateProjectWbsSchedule(project.id, {}, db);
        await recalculateProjectWbsHierarchyStatuses(project.id, db);
        const snapshot = await getProjectWbsSnapshot(project.id, db);
        await recordWbsCommand({
          projectId: project.id,
          type: 'MOVE',
          payload: {
            orderedIds: parsed.data.orderedIds,
            levelsById: parsed.data.levelsById,
            typesById: parsed.data.typesById,
          },
          afterSnapshot: snapshot,
        }, db);
        return snapshot;
      });
      res.json(snapshot);
    } catch (error) {
      if (respondToStructureRejection(res, error)) return;
      throw error;
    }
  });
}
