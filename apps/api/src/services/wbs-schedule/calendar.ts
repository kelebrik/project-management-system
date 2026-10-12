import type { ProjectCalendarCode } from "@prisma/client";
import {
  addWorkingDays as addDays,
  buildCalendarOverrides as buildOverrides,
  calendarDaysInclusive as calendarDays,
  isWorkingDay as isWorking,
  plainDate,
  signedCalendarDays as signedDays,
  workingDaysInclusive as workingDays,
  type CalendarOverrides,
  type PlainDate,
} from "@pms/shared";
import type { WbsScheduleCalendarOverride } from "./types.js";

// The calendar lives in the shared engine on day numbers; these keep the
// server's Date API. A date counts by its UTC day, as the columns store it.

const DAY = 86_400_000;

export function startOfUtcDay(value: Date) {
  const result = new Date(value);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

/** The day number of a Date's UTC day. */
export function dayOf(value: Date) {
  return Math.floor(value.getTime() / DAY);
}

export function dateOfDay(day: number) {
  return new Date(day * DAY);
}

export function toPlainDate(value: Date): PlainDate;
export function toPlainDate(value: Date | null | undefined): PlainDate | null;
export function toPlainDate(value: Date | null | undefined) {
  return value ? plainDate(dayOf(value)) : null;
}

export function fromPlainDate(value: PlainDate): Date;
export function fromPlainDate(value: PlainDate | null | undefined): Date | null;
export function fromPlainDate(value: PlainDate | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function buildCalendarOverrides(overrides: WbsScheduleCalendarOverride[]): CalendarOverrides {
  return buildOverrides(overrides.map((override) => ({ ...override, date: toPlainDate(override.date) })));
}

export function isWorkingDay(value: Date, calendarCode: ProjectCalendarCode, overridesByKey: CalendarOverrides) {
  return isWorking(dayOf(value), calendarCode, overridesByKey);
}

export function addWorkingDays(value: Date, days: number, calendarCode: ProjectCalendarCode, overridesByKey: CalendarOverrides) {
  return dateOfDay(addDays(dayOf(value), days, calendarCode, overridesByKey));
}

export function calendarDaysInclusive(startDate: Date, dueDate: Date) {
  return calendarDays(dayOf(startDate), dayOf(dueDate));
}

export function workingDaysInclusive(startDate: Date, dueDate: Date, calendarCode: ProjectCalendarCode, overridesByKey: CalendarOverrides) {
  return workingDays(dayOf(startDate), dayOf(dueDate), calendarCode, overridesByKey);
}

export function signedCalendarDays(startDate: Date, dueDate: Date) {
  return signedDays(dayOf(startDate), dayOf(dueDate));
}

export function sameDate(left: Date | null, right: Date | null) {
  return (left ? dayOf(left) : null) === (right ? dayOf(right) : null);
}

export function sameNumber(left: number | null, right: number | null) {
  return (left ?? null) === (right ?? null);
}

export function normalizedDate(value: Date | null) {
  return value ? startOfUtcDay(value) : null;
}
