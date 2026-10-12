import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { prisma } from '../db.js';

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

/**
 * One lock for every writer of a project's Structure: the advisory key the
 * append, import and draft paths already take, plus the project row itself.
 */
export async function lockProjectStructure(db: StructureDb, projectId: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wbs:${projectId}`}))`;
  await db.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
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
  return prisma.$transaction(
    async (db) => {
      await lockProjectStructure(db, projectId);
      return work(db);
    },
    { timeout: STRUCTURE_WRITE_TIMEOUT_MS, maxWait: 10_000, isolationLevel: options.isolationLevel },
  );
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
  return prisma.$transaction(
    async (db) => {
      const projectId = await resolve(db);
      await lockProjectStructure(db, projectId);
      return work(db, projectId);
    },
    { timeout: STRUCTURE_WRITE_TIMEOUT_MS, maxWait: 10_000 },
  );
}

/** Answers a rejected Structure write; anything else is left to the caller. */
export function respondToStructureRejection(res: Response, error: unknown) {
  if (!(error instanceof StructureWriteRejection)) return false;
  res.status(error.status).json(error.body);
  return true;
}
