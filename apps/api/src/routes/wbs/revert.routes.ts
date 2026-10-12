import { Prisma } from '@prisma/client';
import type { Router } from 'express';
import { z } from 'zod';
import { currentUser } from '../../server/auth.js';
import { recordAuditEvent } from '../../services/audit.js';
import { recordWbsCommand } from '../../services/wbs-audit.js';
import { bulkUpdateWbsItems, utcTimestamp } from '../../services/wbs-bulk-write.js';
import { recalculateProjectWbsSchedule } from '../../services/wbs-schedule.js';
import { finishStructureChange, structureCommandSnapshot, structureResponse } from '../../services/wbs-structure-delta.js';
import {
  rejectStructureWrite,
  respondToStructureRejection,
  runStructureWrite,
  structureWriteContext,
  type StructureDb,
} from '../../services/wbs-structure-write.js';
import { attachAuditEventToWbsTombstone, createWbsTombstone } from '../../services/wbs-tombstones.js';
import {
  recalculateProjectWbsHierarchyStatuses,
  renumberProjectWbs,
  wbsItemSnapshotData,
} from '../../services/wbs.js';
import { wbsSnapshotSchema } from './schemas.js';

// A row and a link as the page holds them: also the goal labels and the creation time, which an undo puts back.
const itemSchema = wbsSnapshotSchema.shape.wbsItems.element.extend({
  jiraGoalLabels: z.array(z.string()).optional(),
  createdAt: z.string().trim().optional(),
});
const linkSchema = z.object({
  id: z.string().trim().min(1),
  predecessorId: z.string().trim().min(1),
  successorId: z.string().trim().min(1),
  type: z.enum(['FS', 'SS', 'FF', 'SF']),
  lagDays: z.coerce.number().int(),
  createdAt: z.string().trim().optional(),
});
const ids = z.array(z.string().trim().min(1)).default([]);

/**
 * Undo or redo of one step: the rows and links to put back, those to remove,
 * and what the step left, which must still be there. The version is the one
 * the step left the project at.
 */
const revertSchema = z.object({
  baseVersion: z.string().regex(/^\d+$/),
  put: z.object({ items: z.array(itemSchema).default([]), links: z.array(linkSchema).default([]) }),
  remove: z.object({ itemIds: ids, linkIds: ids }),
  expect: z.object({
    items: z.array(itemSchema).default([]),
    absentItemIds: ids,
    links: z.array(linkSchema).default([]),
    absentLinkIds: ids,
  }),
});

type ItemInput = z.infer<typeof itemSchema>;
type LinkInput = z.infer<typeof linkSchema>;

/**
 * A row reduced to what a person or the plan sets: no write times, no closing
 * time the status count stamps. Money is compared as exact text, goal labels
 * only when the page sent them.
 */
function comparableItem(projectId: string, row: ItemInput | Record<string, unknown>, withLabels: boolean) {
  const data = wbsItemSnapshotData(projectId, row as ItemInput) as Record<string, unknown>;
  delete data.closedAt;
  if (withLabels) data.jiraGoalLabels = (row as { jiraGoalLabels?: string[] }).jiraGoalLabels ?? [];
  return JSON.stringify(Object.keys(data).sort().map((key) => {
    const value = data[key];
    if (value === undefined || value === null) return [key, null];
    if (value instanceof Date) return [key, value.toISOString()];
    if (key === 'plannedCost' || key === 'forecastCost') return [key, String(value)];
    return [key, value];
  }));
}

function comparableLink(link: Pick<LinkInput, 'predecessorId' | 'successorId' | 'type' | 'lagDays'>) {
  return `${link.predecessorId}>${link.successorId}:${link.type}:${link.lagDays}`;
}

/** The rows and links of the step that are not as it left them: the codes a person sees. */
async function conflictsWithStep(
  db: StructureDb,
  projectId: string,
  expected: { items: ItemInput[]; absentItemIds: string[]; links: LinkInput[]; absentLinkIds: string[] },
) {
  const itemIds = [...expected.items.map((item) => item.id), ...expected.absentItemIds];
  const linkIds = [...expected.links.map((link) => link.id), ...expected.absentLinkIds];
  const [items, links] = await Promise.all([
    db.wbsItem.findMany({ where: { id: { in: itemIds } } }),
    db.wbsDependency.findMany({ where: { id: { in: linkIds } }, include: { successor: { select: { code: true } } } }),
  ]);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const linksById = new Map(links.map((link) => [link.id, link]));
  const codes = new Set<string>();
  for (const item of expected.items) {
    const current = itemsById.get(item.id);
    const withLabels = item.jiraGoalLabels !== undefined;
    if (!current || current.projectId !== projectId || comparableItem(projectId, current, withLabels) !== comparableItem(projectId, item, withLabels)) {
      codes.add(current?.code ?? item.code);
    }
  }
  for (const id of expected.absentItemIds) {
    const current = itemsById.get(id);
    if (current) codes.add(current.code);
  }
  for (const link of expected.links) {
    const current = linksById.get(link.id);
    if (!current || current.projectId !== projectId || comparableLink(current) !== comparableLink(link)) {
      codes.add(current?.successor.code ?? link.successorId);
    }
  }
  for (const id of expected.absentLinkIds) {
    const current = linksById.get(id);
    if (current) codes.add(current.successor.code);
  }
  return [...codes].sort();
}

function rejectConflict(codes: string[]): never {
  rejectStructureWrite(409, codes.length > 0
    ? `Отменить нельзя: эти строки уже изменили: ${codes.join(', ')}`
    : 'Отменить нельзя: Структура уже изменилась', { code: 'UNDO_CONFLICT', codes });
}

/** Rows of the step that cannot be removed without losing what others hang on them. */
async function removalBlockers(db: StructureDb, projectId: string, removeIds: string[], removeLinkIds: string[], put: ItemInput[]) {
  if (removeIds.length === 0) return [];
  const removed = new Set(removeIds);
  const removedLinks = new Set(removeLinkIds);
  const movedAway = new Map(put.map((item) => [item.id, item.parentId || null]));
  const [children, issues, raci, checkIns, links] = await Promise.all([
    db.wbsItem.findMany({ where: { projectId, parentId: { in: removeIds } }, select: { id: true, code: true, parentId: true } }),
    db.issue.findMany({ where: { OR: [{ phaseId: { in: removeIds } }, { workPackageId: { in: removeIds } }] }, select: { phaseId: true, workPackageId: true } }),
    db.raciAssignment.findMany({ where: { wbsItemId: { in: removeIds } }, select: { wbsItemId: true } }),
    db.workCheckIn.findMany({ where: { wbsItemId: { in: removeIds } }, select: { wbsItemId: true } }),
    db.wbsDependency.findMany({ where: { OR: [{ predecessorId: { in: removeIds } }, { successorId: { in: removeIds } }] }, select: { id: true, predecessorId: true, successorId: true } }),
  ]);
  const blocked = new Set<string>();
  for (const child of children) {
    const stays = !removed.has(child.id) && (!movedAway.has(child.id) || movedAway.get(child.id) === child.parentId);
    if (stays) blocked.add(child.parentId!);
  }
  for (const issue of issues) [issue.phaseId, issue.workPackageId].forEach((id) => id && removed.has(id) && blocked.add(id));
  for (const row of [...raci, ...checkIns]) blocked.add(row.wbsItemId);
  // A link someone added to the row since is not the step's to remove.
  for (const link of links) {
    if (removedLinks.has(link.id)) continue;
    if (removed.has(link.predecessorId)) blocked.add(link.predecessorId);
    if (removed.has(link.successorId)) blocked.add(link.successorId);
  }
  const rows = await db.wbsItem.findMany({ where: { id: { in: [...blocked] } }, select: { code: true } });
  return rows.map((row) => row.code).sort();
}

/** Writes the rows of the step as they were; a row of another project is refused by the row count. */
async function putItems(db: StructureDb, projectId: string, items: ItemInput[]) {
  if (items.length === 0) return;
  const withLabels = items.every((item) => item.jiraGoalLabels !== undefined);
  const rows = items.map((item) => ({
    ...wbsItemSnapshotData(projectId, item),
    ...(withLabels ? { jiraGoalLabels: item.jiraGoalLabels ?? [] } : {}),
  }));
  const createdAtById = new Map(items.map((item) => [item.id, item.createdAt ? new Date(item.createdAt).toISOString().slice(0, 23) : null]));
  const existing = await db.wbsItem.findMany({ where: { id: { in: rows.map((row) => row.id) } }, select: { id: true, code: true } });
  const codeById = new Map(existing.map((row) => [row.id, row.code]));
  // A row whose code changes gives it up first, so codes can be put back in any order.
  await bulkUpdateWbsItems(db, projectId, rows.filter((row) => codeById.has(row.id) && codeById.get(row.id) !== row.code).map((row) => ({ id: row.id, code: `__revert_${row.id}` })), ['code']);
  const columns = Object.keys(rows[0]!) as Array<keyof (typeof rows)[number]>;
  const names = columns.map((column) => `"${column}"`).join(', ');
  const picked = columns.map((column) => `r."${column}"`).join(', ');
  const updates = columns.filter((column) => column !== 'id' && column !== 'projectId').map((column) => `"${column}" = EXCLUDED."${column}"`).join(', ');
  const at = utcTimestamp();
  // A row that comes back keeps its creation time, which orders rows of one position.
  const written = await db.$executeRaw`
    INSERT INTO "WbsItem" (${Prisma.raw(names)}, "createdAt", "updatedAt")
    SELECT ${Prisma.raw(picked)}, COALESCE(r."createdAt", ${at}), ${at}
    FROM jsonb_populate_recordset(NULL::"WbsItem", ${JSON.stringify(rows.map((row) => ({ ...row, parentId: null, createdAt: createdAtById.get(row.id) })))}::jsonb) AS r
    ON CONFLICT ("id") DO UPDATE SET ${Prisma.raw(updates)}, "updatedAt" = ${at}
    WHERE "WbsItem"."projectId" = EXCLUDED."projectId"`;
  if (written !== rows.length) rejectConflict([]);
  await bulkUpdateWbsItems(db, projectId, rows.filter((row) => row.parentId).map((row) => ({ id: row.id, parentId: row.parentId })), ['parentId']);
}

/**
 * Puts the step's links back. A link id of another project, an end that is
 * not a row of this project, or a pair already linked under another id is a
 * conflict; the graph must stay without cycles.
 */
async function putLinks(db: StructureDb, projectId: string, links: LinkInput[]) {
  if (links.length === 0) return;
  const ends = [...new Set(links.flatMap((link) => [link.predecessorId, link.successorId]))];
  const [existing, rows, pairs] = await Promise.all([
    db.wbsDependency.findMany({ where: { id: { in: links.map((link) => link.id) } }, select: { id: true, projectId: true } }),
    db.wbsItem.findMany({ where: { projectId, id: { in: ends } }, select: { id: true } }),
    db.wbsDependency.findMany({
      where: { projectId, OR: links.map((link) => ({ predecessorId: link.predecessorId, successorId: link.successorId, type: link.type })) },
      select: { id: true, predecessorId: true, successorId: true, type: true },
    }),
  ]);
  const present = new Set(rows.map((row) => row.id));
  if (existing.some((link) => link.projectId !== projectId)) rejectConflict([]);
  if (ends.some((id) => !present.has(id))) rejectConflict([]);
  const ids = new Set(links.map((link) => link.id));
  if (pairs.some((pair) => !ids.has(pair.id))) rejectConflict([]);
  for (const link of links) {
    await db.wbsDependency.upsert({
      where: { id: link.id },
      create: {
        id: link.id, projectId, predecessorId: link.predecessorId, successorId: link.successorId, type: link.type, lagDays: link.lagDays,
        // The creation time orders links; one that comes back keeps its own.
        createdAt: link.createdAt ? new Date(link.createdAt) : new Date(),
      },
      update: { predecessorId: link.predecessorId, successorId: link.successorId, type: link.type, lagDays: link.lagDays },
    });
  }
  const graph = await db.wbsDependency.findMany({ where: { projectId }, select: { predecessorId: true, successorId: true } });
  if (hasCycle(graph)) rejectConflict([]);
}

function hasCycle(links: Array<{ predecessorId: string; successorId: string }>) {
  const next = new Map<string, string[]>();
  for (const link of links) next.set(link.predecessorId, [...(next.get(link.predecessorId) ?? []), link.successorId]);
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 2) return false;
    if (state.get(id) === 1) return true;
    state.set(id, 1);
    for (const successor of next.get(id) ?? []) if (visit(successor)) return true;
    state.set(id, 2);
    return false;
  };
  return [...next.keys()].some((id) => visit(id));
}

/** A tombstone whose every row is back is marked restored, so it cannot be restored a second time. */
async function settleTombstones(db: StructureDb, projectId: string) {
  const open = await db.wbsTombstone.findMany({ where: { projectId, restoredAt: null }, select: { id: true, itemIds: true } });
  const present = new Set((await db.wbsItem.findMany({ where: { projectId }, select: { id: true } })).map((row) => row.id));
  const restoredAt = new Date();
  for (const tombstone of open) {
    const itemIds = Array.isArray(tombstone.itemIds) ? tombstone.itemIds.map(String) : [];
    if (itemIds.length > 0 && itemIds.every((id) => present.has(id))) {
      await db.wbsTombstone.update({ where: { id: tombstone.id }, data: { restoredAt } });
    }
  }
}

async function writtenIds(db: StructureDb, projectId: string) {
  const [items, links] = await Promise.all([
    db.$queryRaw<Array<{ id: string }>>`SELECT id FROM "WbsItem" WHERE "projectId" = ${projectId} AND xmin::text = (txid_current() % 4294967296)::text`,
    db.$queryRaw<Array<{ id: string }>>`SELECT id FROM "WbsDependency" WHERE "projectId" = ${projectId} AND xmin::text = (txid_current() % 4294967296)::text`,
  ]);
  return { items: items.map((row) => row.id), links: links.map((row) => row.id) };
}

export function registerWbsRevertRoutes(router: Router) {
  router.post('/projects/:projectId/wbs-snapshot/revert', async (req, res) => {
    const parsed = revertSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { baseVersion, put, remove, expect } = parsed.data;
    const projectId = req.params.projectId;
    const actor = currentUser(req);
    try {
      const change = await runStructureWrite(projectId, async (db) => {
        const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
        if (!project) rejectStructureWrite(404, 'Проект не найден');

        // What the step left must still be there, whatever version the page believes the project is at.
        const conflicts = await conflictsWithStep(db, projectId, expect);
        if (conflicts.length > 0) rejectConflict(conflicts);
        const blockers = await removalBlockers(db, projectId, remove.itemIds, remove.linkIds, put.items);
        if (blockers.length > 0) rejectConflict(blockers);
        // Nobody wrote since the step: putting its rows back restores the plan as it was, recalculation included.
        const untouched = structureWriteContext(db, projectId)!.baseVersion === BigInt(baseVersion);

        // Rows the step removes go to a tombstone with every link they had, read before any link is removed,
        // so an administrator restoring it gets the links back too.
        if (remove.itemIds.length > 0) {
          const removedItems = await db.wbsItem.findMany({ where: { projectId, id: { in: remove.itemIds } } });
          const removedLinks = await db.wbsDependency.findMany({
            where: { projectId, OR: [{ predecessorId: { in: remove.itemIds } }, { successorId: { in: remove.itemIds } }] },
          });
          const tombstone = await createWbsTombstone({ projectId, deletedById: actor?.id ?? null, items: removedItems, dependencies: removedLinks }, db);
          const auditEvent = await recordAuditEvent({
            req, actor, action: 'wbs_item.delete', objectType: 'WbsItem', projectId,
            beforeValue: removedItems.map((item) => ({ id: item.id, code: item.code, title: item.title })),
            metadata: { action: 'revert-change', itemIds: remove.itemIds, tombstoneId: tombstone.id, tombstoneExpiresAt: tombstone.expiresAt },
          }, db);
          if (auditEvent) await attachAuditEventToWbsTombstone(tombstone.id, auditEvent.id, db);
        }
        if (remove.linkIds.length > 0) {
          await db.wbsDependency.deleteMany({ where: { projectId, id: { in: remove.linkIds } } });
        }
        if (remove.itemIds.length > 0) {
          // Every link of these rows is in the step (checked above), so none is left to cascade.
          await db.wbsItem.deleteMany({ where: { projectId, id: { in: remove.itemIds } } });
        }
        await putItems(db, projectId, put.items);
        await putLinks(db, projectId, put.links);
        await settleTombstones(db, projectId);

        if (!untouched) {
          // Someone wrote since: the plan is recalculated around the rows put back, whose dates lead.
          await renumberProjectWbs(projectId, db);
          await recalculateProjectWbsSchedule(projectId, {
            changedItems: put.items.map((item) => ({ itemId: item.id, changedFields: ['startDate', 'dueDate'] })),
          }, db);
          await recalculateProjectWbsHierarchyStatuses(projectId, db);
          // The recalculation may neither reach outside the step nor move what it put back.
          const stepItems = new Set([...put.items.map((item) => item.id), ...remove.itemIds, ...expect.items.map((item) => item.id), ...expect.absentItemIds]);
          const stepLinks = new Set([...put.links.map((link) => link.id), ...remove.linkIds, ...expect.links.map((link) => link.id), ...expect.absentLinkIds]);
          const written = await writtenIds(db, projectId);
          const outside = written.items.filter((id) => !stepItems.has(id)).length + written.links.filter((id) => !stepLinks.has(id)).length;
          const moved = await conflictsWithStep(db, projectId, { items: put.items, absentItemIds: remove.itemIds, links: put.links, absentLinkIds: remove.linkIds });
          if (outside > 0 || moved.length > 0) rejectConflict(moved);
        }

        const change = await finishStructureChange(db, projectId, req);
        await recordWbsCommand({
          projectId,
          userId: actor?.id,
          type: 'RESTORE',
          payload: {
            action: 'revert-change',
            recalculated: !untouched,
            putItemCount: put.items.length,
            removedItemCount: remove.itemIds.length,
            ...structureCommandSnapshot(change),
          },
        }, db);
        return { change, recalculated: !untouched };
      });
      // Whether the plan was recalculated: when it was not, the page knows the project stands exactly where the step began.
      res.json({ ...structureResponse(change.change), recalculated: change.recalculated });
    } catch (error) {
      if (respondToStructureRejection(res, error)) return;
      throw error;
    }
  });
}
