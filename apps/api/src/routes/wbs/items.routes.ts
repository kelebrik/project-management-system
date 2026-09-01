import { wbsItemBaseSchema, wbsItemSchema } from '@pms/shared';
import type { Router } from 'express';
import { prisma } from '../../db.js';
import { jiraUrlMatchesConfiguredBase } from '../../jira-url-policy.js';
import { currentUser } from '../../server/auth.js';
import { buildAuditFieldChanges, recordAuditEvent } from '../../services/audit.js';
import {
  attachAuditEventToWbsTombstone,
  createWbsTombstone,
} from '../../services/wbs-tombstones.js';
import {
  getProjectWbsSnapshot,
  recalculateProjectWbsHierarchyStatuses,
  renumberProjectWbs,
} from '../../services/wbs.js';
import { recordWbsCommand } from '../../services/wbs-audit.js';
import { resolveWbsScheduleDateWrites, resolveWbsSchedulePatch } from '../../services/wbs-schedule-patch.js';
import { recalculateProjectWbsSchedule } from '../../services/wbs-schedule.js';
import { invalidIssueLinkedWbsPlan } from '../../services/wbs-issue-links.js';
import { emitWebhookEvent } from '../../services/webhooks.js';
import {
  closedAtForWbsStatus,
  collectDescendantLevelUpdates,
  validateWbsProjectAndParent,
  wouldCreateWbsCycle,
} from './helpers.js';
import { wbsBulkDeleteSchema, wbsBulkUpdateSchema } from './schemas.js';

function wbsLevelFromItem(item: { code: string; wbsLevel: number | null }) {
  return Math.max(1, item.wbsLevel ?? item.code.split('.').filter(Boolean).length);
}

const closedIssueStatuses = ['Done', 'Closed', 'Resolved'];

function datesMatch(left: Date | null, right: string | null | undefined) {
  if (right === undefined) return true;
  const normalizedRight = right ? new Date(right) : null;
  return left?.getTime() === normalizedRight?.getTime();
}

function linkedIssueManagedFieldsChanged(
  existing: {
    id: string;
    code: string;
    parentId: string | null;
    title: string;
    type: string;
    owner: string;
    dueDate: Date | null;
    wbsLevel: number | null;
  },
  patch: {
    parentId?: string | null;
    title?: string;
    type?: string;
    owner?: string;
    dueDate?: string | null;
    wbsLevel?: number | null;
  },
) {
  return (patch.parentId !== undefined && (patch.parentId || null) !== existing.parentId)
    || (patch.title !== undefined && patch.title !== existing.title)
    || (patch.type !== undefined && patch.type !== existing.type)
    || (patch.owner !== undefined && patch.owner !== existing.owner)
    || (patch.wbsLevel !== undefined && patch.wbsLevel !== wbsLevelFromItem(existing))
    || !datesMatch(existing.dueDate, patch.dueDate);
}

const wbsItemAuditFields = [
  'parentId',
  'code',
  'title',
  'type',
  'status',
  'owner',
  'startDate',
  'dueDate',
  'baselineStartDate',
  'baselineDueDate',
  'forecastStartDate',
  'forecastDueDate',
  'wbsLevel',
  'predecessor1',
  'predecessor2',
  'predecessor3',
  'predecessor4',
  'predecessor5',
  'predecessor6',
  'leadLagDays',
  'workDays',
  'calendarDays',
  'excelStartDate',
  'excelEndDate',
  'planWorkDays',
  'planCalendarDays',
  'calendarCode',
  'templateColor',
  'priority',
  'effortPercent',
  'plannedCost',
  'forecastCost',
  'progress',
  'jiraTicketKey',
  'jiraTicketUrl',
  'description',
  'closedAt',
  'sortOrder',
];

export function registerWbsItemRoutes(router: Router) {
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
        effortPercent: parsed.data.effortPercent,
        plannedCost: parsed.data.plannedCost,
        forecastCost: parsed.data.forecastCost,
        progress: parsed.data.progress,
        jiraTicketKey: parsed.data.jiraTicketKey || null,
        jiraTicketUrl: parsed.data.jiraTicketUrl || null,
        mattermostUrl: parsed.data.mattermostUrl?.trim() || null,
        description: parsed.data.description || null,
        comment: parsed.data.comment?.trim() || null,
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
    await recalculateProjectWbsHierarchyStatuses(validation.project.id);
    const snapshot = await getProjectWbsSnapshot(validation.project.id);
    const recalculatedItem = snapshot.wbsItems.find((wbsItem) => wbsItem.id === item.id) ?? item;
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'wbs_item.create',
      objectType: 'WbsItem',
      objectId: item.id,
      projectId: validation.project.id,
      afterValue: recalculatedItem,
      changes: buildAuditFieldChanges({}, recalculatedItem, wbsItemAuditFields),
    });
    await emitWebhookEvent({
      eventType: 'wbs.item.created',
      projectId: validation.project.id,
      payload: { item, snapshot },
    }).catch(() => undefined);
    res.status(201).json({ item, ...snapshot });
  });

  router.patch('/projects/:projectId/wbs-items/bulk', async (req, res) => {
    const parsed = wbsBulkUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const project = await prisma.project.findUnique({
      where: { id: req.params.projectId },
      include: { jiraIntegration: true },
    });
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }

    const itemIds = parsed.data.items.map((item) => item.id);
    if (new Set(itemIds).size !== itemIds.length) {
      res.status(400).json({ error: 'Элементы Структуры в запросе не должны повторяться' });
      return;
    }

    const projectItems = await prisma.wbsItem.findMany({
      where: { projectId: project.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const requestedIds = new Set(itemIds);
    const existingItems = projectItems.filter((item) => requestedIds.has(item.id));
    const existingById = new Map(existingItems.map((item) => [item.id, item]));
    const projectItemIds = new Set(projectItems.map((item) => item.id));
    const missingIds = itemIds.filter((itemId) => !existingById.has(itemId));
    if (missingIds.length > 0) {
      res.status(404).json({ error: `Элементы Структуры не найдены: ${missingIds.join(', ')}` });
      return;
    }

    const linkedIssues = await prisma.issue.findMany({
      where: {
        projectId: project.id,
        status: { notIn: closedIssueStatuses },
        OR: [
          { phaseId: { not: null } },
          { workPackageId: { not: null } },
        ],
      },
      select: { title: true, phaseId: true, workPackageId: true },
    });
    for (const requested of parsed.data.items) {
      const existing = existingById.get(requested.id)!;
      const phaseIssue = linkedIssues.find((issue) => issue.phaseId === requested.id);
      if (phaseIssue && requested.patch.type !== undefined && requested.patch.type !== 'PHASE') {
        res.status(409).json({
          error: `Фаза связана с открытым вопросом «${phaseIssue.title}»; её тип нельзя изменить`,
        });
        return;
      }
      if (
        phaseIssue
        && requested.patch.wbsLevel !== undefined
        && requested.patch.wbsLevel !== wbsLevelFromItem(existing)
      ) {
        res.status(409).json({
          error: `Фаза связана с открытым вопросом «${phaseIssue.title}»; её уровень нельзя изменить`,
        });
        return;
      }
      const workPackageIssue = linkedIssues.find((issue) => issue.workPackageId === requested.id);
      if (workPackageIssue && linkedIssueManagedFieldsChanged(existing, requested.patch)) {
        res.status(409).json({
          error: `Пакет работ управляется открытым вопросом «${workPackageIssue.title}»; измените его в реестре вопросов`,
        });
        return;
      }
    }
    const patchesById = new Map(parsed.data.items.map((item) => [item.id, item.patch]));
    const proposedItems = projectItems
      .map((item) => {
        const patch = patchesById.get(item.id);
        return {
          ...item,
          type: patch?.type ?? item.type,
          wbsLevel: patch?.wbsLevel === undefined ? item.wbsLevel : patch.wbsLevel,
          sortOrder: patch?.sortOrder ?? item.sortOrder,
        };
      })
      .sort((left, right) => left.sortOrder - right.sortOrder
        || left.createdAt.getTime() - right.createdAt.getTime()
        || left.id.localeCompare(right.id));
    const invalidLinkedPlan = invalidIssueLinkedWbsPlan(proposedItems, linkedIssues);
    if (invalidLinkedPlan) {
      res.status(409).json({
        error: `Изменение нарушает связь пакета работ с открытым вопросом «${invalidLinkedPlan.title}»; измените фазу в реестре вопросов`,
      });
      return;
    }

    const parentById = new Map(projectItems.map((item) => [item.id, item.parentId]));
    for (const item of parsed.data.items) {
      const existing = existingById.get(item.id)!;
      if (item.patch.parentId === existing.id) {
        res.status(400).json({ error: 'Элемент Структуры не может быть своим родителем' });
        return;
      }
      const nextParentId = item.patch.parentId === undefined ? existing.parentId : item.patch.parentId;
      const nextJiraUrl = item.patch.jiraTicketUrl === undefined ? existing.jiraTicketUrl : item.patch.jiraTicketUrl;
      if (nextParentId && !projectItemIds.has(nextParentId)) {
        res.status(400).json({ error: 'Родительский элемент Структуры не найден в этом проекте' });
        return;
      }
      if (nextJiraUrl && !nextJiraUrl.startsWith('https://')) {
        res.status(400).json({ error: 'Ссылка Jira должна начинаться с https://' });
        return;
      }
      const jiraBaseUrl = project.jiraIntegration?.baseUrl;
      if (jiraBaseUrl && nextJiraUrl && !jiraUrlMatchesConfiguredBase(nextJiraUrl, jiraBaseUrl)) {
        res.status(400).json({ error: `URL Jira должен начинаться с ${jiraBaseUrl}` });
        return;
      }
      parentById.set(existing.id, nextParentId ?? null);
    }

    for (const itemId of itemIds) {
      const seen = new Set([itemId]);
      let parentId = parentById.get(itemId) ?? null;
      while (parentId) {
        if (seen.has(parentId)) {
          res.status(400).json({ error: 'Изменения создают цикл в Структуре' });
          return;
        }
        seen.add(parentId);
        parentId = parentById.get(parentId) ?? null;
      }
    }

    const schedulePatchesByItemId = new Map(
      parsed.data.items.map((item) => [
        item.id,
        resolveWbsSchedulePatch(item.patch, existingById.get(item.id)!),
      ]),
    );

    const updatedItems = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const item of parsed.data.items) {
        const existing = existingById.get(item.id)!;
        const patch = item.patch;
        const schedulePatch = schedulePatchesByItemId.get(item.id)!;
        const scheduleDateWrites = resolveWbsScheduleDateWrites(patch, schedulePatch);
        results.push(
          await tx.wbsItem.update({
            where: { id: existing.id },
            data: {
              parentId: patch.parentId === undefined ? undefined : patch.parentId || null,
              code: undefined,
              title: patch.title,
              type: patch.type,
              status: patch.status,
              owner: patch.owner,
              startDate: scheduleDateWrites.startDate === undefined ? undefined : scheduleDateWrites.startDate ? new Date(scheduleDateWrites.startDate) : null,
              dueDate: scheduleDateWrites.dueDate === undefined ? undefined : scheduleDateWrites.dueDate ? new Date(scheduleDateWrites.dueDate) : null,
              baselineStartDate: patch.baselineStartDate === undefined ? undefined : patch.baselineStartDate ? new Date(patch.baselineStartDate) : null,
              baselineDueDate: patch.baselineDueDate === undefined ? undefined : patch.baselineDueDate ? new Date(patch.baselineDueDate) : null,
              forecastStartDate: scheduleDateWrites.forecastStartDate === undefined ? undefined : scheduleDateWrites.forecastStartDate ? new Date(scheduleDateWrites.forecastStartDate) : null,
              forecastDueDate: scheduleDateWrites.forecastDueDate === undefined ? undefined : scheduleDateWrites.forecastDueDate ? new Date(scheduleDateWrites.forecastDueDate) : null,
              wbsLevel: patch.wbsLevel === undefined ? undefined : patch.wbsLevel ?? null,
              predecessor1: patch.predecessor1 === undefined ? undefined : patch.predecessor1 || null,
              predecessor2: patch.predecessor2 === undefined ? undefined : patch.predecessor2 || null,
              predecessor3: patch.predecessor3 === undefined ? undefined : patch.predecessor3 || null,
              predecessor4: patch.predecessor4 === undefined ? undefined : patch.predecessor4 || null,
              predecessor5: patch.predecessor5 === undefined ? undefined : patch.predecessor5 || null,
              predecessor6: patch.predecessor6 === undefined ? undefined : patch.predecessor6 || null,
              leadLagDays: patch.leadLagDays,
              workDays: !schedulePatch.writeWorkDays || patch.workDays === undefined ? undefined : patch.workDays ?? null,
              calendarDays: !schedulePatch.writeCalendarDays || patch.calendarDays === undefined ? undefined : patch.calendarDays ?? null,
              excelStartDate: patch.excelStartDate === undefined ? undefined : patch.excelStartDate ? new Date(patch.excelStartDate) : null,
              excelEndDate: patch.excelEndDate === undefined ? undefined : patch.excelEndDate ? new Date(patch.excelEndDate) : null,
              planWorkDays: patch.planWorkDays === undefined ? undefined : patch.planWorkDays ?? null,
              planCalendarDays: patch.planCalendarDays === undefined ? undefined : patch.planCalendarDays ?? null,
              calendarCode: patch.calendarCode,
              templateColor: patch.templateColor === undefined ? undefined : patch.templateColor || null,
              priority: patch.priority === undefined ? undefined : patch.priority || null,
              effortPercent: patch.effortPercent,
              plannedCost: patch.plannedCost,
              forecastCost: patch.forecastCost,
              progress: patch.progress,
              jiraTicketKey: patch.jiraTicketKey === undefined ? undefined : patch.jiraTicketKey || null,
              jiraTicketUrl: patch.jiraTicketUrl === undefined ? undefined : patch.jiraTicketUrl || null,
              mattermostUrl: patch.mattermostUrl === undefined ? undefined : patch.mattermostUrl?.trim() || null,
              description: patch.description === undefined ? undefined : patch.description || null,
              comment: patch.comment === undefined ? undefined : patch.comment?.trim() || null,
              closedAt: closedAtForWbsStatus(patch.status, existing),
              sortOrder: patch.sortOrder,
            },
          }),
        );
      }
      return results;
    });

    if (parsed.data.renumber) {
      await renumberProjectWbs(project.id);
    }
    await recalculateProjectWbsSchedule(project.id, {
      changedItems: parsed.data.items.map((item) => ({
        itemId: item.id,
        changedFields: schedulePatchesByItemId.get(item.id)!.changedFields,
      })),
    });
    await recalculateProjectWbsHierarchyStatuses(project.id);
    const snapshot = await getProjectWbsSnapshot(project.id);

    await Promise.all(
      updatedItems.map((updated) =>
        recordWbsCommand({
          projectId: project.id,
          type: 'UPDATE',
          payload: {
            itemId: updated.id,
            patch: parsed.data.items.find((item) => item.id === updated.id)?.patch,
            bulk: true,
          },
          beforeSnapshot: existingById.get(updated.id),
          afterSnapshot: snapshot.wbsItems.find((item) => item.id === updated.id) ?? updated,
        }),
      ),
    );
    await emitWebhookEvent({
      eventType: 'wbs.items.updated',
      projectId: project.id,
      payload: { itemIds, snapshot },
    }).catch(() => undefined);

    res.setHeader('X-WBS-Updated-Count', String(updatedItems.length));
    res.json({ updatedCount: updatedItems.length, ...snapshot });
  });

  router.delete('/projects/:projectId/wbs-items', async (req, res) => {
    const parsed = wbsBulkDeleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const itemIds = [...new Set(parsed.data.itemIds)];
    const items = await prisma.wbsItem.findMany({
      where: { projectId: req.params.projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const missingIds = itemIds.filter((itemId) => !itemsById.has(itemId));
    if (missingIds.length > 0) {
      res.status(404).json({ error: 'Один или несколько элементов Структуры не найдены в проекте' });
      return;
    }

    const linkedIssue = await prisma.issue.findFirst({
      where: {
        status: { notIn: closedIssueStatuses },
        OR: [
          { phaseId: { in: itemIds } },
          { workPackageId: { in: itemIds } },
        ],
      },
      select: { id: true, title: true },
    });
    if (linkedIssue) {
      res.status(409).json({
        error: `Один из элементов связан с открытым вопросом «${linkedIssue.title}» и не может быть удалён`,
      });
      return;
    }

    const actor = currentUser(req);
    const deletedFullItems = itemIds
      .map((itemId) => itemsById.get(itemId))
      .filter((item) => item !== undefined);
    const deletedDependencies = await prisma.wbsDependency.findMany({
      where: {
        OR: [
          { predecessorId: { in: itemIds } },
          { successorId: { in: itemIds } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const tombstone = await createWbsTombstone({
      projectId: req.params.projectId,
      deletedById: actor?.id ?? null,
      items: deletedFullItems,
      dependencies: deletedDependencies,
    });

    const deletedIdSet = new Set(itemIds);
    const levelUpdates = new Map<string, number>();
    const parentUpdates = new Map<string, string | null>();
    for (const item of items) {
      if (deletedIdSet.has(item.id)) continue;
      let deletedAncestorCount = 0;
      let parentId = item.parentId;
      while (parentId && deletedIdSet.has(parentId)) {
        deletedAncestorCount += 1;
        parentId = itemsById.get(parentId)?.parentId ?? null;
      }
      if (deletedAncestorCount === 0) continue;
      levelUpdates.set(item.id, Math.max(1, wbsLevelFromItem(item) - deletedAncestorCount));
      parentUpdates.set(item.id, parentId);
    }

    await prisma.$transaction(async (tx) => {
      for (const [itemId, parentId] of parentUpdates) {
        await tx.wbsItem.update({
          where: { id: itemId },
          data: {
            parentId,
            wbsLevel: levelUpdates.get(itemId),
          },
        });
      }

      await tx.wbsDependency.deleteMany({
        where: {
          OR: [
            { predecessorId: { in: itemIds } },
            { successorId: { in: itemIds } },
          ],
        },
      });

      await tx.wbsItem.deleteMany({
        where: {
          projectId: req.params.projectId,
          id: { in: itemIds },
        },
      });
    });

    await renumberProjectWbs(req.params.projectId);
    await recalculateProjectWbsSchedule(req.params.projectId);
    await recalculateProjectWbsHierarchyStatuses(req.params.projectId);
    const snapshot = await getProjectWbsSnapshot(req.params.projectId);
    const deletedItems = itemIds
      .map((itemId) => itemsById.get(itemId))
      .filter((item) => item !== undefined)
      .map((item) => ({
        id: item.id,
        code: item.code,
        title: item.title,
      }));
    await recordWbsCommand({
      projectId: req.params.projectId,
      type: 'DELETE',
      payload: {
        action: 'bulk-delete',
        itemIds,
        deletedItems,
      },
      beforeSnapshot: deletedItems,
      afterSnapshot: snapshot,
    });
    const auditEvent = await recordAuditEvent({
      req,
      actor,
      action: 'wbs_item.delete',
      objectType: 'WbsItem',
      projectId: req.params.projectId,
      beforeValue: deletedItems,
      metadata: {
        action: 'bulk-delete',
        itemIds,
        deletedCount: deletedItems.length,
        tombstoneId: tombstone.id,
        tombstoneExpiresAt: tombstone.expiresAt,
      },
    });
    if (auditEvent) {
      await attachAuditEventToWbsTombstone(tombstone.id, auditEvent.id);
    }

    res.json({
      deletedCount: itemIds.length,
      ...snapshot,
    });
  });

  router.patch('/wbs-items/:itemId', async (req, res) => {
    const parsed = wbsItemBaseSchema.partial().safeParse(req.body);
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

    const linkedIssues = await prisma.issue.findMany({
      where: {
        projectId: existing.projectId,
        status: { notIn: closedIssueStatuses },
        OR: [
          { phaseId: { not: null } },
          { workPackageId: { not: null } },
        ],
      },
      select: { title: true, phaseId: true, workPackageId: true },
    });
    const linkedIssue = linkedIssues.find((issue) => (
      issue.phaseId === existing.id || issue.workPackageId === existing.id
    ));
    if (
      linkedIssue?.phaseId === existing.id
      && parsed.data.type !== undefined
      && parsed.data.type !== 'PHASE'
    ) {
      res.status(409).json({
        error: `Фаза связана с открытым вопросом «${linkedIssue.title}»; её тип нельзя изменить`,
      });
      return;
    }
    if (parsed.data.wbsLevel !== undefined || parsed.data.sortOrder !== undefined) {
      const projectItems = await prisma.wbsItem.findMany({
        where: { projectId: existing.projectId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      const proposedItems = projectItems
        .map((item) => item.id === existing.id
          ? {
              ...item,
              type: parsed.data.type ?? item.type,
              wbsLevel: parsed.data.wbsLevel === undefined
                ? item.wbsLevel
                : parsed.data.wbsLevel,
              sortOrder: parsed.data.sortOrder ?? item.sortOrder,
            }
          : item)
        .sort((left, right) => left.sortOrder - right.sortOrder
          || left.createdAt.getTime() - right.createdAt.getTime()
          || left.id.localeCompare(right.id));
      const invalidLinkedPlan = invalidIssueLinkedWbsPlan(proposedItems, linkedIssues);
      if (invalidLinkedPlan) {
        res.status(409).json({
          error: `Изменение нарушает связь пакета работ с открытым вопросом «${invalidLinkedPlan.title}»; измените фазу в реестре вопросов`,
        });
        return;
      }
    }
    if (
      linkedIssue?.phaseId === existing.id
      && parsed.data.wbsLevel !== undefined
      && parsed.data.wbsLevel !== wbsLevelFromItem(existing)
    ) {
      res.status(409).json({
        error: `Фаза связана с открытым вопросом «${linkedIssue.title}»; её уровень нельзя изменить`,
      });
      return;
    }
    if (
      linkedIssue?.workPackageId === existing.id
      && linkedIssueManagedFieldsChanged(existing, parsed.data)
    ) {
      res.status(409).json({
        error: `Пакет работ управляется открытым вопросом «${linkedIssue.title}»; измените его в реестре вопросов`,
      });
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

    const schedulePatch = resolveWbsSchedulePatch(parsed.data, existing);
    const scheduleDateWrites = resolveWbsScheduleDateWrites(parsed.data, schedulePatch);

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
          scheduleDateWrites.startDate === undefined
            ? undefined
            : scheduleDateWrites.startDate
              ? new Date(scheduleDateWrites.startDate)
              : null,
        dueDate:
          scheduleDateWrites.dueDate === undefined
            ? undefined
            : scheduleDateWrites.dueDate
              ? new Date(scheduleDateWrites.dueDate)
              : null,
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
          scheduleDateWrites.forecastStartDate === undefined
            ? undefined
            : scheduleDateWrites.forecastStartDate
              ? new Date(scheduleDateWrites.forecastStartDate)
              : null,
        forecastDueDate:
          scheduleDateWrites.forecastDueDate === undefined
            ? undefined
            : scheduleDateWrites.forecastDueDate
              ? new Date(scheduleDateWrites.forecastDueDate)
              : null,
        wbsLevel: parsed.data.wbsLevel === undefined ? undefined : parsed.data.wbsLevel ?? null,
        predecessor1: parsed.data.predecessor1 === undefined ? undefined : parsed.data.predecessor1 || null,
        predecessor2: parsed.data.predecessor2 === undefined ? undefined : parsed.data.predecessor2 || null,
        predecessor3: parsed.data.predecessor3 === undefined ? undefined : parsed.data.predecessor3 || null,
        predecessor4: parsed.data.predecessor4 === undefined ? undefined : parsed.data.predecessor4 || null,
        predecessor5: parsed.data.predecessor5 === undefined ? undefined : parsed.data.predecessor5 || null,
        predecessor6: parsed.data.predecessor6 === undefined ? undefined : parsed.data.predecessor6 || null,
        leadLagDays: parsed.data.leadLagDays,
        workDays:
          !schedulePatch.writeWorkDays || parsed.data.workDays === undefined
            ? undefined
            : parsed.data.workDays ?? null,
        calendarDays:
          !schedulePatch.writeCalendarDays || parsed.data.calendarDays === undefined
            ? undefined
            : parsed.data.calendarDays ?? null,
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
        effortPercent: parsed.data.effortPercent,
        plannedCost: parsed.data.plannedCost,
        forecastCost: parsed.data.forecastCost,
        progress: parsed.data.progress,
        jiraTicketKey: parsed.data.jiraTicketKey === undefined ? undefined : parsed.data.jiraTicketKey || null,
        jiraTicketUrl: parsed.data.jiraTicketUrl === undefined ? undefined : parsed.data.jiraTicketUrl || null,
        mattermostUrl: parsed.data.mattermostUrl === undefined ? undefined : parsed.data.mattermostUrl?.trim() || null,
        description: parsed.data.description === undefined ? undefined : parsed.data.description || null,
        comment: parsed.data.comment === undefined ? undefined : parsed.data.comment?.trim() || null,
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
      changedFields: schedulePatch.changedFields,
    });
    await recalculateProjectWbsHierarchyStatuses(existing.projectId);
    const snapshot = await getProjectWbsSnapshot(existing.projectId);
    const recalculatedItem =
      snapshot.wbsItems.find((item) => item.id === existing.id) ?? updated;
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'wbs_item.update',
      objectType: 'WbsItem',
      objectId: existing.id,
      projectId: existing.projectId,
      beforeValue: existing,
      afterValue: recalculatedItem,
      metadata: { changedFields: Object.keys(parsed.data) },
      changes: buildAuditFieldChanges(existing, recalculatedItem, wbsItemAuditFields),
    });
    await emitWebhookEvent({
      eventType: 'wbs.item.updated',
      projectId: existing.projectId,
      payload: { before: existing, after: recalculatedItem, snapshot },
    }).catch(() => undefined);
    res.json({ item: recalculatedItem, ...snapshot });
  });

  router.delete('/wbs-items/:itemId', async (req, res) => {
    const existing = await prisma.wbsItem.findUnique({
      where: { id: req.params.itemId },
    });

    if (!existing) {
      res.status(404).json({ error: 'Элемент Структуры не найден' });
      return;
    }

    const linkedIssue = await prisma.issue.findFirst({
      where: {
        status: { notIn: closedIssueStatuses },
        OR: [
          { phaseId: existing.id },
          { workPackageId: existing.id },
        ],
      },
      select: { id: true, title: true },
    });
    if (linkedIssue) {
      res.status(409).json({
        error: `Элемент связан с открытым вопросом «${linkedIssue.title}» и не может быть удалён`,
      });
      return;
    }

    const actor = currentUser(req);
    const deletedDependencies = await prisma.wbsDependency.findMany({
      where: {
        OR: [{ predecessorId: existing.id }, { successorId: existing.id }],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const tombstone = await createWbsTombstone({
      projectId: existing.projectId,
      deletedById: actor?.id ?? null,
      items: [existing],
      dependencies: deletedDependencies,
    });

    const descendantUpdates = await collectDescendantLevelUpdates(existing);
    await prisma.$transaction(async (tx) => {
      await tx.wbsItem.updateMany({
        where: { parentId: existing.id },
        data: { parentId: existing.parentId },
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
    await recalculateProjectWbsHierarchyStatuses(existing.projectId);
    const snapshot = await getProjectWbsSnapshot(existing.projectId);
    await recordWbsCommand({
      projectId: existing.projectId,
      type: 'DELETE',
      payload: { itemId: existing.id, code: existing.code, title: existing.title },
      beforeSnapshot: existing,
      afterSnapshot: snapshot,
    });
    const auditEvent = await recordAuditEvent({
      req,
      actor,
      action: 'wbs_item.delete',
      objectType: 'WbsItem',
      objectId: existing.id,
      projectId: existing.projectId,
      beforeValue: existing,
      metadata: {
        tombstoneId: tombstone.id,
        tombstoneExpiresAt: tombstone.expiresAt,
      },
    });
    if (auditEvent) {
      await attachAuditEventToWbsTombstone(tombstone.id, auditEvent.id);
    }

    res.json(snapshot);
  });
}
