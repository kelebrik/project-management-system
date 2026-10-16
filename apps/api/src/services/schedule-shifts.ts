import { CLOSED_WORK_STATUSES, isClosedWorkStatus } from '@pms/shared';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
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
  'IMPORT',
  'AUTOMATION',
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
  /** Checkpoints whose baseline the operation sets anew, even to the date it had: their history restarts once it succeeds. */
  rebaselineIds?: string[];
  actor?: { id: string; name?: string | null; email?: string | null } | null;
  /** The answer to the person's request: it gets the journal's headers, so the page knows the session. */
  answer?: { setHeader(name: string, value: string): unknown; headersSent: boolean } | null;
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

/**
 * When the project's plan was first fixed: before that its dates are a draft,
 * so their moves are no delay and the journal counts nothing.
 */
async function firstBaselineAt(projectId: string, db: Pick<typeof prisma, 'wbsBaseline'> = prisma) {
  const first = await db.wbsBaseline.findFirst({ where: { projectId }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
  return first?.createdAt ?? null;
}

export type ShiftRow = {
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
 * BASELINE marker for every checkpoint whose baseline changed or was set anew
 * (`rebaselineIds`), so its history restarts there. Checkpoints that appeared
 * or disappeared are not shifts.
 */
export function diffCheckpoints(
  before: Map<string, Checkpoint>,
  after: Map<string, Checkpoint>,
  context: ShiftContext,
  meta: { projectId: string; operationId: string; source?: { code: string; title: string } | null; rebaselineIds?: string[] },
): ShiftRow[] {
  const rows: ShiftRow[] = [];
  const rebaselined = new Set(meta.rebaselineIds ?? []);
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
    if (dayKey(was.baselineDueDate) !== dayKey(now.baselineDueDate) || rebaselined.has(id)) {
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

/** How an operation ended, for its editing session: a new change, a repeat of one already done, or a failure. */
export type OperationOutcome = 'succeeded' | 'replayed' | 'failed';

/** What the journal recorded of one operation: its moves and the editing session it joined, if any. */
export type ShiftJournal = { operationId: string; sessionId: string | null; projectId: string; actorId: string | null; shifts: number; reasonNeeded: number };

export type ShiftTracking = { operationId: string; finish: (outcome?: OperationOutcome) => Promise<ShiftJournal> };

/** A pause longer than this ends a person's editing session. */
export const SESSION_GAP_MS = 30 * 60_000;

type SessionDb = Prisma.TransactionClient;

/** Serialises everything that opens, extends, closes or reads the sessions of a project, across transactions. */
async function lockSessions(db: SessionDb, projectId: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`shift-session:${projectId}`}))`;
}

/** Closes a session at its last activity, so the pause after it is not part of it. */
async function closeSession(db: SessionDb, session: { id: string; lastActivityAt: Date }) {
  await db.scheduleShiftSession.update({ where: { id: session.id }, data: { closedAt: session.lastActivityAt } });
}

/**
 * Records an operation's journal rows in its editing session, under the
 * project's session lock: a new change by a person extends their open session
 * when nobody else changed the project since and the pause was at most 30
 * minutes, else it closes the open one and starts another. A change without a
 * person, a failed one that still moved dates, or a repeat that unexpectedly
 * did, stands alone and ends the open session. A closed session never gains a
 * row, whatever ran in between.
 */
export async function recordInSession(
  projectId: string,
  actor: ShiftContext['actor'],
  outcome: OperationOutcome,
  rows: ShiftRow[],
  now = new Date(),
): Promise<string | null> {
  return prisma.$transaction(async (db) => {
    await lockSessions(db, projectId);
    const open = await db.scheduleShiftSession.findFirst({ where: { projectId, closedAt: null } });
    let sessionId: string | null = null;
    if (outcome === 'succeeded' && actor) {
      if (open && open.actorId === actor.id && now.getTime() - open.lastActivityAt.getTime() <= SESSION_GAP_MS) {
        await db.scheduleShiftSession.update({ where: { id: open.id }, data: { lastActivityAt: now } });
        sessionId = open.id;
      } else {
        if (open) await closeSession(db, open);
        const created = await db.scheduleShiftSession.create({
          data: { projectId, actorId: actor.id, actorName: actor.name ?? actor.email ?? null, startedAt: now, lastActivityAt: now },
        });
        sessionId = created.id;
      }
    } else if (rows.length > 0) {
      if (outcome === 'replayed') logEvent('warn', 'schedule_shift.replay_moved_dates', { projectId, rows: rows.length });
      if (open) await closeSession(db, open);
    }
    if (rows.length > 0) await db.scheduleShift.createMany({ data: rows.map((row) => ({ ...row, sessionId })) });
    return sessionId;
  });
}

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
    finish: async (outcome: OperationOutcome = 'succeeded') => {
      const none = { operationId, sessionId: null, projectId, actorId: context.actor?.id ?? null, shifts: 0, reasonNeeded: 0 };
      if (!before) return none;
      try {
        // A plan not fixed yet is a draft: its moves are not journaled (the operation that fixes it is).
        if (!(await firstBaselineAt(projectId))) return none;
        const after = await checkpoints(projectId);
        const source = context.sourceItemId
          ? await prisma.wbsItem.findUnique({ where: { id: context.sourceItemId }, select: { code: true, title: true } })
          : null;
        // A baseline set anew counts only when the operation went through: a failed one rolled it back.
        const rebaselineIds = outcome === 'succeeded' ? context.rebaselineIds : [];
        const rows = diffCheckpoints(before, after, context, { projectId, operationId, source, rebaselineIds });
        const sessionId = await recordInSession(projectId, context.actor, outcome, rows);
        return { operationId, sessionId, projectId, actorId: context.actor?.id ?? null, shifts: rows.filter((row) => row.kind === 'SHIFT').length, reasonNeeded: rows.filter(needsReason).length };
      } catch (error) {
        logEvent('warn', 'schedule_shift.record_failed', { projectId, reason: error instanceof Error ? error.message : String(error) });
        return none;
      }
    },
  };
}

/**
 * Runs an operation and journals the checkpoint dates it moved, also when it
 * fails halfway, since what it wrote stays. Call it inside the project's write
 * queue. `replayed` tells a repeat of a change already made, which is no new
 * editing; `onJournal` hears what was recorded, to tell the page.
 */
export async function trackScheduleShifts<T>(
  projectId: string,
  context: ShiftContext,
  operation: () => Promise<T>,
  options: { replayed?: (result: T) => boolean; onJournal?: (journal: ShiftJournal) => void } = {},
) {
  const tracking = await beginScheduleShiftTracking(projectId, context);
  let outcome: OperationOutcome = 'failed';
  try {
    const result = await operation();
    outcome = options.replayed?.(result) ? 'replayed' : 'succeeded';
    return result;
  } finally {
    const journal = await tracking.finish(outcome);
    // The headers only tell the page; an answer that cannot take them never fails the operation.
    try {
      if (context.answer && !context.answer.headersSent) {
        for (const [name, value] of Object.entries(shiftJournalHeaders(journal))) context.answer.setHeader(name, value);
      }
    } catch (error) {
      logEvent('warn', 'schedule_shift.headers_failed', { projectId, reason: error instanceof Error ? error.message : String(error) });
    }
    options.onJournal?.(journal);
  }
}

/** The journal's headers on an answer: the page learns the operation, its session and its project. */
export function shiftJournalHeaders(journal: ShiftJournal): Record<string, string> {
  return {
    'X-Schedule-Shift-Operation-Id': journal.operationId,
    'X-Schedule-Shift-Reason-Needed': String(journal.reasonNeeded),
    'X-Schedule-Shift-Project-Id': journal.projectId,
    ...(journal.sessionId ? { 'X-Schedule-Shift-Session-Id': journal.sessionId } : {}),
    ...(journal.actorId ? { 'X-Schedule-Shift-Actor-Id': journal.actorId } : {}),
  };
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
  sessionId?: string | null;
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
 * The days a checkpoint is late now, split by the reasons of the moves that
 * made it so. A move earlier takes back the latest moves later first, so a date
 * sent away and brought back counts nothing; what stays is cut to the days
 * past the baseline, oldest moves first. No baseline, or not late: nothing.
 */
export function lateDaysByReason(operations: { days: number; category: string | null }[], varianceDays: number | null) {
  const reasonDays: Record<string, number> = {};
  if (varianceDays === null || varianceDays <= 0) return reasonDays;
  const later: { days: number; category: string | null }[] = [];
  for (const { days, category } of operations) {
    if (days > 0) {
      later.push({ days, category });
      continue;
    }
    let back = -days;
    while (back > 0 && later.length > 0) {
      const last = later[later.length - 1];
      const taken = Math.min(back, last.days);
      last.days -= taken;
      back -= taken;
      if (last.days === 0) later.pop();
    }
  }
  let excess = later.reduce((sum, entry) => sum + entry.days, 0) - varianceDays;
  for (const entry of later) {
    const cut = Math.min(Math.max(0, excess), entry.days);
    entry.days -= cut;
    excess -= cut;
    if (entry.days === 0) continue;
    const key = entry.category ?? 'NONE';
    reasonDays[key] = (reasonDays[key] ?? 0) + entry.days;
  }
  return reasonDays;
}

/** A checkpoint's journal rows of one session (or of one operation outside sessions), counted as one step. */
export type CheckpointStep = {
  group: string;
  sessionId: string | null;
  rows: JournalRow[];
  first: JournalRow;
  last: JournalRow;
  /** Days between the step's ends; none when one end has no date. */
  deltaDays: number | null;
  operations: number;
  /** none: no row has a reason; full: all rows the same one; mixed: anything else. */
  reasonState: 'none' | 'full' | 'mixed';
  needsReason: boolean;
};

/** Steps shown with the same reason in charts when their rows were given different ones. */
export const MIXED_REASON = 'MIXED';

/**
 * A checkpoint's steps since its last baseline: its journal rows grouped by
 * session (rows outside one stand by their operation), each group one step
 * from where the first row found the date to where the last left it. A step
 * that ended where it began is no step; one with an end without a date stays.
 * The steps of the operation that set the baseline belong to the old plan.
 */
export function checkpointSteps(rows: JournalRow[]): CheckpointStep[] {
  const sorted = [...rows].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  const lastBaseline = [...sorted].reverse().find((row) => row.kind === 'BASELINE') ?? null;
  const since = lastBaseline ? sorted.slice(sorted.indexOf(lastBaseline) + 1).filter((row) => row.operationId !== lastBaseline.operationId) : sorted;
  const groups = new Map<string, JournalRow[]>();
  for (const row of since) {
    if (row.kind !== 'SHIFT') continue;
    const key = row.sessionId ? `session:${row.sessionId}` : `op:${row.operationId}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const steps: CheckpointStep[] = [];
  for (const [group, members] of groups) {
    const first = members[0]!;
    const last = members[members.length - 1]!;
    // The days of the rows add up to the step's; across a date taken away and set again, the ends tell it.
    const deltaDays = members.every((row) => row.deltaDays !== null)
      ? members.reduce((sum, row) => sum + row.deltaDays!, 0)
      : first.previousDate && last.newDate ? calendarDaysBetween(first.previousDate, last.newDate) : null;
    if (deltaDays === 0) continue;
    const categories = new Set(members.map((row) => row.reasonCategory));
    const reasonState = categories.size === 1 && !categories.has(null) ? 'full' : categories.size === 1 ? 'none' : 'mixed';
    const unexplained = members.some((row) => !row.reasonCategory);
    steps.push({
      group,
      sessionId: first.sessionId ?? null,
      rows: members,
      first,
      last,
      deltaDays,
      operations: new Set(members.map((row) => row.operationId)).size,
      reasonState,
      needsReason: unexplained && (deltaDays ?? 0) > 0 && Boolean(last.newDate && last.baselineDate && last.newDate > last.baselineDate),
    });
  }
  return steps;
}

/** The reason a step shows: one row's whole reason when all rows share it, "mixed" when they differ. */
function stepReason(step: CheckpointStep) {
  if (step.reasonState === 'none') return null;
  if (step.reasonState === 'mixed') return { category: MIXED_REASON, text: null, raidItemId: null };
  const row = step.rows.find((member) => member.reasonCategory)!;
  return { category: row.reasonCategory!, text: row.reasonText, raidItemId: row.reasonRaidItemId };
}

/**
 * For every open milestone and goal that is off its baseline or moved: the
 * baseline, its steps since that baseline was set for this checkpoint (a
 * baseline saved for other rows does not count), one step per editing
 * session, and the days no step explains, which happened before the journal.
 * The active goal comes first. `openSessions` are still being edited: a step
 * of one with too many rows to name gets its reason once the session closes.
 */
export function buildShiftLadders(checkpointRows: LadderCheckpoint[], journal: JournalRow[], openSessions: ReadonlySet<string> = new Set()) {
  const open = checkpointRows
    .filter((item) => !isClosedWorkStatus(item.status))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code, 'ru', { numeric: true }));
  const activeGoalId = open.find((item) => item.type === 'GOAL')?.id ?? null;
  // A checkpoint with no baseline has nothing to be late against.
  const measured = open.filter((item) => item.baselineDueDate !== null);
  const byCheckpoint = new Map<string, JournalRow[]>();
  for (const row of journal) {
    if (!row.checkpointId) continue;
    byCheckpoint.set(row.checkpointId, [...(byCheckpoint.get(row.checkpointId) ?? []), row]);
  }
  const ladders = measured.map((item) => {
    const steps = checkpointSteps(byCheckpoint.get(item.id) ?? []);
    const varianceDays = item.dueDate && item.baselineDueDate ? calendarDaysBetween(item.baselineDueDate, item.dueDate) : null;
    const explainedDays = steps.reduce((sum, step) => sum + (step.deltaDays ?? 0), 0);
    // Days by reason: each step by its net move, in order.
    const reasonDays = lateDaysByReason(
      steps.map((step) => ({ days: step.deltaDays ?? 0, category: stepReason(step)?.category ?? null })),
      varianceDays,
    );
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
      reasonDays,
      earlierSteps: folded.length > 0 ? { count: folded.length, deltaDays: folded.reduce((sum, step) => sum + (step.deltaDays ?? 0), 0) } : null,
      steps: shown.map((step) => {
        const single = step.operations === 1;
        const notes = [...new Set(step.rows.map((row) => row.sourceNote).filter((note): note is string => Boolean(note)))];
        const sessionOpen = step.sessionId !== null && openSessions.has(step.sessionId);
        return {
          id: step.last.id,
          operationId: step.last.operationId,
          sessionId: step.sessionId,
          sessionOpen,
          shiftIds: step.rows.map((row) => row.id),
          operations: step.operations,
          at: step.last.createdAt.toISOString(),
          previousDate: isoDay(step.first.previousDate),
          newDate: isoDay(step.last.newDate),
          deltaDays: step.deltaDays,
          trigger: single ? step.last.trigger : 'SESSION',
          sourceItemId: single ? step.last.sourceItemId : null,
          sourceCode: single ? step.last.sourceCode : null,
          sourceTitle: single ? step.last.sourceTitle : null,
          sourceIssueId: single ? step.last.sourceIssueId : null,
          sourceNote: notes.length === 1 ? notes[0]! : null,
          actorName: step.last.actorName,
          reason: stepReason(step),
          needsReason: step.needsReason,
          // A reason is given by the step's rows; an open session's step too large to name waits until it closes.
          reasonEditable: !sessionOpen || step.rows.length <= REASON_SHIFT_LIMIT,
        };
      }),
    };
  });
  return ladders
    .filter((ladder) => (ladder.varianceDays ?? 0) !== 0 || ladder.steps.length > 0)
    .sort((left, right) => Number(right.isActiveGoal) - Number(left.isActiveGoal));
}

/** How many journal rows one reason may name by their ids; a closed session's step is named by the session instead. */
export const REASON_SHIFT_LIMIT = 50;

/** The open milestones and goals of a project with their journal, for the ladders and the reasons asked. */
async function projectCheckpointJournal(projectId: string) {
  const items = await prisma.wbsItem.findMany({
    where: { projectId, type: { in: ['MILESTONE', 'GOAL'] }, status: { notIn: [...CLOSED_WORK_STATUSES] } },
    select: { id: true, code: true, title: true, type: true, status: true, sortOrder: true, dueDate: true, baselineDueDate: true },
  });
  // Only what moved since the plan was first fixed counts; without a fixed plan nothing does.
  const since = await firstBaselineAt(projectId);
  if (!since) return { items: [], journal: [] };
  const journal = await prisma.scheduleShift.findMany({
    where: { projectId, checkpointId: { in: items.map((item) => item.id) }, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
  });
  return { items, journal };
}

/** Loads what the ladders need for one project. */
export async function projectShiftLadders(projectId: string) {
  const { items, journal } = await projectCheckpointJournal(projectId);
  const openSessions = await prisma.scheduleShiftSession.findMany({ where: { projectId, closedAt: null }, select: { id: true } });
  return buildShiftLadders(items, journal, new Set(openSessions.map((session) => session.id)));
}

/** Sessions of the project idle past the gap are closed, under the session lock. */
async function closeIdleSessions(db: SessionDb, projectId: string, now: Date) {
  const stale = await db.scheduleShiftSession.findMany({ where: { projectId, closedAt: null, lastActivityAt: { lt: new Date(now.getTime() - SESSION_GAP_MS) } } });
  for (const session of stale) await closeSession(db, session);
}

/**
 * Closes one session of a person: on leaving the editing pages ("leave"),
 * after the person's own pause ("idle"), which another tab may have cut short
 * by editing on, or as left in a tab that is gone ("stale"), only if its last
 * activity is still the one the page saw. Closing a closed session does nothing.
 */
export async function closeShiftSession(
  projectId: string,
  sessionId: string,
  userId: string,
  mode: 'leave' | 'idle' | 'stale',
  options: { now?: Date; lastActivityAt?: Date } = {},
) {
  const now = options.now ?? new Date();
  return prisma.$transaction(async (db) => {
    await lockSessions(db, projectId);
    const session = await db.scheduleShiftSession.findFirst({ where: { id: sessionId, projectId, actorId: userId } });
    if (!session) return { found: false as const };
    if (session.closedAt) return { found: true as const, closed: true };
    if (mode === 'idle' && now.getTime() - session.lastActivityAt.getTime() <= SESSION_GAP_MS) return { found: true as const, closed: false };
    // A session left in a tab that is gone: closed only if nothing was saved in it since the page looked.
    if (mode === 'stale' && session.lastActivityAt.getTime() !== options.lastActivityAt?.getTime()) return { found: true as const, closed: false };
    await closeSession(db, session);
    return { found: true as const, closed: true };
  });
}

/** A checkpoint's net move in one closed session that still wants a reason. */
export type PendingStep = {
  checkpointId: string;
  code: string;
  title: string;
  deltaDays: number | null;
  previousDate: string | null;
  newDate: string | null;
  baselineDate: string | null;
  notes: string[];
};

/**
 * A person's closed sessions of a project not yet looked at, with the net
 * moves of each that went later past the baseline without a reason, and the
 * person's open session, if any, with its last activity: a page that did not
 * take part in it may end it as left in a tab that is gone. Sessions idle past
 * the gap are closed first; sessions with nothing to ask are marked looked at.
 * All under the session lock, so no session read here gains rows afterwards.
 */
export async function pendingShiftSessions(projectId: string, userId: string, options: { now?: Date } = {}) {
  const now = options.now ?? new Date();
  return prisma.$transaction(async (db) => {
    await lockSessions(db, projectId);
    await closeIdleSessions(db, projectId, now);
    const own = await db.scheduleShiftSession.findFirst({ where: { projectId, actorId: userId, closedAt: null }, select: { id: true, lastActivityAt: true } });
    const ownOpen = own ? { id: own.id, lastActivityAt: own.lastActivityAt.toISOString() } : null;
    const sessions = await db.scheduleShiftSession.findMany({
      where: { projectId, actorId: userId, closedAt: { not: null }, reviewedAt: null },
      orderBy: { startedAt: 'asc' },
    });
    if (sessions.length === 0) return { sessions: [], ownOpen };
    const items = await db.wbsItem.findMany({
      where: { projectId, type: { in: ['MILESTONE', 'GOAL'] }, status: { notIn: [...CLOSED_WORK_STATUSES] } },
      select: { id: true, code: true, title: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    // Moves before the plan was first fixed ask for no reason.
    const since = await firstBaselineAt(projectId, db);
    const journal = since
      ? await db.scheduleShift.findMany({ where: { projectId, checkpointId: { in: items.map((item) => item.id) }, createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } })
      : [];
    const stepsBySession = new Map<string, PendingStep[]>();
    for (const item of items) {
      for (const step of checkpointSteps(journal.filter((row) => row.checkpointId === item.id))) {
        if (!step.sessionId || !step.needsReason) continue;
        // The justification typed with a new target date, to offer as the reason's text.
        const notes = [...new Set(step.rows.filter((row) => row.trigger === 'TARGET_DATE').map((row) => row.sourceNote).filter((note): note is string => Boolean(note)))];
        stepsBySession.set(step.sessionId, [...(stepsBySession.get(step.sessionId) ?? []), {
          checkpointId: item.id,
          code: item.code,
          title: item.title,
          deltaDays: step.deltaDays,
          previousDate: isoDay(step.first.previousDate),
          newDate: isoDay(step.last.newDate),
          baselineDate: isoDay(step.last.baselineDate),
          notes,
        }]);
      }
    }
    const quiet = sessions.filter((session) => !stepsBySession.has(session.id)).map((session) => session.id);
    if (quiet.length > 0) await db.scheduleShiftSession.updateMany({ where: { id: { in: quiet } }, data: { reviewedAt: now, reviewedById: userId } });
    return {
      ownOpen,
      sessions: sessions
        .filter((session) => stepsBySession.has(session.id))
        .map((session) => ({ id: session.id, startedAt: session.startedAt.toISOString(), endedAt: (session.closedAt ?? session.lastActivityAt).toISOString(), steps: stepsBySession.get(session.id)! })),
    };
  });
}

/** Marks a person's closed sessions looked at: the question about them is not asked again. */
export async function reviewShiftSessions(projectId: string, userId: string, sessionIds: string[], now = new Date()) {
  return prisma.$transaction(async (db) => {
    await lockSessions(db, projectId);
    const updated = await db.scheduleShiftSession.updateMany({
      where: { id: { in: sessionIds }, projectId, actorId: userId, closedAt: { not: null } },
      data: { reviewedAt: now, reviewedById: userId },
    });
    return updated.count;
  });
}

/**
 * The journal rows a reason is given to: named by their ids, or as the moves
 * of some checkpoints in one closed session (its rows since each checkpoint's
 * baseline). Runs `assign` under the session lock, so the rows are the ones
 * the person saw: an open session's step cannot be named by the session.
 */
export async function withReasonRows<T>(
  projectId: string,
  target: { shiftIds: string[] } | { sessionId: string; checkpointIds: string[] },
  assign: (db: SessionDb, shiftIds: string[]) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  return prisma.$transaction(async (db) => {
    await lockSessions(db, projectId);
    if ('shiftIds' in target) {
      const found = await db.scheduleShift.count({ where: { id: { in: target.shiftIds }, projectId, kind: 'SHIFT' } });
      if (found !== target.shiftIds.length) return { ok: false as const, error: 'Сдвиги не относятся к этому проекту' };
      return { ok: true as const, value: await assign(db, target.shiftIds) };
    }
    const session = await db.scheduleShiftSession.findFirst({ where: { id: target.sessionId, projectId }, select: { closedAt: true } });
    if (!session) return { ok: false as const, error: 'Сессия правок не относится к этому проекту' };
    if (!session.closedAt) return { ok: false as const, error: 'Причину можно указать, когда правки закончены' };
    const journal = await db.scheduleShift.findMany({ where: { projectId, checkpointId: { in: target.checkpointIds } }, orderBy: { createdAt: 'asc' } });
    const ids: string[] = [];
    for (const checkpointId of target.checkpointIds) {
      for (const step of checkpointSteps(journal.filter((row) => row.checkpointId === checkpointId))) {
        if (step.sessionId === target.sessionId) ids.push(...step.rows.map((row) => row.id));
      }
    }
    if (ids.length === 0) return { ok: false as const, error: 'В этой сессии у выбранных вех нет сдвигов' };
    return { ok: true as const, value: await assign(db, ids) };
  });
}

/** The later-than-baseline moves of one operation that still have no reason, for the prompt after a save. */
export async function operationShiftsNeedingReason(operationId: string) {
  const rows = await prisma.scheduleShift.findMany({ where: { operationId, kind: 'SHIFT', reasonCategory: null }, orderBy: { checkpointCode: 'asc' } });
  // Moves made before the project's plan was first fixed ask for no reason.
  const since = rows[0] ? await firstBaselineAt(rows[0].projectId) : null;
  const open = since ? rows.filter((row) => row.createdAt >= since && needsReason(row as Parameters<typeof needsReason>[0])) : [];
  return {
    projectId: open[0]?.projectId ?? rows[0]?.projectId ?? null,
    shifts: open.map((row) => ({
      id: row.id,
      checkpointId: row.checkpointId,
      checkpointCode: row.checkpointCode,
      checkpointTitle: row.checkpointTitle,
      deltaDays: row.deltaDays,
      newDate: isoDay(row.newDate),
      baselineDate: isoDay(row.baselineDate),
    })),
  };
}
