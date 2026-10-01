import { AUTOMATION_LIMITS, type AutomationRowRef } from '@pms/shared';

const cut = (text: string, max: number = AUTOMATION_LIMITS.text) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
export const rowRef = (row: { id: string; code: string; title: string }): AutomationRowRef => ({ id: row.id, code: row.code, title: cut(row.title) });

/** At most a few rows by name, and how many more there are. */
export function listed<T>(rows: T[]) {
  return { rows: rows.slice(0, AUTOMATION_LIMITS.listed), more: Math.max(0, rows.length - AUTOMATION_LIMITS.listed) };
}

export type ShiftSource = {
  id: string;
  kind: string;
  checkpointId: string | null;
  checkpointCode: string;
  checkpointTitle: string;
  deltaDays: number | null;
  newDate: Date | null;
  baselineDate: Date | null;
  reasonCategory: string | null;
  createdAt: Date;
};

/**
 * Milestone and goal moves later by at least `minDays` calendar days, one per
 * checkpoint and local day: the biggest move of the day stands for the rest.
 */
export function shiftEvents(shifts: ShiftSource[], minDays: number, localDate: (at: Date) => string) {
  const byKey = new Map<string, ShiftSource>();
  for (const shift of shifts) {
    if (shift.kind !== 'SHIFT' || !shift.checkpointId || (shift.deltaDays ?? 0) < minDays) continue;
    const key = `shift:${shift.checkpointId}:${localDate(shift.createdAt)}`;
    const current = byKey.get(key);
    if (!current || (shift.deltaDays ?? 0) > (current.deltaDays ?? 0)) byKey.set(key, shift);
  }
  return [...byKey.entries()].map(([dedupeKey, shift]) => ({ dedupeKey, shift }));
}

export type CheckInSource = { id: string; wbsItemId: string; userId: string; personName: string; weekStart: Date; confidence: string; blocker: string };

/** Check-ins that say the work will not make it or name what is in the way; one per row, person and week. */
export function blockerEvents(checkIns: CheckInSource[]) {
  return checkIns
    .filter((checkIn) => checkIn.confidence === 'OFF_TRACK' || checkIn.blocker.trim() !== '')
    .map((checkIn) => ({ dedupeKey: `checkin:${checkIn.wbsItemId}:${checkIn.userId}:${checkIn.weekStart.toISOString().slice(0, 10)}`, checkIn }));
}

export type FloatRow = { id: string; code: string; title: string; type: string; status: string; totalFloatWorkDays: number };

/** Unfinished rows (not phases) with no float left. */
export function exhaustedFloat(rows: FloatRow[]) {
  return rows.filter((row) => row.type !== 'PHASE' && row.status !== 'DONE' && row.status !== 'CANCELLED' && row.totalFloatWorkDays <= 0);
}

/**
 * Rows that ran out of float since the last look. The first look only
 * remembers: otherwise switching the rule on would announce the whole
 * critical path at once.
 */
export function newlyExhausted(previousIds: string[] | undefined, current: FloatRow[]) {
  if (previousIds === undefined) return { fresh: [] as FloatRow[], ids: current.map((row) => row.id) };
  const before = new Set(previousIds);
  return { fresh: current.filter((row) => !before.has(row.id)), ids: current.map((row) => row.id) };
}

export type ReconciliationSource = { id: string; code: string; title: string; jiraKey: string; proposedStatus: string | null; actionable: boolean; expectedUpdatedAt: string; expectedJiraUpdatedAt: string | null };

/** Rows whose Jira ticket is done while the row is not, from the synced snapshots only. */
export function jiraDoneEvents(rows: ReconciliationSource[]) {
  return rows
    .filter((row) => row.proposedStatus === 'DONE' && row.actionable && row.expectedJiraUpdatedAt)
    .map((row) => ({ dedupeKey: `jira:${row.id}:${row.expectedJiraUpdatedAt}`, row }));
}

export const blockerIssueTitle = (row: { code: string; title: string }, blocker: string) =>
  cut(`${row.code} ${row.title}: ${blocker.trim() || 'не успеваю в срок'}`, 500);
export const cutText = cut;
