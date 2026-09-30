/** One row of a plan as a snapshot keeps it: identity, where it sits, what it is and its dates. */
export type SnapshotRow = {
  id: string;
  parentId: string | null;
  code: string;
  title: string;
  type: string;
  status: string;
  owner: string;
  startDate: string | null;
  dueDate: string | null;
  baselineDueDate: string | null;
  progress: number;
};

export const PLAN_SNAPSHOT_LIMITS = { perProject: 50, rows: 3000, bytes: 2_000_000, name: 120 } as const;

const DAY_MS = 86_400_000;
const day = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);
const days = (from: string | null, to: string | null) =>
  from && to ? Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) : null;

export function snapshotRows(
  items: Array<{
    id: string;
    parentId: string | null;
    code: string;
    title: string;
    type: string;
    status: string;
    owner: string;
    startDate: Date | null;
    dueDate: Date | null;
    baselineDueDate: Date | null;
    progress: number;
  }>,
): SnapshotRow[] {
  return items.map((item) => ({
    id: item.id,
    parentId: item.parentId,
    code: item.code,
    title: item.title,
    type: item.type,
    status: item.status,
    owner: item.owner,
    startDate: day(item.startDate),
    dueDate: day(item.dueDate),
    baselineDueDate: day(item.baselineDueDate),
    progress: item.progress,
  }));
}

type Brief = Pick<SnapshotRow, 'id' | 'code' | 'title' | 'type'>;
export type PlanChange = Brief & {
  checkpoint: boolean;
  startDays: number | null;
  dueDays: number | null;
  from: { startDate: string | null; dueDate: string | null; status: string; owner: string };
  to: { startDate: string | null; dueDate: string | null; status: string; owner: string };
  moved: boolean;
  statusChanged: boolean;
  ownerChanged: boolean;
};

const isCheckpoint = (row: Pick<SnapshotRow, 'type'>) => row.type === 'MILESTONE' || row.type === 'GOAL';

/**
 * What changed from one plan to another: rows matched by id, and rows whose
 * id is not found matched by code (a structure rebuilt or imported keeps its
 * codes). Moves in calendar days, status and owner changes, added and removed
 * rows; milestones and goals first.
 */
export function comparePlans(before: SnapshotRow[], after: SnapshotRow[]) {
  const afterById = new Map(after.map((row) => [row.id, row]));
  const matched = new Set<string>();
  const pairs: Array<[SnapshotRow, SnapshotRow]> = [];
  const unmatchedBefore: SnapshotRow[] = [];
  for (const row of before) {
    const same = afterById.get(row.id);
    if (same) {
      pairs.push([row, same]);
      matched.add(same.id);
    } else unmatchedBefore.push(row);
  }
  const afterByCode = new Map(after.filter((row) => !matched.has(row.id)).map((row) => [row.code, row]));
  const removed: Brief[] = [];
  for (const row of unmatchedBefore) {
    const byCode = afterByCode.get(row.code);
    if (byCode && !matched.has(byCode.id)) {
      pairs.push([row, byCode]);
      matched.add(byCode.id);
    } else removed.push({ id: row.id, code: row.code, title: row.title, type: row.type });
  }
  const added: Brief[] = after.filter((row) => !matched.has(row.id)).map((row) => ({ id: row.id, code: row.code, title: row.title, type: row.type }));
  const changes: PlanChange[] = pairs
    .map(([was, now]) => {
      const startDays = was.startDate !== now.startDate ? days(was.startDate, now.startDate) : 0;
      const dueDays = was.dueDate !== now.dueDate ? days(was.dueDate, now.dueDate) : 0;
      const moved = was.startDate !== now.startDate || was.dueDate !== now.dueDate;
      return {
        id: now.id,
        code: now.code,
        title: now.title,
        type: now.type,
        checkpoint: isCheckpoint(now),
        startDays,
        dueDays,
        from: { startDate: was.startDate, dueDate: was.dueDate, status: was.status, owner: was.owner },
        to: { startDate: now.startDate, dueDate: now.dueDate, status: now.status, owner: now.owner },
        moved,
        statusChanged: was.status !== now.status,
        ownerChanged: was.owner.trim() !== now.owner.trim(),
      };
    })
    .filter((change) => change.moved || change.statusChanged || change.ownerChanged)
    .sort((left, right) => Number(right.checkpoint) - Number(left.checkpoint) || left.code.localeCompare(right.code, 'ru', { numeric: true }));
  const later = changes.filter((change) => (change.dueDays ?? 0) > 0).length;
  const earlier = changes.filter((change) => (change.dueDays ?? 0) < 0).length;
  return {
    changes,
    added,
    removed,
    summary: { changed: changes.length, moved: changes.filter((change) => change.moved).length, later, earlier, added: added.length, removed: removed.length },
  };
}
