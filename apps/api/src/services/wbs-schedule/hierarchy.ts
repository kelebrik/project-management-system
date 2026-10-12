import type { ProjectCalendarCode } from "@prisma/client";
import type { CalendarOverrides } from "@pms/shared";
import { addWorkingDays, startOfUtcDay } from "./calendar.js";

export { buildChildrenByParent, isWbsCheckpointType, isWbsZeroDurationItem, resolveDurationWorkDays, sortByPlanOrder, wbsLevelFromItem } from "@pms/shared";

export function minDate(dates: Date[]) {
  if (dates.length === 0) return null;
  return dates.reduce((earliest, current) => (current.getTime() < earliest.getTime() ? current : earliest));
}

export function maxDate(dates: Date[]) {
  if (dates.length === 0) return null;
  return dates.reduce((latest, current) => (current.getTime() > latest.getTime() ? current : latest));
}

export function startFromFinish(finishDate: Date, durationWorkDays: number, calendarCode: ProjectCalendarCode, overridesByKey: CalendarOverrides) {
  if (durationWorkDays <= 1) return startOfUtcDay(finishDate);
  return addWorkingDays(finishDate, -(durationWorkDays - 1), calendarCode, overridesByKey);
}
