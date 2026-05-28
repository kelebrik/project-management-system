import { wbsItemSchema } from '@pms/shared';
import type { WbsItem } from '@prisma/client';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
  getProjectWbsSnapshot,
  levelFromWbsCode,
  levelFromWbsItem,
  renumberProjectWbs,
  syncWbsPredecessorFields,
  wbsItemSnapshotData,
} from '../services/wbs.js';
import { recordWbsCommand } from '../services/wbs-audit.js';
import { createWbsBaselineFromCurrentPlan } from '../services/wbs-baseline.js';
import { recalculateProjectWbsSchedule } from '../services/wbs-schedule.js';
import { emitWebhookEvent } from '../services/webhooks.js';

type WbsRoutesContext = {
  serverErrorMessage: (error: unknown, fallback: string) => string;
};

export function createWbsRouter({ serverErrorMessage }: WbsRoutesContext) {
  const router = Router();

  function closedAtForWbsStatus(
    nextStatus: string | undefined,
    current?: { status: string; closedAt: Date | null },
  ) {
    if (nextStatus === undefined) return undefined;
    if (nextStatus === 'DONE') {
      return current?.closedAt ?? new Date();
    }
    if (current?.status === 'DONE') return null;
    return undefined;
  }

const wbsInsertAfterSchema = z.object({
  afterItemId: z.string().trim().min(1),
  beforeItemId: z.string().trim().optional().nullable(),
});

const wbsReorderSchema = z.object({
  orderedIds: z.array(z.string().trim().min(1)).min(1),
});

const wbsDependencySnapshotSchema = z.object({
  predecessorId: z.string().trim().min(1),
  successorId: z.string().trim().min(1),
  type: z.enum(['FS', 'SS', 'FF', 'SF']).default('FS'),
  lagDays: z.coerce.number().int().default(0),
});

const wbsSnapshotSchema = z.object({
  wbsItems: z.array(
    wbsItemSchema.extend({
      id: z.string().trim().min(1),
      closedAt: z.string().trim().optional().nullable(),
    }),
  ),
  wbsDependencies: z.array(wbsDependencySnapshotSchema).default([]),
});

let wbsWriteQueue: Promise<void> = Promise.resolve();

function isWbsWriteRequest(req: Request) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return false;
  return [
    '/wbs-items',
    '/wbs-dependencies',
    '/wbs-snapshot',
    '/wbs-baseline',
  ].some((segment) => req.path.includes(segment));
}

router.use((req, res, next) => {
  if (!isWbsWriteRequest(req)) {
    next();
    return;
  }

  const previous = wbsWriteQueue;
  let release!: () => void;
  wbsWriteQueue = previous
    .catch(() => undefined)
    .then(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

  void previous
    .catch(() => undefined)
    .then(() => {
      let released = false;
      const done = () => {
        if (released) return;
        released = true;
        release();
      };

      res.once('finish', done);
      res.once('close', done);
      next();
    });
});

async function validateWbsProjectAndParent(
  projectId: string,
  parentId: string | null | undefined,
  jiraTicketUrl: string | null | undefined,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { jiraIntegration: true },
  });

  if (!project) {
    return { error: 'Проект не найден' as const };
  }

  if (parentId) {
    const parent = await prisma.wbsItem.findUnique({
      where: { id: parentId },
    });
    if (!parent || parent.projectId !== project.id) {
      return { error: 'Родительский элемент Структуры не найден в этом проекте' as const };
    }
  }

  if (jiraTicketUrl && !jiraTicketUrl.startsWith('https://')) {
    return { error: 'Ссылка Jira должна начинаться с https://' as const };
  }

  const jiraBaseUrl = project.jiraIntegration?.baseUrl;
  if (jiraBaseUrl && jiraTicketUrl && !jiraTicketUrl.startsWith(jiraBaseUrl)) {
    return { error: `URL Jira должен начинаться с ${jiraBaseUrl}` as const };
  }

  return { project };
}

async function wouldCreateWbsCycle(itemId: string, nextParentId: string | null | undefined) {
  let cursor = nextParentId;
  while (cursor) {
    if (cursor === itemId) {
      return true;
    }
    const parent = await prisma.wbsItem.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = parent?.parentId ?? null;
  }
  return false;
}

const WBS_SCHEDULE_DATE_FIELDS = [
  'startDate',
  'dueDate',
  'forecastStartDate',
  'forecastDueDate',
] as const;

const WBS_SCHEDULE_PREDECESSOR_FIELDS = [
  'predecessor1',
  'predecessor2',
  'predecessor3',
  'predecessor4',
  'predecessor5',
  'predecessor6',
] as const;

function dateOnly(value: Date | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function changedWbsScheduleFields(
  patch: Partial<z.infer<typeof wbsItemSchema>>,
  existing: WbsItem,
) {
  const fields = new Set<string>();

  for (const field of WBS_SCHEDULE_DATE_FIELDS) {
    if (patch[field] !== undefined && dateOnly(patch[field]) !== dateOnly(existing[field])) {
      fields.add(field);
    }
  }

  if (patch.workDays !== undefined && (patch.workDays ?? null) !== existing.workDays) {
    fields.add('workDays');
  }
  if (patch.calendarCode !== undefined && patch.calendarCode !== existing.calendarCode) {
    fields.add('calendarCode');
  }
  if (patch.leadLagDays !== undefined && patch.leadLagDays !== existing.leadLagDays) {
    fields.add('leadLagDays');
  }

  for (const field of WBS_SCHEDULE_PREDECESSOR_FIELDS) {
    if (patch[field] !== undefined && (patch[field] || null) !== existing[field]) {
      fields.add(field);
      fields.add('predecessors');
    }
  }

  return [...fields];
}

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
          sortOrder: (insertIndex + 1) * 10,
        },
      });
    });

    await renumberProjectWbs(project.id);
    await recalculateProjectWbsSchedule(project.id);
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

router.post('/projects/:projectId/wbs-snapshot/restore', async (req, res) => {
  const parsed = wbsSnapshotSchema.safeParse(req.body);
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

  const snapshotItemIds = new Set(parsed.data.wbsItems.map((item) => item.id));
  if (snapshotItemIds.size !== parsed.data.wbsItems.length) {
    res.status(400).json({ error: 'Снимок Структуры содержит повторяющиеся идентификаторы элементов' });
    return;
  }

  for (const item of parsed.data.wbsItems) {
    if (item.parentId && !snapshotItemIds.has(item.parentId)) {
      res.status(400).json({ error: `Родительский элемент Структуры ${item.parentId} отсутствует в снимке` });
      return;
    }
  }

  for (const dependency of parsed.data.wbsDependencies) {
    if (!snapshotItemIds.has(dependency.predecessorId) || !snapshotItemIds.has(dependency.successorId)) {
      res.status(400).json({ error: 'Связь в снимке Структуры ссылается на отсутствующий элемент' });
      return;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.wbsDependency.deleteMany({ where: { projectId: project.id } });

    const existingItems = await tx.wbsItem.findMany({
      where: { projectId: project.id },
      select: { id: true },
    });

    for (const item of existingItems) {
      await tx.wbsItem.update({
        where: { id: item.id },
        data: {
          parentId: null,
          code: `__restore_${item.id}`,
        },
      });
    }

    await tx.wbsItem.deleteMany({
      where: { projectId: project.id, id: { notIn: [...snapshotItemIds] } },
    });

    for (const item of parsed.data.wbsItems) {
      const data = wbsItemSnapshotData(project.id, item);
      await tx.wbsItem.upsert({
        where: { id: item.id },
        update: data,
        create: data,
      });
    }

    for (const item of parsed.data.wbsItems) {
      await tx.wbsItem.update({
        where: { id: item.id },
        data: { parentId: item.parentId || null },
      });
    }

    for (const dependency of parsed.data.wbsDependencies) {
      await tx.wbsDependency.create({
        data: {
          projectId: project.id,
          predecessorId: dependency.predecessorId,
          successorId: dependency.successorId,
          type: dependency.type,
          lagDays: dependency.lagDays,
        },
      });
    }
  });

  await renumberProjectWbs(project.id);
  await recalculateProjectWbsSchedule(project.id);
  const snapshot = await getProjectWbsSnapshot(project.id);
  await recordWbsCommand({
    projectId: project.id,
    type: 'RESTORE',
    payload: {
      itemCount: parsed.data.wbsItems.length,
      dependencyCount: parsed.data.wbsDependencies.length,
    },
    afterSnapshot: snapshot,
  });

  res.json(snapshot);
});

router.post('/projects/:projectId/wbs-items', async (req, res) => {
  const parsed = wbsItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const validation = await validateWbsProjectAndParent(
    req.params.projectId,
    parsed.data.parentId,
    parsed.data.jiraTicketUrl,
  );
  if ('error' in validation) {
    res.status(validation.error === 'Проект не найден' ? 404 : 400).json({ error: validation.error });
    return;
  }

  const item = await prisma.wbsItem.create({
    data: {
      projectId: validation.project.id,
      parentId: parsed.data.parentId || null,
      code: parsed.data.code,
      title: parsed.data.title,
      type: parsed.data.type,
      status: parsed.data.status,
      owner: parsed.data.owner,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      baselineStartDate: parsed.data.baselineStartDate
        ? new Date(parsed.data.baselineStartDate)
        : parsed.data.startDate
          ? new Date(parsed.data.startDate)
          : null,
      baselineDueDate: parsed.data.baselineDueDate
        ? new Date(parsed.data.baselineDueDate)
        : parsed.data.dueDate
          ? new Date(parsed.data.dueDate)
          : null,
      forecastStartDate: parsed.data.forecastStartDate
        ? new Date(parsed.data.forecastStartDate)
        : parsed.data.startDate
          ? new Date(parsed.data.startDate)
          : null,
      forecastDueDate: parsed.data.forecastDueDate
        ? new Date(parsed.data.forecastDueDate)
        : parsed.data.dueDate
          ? new Date(parsed.data.dueDate)
          : null,
      wbsLevel: parsed.data.wbsLevel ?? null,
      predecessor1: parsed.data.predecessor1 || null,
      predecessor2: parsed.data.predecessor2 || null,
      predecessor3: parsed.data.predecessor3 || null,
      predecessor4: parsed.data.predecessor4 || null,
      predecessor5: parsed.data.predecessor5 || null,
      predecessor6: parsed.data.predecessor6 || null,
      leadLagDays: parsed.data.leadLagDays,
      workDays: parsed.data.workDays ?? null,
      calendarDays: parsed.data.calendarDays ?? null,
      excelStartDate: parsed.data.excelStartDate
        ? new Date(parsed.data.excelStartDate)
        : parsed.data.startDate
          ? new Date(parsed.data.startDate)
          : null,
      excelEndDate: parsed.data.excelEndDate
        ? new Date(parsed.data.excelEndDate)
        : parsed.data.dueDate
          ? new Date(parsed.data.dueDate)
          : null,
      planWorkDays: parsed.data.planWorkDays ?? null,
      planCalendarDays: parsed.data.planCalendarDays ?? null,
      calendarCode: parsed.data.calendarCode,
      templateColor: parsed.data.templateColor || null,
      priority: parsed.data.priority || null,
      plannedCost: parsed.data.plannedCost,
      forecastCost: parsed.data.forecastCost,
      progress: parsed.data.progress,
      jiraTicketKey: parsed.data.jiraTicketKey || null,
      jiraTicketUrl: parsed.data.jiraTicketUrl || null,
      description: parsed.data.description || null,
      closedAt: parsed.data.status === 'DONE' ? new Date() : null,
      sortOrder: parsed.data.sortOrder,
    },
  });
  await recordWbsCommand({
    projectId: validation.project.id,
    type: 'CREATE',
    payload: { itemId: item.id, item },
  });

  await recalculateProjectWbsSchedule(validation.project.id);
  const snapshot = await getProjectWbsSnapshot(validation.project.id);
  await emitWebhookEvent({
    eventType: 'wbs.item.created',
    projectId: validation.project.id,
    payload: { item, snapshot },
  }).catch(() => undefined);
  res.status(201).json({ item, ...snapshot });
});

router.patch('/wbs-items/:itemId', async (req, res) => {
  const parsed = wbsItemSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.wbsItem.findUnique({
    where: { id: req.params.itemId },
  });

  if (!existing) {
    res.status(404).json({ error: 'Элемент Структуры не найден' });
    return;
  }

  if (parsed.data.parentId === existing.id) {
    res.status(400).json({ error: 'Элемент Структуры не может быть своим родителем' });
    return;
  }

  const nextParentId = parsed.data.parentId === undefined ? existing.parentId : parsed.data.parentId;
  const nextJiraUrl = parsed.data.jiraTicketUrl === undefined ? existing.jiraTicketUrl : parsed.data.jiraTicketUrl;
  const validation = await validateWbsProjectAndParent(existing.projectId, nextParentId, nextJiraUrl);
  if ('error' in validation) {
    res.status(validation.error === 'Проект не найден' ? 404 : 400).json({ error: validation.error });
    return;
  }

  if (await wouldCreateWbsCycle(existing.id, nextParentId)) {
    res.status(400).json({ error: 'Элемент Структуры нельзя перенести под свой дочерний элемент' });
    return;
  }

  const scheduleChangedFields = changedWbsScheduleFields(parsed.data, existing);

  const updated = await prisma.wbsItem.update({
    where: { id: existing.id },
    data: {
      parentId: parsed.data.parentId === undefined ? undefined : parsed.data.parentId || null,
      code: undefined,
      title: parsed.data.title,
      type: parsed.data.type,
      status: parsed.data.status,
      owner: parsed.data.owner,
      startDate:
        parsed.data.startDate === undefined
          ? undefined
          : parsed.data.startDate
            ? new Date(parsed.data.startDate)
            : null,
      dueDate:
        parsed.data.dueDate === undefined ? undefined : parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      baselineStartDate:
        parsed.data.baselineStartDate === undefined
          ? undefined
          : parsed.data.baselineStartDate
            ? new Date(parsed.data.baselineStartDate)
            : null,
      baselineDueDate:
        parsed.data.baselineDueDate === undefined
          ? undefined
          : parsed.data.baselineDueDate
            ? new Date(parsed.data.baselineDueDate)
            : null,
      forecastStartDate:
        parsed.data.forecastStartDate === undefined
          ? undefined
          : parsed.data.forecastStartDate
            ? new Date(parsed.data.forecastStartDate)
            : null,
      forecastDueDate:
        parsed.data.forecastDueDate === undefined
          ? undefined
          : parsed.data.forecastDueDate
            ? new Date(parsed.data.forecastDueDate)
            : null,
      wbsLevel: parsed.data.wbsLevel === undefined ? undefined : parsed.data.wbsLevel ?? null,
      predecessor1: parsed.data.predecessor1 === undefined ? undefined : parsed.data.predecessor1 || null,
      predecessor2: parsed.data.predecessor2 === undefined ? undefined : parsed.data.predecessor2 || null,
      predecessor3: parsed.data.predecessor3 === undefined ? undefined : parsed.data.predecessor3 || null,
      predecessor4: parsed.data.predecessor4 === undefined ? undefined : parsed.data.predecessor4 || null,
      predecessor5: parsed.data.predecessor5 === undefined ? undefined : parsed.data.predecessor5 || null,
      predecessor6: parsed.data.predecessor6 === undefined ? undefined : parsed.data.predecessor6 || null,
      leadLagDays: parsed.data.leadLagDays,
      workDays: parsed.data.workDays === undefined ? undefined : parsed.data.workDays ?? null,
      calendarDays: parsed.data.calendarDays === undefined ? undefined : parsed.data.calendarDays ?? null,
      excelStartDate:
        parsed.data.excelStartDate === undefined
          ? undefined
          : parsed.data.excelStartDate
            ? new Date(parsed.data.excelStartDate)
            : null,
      excelEndDate:
        parsed.data.excelEndDate === undefined
          ? undefined
          : parsed.data.excelEndDate
            ? new Date(parsed.data.excelEndDate)
            : null,
      planWorkDays: parsed.data.planWorkDays === undefined ? undefined : parsed.data.planWorkDays ?? null,
      planCalendarDays:
        parsed.data.planCalendarDays === undefined ? undefined : parsed.data.planCalendarDays ?? null,
      calendarCode: parsed.data.calendarCode,
      templateColor: parsed.data.templateColor === undefined ? undefined : parsed.data.templateColor || null,
      priority: parsed.data.priority === undefined ? undefined : parsed.data.priority || null,
      plannedCost: parsed.data.plannedCost,
      forecastCost: parsed.data.forecastCost,
      progress: parsed.data.progress,
      jiraTicketKey: parsed.data.jiraTicketKey === undefined ? undefined : parsed.data.jiraTicketKey || null,
      jiraTicketUrl: parsed.data.jiraTicketUrl === undefined ? undefined : parsed.data.jiraTicketUrl || null,
      description: parsed.data.description === undefined ? undefined : parsed.data.description || null,
      closedAt: closedAtForWbsStatus(parsed.data.status, existing),
      sortOrder: parsed.data.sortOrder,
    },
  });
  await recordWbsCommand({
    projectId: existing.projectId,
    type: 'UPDATE',
    payload: { itemId: existing.id, patch: parsed.data },
    beforeSnapshot: existing,
    afterSnapshot: updated,
  });

  await recalculateProjectWbsSchedule(existing.projectId, {
    changedItemId: existing.id,
    changedFields: scheduleChangedFields,
  });
  const snapshot = await getProjectWbsSnapshot(existing.projectId);
  await emitWebhookEvent({
    eventType: 'wbs.item.updated',
    projectId: existing.projectId,
    payload: { before: existing, after: updated, snapshot },
  }).catch(() => undefined);
  res.json({ item: updated, ...snapshot });
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

  const updatedCount = await renumberProjectWbs(project.id);
  await recalculateProjectWbsSchedule(project.id);
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
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    select: { id: true },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
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
    select: { id: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  const existingIds = new Set(items.map((item) => item.id));
  const orderedIds = parsed.data.orderedIds.filter((id, index, ids) => existingIds.has(id) && ids.indexOf(id) === index);
  const submittedIds = new Set(orderedIds);
  const missingIds = items.map((item) => item.id).filter((id) => !submittedIds.has(id));
  const nextIds = [...orderedIds, ...missingIds];

  await prisma.$transaction(
    nextIds.map((id, index) =>
      prisma.wbsItem.update({
        where: { id },
        data: { sortOrder: (index + 1) * 10 },
      }),
    ),
  );

  await renumberProjectWbs(project.id);
  await recalculateProjectWbsSchedule(project.id);
  const snapshot = await getProjectWbsSnapshot(project.id);
  await recordWbsCommand({
    projectId: project.id,
    type: 'MOVE',
    payload: { orderedIds: parsed.data.orderedIds },
    afterSnapshot: snapshot,
  });

  res.json(snapshot);
});

router.delete('/wbs-items/:itemId', async (req, res) => {
  const existing = await prisma.wbsItem.findUnique({
    where: { id: req.params.itemId },
  });

  if (!existing) {
    res.status(404).json({ error: 'Элемент Структуры не найден' });
    return;
  }

  const projectItems = await prisma.wbsItem.findMany({
    where: { projectId: existing.projectId },
    select: { id: true, parentId: true, code: true, wbsLevel: true },
  });
  const childrenByParent = new Map<string, typeof projectItems>();
  for (const item of projectItems) {
    if (!item.parentId) continue;
    childrenByParent.set(item.parentId, [...(childrenByParent.get(item.parentId) ?? []), item]);
  }
  const descendantUpdates: Array<{ id: string; wbsLevel: number }> = [];
  const collectDescendants = (parentId: string) => {
    for (const child of childrenByParent.get(parentId) ?? []) {
      const currentLevel = child.wbsLevel ?? levelFromWbsCode(child.code);
      descendantUpdates.push({ id: child.id, wbsLevel: Math.max(1, currentLevel - 1) });
      collectDescendants(child.id);
    }
  };
  collectDescendants(existing.id);

  await prisma.$transaction(async (tx) => {
    await tx.wbsItem.updateMany({
      where: { parentId: existing.id },
      data: {
        parentId: existing.parentId,
      },
    });

    for (const descendant of descendantUpdates) {
      await tx.wbsItem.update({
        where: { id: descendant.id },
        data: { wbsLevel: descendant.wbsLevel },
      });
    }

    await tx.wbsDependency.deleteMany({
      where: {
        OR: [{ predecessorId: existing.id }, { successorId: existing.id }],
      },
    });

    await tx.wbsItem.delete({
      where: { id: existing.id },
    });
  });

  await renumberProjectWbs(existing.projectId);
  await recalculateProjectWbsSchedule(existing.projectId);
  const snapshot = await getProjectWbsSnapshot(existing.projectId);
  await recordWbsCommand({
    projectId: existing.projectId,
    type: 'DELETE',
    payload: { itemId: existing.id, code: existing.code, title: existing.title },
    beforeSnapshot: existing,
    afterSnapshot: snapshot,
  });

  res.json(snapshot);
});

const wbsDependencySchema = z.object({
  predecessorId: z.string().trim().min(1),
  successorId: z.string().trim().min(1),
  type: z.enum(['FS', 'SS', 'FF', 'SF']).default('FS'),
  lagDays: z.coerce.number().int().default(0),
});

async function wouldCreateDependencyCycle(
  projectId: string,
  predecessorId: string,
  successorId: string,
  ignoredDependencyId?: string,
) {
  const dependencies = await prisma.wbsDependency.findMany({
    where: {
      projectId,
      ...(ignoredDependencyId ? { id: { not: ignoredDependencyId } } : {}),
    },
    select: { predecessorId: true, successorId: true },
  });
  const graph = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const next = graph.get(dependency.predecessorId) ?? [];
    next.push(dependency.successorId);
    graph.set(dependency.predecessorId, next);
  }
  graph.set(predecessorId, [...(graph.get(predecessorId) ?? []), successorId]);

  const seen = new Set<string>();
  const stack = [successorId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    if (current === predecessorId) return true;
    seen.add(current);
    stack.push(...(graph.get(current) ?? []));
  }
  return false;
}

async function dependencyLimitExceeded(
  projectId: string,
  successorId: string,
  predecessorId: string,
  ignoredDependencyId?: string,
) {
  const dependencies = await prisma.wbsDependency.findMany({
    where: {
      projectId,
      successorId,
      ...(ignoredDependencyId ? { id: { not: ignoredDependencyId } } : {}),
    },
    select: { predecessorId: true },
  });
  const uniquePredecessors = new Set(dependencies.map((dependency) => dependency.predecessorId));
  uniquePredecessors.add(predecessorId);
  return uniquePredecessors.size > 6;
}

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



  return router;
}
