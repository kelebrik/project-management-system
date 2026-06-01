import type { ProjectCalendarCode } from "@prisma/client";
import {
  addWorkingDays,
  startOfUtcDay,
  workingDaysInclusive,
} from "./calendar.js";
import type { WbsCriticalPathItemInput } from "./types.js";

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
  if (item.type === "MILESTONE") return 0;
  if (item.workDays !== null && item.workDays !== undefined && item.workDays > 0) {
    return item.workDays;
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
