import { isWorkingDay as isProductionWorkingDay, type LeaveCalendarDay } from "./leaveScheduleModel";

export type ProjectCalendarCode = "RU" | "CN" | "RU_CN";
/** A day a project's calendar sets apart from Monday to Friday, as the server stores it. */
export type ProjectCalendarOverrideDay = { calendarCode: ProjectCalendarCode; date: string; isWorkingDay: boolean };
/** Whether a day (YYYY-MM-DD) is a working day in some calendar. */
export type WorkingDayTest = (day: string) => boolean;

/** Far enough to cross any run of days off; the server's schedule search goes further still, so the two agree on real calendars. */
export const WORKING_DAY_SEARCH_LIMIT = 3660;

const weekday = (day: string) => new Date(`${day}T00:00:00.000Z`).getUTCDay();

/**
 * A project calendar as the server's schedule reads it: Monday to Friday plus
 * the project's own days off and working days; "RU_CN" works only on days
 * that are working in both the Russian and the Chinese calendar.
 */
export function projectCalendarTest(calendarCode: ProjectCalendarCode, overrides: readonly ProjectCalendarOverrideDay[]): WorkingDayTest {
  const byKey = new Map(overrides.map((override) => [`${override.calendarCode}:${override.date.slice(0, 10)}`, override.isWorkingDay]));
  const codes: Array<"RU" | "CN"> = calendarCode === "RU_CN" ? ["RU", "CN"] : [calendarCode];
  return (day) => codes.every((code) => byKey.get(`${code}:${day}`) ?? (weekday(day) !== 0 && weekday(day) !== 6));
}

/** The production calendar of people (the leave schedule's), as a test. */
export const productionCalendarTest = (overrides: Map<string, LeaveCalendarDay>): WorkingDayTest => (day) => isProductionWorkingDay(day, overrides);

export function addCalendarDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Working days from `from` to `to`, both included; 0 when `to` is before `from`. */
export function countWorkingDays(from: string, to: string, isWorking: WorkingDayTest) {
  let count = 0;
  for (let day = from, guard = 0; day <= to && guard < WORKING_DAY_SEARCH_LIMIT * 10; day = addCalendarDays(day, 1), guard += 1) {
    if (isWorking(day)) count += 1;
  }
  return count;
}
