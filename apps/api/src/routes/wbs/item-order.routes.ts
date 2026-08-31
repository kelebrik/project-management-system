import type { Router } from 'express';
import { prisma } from '../../db.js';
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

    try {
      const project = await prisma.project.findUnique({
        where: { id: req.params.projectId },
        select: { id: true },
      });
      if (!project) {
        res.status(404).json({ error: 'Проект не найден' });
        return;
      }

      const items = await prisma.wbsItem.findMany({
        where: { projectId: project.id },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      const afterIndex = items.findIndex((item) => item.id === parsed.data.afterItemId);
      if (afterIndex === -1) {
        res.status(404).json({ error: 'Элемент Структуры не найден в этом проекте' });
        return;
      }

      let insertIndex = afterIndex + 1;
      if (parsed.data.beforeItemId) {
        const beforeIndex = items.findIndex((item) => item.id === parsed.data.beforeItemId);
        if (beforeIndex === -1) {
          res.status(404).json({ error: 'Следующий элемент Структуры не найден в этом проекте' });
          return;
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

      const temporaryCode = `__insert_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const created = await prisma.$transaction(async (tx) => {
        for (const [index, item] of items.entries()) {
          await tx.wbsItem.update({
            where: { id: item.id },
            data: { sortOrder: (index < insertIndex ? index + 1 : index + 2) * 10 },
          });
        }

        return tx.wbsItem.create({
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
      });

      await renumberProjectWbs(project.id);
      await recalculateProjectWbsSchedule(project.id);
      await recalculateProjectWbsHierarchyStatuses(project.id);
      const snapshot = await getProjectWbsSnapshot(project.id);
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
      });
      await emitWebhookEvent({
        eventType: 'wbs.item.created',
        projectId: project.id,
        payload: { action: 'insert-after', itemId: created.id, snapshot },
      }).catch(() => undefined);
      res.status(201).json({
        insertedItemId: created.id,
        ...snapshot,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Не удалось вставить элемент Структуры',
      });
    }
  });

  router.post('/projects/:projectId/wbs-items/renumber', async (req, res) => {
    const project = await prisma.project.findUnique({
      where: { id: req.params.projectId },
      select: { id: true },
    });
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }

    let updatedCount: number;
    try {
      updatedCount = await renumberProjectWbs(project.id);
    } catch (error) {
      if (error instanceof WbsIssueLinkViolationError) {
        res.status(409).json({ error: error.message });
        return;
      }
      throw error;
    }
    await recalculateProjectWbsSchedule(project.id);
    await recalculateProjectWbsHierarchyStatuses(project.id);
    const snapshot = await getProjectWbsSnapshot(project.id);
    await recordWbsCommand({
      projectId: project.id,
      type: 'BULK_UPDATE',
      payload: { action: 'renumber', updatedCount },
      afterSnapshot: snapshot,
    });
    res.json({
      updatedCount,
      ...snapshot,
    });
  });

  router.post('/projects/:projectId/wbs-baseline', async (req, res) => {
    const parsed = wbsBaselineSchema.safeParse(req.body ?? {});
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

    if (parsed.data.itemIds) {
      if (currentUser(req)?.role !== 'ADMIN') {
        res.status(403).json({ error: 'Выборочное обновление базового плана доступно только администратору' });
        return;
      }
      const result = await updateSelectedWbsBaselineFromCurrentPlan(
        project.id,
        parsed.data.itemIds,
      );
      if (result.missingItemIds.length > 0) {
        res.status(400).json({
          error: 'Некоторые выбранные элементы Структуры не найдены в проекте',
          missingItemIds: result.missingItemIds,
        });
        return;
      }
      const snapshot = await getProjectWbsSnapshot(project.id);
      await recordWbsCommand({
        projectId: project.id,
        type: 'BASELINE',
        payload: {
          action: 'update-selected-baseline-from-current-dates',
          itemIds: parsed.data.itemIds,
          updatedCount: result.updatedCount,
        },
        afterSnapshot: snapshot,
      });
      res.json({ updatedCount: result.updatedCount, ...snapshot });
      return;
    }

    const baseline = await createWbsBaselineFromCurrentPlan(project.id);
    const snapshot = await getProjectWbsSnapshot(project.id);
    await recordWbsCommand({
      projectId: project.id,
      type: 'BASELINE',
      payload: {
        action: 'set-baseline-from-current-structure',
        baselineId: baseline.id,
        version: baseline.version,
      },
      afterSnapshot: snapshot,
    });
    res.json(snapshot);
  });

  router.post('/projects/:projectId/wbs-items/reorder', async (req, res) => {
    const parsed = wbsReorderSchema.safeParse(req.body);
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

    const items = await prisma.wbsItem.findMany({
      where: { projectId: project.id },
      select: { id: true, code: true, type: true, wbsLevel: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const existingIds = new Set(items.map((item) => item.id));
    const orderedIds = parsed.data.orderedIds.filter(
      (id, index, ids) => existingIds.has(id) && ids.indexOf(id) === index,
    );
    const submittedIds = new Set(orderedIds);
    const missingIds = items.map((item) => item.id).filter((id) => !submittedIds.has(id));
    const nextIds = [...orderedIds, ...missingIds];

    const linkedIssues = await prisma.issue.findMany({
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
      res.status(409).json({
        error: `Изменение нарушает связь пакета работ с открытым вопросом «${invalidLinkedIssue.title}»; измените фазу в реестре вопросов`,
      });
      return;
    }

    await prisma.$transaction(
      nextIds.map((id, index) => {
        const nextLevel = parsed.data.levelsById?.[id];
        const nextType = parsed.data.typesById?.[id];
        return prisma.wbsItem.update({
          where: { id },
          data: {
            sortOrder: (index + 1) * 10,
            ...(nextLevel ? { wbsLevel: nextLevel } : {}),
            ...(nextType ? { type: nextType } : {}),
          },
        });
      }),
    );

    await renumberProjectWbs(project.id);
    await recalculateProjectWbsSchedule(project.id);
    await recalculateProjectWbsHierarchyStatuses(project.id);
    const snapshot = await getProjectWbsSnapshot(project.id);
    await recordWbsCommand({
      projectId: project.id,
      type: 'MOVE',
      payload: {
        orderedIds: parsed.data.orderedIds,
        levelsById: parsed.data.levelsById,
        typesById: parsed.data.typesById,
      },
      afterSnapshot: snapshot,
    });

    res.json(snapshot);
  });
}
