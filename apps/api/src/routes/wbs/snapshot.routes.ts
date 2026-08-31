import type { Router } from 'express';
import { prisma } from '../../db.js';
import {
  getProjectWbsSnapshot,
  recalculateProjectWbsHierarchyStatuses,
  renumberProjectWbs,
  wbsItemSnapshotData,
} from '../../services/wbs.js';
import { recordWbsCommand } from '../../services/wbs-audit.js';
import { recalculateProjectWbsSchedule } from '../../services/wbs-schedule.js';
import { wbsSnapshotSchema } from './schemas.js';

export function registerWbsSnapshotRoutes(router: Router) {
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
    const snapshotItemsById = new Map(parsed.data.wbsItems.map((item) => [item.id, item]));
    const invalidLinkedIssue = linkedIssues.find((issue) => {
      const phase = issue.phaseId ? snapshotItemsById.get(issue.phaseId) : null;
      const workPackage = issue.workPackageId
        ? snapshotItemsById.get(issue.workPackageId)
        : null;
      return (issue.phaseId && phase?.type !== 'PHASE')
        || (issue.workPackageId && (
          workPackage?.type !== 'WORK_PACKAGE'
          || workPackage.parentId !== issue.phaseId
        ));
    });
    if (invalidLinkedIssue) {
      res.status(409).json({
        error: `Снимок нарушает связь Структуры с открытым вопросом «${invalidLinkedIssue.title}»`,
      });
      return;
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
    await recalculateProjectWbsHierarchyStatuses(project.id);
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
}
