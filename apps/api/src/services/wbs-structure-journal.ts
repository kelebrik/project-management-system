import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { pruneStructureMutationReceipts } from './structure-mutations.js';

/** How long the journal keeps changes; a browser that last looked earlier reads the Structure whole. */
export const STRUCTURE_JOURNAL_RETENTION_DAYS = 30;
/** Past this many journaled changes since a version, reading the Structure whole is cheaper than picking the changes out. */
export const STRUCTURE_CHANGES_READ_LIMIT = 5_000;

const VERSION = /^\d{1,19}$/;
const LINK_INCLUDE = {
  predecessor: { select: { id: true, code: true, title: true } },
  successor: { select: { id: true, code: true, title: true } },
} satisfies Prisma.WbsDependencyInclude;

/**
 * The project's Structure as a browser holding it at `since` needs it: the
 * rows and links changed after that version as they are now, the ids of the
 * ones gone, or the whole Structure when the journal cannot say (no version,
 * one older than the journal reaches, one it never gave, or a version the
 * journal has no record of). The calendar and the server's day come either
 * way; the critical path is the browser's to work out. Everything is read
 * from one snapshot of the database.
 */
export async function readStructureChanges(projectId: string, since: string | undefined, db: typeof prisma = prisma) {
  return db.$transaction(async (tx) => {
    // A project gone before this snapshot is not found, rather than read as an empty Structure.
    if (!(await tx.project.findUnique({ where: { id: projectId }, select: { id: true } }))) return null;
    const state = await tx.projectStructureVersion.findUnique({ where: { projectId }, select: { version: true, journalFloor: true } });
    const version = state?.version ?? 0n;
    const journalFloor = state?.journalFloor ?? 0n;
    const calendarOverrides = await tx.projectCalendarOverride.findMany({ where: { projectId }, orderBy: [{ calendarCode: 'asc' }, { date: 'asc' }] });
    const common = { projectId, version: version.toString(), journalFloor: journalFloor.toString(), today: new Date().toISOString().slice(0, 10), calendarOverrides };
    const base = since !== undefined && VERSION.test(since) ? BigInt(since) : null;
    // Every version after `since` must be in the journal (a write of a server that did not keep it leaves a gap), and not too many changes.
    const window = base !== null && base >= journalFloor && base <= version
      ? await tx.projectStructureCommit.aggregate({ where: { projectId, version: { gt: base, lte: version } }, _count: { _all: true }, _sum: { changeCount: true } })
      : null;
    const answerable = window !== null && BigInt(window._count._all) === version - base! && (window._sum.changeCount ?? 0) <= STRUCTURE_CHANGES_READ_LIMIT;
    if (!answerable) {
      const [items, dependencies] = await Promise.all([
        tx.wbsItem.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
        tx.wbsDependency.findMany({ where: { projectId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: LINK_INCLUDE }),
      ]);
      return { ...common, full: true as const, baseVersion: null, items, dependencies, deletedItemIds: [] as string[], deletedDependencyIds: [] as string[] };
    }
    // Each row or link once, however many writes touched it: a long gap reads no more than the Structure.
    const changes = await tx.$queryRaw<Array<{ entityType: string; entityId: string }>>`
      SELECT DISTINCT "entityType", "entityId" FROM "ProjectStructureChange"
      WHERE "projectId" = ${projectId} AND "version" > ${base!} AND "version" <= ${version}`;
    const itemIds = changes.filter((change) => change.entityType === 'ITEM').map((change) => change.entityId);
    const linkIds = changes.filter((change) => change.entityType === 'LINK').map((change) => change.entityId);
    const [items, dependencies] = await Promise.all([
      tx.wbsItem.findMany({ where: { projectId, id: { in: itemIds } }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
      // A link shows its ends' codes and titles: a changed row brings its links along.
      tx.wbsDependency.findMany({
        where: { projectId, OR: [{ id: { in: linkIds } }, { predecessorId: { in: itemIds } }, { successorId: { in: itemIds } }] },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: LINK_INCLUDE,
      }),
    ]);
    const itemsNow = new Set(items.map((item) => item.id));
    const linksNow = new Set(dependencies.map((link) => link.id));
    return {
      ...common,
      full: false as const,
      baseVersion: base!.toString(),
      items,
      dependencies,
      deletedItemIds: itemIds.filter((id) => !itemsNow.has(id)),
      deletedDependencyIds: linkIds.filter((id) => !linksNow.has(id)),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60_000, maxWait: 10_000 });
}

export type StructureChanges = NonNullable<Awaited<ReturnType<typeof readStructureChanges>>>;

/**
 * Forgets the journal older than the retention, from its start: everything
 * up to the last version before the first one still kept, so the journal
 * stays whole from its new floor. The Structure itself does not change, so
 * its version stays; the project's writers are held off meanwhile.
 */
export async function pruneStructureJournal(projectId: string, now = new Date(), db: typeof prisma = prisma) {
  const cutoff = new Date(now.getTime() - STRUCTURE_JOURNAL_RETENTION_DAYS * 86_400_000);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wbs:${projectId}`}))`;
    const state = await tx.projectStructureVersion.findUnique({ where: { projectId }, select: { version: true, journalFloor: true } });
    if (!state) return null;
    const kept = await tx.projectStructureCommit.findFirst({ where: { projectId, createdAt: { gte: cutoff } }, orderBy: { version: 'asc' }, select: { version: true } });
    // Commits are not stamped in version order exactly; the floor stops before the first one still kept.
    const floor = kept ? kept.version - 1n : state.version;
    if (floor <= state.journalFloor) return state.journalFloor;
    await tx.projectStructureCommit.deleteMany({ where: { projectId, version: { lte: floor } } });
    await tx.projectStructureVersion.update({ where: { projectId }, data: { journalFloor: floor } });
    return floor;
  }, { timeout: 60_000, maxWait: 10_000 });
}

const PRUNE_INTERVAL_MS = 6 * 60 * 60_000;

/** Forgets old journal entries of every project now and then; a failure is logged and tried again next time. */
export function startStructureJournalPrune(client: typeof prisma = prisma, log: (message: string, projectId: string) => void = () => undefined) {
  const run = async () => {
    const projects = await client.projectStructureVersion.findMany({ select: { projectId: true } });
    for (const { projectId } of projects) {
      await pruneStructureJournal(projectId, new Date(), client).catch((error) => log(error instanceof Error ? error.message : String(error), projectId));
    }
    // Receipts of repeated writes live as long as the journal a repeat would catch up through.
    await pruneStructureMutationReceipts(new Date(), STRUCTURE_JOURNAL_RETENTION_DAYS, client).catch((error) => log(error instanceof Error ? error.message : String(error), ''));
  };
  const first = setTimeout(() => void run().catch(() => undefined), 5 * 60_000);
  first.unref();
  const interval = setInterval(() => void run().catch(() => undefined), PRUNE_INTERVAL_MS);
  interval.unref();
  return () => {
    clearTimeout(first);
    clearInterval(interval);
  };
}
