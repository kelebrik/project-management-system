import type { ProjectCalendarCode } from "@prisma/client";
import {
  addWorkingDays,
  startOfUtcDay,
  workingDaysInclusive,
} from "./calendar.js";
import type { WbsCriticalPathItemInput } from "./types.js";

function isWbsCheckpointType(item: Pick<WbsCriticalPathItemInput, "type">) {
  return item.type === "MILESTONE" || item.type === "GOAL";
}

function isWbsZeroDurationItem(
  item: Pick<WbsCriticalPathItemInput, "type" | "status">,
) {
  return isWbsCheckpointType(item) || item.status === "CANCELLED";
}

export function finishFromStart(
  startDate: Date,
  durationWorkDays: number,
  calendarCode: ProjectCalendarCode,
  overridesByKey: Map<string, boolean>,
) {
  if (durationWorkDays <= 1) return startOfUtcDay(startDate);
  return addWorkingDays(
    startDate,
    durationWorkDays - 1,
    calendarCode,
    overridesByKey,
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

export function maxDate(left: Date, right: Date) {
  return right.getTime() > left.getTime() ? right : left;
}

export function minDate(left: Date, right: Date) {
  return right.getTime() < left.getTime() ? right : left;
}

export function sameDate(left: Date, right: Date) {
  return startOfUtcDay(left).getTime() === startOfUtcDay(right).getTime();
}

export function sortByPlanOrder(
  left: WbsCriticalPathItemInput,
  right: WbsCriticalPathItemInput,
) {
  return left.sortOrder - right.sortOrder || left.code.localeCompare(right.code, "ru");
}

export function resolveDurationWorkDays(
  item: WbsCriticalPathItemInput,
  overridesByKey: Map<string, boolean>,
) {
  if (isWbsZeroDurationItem(item)) return 0;
  if (item.workDays !== null && item.workDays !== undefined) {
    return Math.max(0, item.workDays);
  }
  if (item.startDate && item.dueDate) {
    return Math.max(
      1,
      Math.abs(
        workingDaysInclusive(
          item.startDate,
          item.dueDate,
          item.calendarCode,
          overridesByKey,
        ),
      ),
    );
  }
  return 1;
}
