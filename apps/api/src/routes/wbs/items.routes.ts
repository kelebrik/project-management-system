import { wbsItemBaseSchema, wbsItemSchema } from '@pms/shared';
import type { Router } from 'express';
import { prisma } from '../../db.js';
import {
  getProjectWbsSnapshot,
  recalculateProjectWbsHierarchyStatuses,
  renumberProjectWbs,
} from '../../services/wbs.js';
import { recordWbsCommand } from '../../services/wbs-audit.js';
import { resolveWbsScheduleDateWrites, resolveWbsSchedulePatch } from '../../services/wbs-schedule-patch.js';
import { recalculateProjectWbsSchedule } from '../../services/wbs-schedule.js';
import { emitWebhookEvent } from '../../services/webhooks.js';
import {
  closedAtForWbsStatus,
  collectDescendantLevelUpdates,
  validateWbsProjectAndParent,
  wouldCreateWbsCycle,
} from './helpers.js';

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
    await recalculateProjectWbsHierarchyStatuses(validation.project.id);
    const snapshot = await getProjectWbsSnapshot(validation.project.id);
    await emitWebhookEvent({
      eventType: 'wbs.item.created',
      projectId: validation.project.id,
      payload: { item, snapshot },
    }).catch(() => undefined);
    res.status(201).json({ item, ...snapshot });
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
      changedFields: schedulePatch.changedFields,
    });
    await recalculateProjectWbsHierarchyStatuses(existing.projectId);
    const snapshot = await getProjectWbsSnapshot(existing.projectId);
    const recalculatedItem =
      snapshot.wbsItems.find((item) => item.id === existing.id) ?? updated;
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

    res.json(snapshot);
  });
}
