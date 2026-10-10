import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db.js';
import { historyDayEnd, historyDayKey, type ProjectHistoryPayload } from './project-history.js';

type Row = Record<string, unknown>;
export type HistoryProvenance = 'daily' | 'partial' | 'reconstructed' | 'unknown' | 'unavailable';

export type HistoryFieldChange = { field: string; then: unknown; now: unknown };
export type HistoryComparison = {
  added: Row[];
  removed: Row[];
  changed: Array<{ id: string; label: string; fields: HistoryFieldChange[] }>;
};
export type HistorySection<T> = { provenance: HistoryProvenance; note: string | null; unknown: number; data: T | null; compare: HistoryComparison | null };

export const WBS_HISTORY_FIELDS = ['parentId', 'code', 'title', 'type', 'status', 'owner', 'startDate', 'dueDate', 'forecastDueDate', 'baselineDueDate', 'progress', 'workDays'] as const;
export const RAID_HISTORY_FIELDS = ['type', 'title', 'status', 'owner', 'probability', 'impact', 'riskScore', 'dueDate', 'decisionRequired'] as const;
export const ISSUE_HISTORY_FIELDS = ['title', 'status', 'severity', 'readiness', 'owner', 'dueDate', 'category', 'decisionRequired'] as const;
export const PROJECT_HISTORY_FIELDS = ['status', 'rag', 'targetDate', 'projectManager', 'name'] as const;

function normalized(value: unknown) {
  // Dates compare as days; the rest as they are.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  return value ?? null;
}

function rowLabel(row: Row) {
  return [row.code, row.title ?? row.name].filter(Boolean).join(' ');
}

/** Rows matched by id only — a new row that reused an old code is a new row. */
export function compareRows(then: Row[], now: Row[], fields: readonly string[]): HistoryComparison {
  const thenById = new Map(then.map((row) => [String(row.id), row]));
  const nowById = new Map(now.map((row) => [String(row.id), row]));
  const changed: HistoryComparison['changed'] = [];
  for (const [id, before] of thenById) {
    const after = nowById.get(id);
    if (!after) continue;
    const differences = fields
      .filter((field) => JSON.stringify(normalized(before[field])) !== JSON.stringify(normalized(after[field])))
      .map((field) => ({ field, then: normalized(before[field]), now: normalized(after[field]) }));
    if (differences.length > 0) changed.push({ id, label: rowLabel(after), fields: differences });
  }
  return {
    added: now.filter((row) => !thenById.has(String(row.id))),
    removed: then.filter((row) => !nowById.has(String(row.id))),
    changed,
  };
}

type AuditRow = { objectId: string | null; action: string; createdAt: Date; beforeValue: unknown; afterValue: unknown };

/**
 * An object's state at the end of a day from its journal: the state after
 * its last change by then, else the state before its first change after,
 * else the current row — only when it provably did not change since
 * (updated by then). Otherwise unknown.
 */
export function stateFromJournal(
  events: AuditRow[],
  current: Row | undefined,
  end: Date,
): { state: Row | null; known: boolean } {
  const sorted = [...events].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  const before = sorted.filter((event) => event.createdAt <= end).at(-1);
  if (before) {
    if (/\.delete$/.test(before.action)) return { state: null, known: true };
    return before.afterValue && typeof before.afterValue === 'object' ? { state: before.afterValue as Row, known: true } : { state: null, known: false };
  }
  const after = sorted.find((event) => event.createdAt > end);
  if (after) {
    if (/\.create$/.test(after.action)) return { state: null, known: true };
    return after.beforeValue && typeof after.beforeValue === 'object' ? { state: after.beforeValue as Row, known: true } : { state: null, known: false };
  }
  if (!current) return { state: null, known: true };
  if (new Date(String(current.createdAt)) > end) return { state: null, known: true };
  if (new Date(String(current.updatedAt)) <= end) return { state: current, known: true };
  return { state: null, known: false };
}

function reconstructObjects(events: AuditRow[], current: Row[], end: Date) {
  const byId = new Map<string, AuditRow[]>();
  for (const event of events) {
    if (!event.objectId) continue;
    byId.set(event.objectId, [...(byId.get(event.objectId) ?? []), event]);
  }
  const currentById = new Map(current.map((row) => [String(row.id), row]));
  const ids = new Set([...byId.keys(), ...currentById.keys()]);
  const rows: Row[] = [];
  let unknown = 0;
  for (const id of ids) {
    const { state, known } = stateFromJournal(byId.get(id) ?? [], currentById.get(id), end);
    if (!known) unknown += 1;
    if (state) {
      // Status updates are never edited or deleted, so the current rows tell which existed then.
      const updates = (currentById.get(id)?.statusUpdates as Row[] | undefined) ?? [];
      rows.push({ ...state, statusUpdates: updates.filter((update) => new Date(String(update.statusAt)) <= end) });
    }
  }
  return { rows, unknown };
}

type CommandRow = { type: string; createdAt: Date; payload: unknown; afterSnapshot: unknown };

function fullSnapshotItems(snapshot: unknown): Row[] | null {
  if (snapshot && typeof snapshot === 'object' && Array.isArray((snapshot as { wbsItems?: unknown }).wbsItems)) {
    return (snapshot as { wbsItems: Row[] }).wbsItems;
  }
  return null;
}

/**
 * The structure at the end of a day from the structure journal: the last
 * full snapshot by then, then the single rows and partial schedule rows
 * written after it. Writes that left no journal entry are not seen.
 */
export function structureFromCommands(commands: CommandRow[], end: Date) {
  const upToEnd = commands.filter((command) => command.createdAt <= end).sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  let baseIndex = -1;
  upToEnd.forEach((command, index) => {
    if (fullSnapshotItems(command.afterSnapshot)) baseIndex = index;
  });
  if (baseIndex < 0) return null;
  const base = upToEnd[baseIndex]!;
  const rows = new Map(fullSnapshotItems(base.afterSnapshot)!.map((row) => [String(row.id), { ...row }]));
  const dependencies = ((base.afterSnapshot as { wbsDependencies?: Row[] }).wbsDependencies ?? []).map((row) => ({ ...row }));
  for (const command of upToEnd.slice(baseIndex + 1)) {
    const after = command.afterSnapshot;
    if (Array.isArray(after)) {
      for (const partial of after as Row[]) {
        const id = String(partial.id);
        if (rows.has(id)) rows.set(id, { ...rows.get(id)!, ...partial });
      }
    } else if (after && typeof after === 'object' && 'id' in after) {
      const row = after as Row;
      rows.set(String(row.id), { ...(rows.get(String(row.id)) ?? {}), ...row });
    } else if (command.type === 'CREATE') {
      const item = (command.payload as { item?: Row } | null)?.item;
      if (item?.id) rows.set(String(item.id), item);
    }
  }
  return { rows: [...rows.values()], dependencies, baseAt: base.createdAt };
}

function dependencyKey(row: Row) {
  return `${row.predecessorId}>${row.successorId}:${row.type ?? 'FS'}:${row.lagDays ?? 0}`;
}

export type ProjectHistoryResult = {
  date: string;
  firstCapturedDay: string | null;
  structure: HistorySection<{ rows: Row[]; dependencies: Row[] }> & { dependencies: { added: number; removed: number } | null };
  raid: HistorySection<Row[]>;
  issues: HistorySection<Row[]>;
  project: HistorySection<Row>;
};

const RECONSTRUCTED_NOTE = 'reconstructed';

/** How the project stood at the end of the Moscow day `date` and what changed since; never writes, never asks Jira. */
export async function readProjectHistory(projectId: string, date: string, current: ProjectHistoryPayload, client: PrismaClient = defaultPrisma): Promise<ProjectHistoryResult> {
  const end = historyDayEnd(date);
  const [snapshot, first, newestJournal] = await Promise.all([
    client.projectHistorySnapshot.findFirst({ where: { projectId, day: { lte: new Date(`${date}T00:00:00.000Z`) } }, orderBy: { day: 'desc' } }),
    client.projectHistorySnapshot.findFirst({ where: { projectId }, orderBy: { day: 'asc' }, select: { day: true } }),
    Promise.all([
      client.auditEvent.findFirst({ where: { projectId, createdAt: { lte: end } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      client.wbsCommand.findFirst({ where: { projectId, createdAt: { lte: end } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]),
  ]);
  const firstCapturedDay = first ? first.day.toISOString().slice(0, 10) : null;
  const project = current.project;

  let thenPayload: ProjectHistoryPayload | null = null;
  let provenance: HistoryProvenance | null = null;
  if (snapshot) {
    if (snapshot.oversized || !snapshot.payload) {
      provenance = 'unavailable';
    } else {
      thenPayload = snapshot.payload as unknown as ProjectHistoryPayload;
      const latestWrite = newestJournal.flatMap((row) => (row ? [row.createdAt] : [])).sort((left, right) => right.getTime() - left.getTime())[0];
      // Changes journaled after the capture and still that day are not in it.
      // A day captured together with an earlier day's changes is not called exact either.
      provenance = snapshot.partial || (latestWrite && latestWrite > snapshot.takenAt) ? 'partial' : 'daily';
    }
  }

  if (provenance === 'unavailable') {
    const unavailable = { provenance, note: 'oversized', unknown: 0, data: null, compare: null } as const;
    return { date, firstCapturedDay, structure: { ...unavailable, dependencies: null }, raid: unavailable, issues: unavailable, project: unavailable };
  }

  if (thenPayload && provenance) {
    const depsThen = new Set(thenPayload.wbs.dependencies.map(dependencyKey));
    const depsNow = new Set(current.wbs.dependencies.map(dependencyKey));
    return {
      date,
      firstCapturedDay,
      structure: {
        provenance, note: null, unknown: 0,
        data: { rows: thenPayload.wbs.items, dependencies: thenPayload.wbs.dependencies },
        compare: compareRows(thenPayload.wbs.items, current.wbs.items, WBS_HISTORY_FIELDS),
        dependencies: { added: [...depsNow].filter((key) => !depsThen.has(key)).length, removed: [...depsThen].filter((key) => !depsNow.has(key)).length },
      },
      raid: { provenance, note: null, unknown: 0, data: thenPayload.raid, compare: compareRows(thenPayload.raid, current.raid, RAID_HISTORY_FIELDS) },
      issues: { provenance, note: null, unknown: 0, data: thenPayload.issues, compare: compareRows(thenPayload.issues, current.issues, ISSUE_HISTORY_FIELDS) },
      project: { provenance, note: null, unknown: 0, data: thenPayload.project, compare: compareRows([thenPayload.project], [project], PROJECT_HISTORY_FIELDS) },
    };
  }

  // Before the first capture: rebuilt from the journals, section by section.
  const [audits, commands] = await Promise.all([
    client.auditEvent.findMany({
      where: { projectId, objectType: { in: ['RaidItem', 'Issue', 'Project'] } },
      select: { objectType: true, objectId: true, action: true, createdAt: true, beforeValue: true, afterValue: true },
      orderBy: { createdAt: 'asc' },
    }),
    client.wbsCommand.findMany({ where: { projectId, createdAt: { lte: end } }, select: { type: true, createdAt: true, payload: true, afterSnapshot: true }, orderBy: { createdAt: 'asc' } }),
  ]);
  const raid = reconstructObjects(audits.filter((event) => event.objectType === 'RaidItem'), current.raid, end);
  const issues = reconstructObjects(audits.filter((event) => event.objectType === 'Issue'), current.issues, end);
  const projectState = stateFromJournal(audits.filter((event) => event.objectType === 'Project' && event.objectId === projectId), project, end);
  const structure = structureFromCommands(commands, end);
  const depsNow = new Set(current.wbs.dependencies.map(dependencyKey));
  const depsThen = structure ? new Set(structure.dependencies.map(dependencyKey)) : null;
  return {
    date,
    firstCapturedDay,
    structure: structure
      ? {
          provenance: 'reconstructed', note: RECONSTRUCTED_NOTE, unknown: 0,
          data: { rows: structure.rows, dependencies: structure.dependencies },
          compare: compareRows(structure.rows, current.wbs.items, WBS_HISTORY_FIELDS),
          dependencies: { added: [...depsNow].filter((key) => !depsThen!.has(key)).length, removed: [...depsThen!].filter((key) => !depsNow.has(key)).length },
        }
      : { provenance: 'unknown', note: 'noStructureJournal', unknown: 0, data: null, compare: null, dependencies: null },
    raid: { provenance: 'reconstructed', note: RECONSTRUCTED_NOTE, unknown: raid.unknown, data: raid.rows, compare: compareRows(raid.rows, current.raid, RAID_HISTORY_FIELDS) },
    issues: { provenance: 'reconstructed', note: 'issueLinksNotCovered', unknown: issues.unknown, data: issues.rows, compare: compareRows(issues.rows, current.issues, ISSUE_HISTORY_FIELDS) },
    project: projectState.state
      ? { provenance: 'reconstructed', note: RECONSTRUCTED_NOTE, unknown: 0, data: projectState.state, compare: compareRows([projectState.state], [project], PROJECT_HISTORY_FIELDS) }
      : { provenance: 'unknown', note: 'noProjectJournal', unknown: 1, data: null, compare: null },
  };
}

/** Days of the last year with a capture or journal activity, for the date strip. */
export async function readProjectHistoryDays(projectId: string, client: PrismaClient = defaultPrisma) {
  // Days are dates: the cutoff is a date too, so today's row is never left out.
  const since = new Date(`${historyDayKey(new Date(Date.now() - 366 * 24 * 3_600_000))}T00:00:00.000Z`);
  const [snapshots, journal] = await Promise.all([
    client.projectHistorySnapshot.findMany({ where: { projectId, day: { gte: since } }, select: { day: true, partial: true, oversized: true }, orderBy: { day: 'asc' } }),
    client.$queryRaw<Array<{ day: string; count: bigint }>>`
      SELECT day, COUNT(*)::bigint AS count FROM (
        SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD') AS day FROM "AuditEvent" WHERE "projectId" = ${projectId} AND "createdAt" >= ${since}
        UNION ALL
        SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD') AS day FROM "WbsCommand" WHERE "projectId" = ${projectId} AND "createdAt" >= ${since}
      ) AS events GROUP BY day ORDER BY day`,
  ]);
  const captured = new Map(snapshots.map((row) => [row.day.toISOString().slice(0, 10), row]));
  const days = new Set([...captured.keys(), ...journal.map((row) => row.day)]);
  return [...days].sort().map((day) => ({
    day,
    changes: Number(journal.find((row) => row.day === day)?.count ?? 0),
    captured: captured.has(day),
    partial: captured.get(day)?.partial ?? false,
    unavailable: captured.get(day)?.oversized ?? false,
  }));
}
