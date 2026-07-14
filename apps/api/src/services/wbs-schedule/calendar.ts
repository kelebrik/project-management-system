import type { ProjectCalendarCode } from "@prisma/client";
import type { WbsScheduleCalendarOverride } from "./types.js";

export function startOfUtcDay(value: Date) {
  const result = new Date(value);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function dateKey(value: Date) {
  return startOfUtcDay(value).toISOString().slice(0, 10);
}

function calendarOverrideKey(calendarCode: ProjectCalendarCode, value: Date) {
  return `${calendarCode}:${dateKey(value)}`;
}

export function buildCalendarOverrides(
  overrides: WbsScheduleCalendarOverride[],
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

function isWorkingDay(
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
      throw new Error("Не удалось рассчитать рабочие дни Структуры");
    }
  }

  return result;
}

export function calendarDaysInclusive(startDate: Date, dueDate: Date) {
  const start = startOfUtcDay(startDate);
  const due = startOfUtcDay(dueDate);
  const diff = Math.round((due.getTime() - start.getTime()) / 86_400_000);
  return Math.max(0, diff + 1);
}

export function workingDaysInclusive(
  startDate: Date,
  dueDate: Date,
  calendarCode: ProjectCalendarCode,
  overridesByKey: Map<string, boolean>,
) {
  const start = startOfUtcDay(startDate);
  const due = startOfUtcDay(dueDate);
  if (due.getTime() < start.getTime()) return 0;

  let current = new Date(start);
  let workingDays = 0;
  let guard = 0;
  while (current.getTime() <= due.getTime()) {
    if (isWorkingDay(current, calendarCode, overridesByKey)) {
      workingDays += 1;
    }
    current.setUTCDate(current.getUTCDate() + 1);
    guard += 1;
    if (guard > 20_000) {
      throw new Error("Не удалось рассчитать рабочие дни Структуры");
    }
  }
  return workingDays;
}

export function signedCalendarDays(startDate: Date, dueDate: Date) {
  const start = startOfUtcDay(startDate);
  const due = startOfUtcDay(dueDate);
  return Math.round((due.getTime() - start.getTime()) / 86_400_000);
}

export function sameDate(left: Date | null, right: Date | null) {
  return (
    (left ? startOfUtcDay(left).getTime() : null) ===
    (right ? startOfUtcDay(right).getTime() : null)
  );
}

export function sameNumber(left: number | null, right: number | null) {
  return (left ?? null) === (right ?? null);
}

export function normalizedDate(value: Date | null) {
  return value ? startOfUtcDay(value) : null;
}
