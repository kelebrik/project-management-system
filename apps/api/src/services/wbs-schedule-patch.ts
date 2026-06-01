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

const WBS_SCHEDULE_DATE_FIELDS = [
  "startDate",
  "dueDate",
  "forecastStartDate",
  "forecastDueDate",
] as const;

const WBS_SCHEDULE_PREDECESSOR_FIELDS = [
  "predecessor1",
  "predecessor2",
  "predecessor3",
  "predecessor4",
  "predecessor5",
  "predecessor6",
] as const;

function dateOnly(value: Date | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function resolveWbsSchedulePatch(
  patch: WbsSchedulePatch,
  existing: WbsScheduleExisting,
) {
  const fields = new Set<string>();
  const changedDateFields = WBS_SCHEDULE_DATE_FIELDS.filter(
    (field) =>
      patch[field] !== undefined &&
      dateOnly(patch[field]) !== dateOnly(existing[field]),
  );
  const hasDatePayload = WBS_SCHEDULE_DATE_FIELDS.some(
    (field) => patch[field] !== undefined,
  );
  const hasChangedWorkDays =
    patch.workDays !== undefined && (patch.workDays ?? null) !== existing.workDays;
  const hasChangedCalendarDays =
    patch.calendarDays !== undefined &&
    (patch.calendarDays ?? null) !== existing.calendarDays;

  const effectiveDriver =
    patch.scheduleDriver ??
    (changedDateFields.length > 0 ? ("dates" as const) : undefined);

  // A full-row autosave may arrive after a date edit with unchanged dates but
  // stale duration values. Explicit workDays edits send scheduleDriver=workDays.
  const staleDurationFromFullRowSave =
    effectiveDriver === undefined &&
    hasDatePayload &&
    changedDateFields.length === 0 &&
    (hasChangedWorkDays || hasChangedCalendarDays);

  const writeScheduleDates = effectiveDriver !== "workDays";
  const writeWorkDays =
    effectiveDriver !== "dates" && !staleDurationFromFullRowSave;
  const writeCalendarDays =
    effectiveDriver === undefined && !staleDurationFromFullRowSave;

  if (writeScheduleDates) {
    for (const field of changedDateFields) {
      fields.add(field);
    }
  }

  if (writeWorkDays && hasChangedWorkDays) {
    fields.add("workDays");
  }
  if (patch.calendarCode !== undefined && patch.calendarCode !== existing.calendarCode) {
    fields.add("calendarCode");
  }
  if (patch.leadLagDays !== undefined && patch.leadLagDays !== existing.leadLagDays) {
    fields.add("leadLagDays");
  }

  for (const field of WBS_SCHEDULE_PREDECESSOR_FIELDS) {
    if (patch[field] !== undefined && (patch[field] || null) !== existing[field]) {
      fields.add(field);
      fields.add("predecessors");
    }
  }

  return {
    changedFields: [...fields],
    scheduleDriver: effectiveDriver,
    staleDurationFromFullRowSave,
    writeCalendarDays,
    writeScheduleDates,
    writeWorkDays,
  };
}

export function resolveWbsScheduleDateWrites(
  patch: WbsSchedulePatch,
  schedulePatch: ReturnType<typeof resolveWbsSchedulePatch>,
) {
  if (!schedulePatch.writeScheduleDates) {
    return {
      startDate: undefined,
      dueDate: undefined,
      forecastStartDate: undefined,
      forecastDueDate: undefined,
    };
  }

  return {
    startDate: patch.startDate,
    dueDate: patch.dueDate,
    forecastStartDate:
      schedulePatch.scheduleDriver === "dates" && patch.startDate !== undefined
        ? patch.startDate
        : patch.forecastStartDate,
    forecastDueDate:
      schedulePatch.scheduleDriver === "dates" && patch.dueDate !== undefined
        ? patch.dueDate
        : patch.forecastDueDate,
  };
}
