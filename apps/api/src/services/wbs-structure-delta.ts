import type { NextFunction, Request, Response } from 'express';
import { calculateProjectCriticalPath } from './wbs-critical-path.js';
import { getProjectWbsSnapshot } from './wbs.js';
import { structureWriteContext, type StructureDb } from './wbs-structure-write.js';

async function idsWrittenHere(db: StructureDb, table: 'WbsItem' | 'WbsDependency', projectId: string) {
  // A row version written by this transaction carries its id in xmin: whatever
  // path wrote it (a bulk statement, a cascade, an upsert), it is found here.
  const rows = table === 'WbsItem'
    ? await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM "WbsItem" WHERE "projectId" = ${projectId} AND xmin::text = (txid_current() % 4294967296)::text`
    : await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM "WbsDependency" WHERE "projectId" = ${projectId} AND xmin::text = (txid_current() % 4294967296)::text`;
  return rows.map((row) => row.id);
}

/**
 * What this transaction changed in the project's Structure, from the version
 * it started at to the one it produces: the rows and links it wrote (and the
 * links whose ends were renumbered), what it deleted, and the critical path.
 */
export async function readStructureDelta(db: StructureDb, projectId: string) {
  const context = structureWriteContext(db, projectId);
  if (!context) throw new Error('A Structure change is read only inside a Structure write');
  const [writtenItemIds, writtenDependencyIds, itemIds, dependencyIds] = await Promise.all([
    idsWrittenHere(db, 'WbsItem', projectId),
    idsWrittenHere(db, 'WbsDependency', projectId),
    db.wbsItem.findMany({ where: { projectId }, select: { id: true } }),
    db.wbsDependency.findMany({ where: { projectId }, select: { id: true } }),
  ]);
  const currentItemIds = new Set(itemIds.map((row) => row.id));
  const currentDependencyIds = new Set(dependencyIds.map((row) => row.id));
  const [items, dependencies, criticalPath] = await Promise.all([
    db.wbsItem.findMany({ where: { id: { in: writtenItemIds } }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
    db.wbsDependency.findMany({
      where: {
        projectId,
        OR: [
          { id: { in: writtenDependencyIds } },
          { predecessorId: { in: writtenItemIds } },
          { successorId: { in: writtenItemIds } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        predecessor: { select: { id: true, code: true, title: true } },
        successor: { select: { id: true, code: true, title: true } },
      },
    }),
    calculateProjectCriticalPath(projectId, db),
  ]);
  return {
    projectId,
    baseVersion: context.baseVersion.toString(),
    version: context.nextVersion.toString(),
    items,
    deletedItemIds: [...context.itemIdsBefore].filter((id) => !currentItemIds.has(id)),
    dependencies,
    deletedDependencyIds: [...context.dependencyIdsBefore].filter((id) => !currentDependencyIds.has(id)),
    criticalPath,
  };
}

export type StructureDelta = Awaited<ReturnType<typeof readStructureDelta>>;

/** Whether the browser asked for changes only; other clients keep the whole Structure in answers. */
export function wantsStructureDelta(req: Pick<Request, 'get'>) {
  return req.get?.('x-pms-structure-delta') === '1';
}

/**
 * The end of a Structure write: its changes, and the whole Structure only for
 * a client that did not ask for changes. Read inside the transaction, after
 * every write and recalculation.
 */
export async function finishStructureChange(db: StructureDb, projectId: string, req: Pick<Request, 'get'>) {
  const delta = await readStructureDelta(db, projectId);
  const snapshot = wantsStructureDelta(req) ? null : await getProjectWbsSnapshot(projectId, db);
  return { delta, snapshot };
}

export type StructureChange = Awaited<ReturnType<typeof finishStructureChange>>;

/**
 * Marks answers that carry Structure changes, so the browser expands them
 * against its copy of the Structure before anyone reads them.
 */
export function markStructureDeltaAnswers(_req: Request, res: Response, next: NextFunction) {
  const json = res.json.bind(res);
  res.json = (body?: unknown) => {
    if (body && typeof body === 'object' && 'structureDelta' in body) res.setHeader('X-PMS-Structure', 'delta');
    return json(body);
  };
  next();
}

/** What the command journal keeps of a write: its changes, without the critical path. */
export function structureCommandSnapshot(change: StructureChange) {
  const { items, deletedItemIds, dependencies, deletedDependencyIds } = change.delta;
  return { structureDelta: { items, deletedItemIds, dependencies, deletedDependencyIds } };
}

/** The answer's Structure part: the changes, or the whole Structure; the version either way. */
export function structureResponse(change: StructureChange) {
  return change.snapshot
    ? { ...change.snapshot, structureVersion: change.delta.version }
    : { structureDelta: change.delta, structureVersion: change.delta.version };
}

/** A row as the write left it, from its changes or, when it did not change, from the database. */
export async function structureRow(db: StructureDb, change: StructureChange, itemId: string) {
  return change.delta.items.find((item) => item.id === itemId)
    ?? change.snapshot?.wbsItems.find((item) => item.id === itemId)
    ?? db.wbsItem.findUnique({ where: { id: itemId } });
}
