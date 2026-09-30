import { randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import { logEvent } from '../server/logger.js';

/** What set an operation off; shown next to each step of a checkpoint's history. */
export const SHIFT_TRIGGERS = [
  'MANUAL_EDIT',
  'BULK_EDIT',
  'STRUCTURE',
  'LINKS',
  'RESTORE',
  'CALENDAR',
  'TARGET_DATE',
  'ISSUE',
  'DRAFT',
  'RESTORE_DELETED',
  'BASELINE',
  'SYSTEM',
] as const;
export type ShiftTrigger = (typeof SHIFT_TRIGGERS)[number];

export type ShiftContext = {
  trigger: ShiftTrigger;
  sourceItemId?: string | null;
  sourceIssueId?: string | null;
  /** A short note the operation carries, such as the reason typed for a new target date. */
  sourceNote?: string | null;
  actor?: { id: string; name?: string | null; email?: string | null } | null;
};

/** The journal's actor from a signed-in user, or none for the system. */
export const shiftActor = (user: { id: string; name?: string | null; email?: string | null } | null | undefined) =>
  user ? { id: user.id, name: user.name ?? null, email: user.email ?? null } : null;

type Checkpoint = { id: string; code: string; title: string; type: string; dueDate: Date | null; baselineDueDate: Date | null };

const DAY_MS = 86_400_000;
const dayKey = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
/** Signed calendar days between two dates stored as UTC days; time of day and daylight saving do not matter. */
export const calendarDaysBetween = (from: Date, to: Date) =>
  Math.round((Date.parse(`${dayKey(to)}T00:00:00.000Z`) - Date.parse(`${dayKey(from)}T00:00:00.000Z`)) / DAY_MS);

/** Milestones and goals of the project with the dates the journal follows. */
async function checkpoints(projectId: string) {
  const rows = await prisma.wbsItem.findMany({
    where: { projectId, type: { in: ['MILESTONE', 'GOAL'] }, status: { not: 'CANCELLED' } },
    select: { id: true, code: true, title: true, type: true, dueDate: true, baselineDueDate: true },
  });
  return new Map<string, Checkpoint>(rows.map((row) => [row.id, row]));
}

type ShiftRow = {
  projectId: string;
  kind: 'SHIFT' | 'BASELINE';
  checkpointId: string;
  checkpointCode: string;
  checkpointTitle: string;
  checkpointType: string;
  previousDate: Date | null;
  newDate: Date | null;
  deltaDays: number | null;
  baselineDate: Date | null;
  trigger: ShiftTrigger;
  sourceItemId: string | null;
  sourceCode: string | null;
  sourceTitle: string | null;
  sourceIssueId: string | null;
  sourceNote: string | null;
  actorId: string | null;
  actorName: string | null;
  operationId: string;
};

/**
 * The journal rows for one operation: a SHIFT for every checkpoint whose date
 * changed (also from or to no date, then without a number of days), and a
 * BASELINE marker for every checkpoint whose baseline changed, so its history
 * restarts there. Checkpoints that appeared or disappeared are not shifts.
 */
export function diffCheckpoints(
  before: Map<string, Checkpoint>,
  after: Map<string, Checkpoint>,
  context: ShiftContext,
  meta: { projectId: string; operationId: string; source?: { code: string; title: string } | null },
): ShiftRow[] {
  const rows: ShiftRow[] = [];
  for (const [id, now] of after) {
    const was = before.get(id);
    if (!was) continue;
    const common = {
      projectId: meta.projectId,
      checkpointId: id,
      checkpointCode: now.code,
      checkpointTitle: now.title,
      checkpointType: now.type,
      trigger: context.trigger,
      sourceItemId: context.sourceItemId ?? null,
      sourceCode: meta.source?.code ?? null,
      sourceTitle: meta.source?.title ?? null,
      sourceIssueId: context.sourceIssueId ?? null,
      sourceNote: context.sourceNote?.slice(0, 500) ?? null,
      actorId: context.actor?.id ?? null,
      actorName: context.actor?.name ?? context.actor?.email ?? null,
      operationId: meta.operationId,
    };
    if (dayKey(was.baselineDueDate) !== dayKey(now.baselineDueDate)) {
      rows.push({
        ...common,
        kind: 'BASELINE',
        previousDate: was.baselineDueDate,
        newDate: now.baselineDueDate,
        deltaDays: null,
        baselineDate: now.baselineDueDate,
      });
    }
    if (dayKey(was.dueDate) !== dayKey(now.dueDate)) {
      rows.push({
        ...common,
        kind: 'SHIFT',
        previousDate: was.dueDate,
        newDate: now.dueDate,
        deltaDays: was.dueDate && now.dueDate ? calendarDaysBetween(was.dueDate, now.dueDate) : null,
        baselineDate: now.baselineDueDate,
      });
    }
  }
  return rows;
}

/** Shifts that moved a checkpoint later and past its baseline: those deserve a reason. */
export const needsReason = (row: Pick<ShiftRow, 'kind' | 'deltaDays' | 'newDate' | 'baselineDate'>) =>
  row.kind === 'SHIFT' && (row.deltaDays ?? 0) > 0 && Boolean(row.newDate && row.baselineDate && row.newDate > row.baselineDate);

export type ShiftTracking = { operationId: string; finish: () => Promise<{ operationId: string; shifts: number; reasonNeeded: number }> };

/**
 * Starts following one operation on a project: takes the checkpoint dates now,
 * and `finish` compares them with the dates after the operation and writes the
 * journal. The caller runs both inside the project's write queue, so nothing
 * else moves the dates in between. A failure of the journal never fails the
 * operation itself.
 */
export async function beginScheduleShiftTracking(projectId: string, context: ShiftContext): Promise<ShiftTracking> {
  const operationId = randomUUID();
  let before: Map<string, Checkpoint> | null = null;
  try {
    before = await checkpoints(projectId);
  } catch (error) {
    logEvent('warn', 'schedule_shift.snapshot_failed', { projectId, reason: error instanceof Error ? error.message : String(error) });
  }
  return {
    operationId,
    finish: async () => {
      if (!before) return { operationId, shifts: 0, reasonNeeded: 0 };
      try {
        const after = await checkpoints(projectId);
        const source = context.sourceItemId
          ? await prisma.wbsItem.findUnique({ where: { id: context.sourceItemId }, select: { code: true, title: true } })
          : null;
        const rows = diffCheckpoints(before, after, context, { projectId, operationId, source });
        if (rows.length > 0) await prisma.scheduleShift.createMany({ data: rows });
        return { operationId, shifts: rows.filter((row) => row.kind === 'SHIFT').length, reasonNeeded: rows.filter(needsReason).length };
      } catch (error) {
        logEvent('warn', 'schedule_shift.record_failed', { projectId, reason: error instanceof Error ? error.message : String(error) });
        return { operationId, shifts: 0, reasonNeeded: 0 };
      }
    },
  };
}

/**
 * Runs an operation and journals the checkpoint dates it moved, also when it
 * fails halfway, since what it wrote stays. Call it inside the project's write queue.
 */
export async function trackScheduleShifts<T>(projectId: string, context: ShiftContext, operation: () => Promise<T>) {
  const tracking = await beginScheduleShiftTracking(projectId, context);
  try {
    return await operation();
  } finally {
    await tracking.finish();
  }
}

export const SHIFT_REASON_CATEGORIES = ['CUSTOMER', 'SUPPLIER', 'RESOURCES', 'ESTIMATE', 'TECHNICAL', 'EXTERNAL', 'OTHER'] as const;
export type ShiftReasonCategory = (typeof SHIFT_REASON_CATEGORIES)[number];

/** How many of the latest steps a checkpoint shows; older ones are folded into one line. */
export const LADDER_STEPS = 30;

type LadderCheckpoint = { id: string; code: string; title: string; type: string; status: string; sortOrder: number; dueDate: Date | null; baselineDueDate: Date | null };
type JournalRow = {
  id: string;
  kind: string;
  checkpointId: string | null;
  operationId: string;
  createdAt: Date;
  previousDate: Date | null;
  newDate: Date | null;
  deltaDays: number | null;
  baselineDate: Date | null;
  trigger: string;
  sourceItemId: string | null;
  sourceCode: string | null;
  sourceTitle: string | null;
  sourceIssueId: string | null;
  sourceNote: string | null;
  actorName: string | null;
  reasonCategory: string | null;
  reasonText: string | null;
  reasonRaidItemId: string | null;
};

const isoDay = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

/**
 * For every open milestone and goal that is off its baseline or moved: the
 * baseline, the steps since that baseline was set for this checkpoint (a
 * baseline saved for other rows does not count), and the days no step
 * explains, which happened before the journal. The steps of the operation
 * that set the baseline belong to the old plan. The active goal comes first.
 */
export function buildShiftLadders(checkpointRows: LadderCheckpoint[], journal: JournalRow[]) {
  const open = checkpointRows
    .filter((item) => item.status !== 'DONE' && item.status !== 'CANCELLED')
    .sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code, 'ru', { numeric: true }));
  const activeGoalId = open.find((item) => item.type === 'GOAL')?.id ?? null;
  const byCheckpoint = new Map<string, JournalRow[]>();
  for (const row of [...journal].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())) {
    if (!row.checkpointId) continue;
    byCheckpoint.set(row.checkpointId, [...(byCheckpoint.get(row.checkpointId) ?? []), row]);
  }
  const ladders = open.map((item) => {
    const rows = byCheckpoint.get(item.id) ?? [];
    const lastBaseline = [...rows].reverse().find((row) => row.kind === 'BASELINE') ?? null;
    const since = lastBaseline ? rows.slice(rows.indexOf(lastBaseline) + 1).filter((row) => row.operationId !== lastBaseline.operationId) : rows;
    const steps = since.filter((row) => row.kind === 'SHIFT');
    const varianceDays = item.dueDate && item.baselineDueDate ? calendarDaysBetween(item.baselineDueDate, item.dueDate) : null;
    const explainedDays = steps.reduce((sum, row) => sum + (row.deltaDays ?? 0), 0);
    const shown = steps.slice(-LADDER_STEPS);
    const folded = steps.slice(0, steps.length - shown.length);
    return {
      id: item.id,
      code: item.code,
      title: item.title,
      type: item.type,
      isActiveGoal: item.id === activeGoalId,
      baselineDate: isoDay(item.baselineDueDate),
      currentDate: isoDay(item.dueDate),
      varianceDays,
      // What the journal does not account for: moves before it existed, or a baseline set outside it.
      unexplainedDays: varianceDays === null ? null : varianceDays - explainedDays,
      earlierSteps: folded.length > 0 ? { count: folded.length, deltaDays: folded.reduce((sum, row) => sum + (row.deltaDays ?? 0), 0) } : null,
      steps: shown.map((row) => ({
        id: row.id,
        operationId: row.operationId,
        at: row.createdAt.toISOString(),
        previousDate: isoDay(row.previousDate),
        newDate: isoDay(row.newDate),
        deltaDays: row.deltaDays,
        trigger: row.trigger,
        sourceItemId: row.sourceItemId,
        sourceCode: row.sourceCode,
        sourceTitle: row.sourceTitle,
        sourceIssueId: row.sourceIssueId,
        sourceNote: row.sourceNote,
        actorName: row.actorName,
        reason: row.reasonCategory ? { category: row.reasonCategory, text: row.reasonText, raidItemId: row.reasonRaidItemId } : null,
        needsReason: !row.reasonCategory && needsReason({ kind: 'SHIFT', deltaDays: row.deltaDays, newDate: row.newDate, baselineDate: row.baselineDate }),
      })),
    };
  });
  return ladders
    .filter((ladder) => (ladder.varianceDays ?? 0) !== 0 || ladder.steps.length > 0)
    .sort((left, right) => Number(right.isActiveGoal) - Number(left.isActiveGoal));
}

/** Loads what the ladders need for one project. */
export async function projectShiftLadders(projectId: string) {
  const items = await prisma.wbsItem.findMany({
    where: { projectId, type: { in: ['MILESTONE', 'GOAL'] }, status: { notIn: ['DONE', 'CANCELLED'] } },
    select: { id: true, code: true, title: true, type: true, status: true, sortOrder: true, dueDate: true, baselineDueDate: true },
  });
  const journal = await prisma.scheduleShift.findMany({
    where: { projectId, checkpointId: { in: items.map((item) => item.id) } },
    orderBy: { createdAt: 'asc' },
  });
  return buildShiftLadders(items, journal);
}
