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
import { finishStructureChange, structureCommandSnapshot, structureResponse, structureRow } from '../../services/wbs-structure-delta.js';
import {
  createWbsBaselineFromCurrentPlan,
  updateSelectedWbsBaselineFromCurrentPlan,
} from '../../services/wbs-baseline.js';
import { recalculateProjectWbsSchedule } from '../../services/wbs-schedule.js';
import { bulkUpdateWbsItems } from '../../services/wbs-bulk-write.js';
import { sortPositionAt } from './append.routes.js';
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
      const { created, change } = await runStructureWrite(projectId, async (db) => {
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

        // The new row takes a free position between its neighbours, as an appended one does: other rows
        // keep theirs, so the change and its answer stay small. Only when there is no gap do the rows in the way move.
        const sortOrder = await sortPositionAt(db, items, { insertIndex });

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
            sortOrder,
          },
        });

        await renumberProjectWbs(project.id, db);
        await recalculateProjectWbsSchedule(project.id, {}, db);
        await recalculateProjectWbsHierarchyStatuses(project.id, db);
        const change = await finishStructureChange(db, project.id, req);
        await recordWbsCommand({
          projectId: project.id,
          type: 'CREATE',
          payload: {
            ...structureCommandSnapshot(change),
            action: 'insert-after',
            insertedItemId: created.id,
            item: await structureRow(db, change, created.id),
            afterItemId: parsed.data.afterItemId,
            beforeItemId: parsed.data.beforeItemId,
          },
        }, db);
        return { created, change };
      });
      await emitWebhookEvent({
        eventType: 'wbs.item.created',
        projectId,
        payload: async () => ({ action: 'insert-after', itemId: created.id, snapshot: await getProjectWbsSnapshot(projectId) }),
      }).catch(() => undefined);
      res.status(201).json({
        insertedItemId: created.id,
        ...structureResponse(change),
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
      const { updatedCount, change } = await runStructureWrite(projectId, async (db) => {
        const project = await db.project.findUnique({
          where: { id: projectId },
          select: { id: true },
        });
        if (!project) rejectStructureWrite(404, 'Проект не найден');

        const updatedCount = await renumberProjectWbs(project.id, db);
        await recalculateProjectWbsSchedule(project.id, {}, db);
        await recalculateProjectWbsHierarchyStatuses(project.id, db);
        const change = await finishStructureChange(db, project.id, req);
        await recordWbsCommand({
          projectId: project.id,
          type: 'BULK_UPDATE',
          payload: { ...structureCommandSnapshot(change), action: 'renumber', updatedCount },
        }, db);
        return { updatedCount, change };
      });
      res.json({
        updatedCount,
        ...structureResponse(change),
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
          const change = await finishStructureChange(db, project.id, req);
          await recordWbsCommand({
            projectId: project.id,
            type: 'BASELINE',
            payload: {
              ...structureCommandSnapshot(change),
              action: 'update-selected-baseline-from-current-dates',
              itemIds: selectedItemIds,
              updatedCount: result.updatedCount,
            },
            }, db);
          return { updatedCount: result.updatedCount, change };
        }

        // The whole plan is fixed once per project, by anyone who may; after that only an
        // administrator moves single rows' baselines (the «Update baseline» above).
        const fixed = await db.wbsBaseline.findFirst({ where: { projectId: project.id }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
        if (fixed) {
          const [year, month, dayOfMonth] = fixed.createdAt.toISOString().slice(0, 10).split('-');
          rejectStructureWrite(
            409,
            `Базовый план проекта уже зафиксирован ${dayOfMonth}.${month}.${year}. Изменить его может администратор кнопкой «Обновить базовый план»`,
            { code: 'BASELINE_ALREADY_FIXED', baselineFixedAt: fixed.createdAt.toISOString() },
          );
        }
        const baseline = await createWbsBaselineFromCurrentPlan(project.id, db);
        const change = await finishStructureChange(db, project.id, req);
        await recordWbsCommand({
          projectId: project.id,
          type: 'BASELINE',
          payload: {
            ...structureCommandSnapshot(change),
            action: 'set-baseline-from-current-structure',
            baselineId: baseline.id,
            version: baseline.version,
          },
        }, db);
        return { change, baselineFixedAt: baseline.createdAt.toISOString() };
      });
      res.json('updatedCount' in result ? { updatedCount: result.updatedCount, ...structureResponse(result.change) } : { ...structureResponse(result.change), baselineFixedAt: result.baselineFixedAt });
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
      const change = await runStructureWrite(projectId, async (db) => {
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
        const change = await finishStructureChange(db, project.id, req);
        await recordWbsCommand({
          projectId: project.id,
          type: 'MOVE',
          payload: {
            ...structureCommandSnapshot(change),
            orderedIds: parsed.data.orderedIds,
            levelsById: parsed.data.levelsById,
            typesById: parsed.data.typesById,
          },
        }, db);
        return change;
      });
      res.json(structureResponse(change));
    } catch (error) {
      if (respondToStructureRejection(res, error)) return;
      throw error;
    }
  });
}
