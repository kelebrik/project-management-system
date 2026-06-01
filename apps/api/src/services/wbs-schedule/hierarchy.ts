import type { ProjectCalendarCode } from "@prisma/client";
import {
  addWorkingDays,
  startOfUtcDay,
} from "./calendar.js";
import type { WbsScheduleItem } from "./types.js";

export function resolveDurationWorkDays(item: WbsScheduleItem) {
  if (item.workDays !== null && item.workDays !== undefined) {
    return Math.max(0, item.workDays);
  }
  if (item.type === "MILESTONE") return 0;
  return null;
}

function wbsLevelFromCode(code: string) {
  return Math.max(1, code.split(".").filter(Boolean).length);
}

export function wbsLevelFromItem(item: WbsScheduleItem) {
  return Math.max(1, item.wbsLevel ?? wbsLevelFromCode(item.code));
}

function parentCodeFromCode(code: string) {
  const parts = code.split(".").filter(Boolean);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(".");
}

export function buildChildrenByParent(
  items: WbsScheduleItem[],
  itemsById: Map<string, WbsScheduleItem>,
  itemsByCode: Map<string, WbsScheduleItem>,
) {
  const childrenByParent = new Map<string, WbsScheduleItem[]>();
  for (const item of items) {
    const explicitParentId =
      item.parentId && itemsById.has(item.parentId) ? item.parentId : null;
    const inferredParentCode = parentCodeFromCode(item.code);
    const inferredParentId = inferredParentCode
      ? itemsByCode.get(inferredParentCode)?.id ?? null
      : null;
    const parentId = inferredParentId ?? explicitParentId;
    if (!parentId || parentId === item.id) continue;
    childrenByParent.set(parentId, [
      ...(childrenByParent.get(parentId) ?? []),
      item,
    ]);
  }
  return childrenByParent;
}

export function minDate(dates: Date[]) {
  if (dates.length === 0) return null;
  return dates.reduce((earliest, current) =>
    current.getTime() < earliest.getTime() ? current : earliest,
  );
}

export function maxDate(dates: Date[]) {
  if (dates.length === 0) return null;
  return dates.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest,
  );
}

export function startFromFinish(
  finishDate: Date,
  durationWorkDays: number,
  calendarCode: ProjectCalendarCode,
  overridesByKey: Map<string, boolean>,
) {
  if (durationWorkDays <= 1) return startOfUtcDay(finishDate);
  return addWorkingDays(
    finishDate,
    -(durationWorkDays - 1),
    calendarCode,
    overridesByKey,
  );
}

export function sortByPlanOrder(left: WbsScheduleItem, right: WbsScheduleItem) {
  return (
    left.sortOrder - right.sortOrder ||
    left.code.localeCompare(right.code, "ru")
  );
}
