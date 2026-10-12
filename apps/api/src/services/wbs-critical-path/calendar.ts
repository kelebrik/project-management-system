import type { ProjectCalendarCode } from "@prisma/client";
import {
  addWorkingDays as addDays,
  isWorkingDay as isWorking,
  signedWorkingDaysInclusive,
  workingDayDistance as distance,
  type CalendarOverrides,
} from "@pms/shared";
import { buildCalendarOverrides, dateOfDay, dayOf, startOfUtcDay } from "../wbs-schedule/calendar.js";

// The critical path counts days with the shared engine; these keep its Date API.

export { buildCalendarOverrides, startOfUtcDay };

export function isWorkingDay(value: Date, calendarCode: ProjectCalendarCode, overridesByKey: CalendarOverrides) {
  return isWorking(dayOf(value), calendarCode, overridesByKey);
}

export function addWorkingDays(value: Date, days: number, calendarCode: ProjectCalendarCode, overridesByKey: CalendarOverrides) {
  return dateOfDay(addDays(dayOf(value), days, calendarCode, overridesByKey, "Не удалось рассчитать рабочие дни критического пути"));
}

/** Working days from start to due, both counted, negative when due is before start. */
export function workingDaysInclusive(startDate: Date, dueDate: Date, calendarCode: ProjectCalendarCode, overridesByKey: CalendarOverrides) {
  return signedWorkingDaysInclusive(dayOf(startDate), dayOf(dueDate), calendarCode, overridesByKey);
}

export function workingDayDistance(startDate: Date, endDate: Date, calendarCode: ProjectCalendarCode, overridesByKey: CalendarOverrides) {
  return distance(dayOf(startDate), dayOf(endDate), calendarCode, overridesByKey);
}

export function calendarDayDistance(startDate: Date, endDate: Date) {
  return dayOf(endDate) - dayOf(startDate);
}
