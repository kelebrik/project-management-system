import type { ProjectCalendarCode } from "../index.js";
import { dayNumber, weekday, type PlainDate } from "./plain-date.js";

export type ScheduleCalendarCode = ProjectCalendarCode;
type BaseCalendarCode = Exclude<ScheduleCalendarCode, "RU_CN">;

export type ScheduleCalendarOverride = {
  calendarCode: ScheduleCalendarCode;
  date: PlainDate;
  isWorkingDay: boolean;
};

/** Working days a project set by hand, by calendar and day number. */
export type CalendarOverrides = Map<string, boolean>;

function overrideKey(calendarCode: BaseCalendarCode | ScheduleCalendarCode, day: number) {
  return `${calendarCode}:${day}`;
}

export function buildCalendarOverrides(overrides: ScheduleCalendarOverride[]): CalendarOverrides {
  const map: CalendarOverrides = new Map();
  for (const override of overrides) map.set(overrideKey(override.calendarCode, dayNumber(override.date)), override.isWorkingDay);
  return map;
}

function isDefaultWorkingDay(day: number) {
  const dayOfWeek = weekday(day);
  return dayOfWeek !== 0 && dayOfWeek !== 6;
}

function baseCalendarCodes(calendarCode: ScheduleCalendarCode): readonly BaseCalendarCode[] {
  return calendarCode === "RU_CN" ? ["RU", "CN"] : [calendarCode];
}

function isBaseCalendarWorkingDay(day: number, calendarCode: BaseCalendarCode, overrides: CalendarOverrides) {
  return overrides.get(overrideKey(calendarCode, day)) ?? isDefaultWorkingDay(day);
}

/** RU+CN works only on days both calendars work. */
export function isWorkingDay(day: number, calendarCode: ScheduleCalendarCode, overrides: CalendarOverrides) {
  return baseCalendarCodes(calendarCode).every((code) => isBaseCalendarWorkingDay(day, code, overrides));
}

export function addWorkingDays(
  day: number,
  days: number,
  calendarCode: ScheduleCalendarCode,
  overrides: CalendarOverrides,
  failure = "Не удалось рассчитать рабочие дни Структуры",
) {
  if (days === 0) return day;
  const step = days > 0 ? 1 : -1;
  let remaining = Math.abs(days);
  let result = day;
  let guard = 0;
  while (remaining > 0) {
    result += step;
    if (isWorkingDay(result, calendarCode, overrides)) remaining -= 1;
    guard += 1;
    if (guard > 20_000) throw new Error(failure);
  }
  return result;
}

export function calendarDaysInclusive(start: number, due: number) {
  return Math.max(0, due - start + 1);
}

/** Working days from start to due, both counted; none when due is before start. */
export function workingDaysInclusive(start: number, due: number, calendarCode: ScheduleCalendarCode, overrides: CalendarOverrides) {
  if (due < start) return 0;
  let workingDays = 0;
  let guard = 0;
  for (let current = start; current <= due; current += 1) {
    if (isWorkingDay(current, calendarCode, overrides)) workingDays += 1;
    guard += 1;
    if (guard > 20_000) throw new Error("Не удалось рассчитать рабочие дни Структуры");
  }
  return workingDays;
}

export function signedCalendarDays(start: number, due: number) {
  return due - start;
}

/** Working days from start to due, both counted, negative when due is before start. */
export function signedWorkingDaysInclusive(start: number, due: number, calendarCode: ScheduleCalendarCode, overrides: CalendarOverrides) {
  const direction = start <= due ? 1 : -1;
  let days = 0;
  let guard = 0;
  for (let cursor = start; ; cursor += direction) {
    if (isWorkingDay(cursor, calendarCode, overrides)) days += direction;
    if (cursor === due) break;
    guard += 1;
    if (guard > 20_000) throw new Error("Не удалось посчитать длительность критического пути");
  }
  return days;
}

function defaultWorkingDaysInclusive(start: number, due: number) {
  if (start > due) return 0;
  const totalDays = due - start + 1;
  let days = Math.floor(totalDays / 7) * 5;
  const startDay = weekday(start);
  for (let offset = 0; offset < totalDays % 7; offset += 1) {
    const day = (startDay + offset) % 7;
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
}

function overrideAdjustmentInclusive(start: number, due: number, calendarCode: ScheduleCalendarCode, overrides: CalendarOverrides) {
  const selectedCodes = new Set<string>(baseCalendarCodes(calendarCode));
  const overrideDays = new Set<number>();
  for (const key of overrides.keys()) {
    const separator = key.indexOf(":");
    if (separator < 0 || !selectedCodes.has(key.slice(0, separator))) continue;
    overrideDays.add(Number(key.slice(separator + 1)));
  }
  let adjustment = 0;
  for (const day of overrideDays) {
    if (day < start || day > due) continue;
    const combined = isWorkingDay(day, calendarCode, overrides);
    if (combined !== isDefaultWorkingDay(day)) adjustment += combined ? 1 : -1;
  }
  return adjustment;
}

/** Working days strictly after start up to end (or back), counted fast from whole weeks and the overrides. */
export function workingDayDistance(start: number, end: number, calendarCode: ScheduleCalendarCode, overrides: CalendarOverrides) {
  if (start === end) return 0;
  const direction = start < end ? 1 : -1;
  const rangeStart = direction > 0 ? start + 1 : end;
  const rangeEnd = direction > 0 ? end : start - 1;
  return (defaultWorkingDaysInclusive(rangeStart, rangeEnd) + overrideAdjustmentInclusive(rangeStart, rangeEnd, calendarCode, overrides)) * direction;
}
