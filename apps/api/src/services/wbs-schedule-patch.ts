import { resolveScheduleDateWrites, resolveSchedulePatch } from "@pms/shared";
import type { ProjectCalendarCode } from "@prisma/client";

export type WbsScheduleDriver = "dates" | "workDays";

export type WbsSchedulePatch = {
  scheduleDriver?: WbsScheduleDriver;
  startDate?: Date | string | null;
  dueDate?: Date | string | null;
  forecastStartDate?: Date | string | null;
  forecastDueDate?: Date | string | null;
  predecessor1?: string | null;
  predecessor2?: string | null;
  predecessor3?: string | null;
  predecessor4?: string | null;
  predecessor5?: string | null;
  predecessor6?: string | null;
  leadLagDays?: number;
  workDays?: number | null;
  calendarDays?: number | null;
  calendarCode?: ProjectCalendarCode;
};

type WbsScheduleExisting = {
  startDate: Date | null;
  dueDate: Date | null;
  forecastStartDate?: Date | null;
  forecastDueDate?: Date | null;
  predecessor1: string | null;
  predecessor2: string | null;
  predecessor3: string | null;
  predecessor4: string | null;
  predecessor5: string | null;
  predecessor6: string | null;
  leadLagDays: number;
  workDays: number | null;
  calendarDays: number | null;
  calendarCode: ProjectCalendarCode;
};

/** A date as its UTC calendar day; an empty or unreadable value is no date. */
function dateOnly(value: Date | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Which schedule fields a row edit changes; the rule is resolveSchedulePatch in @pms/shared. */
export function resolveWbsSchedulePatch(patch: WbsSchedulePatch, existing: WbsScheduleExisting) {
  const day = (value: Date | string | null | undefined) => (value === undefined ? undefined : dateOnly(value));
  return resolveSchedulePatch(
    { ...patch, startDate: day(patch.startDate), dueDate: day(patch.dueDate), forecastStartDate: day(patch.forecastStartDate), forecastDueDate: day(patch.forecastDueDate) },
    { ...existing, startDate: dateOnly(existing.startDate), dueDate: dateOnly(existing.dueDate), forecastStartDate: dateOnly(existing.forecastStartDate), forecastDueDate: dateOnly(existing.forecastDueDate) },
  );
}

export function resolveWbsScheduleDateWrites(patch: WbsSchedulePatch, schedulePatch: ReturnType<typeof resolveWbsSchedulePatch>) {
  return resolveScheduleDateWrites(patch, schedulePatch);
}
