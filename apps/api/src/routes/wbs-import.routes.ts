import { wbsImportRequestSchema, type WbsImportPlanSummary } from '@pms/shared';
import { Prisma, type ProjectCalendarCode } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../db.js';
import { recordAuditEvent } from '../services/audit.js';
import { shiftActor, trackScheduleShifts } from '../services/schedule-shifts.js';
import { getProjectWbsSnapshot, recalculateProjectWbsHierarchyStatuses } from '../services/wbs.js';
import { PREDECESSOR_FIELDS, planWbsImport, type ImportExistingRow } from '../services/wbs-import.js';
import { levelFromWbsItem } from '../services/wbs-ordering.js';
import { resolveWbsScheduleDateWrites, resolveWbsSchedulePatch } from '../services/wbs-schedule-patch.js';
import { recalculateProjectWbsSchedule } from '../services/wbs-schedule.js';
import { closedAtForWbsStatus } from './wbs/helpers.js';
import { runWithWbsWriteQueue } from './wbs/write-queue.js';
import { projectWriter } from './project-writer.js';

const OPEN_ISSUE_EXCLUDED = ['Done', 'Closed', 'Resolved'];
const date = (value: string | null | undefined) => (value === undefined ? undefined : value ? new Date(`${value}T00:00:00.000Z`) : null);

class ImportRejected extends Error {
  constructor(readonly summary: WbsImportPlanSummary) {
    super('IMPORT_REJECTED');
  }
}

async function loadImportBase(client: Prisma.TransactionClient | typeof prisma, projectId: string) {
  const [items, managed] = await Promise.all([
    client.wbsItem.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    }),
    client.issue.findMany({
      where: { projectId, status: { notIn: OPEN_ISSUE_EXCLUDED }, workPackageId: { not: null } },
      select: { workPackageId: true },
    }),
  ]);
  return { items, managedIds: new Set(managed.map((issue) => issue.workPackageId!)) };
}

/**
 * Brings a table (Excel, Google Sheets, CSV) into a project's Structure. A dry
 * run answers what would change and writes nothing; the import itself plans
 * again under the project's lock, writes everything in one transaction or
 * nothing, deletes nothing, and recalculates the schedule in the Structure's
 * write queue, so the shift journal records it. The import key makes a second
 * send (a double click, a retry) return the first result.
 */
export function createWbsImportRouter() {
  const router = Router();

  router.post('/projects/:projectId/wbs-import', async (req, res) => {
    const writer = await projectWriter(req, res, String(req.params.projectId));
    if (!writer) return;
    const body = wbsImportRequestSchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: 'Некорректные строки импорта', issues: body.error.issues.slice(0, 20) });
      return;
    }
    const { project, user, demo } = writer;
    const { rows, importKey } = body.data;

    if (body.data.dryRun) {
      const { items, managedIds } = await loadImportBase(prisma, project.id);
      res.json(planWbsImport(items, rows, managedIds).summary);
      return;
    }

    const outcome = await runWithWbsWriteQueue(project.id, () =>
      trackScheduleShifts(project.id, { trigger: 'IMPORT', actor: shiftActor(demo ? null : user) }, async () => {
        const written = await prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wbs:${project.id}`}))`;
            const done = await tx.wbsImport.findUnique({ where: { projectId_importKey: { projectId: project.id, importKey } } });
            if (done) return { summary: done.summary as unknown as WbsImportPlanSummary, createdIds: done.createdIds, replayed: true, changedItems: [] };
            const { items, managedIds } = await loadImportBase(tx, project.id);
            const plan = planWbsImport(items as ImportExistingRow[], rows, managedIds);
            if (plan.summary.errors.length > 0) throw new ImportRejected(plan.summary);
            const byId = new Map(items.map((item) => [item.id, item]));

            const changedItems: Array<{ itemId: string; changedFields: string[] }> = [];
            for (const update of plan.updates) {
              const current = byId.get(update.id)!;
              const { values } = update;
              const predecessors =
                values.predecessors === undefined
                  ? {}
                  : Object.fromEntries(PREDECESSOR_FIELDS.map((field, index) => [field, values.predecessors![index] ?? null]));
              const schedulePatch = { startDate: date(values.startDate), dueDate: date(values.dueDate), workDays: values.workDays, ...predecessors };
              const resolved = resolveWbsSchedulePatch(schedulePatch, current);
              const dates = resolveWbsScheduleDateWrites(schedulePatch, resolved);
              await tx.wbsItem.update({
                where: { id: current.id },
                data: {
                  title: values.title,
                  owner: values.owner,
                  status: values.status,
                  closedAt: closedAtForWbsStatus(values.status, current),
                  progress: values.progress,
                  priority: values.priority,
                  comment: values.comment,
                  ...predecessors,
                  startDate: dates.startDate,
                  dueDate: dates.dueDate,
                  forecastStartDate: dates.forecastStartDate,
                  forecastDueDate: dates.forecastDueDate,
                  workDays: resolved.writeWorkDays ? values.workDays : undefined,
                },
              });
              if (resolved.changedFields.length > 0) changedItems.push({ itemId: current.id, changedFields: resolved.changedFields });
            }

            const idByCode = new Map(items.map((item) => [item.code, item.id]));
            const levelByCode = new Map(items.map((item) => [item.code, levelFromWbsItem(item)]));
            const createdIds: string[] = [];
            for (const create of plan.creates) {
              const { row } = create;
              const parentId = create.parentId ?? (create.parentCode ? idByCode.get(create.parentCode) ?? null : null);
              const level = create.parentCode ? (levelByCode.get(create.parentCode) ?? create.parentCode.split('.').length) + 1 : 1;
              const startDate = date(row.startDate) ?? null;
              const dueDate = date(row.dueDate) ?? null;
              const created = await tx.wbsItem.create({
                data: {
                  projectId: project.id,
                  parentId,
                  code: create.code,
                  title: row.title!,
                  type: row.type ?? 'TASK',
                  status: row.status ?? 'NOT_STARTED',
                  owner: row.owner ?? '',
                  startDate,
                  dueDate,
                  baselineStartDate: startDate,
                  baselineDueDate: dueDate,
                  forecastStartDate: startDate,
                  forecastDueDate: dueDate,
                  excelStartDate: startDate,
                  excelEndDate: dueDate,
                  workDays: row.workDays ?? null,
                  wbsLevel: level,
                  calendarCode: create.calendarCode as ProjectCalendarCode,
                  progress: row.progress ?? 0,
                  priority: row.priority?.trim() || null,
                  comment: row.comment?.trim() || null,
                  closedAt: row.status === 'DONE' ? new Date() : null,
                  ...Object.fromEntries(PREDECESSOR_FIELDS.map((field, index) => [field, row.predecessors?.[index] ?? null])),
                  sortOrder: 0,
                },
                select: { id: true },
              });
              idByCode.set(create.code, created.id);
              levelByCode.set(create.code, level);
              createdIds.push(created.id);
            }

            // The new rows sit under their parents; only rows whose place changes are written.
            for (const [index, entry] of plan.order.entries()) {
              const id = 'id' in entry ? entry.id : idByCode.get(entry.code)!;
              const sortOrder = (index + 1) * 10;
              if (byId.get(id)?.sortOrder !== sortOrder) await tx.wbsItem.update({ where: { id }, data: { sortOrder } });
            }

            await tx.wbsImport.create({
              data: {
                projectId: project.id,
                importKey,
                userId: demo ? null : user.id,
                summary: plan.summary as unknown as Prisma.InputJsonValue,
                createdIds,
              },
            });
            return { summary: plan.summary, createdIds, replayed: false, changedItems };
          },
          { timeout: 60_000 },
        );
        await recalculateProjectWbsSchedule(project.id, { changedItems: written.changedItems });
        await recalculateProjectWbsHierarchyStatuses(project.id);
        return { ...written, snapshot: await getProjectWbsSnapshot(project.id) };
      }),
    ).catch((error: unknown) => {
      if (error instanceof ImportRejected) {
        res.status(422).json(error.summary);
        return null;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        res.status(409).json({ error: 'Структура изменилась во время импорта. Проверьте файл ещё раз.' });
        return null;
      }
      throw error;
    });
    if (!outcome) return;

    if (!outcome.replayed) {
      await recordAuditEvent({
        req,
        actor: user,
        action: 'wbs.import',
        objectType: 'Project',
        objectId: project.id,
        projectId: project.id,
        metadata: {
          importKey,
          created: outcome.summary.creates.length,
          updated: outcome.summary.updates.length,
          unchanged: outcome.summary.unchanged,
          createdIds: outcome.createdIds,
        },
      });
    }
    res.status(outcome.replayed ? 200 : 201).json({ summary: outcome.summary, createdIds: outcome.createdIds, replayed: outcome.replayed, ...outcome.snapshot });
  });

  return router;
}
