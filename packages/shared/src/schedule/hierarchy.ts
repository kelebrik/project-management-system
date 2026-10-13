import { addWorkingDays, type CalendarOverrides, type ScheduleCalendarCode } from "./calendar.js";
import type { ScheduleItemStatus, ScheduleItemType } from "./types.js";

type HierarchyItem = { id: string; parentId?: string | null; code: string; type: ScheduleItemType; status?: ScheduleItemStatus; workDays: number | null; wbsLevel?: number | null; sortOrder: number };

export function isWbsCheckpointType(item: { type: ScheduleItemType }) {
  return item.type === "MILESTONE" || item.type === "GOAL";
}

export function isWbsZeroDurationItem(item: { type: ScheduleItemType; status?: ScheduleItemStatus }) {
  return isWbsCheckpointType(item) || item.status === "CANCELLED";
}

export function resolveDurationWorkDays(item: HierarchyItem) {
  if (isWbsZeroDurationItem(item)) return 0;
  if (item.workDays !== null && item.workDays !== undefined) return Math.max(0, item.workDays);
  return null;
}

function wbsLevelFromCode(code: string) {
  return Math.max(1, code.split(".").filter(Boolean).length);
}

export function wbsLevelFromItem(item: { code: string; wbsLevel?: number | null }) {
  return Math.max(1, item.wbsLevel ?? wbsLevelFromCode(item.code));
}

function parentCodeFromCode(code: string) {
  const parts = code.split(".").filter(Boolean);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(".");
}

/** Children by parent: the parent the code says wins over the parent the row names. */
export function buildChildrenByParent<T extends HierarchyItem>(items: T[], itemsById: Map<string, T>, itemsByCode: Map<string, T>) {
  const childrenByParent = new Map<string, T[]>();
  for (const item of items) {
    const explicitParentId = item.parentId && itemsById.has(item.parentId) ? item.parentId : null;
    const inferredParentCode = parentCodeFromCode(item.code);
    const inferredParentId = inferredParentCode ? itemsByCode.get(inferredParentCode)?.id ?? null : null;
    const parentId = inferredParentId ?? explicitParentId;
    if (!parentId || parentId === item.id) continue;
    const children = childrenByParent.get(parentId);
    if (children) children.push(item);
    else childrenByParent.set(parentId, [item]);
  }
  return childrenByParent;
}

export function minDay(days: number[]) {
  return days.length === 0 ? null : days.reduce((earliest, current) => (current < earliest ? current : earliest));
}

export function maxDay(days: number[]) {
  return days.length === 0 ? null : days.reduce((latest, current) => (current > latest ? current : latest));
}

export function startFromFinish(finish: number, durationWorkDays: number, calendarCode: ScheduleCalendarCode, overrides: CalendarOverrides) {
  if (durationWorkDays <= 1) return finish;
  return addWorkingDays(finish, -(durationWorkDays - 1), calendarCode, overrides);
}

export function finishFromStart(start: number, durationWorkDays: number, calendarCode: ScheduleCalendarCode, overrides: CalendarOverrides, failure?: string) {
  if (durationWorkDays <= 1) return start;
  return addWorkingDays(start, durationWorkDays - 1, calendarCode, overrides, failure);
}

const NUMERIC_CODE = /^[0-9.]*$/;

/**
 * The order of Structure codes. Codes of digits and dots, which renumbering
 * and import always make, compare by their characters, the same order the
 * Russian collation gives them, in every browser; anything else falls back to
 * that collation.
 */
export function comparePlanCodes(left: string, right: string) {
  if (NUMERIC_CODE.test(left) && NUMERIC_CODE.test(right)) return left < right ? -1 : left > right ? 1 : 0;
  return left.localeCompare(right, "ru");
}

export function sortByPlanOrder(left: { sortOrder: number; code: string }, right: { sortOrder: number; code: string }) {
  return left.sortOrder - right.sortOrder || comparePlanCodes(left.code, right.code);
}
