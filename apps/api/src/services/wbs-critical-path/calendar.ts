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

type BaseCalendarCode = Exclude<ProjectCalendarCode, "RU_CN">;

function baseCalendarCodes(
  calendarCode: ProjectCalendarCode,
): readonly BaseCalendarCode[] {
  return calendarCode === "RU_CN" ? ["RU", "CN"] : [calendarCode];
}

function isBaseCalendarWorkingDay(
  value: Date,
  calendarCode: BaseCalendarCode,
  overridesByKey: Map<string, boolean>,
) {
  const override = overridesByKey.get(calendarOverrideKey(calendarCode, value));
  return override ?? isDefaultWorkingDay(value);
}

function addCalendarDays(value: Date, days: number) {
  const result = startOfUtcDay(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function defaultWorkingDaysInclusive(startDate: Date, dueDate: Date) {
  const start = startOfUtcDay(startDate);
  const due = startOfUtcDay(dueDate);
  if (start.getTime() > due.getTime()) return 0;

  const totalDays = calendarDayDistance(start, due) + 1;
  const fullWeeks = Math.floor(totalDays / 7);
  let days = fullWeeks * 5;
  const remainingDays = totalDays % 7;
  const startDay = start.getUTCDay();

  for (let offset = 0; offset < remainingDays; offset += 1) {
    const day = (startDay + offset) % 7;
    if (day !== 0 && day !== 6) {
      days += 1;
    }
  }

  return days;
}

function overrideAdjustmentInclusive(
  startDate: Date,
  dueDate: Date,
  calendarCode: ProjectCalendarCode,
  overridesByKey: Map<string, boolean>,
) {
  const startTime = startOfUtcDay(startDate).getTime();
  const dueTime = startOfUtcDay(dueDate).getTime();
  const selectedCodes = new Set(baseCalendarCodes(calendarCode));
  const overrideDates = new Set<string>();
  let adjustment = 0;

  for (const key of overridesByKey.keys()) {
    const separatorIndex = key.indexOf(":");
    const code = key.slice(0, separatorIndex) as BaseCalendarCode;
    if (separatorIndex < 0 || !selectedCodes.has(code)) continue;
    overrideDates.add(key.slice(separatorIndex + 1));
  }

  for (const date of overrideDates) {
    const overrideDate = startOfUtcDay(new Date(`${date}T00:00:00.000Z`));
    const overrideTime = overrideDate.getTime();
    if (overrideTime < startTime || overrideTime > dueTime) continue;

    const isNormallyWorkingDay = isDefaultWorkingDay(overrideDate);
    const isCombinedWorkingDay = isWorkingDay(
      overrideDate,
      calendarCode,
      overridesByKey,
    );
    if (isCombinedWorkingDay !== isNormallyWorkingDay) {
      adjustment += isCombinedWorkingDay ? 1 : -1;
    }
  }

  return adjustment;
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
  return baseCalendarCodes(calendarCode).every((code) =>
    isBaseCalendarWorkingDay(value, code, overridesByKey),
  );
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
  const rangeStart = direction > 0 ? addCalendarDays(start, 1) : end;
  const rangeEnd = direction > 0 ? end : addCalendarDays(start, -1);
  const days =
    defaultWorkingDaysInclusive(rangeStart, rangeEnd) +
    overrideAdjustmentInclusive(rangeStart, rangeEnd, calendarCode, overridesByKey);

  return days * direction;
}

export function calendarDayDistance(startDate: Date, endDate: Date) {
  return Math.round(
    (startOfUtcDay(endDate).getTime() - startOfUtcDay(startDate).getTime()) /
      MILLISECONDS_IN_DAY,
  );
}
