import type { ProjectCalendarCode } from "@prisma/client";
import type { WbsCriticalPathCalendarOverride } from "./types.js";

const MILLISECONDS_IN_DAY = 86_400_000;

function dateKey(value: Date) {
  return startOfUtcDay(value).toISOString().slice(0, 10);
}

function calendarOverrideKey(calendarCode: ProjectCalendarCode, value: Date) {
  return `${calendarCode}:${dateKey(value)}`;
}

function isDefaultWorkingDay(value: Date) {
  const day = startOfUtcDay(value).getUTCDay();
  return day !== 0 && day !== 6;
}

export function startOfUtcDay(value: Date) {
  const result = new Date(value);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

export function buildCalendarOverrides(
  overrides: WbsCriticalPathCalendarOverride[],
) {
  const map = new Map<string, boolean>();
  for (const override of overrides) {
    map.set(
      calendarOverrideKey(override.calendarCode, override.date),
      override.isWorkingDay,
    );
  }
  return map;
}

export function isWorkingDay(
  value: Date,
  calendarCode: ProjectCalendarCode,
  overridesByKey: Map<string, boolean>,
) {
  const override = overridesByKey.get(calendarOverrideKey(calendarCode, value));
  return override ?? isDefaultWorkingDay(value);
}

export function addWorkingDays(
  value: Date,
  days: number,
  calendarCode: ProjectCalendarCode,
  overridesByKey: Map<string, boolean>,
) {
  const result = startOfUtcDay(value);
  if (days === 0) return result;

  const step = days > 0 ? 1 : -1;
  let remaining = Math.abs(days);
  let guard = 0;

  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + step);
    if (isWorkingDay(result, calendarCode, overridesByKey)) {
      remaining -= 1;
    }
    guard += 1;
    if (guard > 20_000) {
      throw new Error("Не удалось рассчитать рабочие дни критического пути");
    }
  }

  return result;
}

export function workingDaysInclusive(
  startDate: Date,
  dueDate: Date,
  calendarCode: ProjectCalendarCode,
  overridesByKey: Map<string, boolean>,
) {
  const start = startOfUtcDay(startDate);
  const due = startOfUtcDay(dueDate);
  const direction = start.getTime() <= due.getTime() ? 1 : -1;
  const cursor = new Date(start);
  let days = 0;
  let guard = 0;

  while (true) {
    if (isWorkingDay(cursor, calendarCode, overridesByKey)) {
      days += direction;
    }
    if (cursor.getTime() === due.getTime()) break;
    cursor.setUTCDate(cursor.getUTCDate() + direction);
    guard += 1;
    if (guard > 20_000) {
      throw new Error("Не удалось посчитать длительность критического пути");
    }
  }

  return days;
}

export function workingDayDistance(
  startDate: Date,
  endDate: Date,
  calendarCode: ProjectCalendarCode,
  overridesByKey: Map<string, boolean>,
) {
  const start = startOfUtcDay(startDate);
  const end = startOfUtcDay(endDate);
  if (start.getTime() === end.getTime()) return 0;

  const direction = start.getTime() < end.getTime() ? 1 : -1;
  const cursor = new Date(start);
  let days = 0;
  let guard = 0;

  while (cursor.getTime() !== end.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + direction);
    if (isWorkingDay(cursor, calendarCode, overridesByKey)) {
      days += direction;
    }
    guard += 1;
    if (guard > 20_000) {
      throw new Error("Не удалось посчитать резерв критического пути");
    }
  }

  return days;
}

export function calendarDayDistance(startDate: Date, endDate: Date) {
  return Math.round(
    (startOfUtcDay(endDate).getTime() - startOfUtcDay(startDate).getTime()) /
      MILLISECONDS_IN_DAY,
  );
}
