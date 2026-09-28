import { addDays, daysBetween, isWorkingDay, workingDaysInRange, type LeaveCalendarDay } from "./leaveScheduleModel";
import type { WorkloadItem } from "./workloadModel";

/** What a drag grabs: the whole bar, or its start or finish edge. */
export type WorkloadDragMode = "move" | "start" | "end";

export type WorkloadDates = { startDate: string; dueDate: string };

/** A day far enough to cover any run of holidays when looking for a working day. */
const MAX_SEARCH_DAYS = 31;

/** The nearest working day from `day` in the given direction, `day` itself when it is one. */
export function snapToWorkingDay(day: string, direction: 1 | -1, overrides: Map<string, LeaveCalendarDay>) {
  let candidate = day;
  for (let step = 0; step < MAX_SEARCH_DAYS; step += 1) {
    if (isWorkingDay(candidate, overrides)) return candidate;
    candidate = addDays(candidate, direction);
  }
  return day;
}

/** The day on which `count` working days starting at `start` end; `start` itself for one day. */
export function endAfterWorkingDays(start: string, count: number, overrides: Map<string, LeaveCalendarDay>) {
  let day = start;
  let left = Math.max(1, count) - (isWorkingDay(start, overrides) ? 1 : 0);
  while (left > 0) {
    day = addDays(day, 1);
    if (isWorkingDay(day, overrides)) left -= 1;
  }
  return day;
}

/**
 * New dates for a bar dragged by `deltaDays`. Moving keeps the number of working
 * days and lands the start on a working day; an edge lands on a working day and
 * never passes the other edge. Returns null when nothing changes.
 */
export function planDrag(
  dates: WorkloadDates,
  mode: WorkloadDragMode,
  deltaDays: number,
  overrides: Map<string, LeaveCalendarDay>,
): WorkloadDates | null {
  if (deltaDays === 0) return null;
  const direction = deltaDays > 0 ? 1 : -1;
  let next: WorkloadDates;
  if (mode === "move") {
    const startDate = snapToWorkingDay(addDays(dates.startDate, deltaDays), direction, overrides);
    const working = workingDaysInRange(dates.startDate, dates.dueDate, overrides);
    const dueDate =
      working > 0
        ? endAfterWorkingDays(startDate, working, overrides)
        : addDays(startDate, Math.max(0, daysBetween(dates.startDate, dates.dueDate)));
    next = { startDate, dueDate };
  } else if (mode === "start") {
    const startDate = snapToWorkingDay(addDays(dates.startDate, deltaDays), 1, overrides);
    next = { startDate: startDate > dates.dueDate ? dates.dueDate : startDate, dueDate: dates.dueDate };
  } else {
    const dueDate = snapToWorkingDay(addDays(dates.dueDate, deltaDays), -1, overrides);
    next = { startDate: dates.startDate, dueDate: dueDate < dates.startDate ? dates.startDate : dueDate };
  }
  return next.startDate === dates.startDate && next.dueDate === dates.dueDate ? null : next;
}

/** Why a bar cannot be changed from the planner, or null when it can. */
export type WorkloadReadOnlyReason = "access" | "issue" | "done" | null;

/**
 * What the planner may change on a piece of work. Links keep the dates they set;
 * a finished item, one an open issue manages, or one in a project the user may
 * not edit stays as it is.
 */
export function workloadEditRights(item: WorkloadItem, editableProjectIds: ReadonlySet<string>) {
  const reason: WorkloadReadOnlyReason = !editableProjectIds.has(item.projectId) || !item.updatedAt
    ? "access"
    : item.lockedByIssue
      ? "issue"
      : item.status === "DONE"
        ? "done"
        : null;
  const editable = reason === null;
  return {
    reason,
    owner: editable,
    start: editable && !item.startLocked,
    end: editable && !item.finishLocked,
    move: editable && !item.startLocked && !item.finishLocked,
  };
}

export type WorkloadChange = { owner?: string; startDate?: string; dueDate?: string };

/** Only the fields that differ from the item, or null when nothing changes. */
export function workloadChange(item: WorkloadItem, next: WorkloadChange): WorkloadChange | null {
  const change: WorkloadChange = {};
  if (next.owner !== undefined && next.owner.trim() && next.owner.trim() !== item.owner) change.owner = next.owner.trim();
  if (next.startDate !== undefined && next.startDate !== item.startDate) change.startDate = next.startDate;
  if (next.dueDate !== undefined && next.dueDate !== item.dueDate) change.dueDate = next.dueDate;
  return Object.keys(change).length > 0 ? change : null;
}

/** The change that puts back what `change` replaced on `before`. */
export function reverseWorkloadChange(before: WorkloadItem, change: WorkloadChange): WorkloadChange {
  return {
    ...(change.owner !== undefined ? { owner: before.owner } : {}),
    ...(change.startDate !== undefined ? { startDate: before.startDate } : {}),
    ...(change.dueDate !== undefined ? { dueDate: before.dueDate } : {}),
  };
}
