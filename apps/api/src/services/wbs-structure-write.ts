import { Prisma, type PrismaClient } from '@prisma/client';
import type { Response } from 'express';
import { buildRenumberPlan, findFamilyLinks, type FamilyLink, type FamilyLinkItem } from '@pms/shared';
import { prisma } from '../db.js';
import {
  commitStructureMutation,
  confirmStructureMutationCommit,
  forgetStructureMutationCommit,
  noteStructureMutationProject,
} from './structure-mutations.js';

/** The client a Structure write runs on: the transaction that holds the project's lock. */
export type StructureDb = Prisma.TransactionClient;

/** A project of 5000 rows recalculates in a few seconds; the limit leaves room without hanging forever. */
export const STRUCTURE_WRITE_TIMEOUT_MS = 60_000;

/**
 * A refusal decided inside a Structure write (a missing row, a linked issue, a
 * stale version): the transaction rolls back and the route answers with it.
 */
export class StructureWriteRejection extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(typeof body.error === 'string' ? body.error : 'Structure write rejected');
  }
}

export function rejectStructureWrite(status: number, error: unknown, extra: Record<string, unknown> = {}): never {
  throw new StructureWriteRejection(status, { error, ...extra });
}

/** What a transaction knows about each project it locked: versions, its commands and the ids it started from. */
export type StructureWriteContext = {
  projectId: string;
  baseVersion: bigint;
  nextVersion: bigint;
  commandOrdinal: number;
  itemIdsBefore: Set<string>;
  dependencyIdsBefore: Set<string>;
  /** Links between a row and its own ancestor or descendant the project already had, in the hierarchy as it stood and as renumbering would make it: only new ones are refused. */
  familyLinksBefore: FamilyKeys;
};

/** What the lock and the journal read of rows and links: their ids, and what tells a link inside a row's own family. */
const FAMILY_ITEM_COLUMNS = {
  id: true, code: true, title: true, parentId: true, wbsLevel: true, sortOrder: true, createdAt: true,
  predecessor1: true, predecessor2: true, predecessor3: true, predecessor4: true, predecessor5: true, predecessor6: true,
} as const;
const FAMILY_LINK_COLUMNS = { id: true, predecessorId: true, successorId: true } as const;

type FamilyRow = FamilyLinkItem & { wbsLevel: number | null; sortOrder: number; createdAt: Date };

/**
 * The links inside a row's own family: in the hierarchy as it stands, and in
 * the one renumbering will make of the rows' levels and order (a row given a
 * deeper level is renumbered under the row above it in the next request).
 */
function familyLinksOf(items: FamilyRow[], dependencies: FamilyLink[]) {
  const byCode = new Map(items.map((item) => [item.code, item.id]));
  const fields = items.flatMap((item) =>
    [item.predecessor1, item.predecessor2, item.predecessor3, item.predecessor4, item.predecessor5, item.predecessor6]
      .map((code) => (code ? byCode.get(code.trim()) : undefined))
      .filter((id): id is string => Boolean(id))
      .map((predecessorId) => ({ predecessorId, successorId: item.id })),
  );
  const ordered = [...items].sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.getTime() - right.createdAt.getTime() || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const planned = buildRenumberPlan(ordered).normalizedRows.map((row) => ({ id: row.id, code: row.code, parentId: row.parentId }));
  return { actual: findFamilyLinks(items, dependencies), planned: findFamilyLinks(planned, [...dependencies, ...fields]) };
}

type FamilyKeys = { actual: Set<string>; planned: Set<string> };
const keyOf = (link: FamilyLink) => `${link.predecessorId}:${link.successorId}`;

function familyKeys(items: FamilyRow[], links: FamilyLink[]): FamilyKeys {
  const found = familyLinksOf(items, links);
  return { actual: new Set(found.actual.map(keyOf)), planned: new Set(found.planned.map(keyOf)) };
}

const contexts = new WeakMap<object, Map<string, StructureWriteContext>>();

export function structureWriteContext(db: StructureDb, projectId: string) {
  return contexts.get(db)?.get(projectId);
}

/**
 * One lock for every writer of a project's Structure: the advisory key the
 * append, import and draft paths already took, plus the project row. Under
 * it the write learns the version it will produce and the rows it starts
 * from. Locking a project twice in one transaction is harmless.
 */
export async function lockProjectStructure(db: StructureDb, projectId: string) {
  const known = structureWriteContext(db, projectId);
  if (known) return known;
  // A mutation sent with an id writes one project: a second one breaks its contract before anything is read.
  noteStructureMutationProject(projectId);
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wbs:${projectId}`}))`;
  await db.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
  const [version, items, dependencies] = await Promise.all([
    db.projectStructureVersion.findUnique({ where: { projectId }, select: { version: true } }),
    db.wbsItem.findMany({ where: { projectId }, select: FAMILY_ITEM_COLUMNS }),
    db.wbsDependency.findMany({ where: { projectId }, select: FAMILY_LINK_COLUMNS }),
  ]);
  const baseVersion = version?.version ?? 0n;
  const context: StructureWriteContext = {
    projectId,
    baseVersion,
    nextVersion: baseVersion + 1n,
    commandOrdinal: 0,
    itemIdsBefore: new Set(items.map((item) => item.id)),
    dependencyIdsBefore: new Set(dependencies.map((dependency) => dependency.id)),
    familyLinksBefore: familyKeys(items, dependencies),
  };
  const byProject = contexts.get(db) ?? new Map<string, StructureWriteContext>();
  byProject.set(projectId, context);
  contexts.set(db, byProject);
  return context;
}

/** The version and place of the next command a write records; empty outside a Structure transaction. */
export function nextCommandStamp(db: unknown, projectId: string) {
  const context = contexts.get(db as object)?.get(projectId);
  if (!context) return { structureVersion: null, commandOrdinal: null };
  const commandOrdinal = context.commandOrdinal;
  context.commandOrdinal += 1;
  return { structureVersion: context.nextVersion, commandOrdinal };
}

/**
 * A row cannot wait for its own ancestor or descendant: a write that leaves
 * such a link the project did not have (a link, a predecessor code, a row
 * moved under the row it is linked with) is refused whole. Links the project
 * already had stay; the schedule does not count them.
 */
function refuseNewFamilyLinks(context: StructureWriteContext, items: FamilyRow[], dependencies: FamilyLink[]) {
  // Each hierarchy against itself: a pair only foreseen before must not become a real one unnoticed.
  const found = familyLinksOf(items, dependencies);
  const addedKeys = new Map<string, FamilyLink>();
  for (const link of found.actual) if (!context.familyLinksBefore.actual.has(keyOf(link))) addedKeys.set(keyOf(link), link);
  for (const link of found.planned) if (!context.familyLinksBefore.planned.has(keyOf(link))) addedKeys.set(keyOf(link), link);
  const added = [...addedKeys.values()];
  if (added.length === 0) return;
  const byId = new Map(items.map((item) => [item.id, item]));
  const name = (id: string) => `«${byId.get(id)?.code ?? ''} ${byId.get(id)?.title ?? ''}»`.replace(' »', '»');
  const [first] = added;
  rejectStructureWrite(
    409,
    `Строка ${name(first!.successorId)} не может зависеть от ${name(first!.predecessorId)}: связь строки с её родительской или дочерней строкой недопустима`,
    { code: 'FAMILY_LINK', links: added },
  );
}

/**
 * Notes the write in the project's change journal: its version, and every row
 * and link it wrote (whatever path wrote them: a row written by this
 * transaction carries its id in xmin) or deleted. A reader of the changes
 * takes their state as it is then.
 */
async function journalStructureWrite(db: StructureDb, context: StructureWriteContext) {
  const { projectId, nextVersion } = context;
  const [items, dependencies] = await Promise.all([
    db.wbsItem.findMany({ where: { projectId }, select: FAMILY_ITEM_COLUMNS }),
    db.wbsDependency.findMany({ where: { projectId }, select: FAMILY_LINK_COLUMNS }),
  ]);
  refuseNewFamilyLinks(context, items, dependencies);
  const itemsNow = new Set(items.map((row) => row.id));
  const dependenciesNow = new Set(dependencies.map((row) => row.id));
  const deletedItems = [...context.itemIdsBefore].filter((id) => !itemsNow.has(id));
  const deletedDependencies = [...context.dependencyIdsBefore].filter((id) => !dependenciesNow.has(id));
  await db.$executeRaw`INSERT INTO "ProjectStructureCommit" ("projectId", "version") VALUES (${projectId}, ${nextVersion})`;
  const changeCount = await db.$executeRaw`
    INSERT INTO "ProjectStructureChange" ("projectId", "version", "entityType", "entityId")
    SELECT ${projectId}, ${nextVersion}, 'ITEM', id FROM "WbsItem" WHERE "projectId" = ${projectId} AND xmin::text = (txid_current() % 4294967296)::text
    UNION SELECT ${projectId}, ${nextVersion}, 'LINK', id FROM "WbsDependency" WHERE "projectId" = ${projectId} AND xmin::text = (txid_current() % 4294967296)::text
    UNION SELECT ${projectId}, ${nextVersion}, 'ITEM', unnest(${deletedItems}::text[])
    UNION SELECT ${projectId}, ${nextVersion}, 'LINK', unnest(${deletedDependencies}::text[])`;
  await db.$executeRaw`UPDATE "ProjectStructureCommit" SET "changeCount" = ${changeCount} WHERE "projectId" = ${projectId} AND "version" = ${nextVersion}`;
}

/** Moves the version of every project the transaction locked and journals the write: exactly once each, at its end. */
async function finishStructureWrites(db: StructureDb) {
  const locked = [...(contexts.get(db)?.values() ?? [])].sort((left, right) => left.projectId.localeCompare(right.projectId));
  for (const context of locked) {
    await journalStructureWrite(db, context);
    await db.projectStructureVersion.upsert({
      where: { projectId: context.projectId },
      create: { projectId: context.projectId, version: context.nextVersion },
      update: { version: context.nextVersion },
    });
  }
  // The receipt of the request's mutation commits with the write it describes.
  await commitStructureMutation(db, locked.map((context) => context.projectId), (projectId) => locked.find((context) => context.projectId === projectId)!.nextVersion);
}

/**
 * A transaction for Structure writers: whatever projects it locks with
 * lockProjectStructure get their version moved when the work is done.
 */
export function structureTransaction<T>(
  work: (db: StructureDb) => Promise<T>,
  options: { isolationLevel?: Prisma.TransactionIsolationLevel; client?: Pick<PrismaClient, '$transaction'>; timeout?: number } = {},
) {
  return (options.client ?? prisma).$transaction(
    async (db) => {
      const result = await work(db);
      await finishStructureWrites(db);
      return result;
    },
    { timeout: options.timeout ?? STRUCTURE_WRITE_TIMEOUT_MS, maxWait: 10_000, isolationLevel: options.isolationLevel },
  ).then(
    (result) => {
      confirmStructureMutationCommit();
      return result;
    },
    (error: unknown) => {
      forgetStructureMutationCommit();
      throw error;
    },
  );
}

/**
 * Runs a Structure change and its recalculation as one transaction under the
 * project's lock: either the row, its codes, dates, statuses and journal all
 * change, or nothing does. Reads that decide the change belong inside `work`.
 */
export function runStructureWrite<T>(
  projectId: string,
  work: (db: StructureDb) => Promise<T>,
  options: { isolationLevel?: Prisma.TransactionIsolationLevel } = {},
) {
  return structureTransaction(async (db) => {
    await lockProjectStructure(db, projectId);
    return work(db);
  }, options);
}

/**
 * The same, for a write addressed by a row or a link: the project is found in
 * the transaction and locked before anything else is read. `resolve` answers
 * the project id or refuses (a missing row).
 */
export function runStructureWriteFor<T>(
  resolve: (db: StructureDb) => Promise<string>,
  work: (db: StructureDb, projectId: string) => Promise<T>,
) {
  return structureTransaction(async (db) => {
    const projectId = await resolve(db);
    await lockProjectStructure(db, projectId);
    return work(db, projectId);
  });
}

/**
 * The project's Structure version as text, for answers that carry the whole
 * Structure. Read it before the rows: a version older than the rows only
 * makes the browser reload once, a newer one would let it miss a change.
 */
export async function readStructureVersion(projectId: string, db: Pick<StructureDb, 'projectStructureVersion'> = prisma) {
  const row = await db.projectStructureVersion.findUnique({ where: { projectId }, select: { version: true } });
  return (row?.version ?? 0n).toString();
}

/** Answers a rejected Structure write; anything else is left to the caller. */
export function respondToStructureRejection(res: Response, error: unknown) {
  if (!(error instanceof StructureWriteRejection)) return false;
  res.status(error.status).json(error.body);
  return true;
}
