import { Prisma } from '@prisma/client';
import type { Router } from 'express';
import {
  getProjectWbsSnapshot,
  recalculateProjectWbsHierarchyStatuses,
  renumberProjectWbs,
  wbsItemSnapshotData,
} from '../../services/wbs.js';
import { recordWbsCommand } from '../../services/wbs-audit.js';
import { bulkUpdateWbsItems } from '../../services/wbs-bulk-write.js';
import { recalculateProjectWbsSchedule } from '../../services/wbs-schedule.js';
import {
  rejectStructureWrite,
  respondToStructureRejection,
  runStructureWrite,
  type StructureDb,
} from '../../services/wbs-structure-write.js';
import { wbsSnapshotSchema } from './schemas.js';

type SnapshotRow = ReturnType<typeof wbsItemSnapshotData>;

/**
 * Writes every row of the snapshot in one statement: new rows are inserted,
 * rows of this project are overwritten, and a row id that belongs to another
 * project is left alone, which the row count then refuses.
 */
async function upsertSnapshotRows(db: StructureDb, rows: SnapshotRow[]) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]!) as Array<keyof SnapshotRow>;
  const names = columns.map((column) => `"${column}"`).join(', ');
  const picked = columns.map((column) => `r."${column}"`).join(', ');
  const updates = columns
    .filter((column) => column !== 'id' && column !== 'projectId')
    .map((column) => `"${column}" = EXCLUDED."${column}"`)
    .join(', ');
  const written = await db.$executeRaw`
    INSERT INTO "WbsItem" (${Prisma.raw(names)}, "createdAt", "updatedAt")
    SELECT ${Prisma.raw(picked)}, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
    FROM jsonb_populate_recordset(NULL::"WbsItem", ${JSON.stringify(rows)}::jsonb) AS r
    ON CONFLICT ("id") DO UPDATE SET ${Prisma.raw(updates)}, "updatedAt" = CURRENT_TIMESTAMP(3)
    WHERE "WbsItem"."projectId" = EXCLUDED."projectId"`;
  if (written !== rows.length) {
    rejectStructureWrite(409, 'Снимок Структуры содержит элементы другого проекта');
  }
}

export function registerWbsSnapshotRoutes(router: Router) {
  router.post('/projects/:projectId/wbs-snapshot/restore', async (req, res) => {
    const parsed = wbsSnapshotSchema.safeParse(req.body);
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

        const snapshotItemIds = new Set(parsed.data.wbsItems.map((item) => item.id));
        if (snapshotItemIds.size !== parsed.data.wbsItems.length) {
          rejectStructureWrite(400, 'Снимок Структуры содержит повторяющиеся идентификаторы элементов');
        }
        for (const item of parsed.data.wbsItems) {
          if (item.parentId && !snapshotItemIds.has(item.parentId)) {
            rejectStructureWrite(400, `Родительский элемент Структуры ${item.parentId} отсутствует в снимке`);
          }
        }
        for (const dependency of parsed.data.wbsDependencies) {
          if (!snapshotItemIds.has(dependency.predecessorId) || !snapshotItemIds.has(dependency.successorId)) {
            rejectStructureWrite(400, 'Связь в снимке Структуры ссылается на отсутствующий элемент');
          }
        }

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
          rejectStructureWrite(409, `Снимок нарушает связь Структуры с открытым вопросом «${invalidLinkedIssue.title}»`);
        }

        // Kept rows give up their codes and parents first, so the snapshot's codes
        // and hierarchy can be written in any order without meeting the old ones.
        await db.wbsDependency.deleteMany({ where: { projectId: project.id } });
        await db.$executeRaw`
          UPDATE "WbsItem" SET "parentId" = NULL, "code" = '__restore_' || "id", "updatedAt" = CURRENT_TIMESTAMP(3)
          WHERE "projectId" = ${project.id}`;
        await db.wbsItem.deleteMany({
          where: { projectId: project.id, id: { notIn: [...snapshotItemIds] } },
        });

        const rows = parsed.data.wbsItems.map((item) => wbsItemSnapshotData(project.id, item));
        await upsertSnapshotRows(db, rows.map((row) => ({ ...row, parentId: null })));
        await bulkUpdateWbsItems(
          db,
          project.id,
          rows.filter((row) => row.parentId).map((row) => ({ id: row.id, parentId: row.parentId })),
          ['parentId'],
        );

        await db.wbsDependency.createMany({
          data: parsed.data.wbsDependencies.map((dependency) => ({
            projectId: project.id,
            predecessorId: dependency.predecessorId,
            successorId: dependency.successorId,
            type: dependency.type,
            lagDays: dependency.lagDays,
          })),
        });

        await renumberProjectWbs(project.id, db);
        await recalculateProjectWbsSchedule(project.id, {}, db);
        await recalculateProjectWbsHierarchyStatuses(project.id, db);
        const snapshot = await getProjectWbsSnapshot(project.id, db);
        await recordWbsCommand({
          projectId: project.id,
          type: 'RESTORE',
          payload: {
            itemCount: parsed.data.wbsItems.length,
            dependencyCount: parsed.data.wbsDependencies.length,
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
