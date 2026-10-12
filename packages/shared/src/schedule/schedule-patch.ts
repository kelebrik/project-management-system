import type { ScheduleCalendarCode } from "./calendar.js";
import type { PlainDate } from "./plain-date.js";

export type ScheduleDriver = "dates" | "workDays";

const DATE_FIELDS = ["startDate", "dueDate", "forecastStartDate", "forecastDueDate"] as const;
const PREDECESSOR_FIELDS = ["predecessor1", "predecessor2", "predecessor3", "predecessor4", "predecessor5", "predecessor6"] as const;

type Predecessors = { [Field in (typeof PREDECESSOR_FIELDS)[number]]?: string | null };

export type SchedulePatch = Predecessors & {
  scheduleDriver?: ScheduleDriver;
  startDate?: PlainDate | null;
  dueDate?: PlainDate | null;
  forecastStartDate?: PlainDate | null;
  forecastDueDate?: PlainDate | null;
  leadLagDays?: number;
  workDays?: number | null;
  calendarDays?: number | null;
  calendarCode?: ScheduleCalendarCode;
};

export type ScheduleExisting = { [Field in (typeof PREDECESSOR_FIELDS)[number]]: string | null } & {
  startDate: PlainDate | null;
  dueDate: PlainDate | null;
  forecastStartDate?: PlainDate | null;
  forecastDueDate?: PlainDate | null;
  leadLagDays: number;
  workDays: number | null;
  calendarDays: number | null;
  calendarCode: ScheduleCalendarCode;
};

/**
 * Which schedule fields a row edit really changes, and which of the circle
 * dates ↔ working days it drives: an explicit driver wins, changed dates
 * drive the dates, and a full-row save that repeats the dates with a stale
 * duration changes neither.
 */
export function resolveSchedulePatch(patch: SchedulePatch, existing: ScheduleExisting) {
  const fields = new Set<string>();
  const changedDateFields = DATE_FIELDS.filter((field) => patch[field] !== undefined && (patch[field] || null) !== (existing[field] ?? null));
  const hasDatePayload = DATE_FIELDS.some((field) => patch[field] !== undefined);
  const hasChangedWorkDays = patch.workDays !== undefined && (patch.workDays ?? null) !== existing.workDays;
  const hasChangedCalendarDays = patch.calendarDays !== undefined && (patch.calendarDays ?? null) !== existing.calendarDays;
  const effectiveDriver = patch.scheduleDriver ?? (changedDateFields.length > 0 ? ("dates" as const) : undefined);

  // A full-row autosave may arrive after a date edit with unchanged dates but
  // stale duration values. Explicit workDays edits send scheduleDriver=workDays.
  const staleDurationFromFullRowSave = effectiveDriver === undefined && hasDatePayload && changedDateFields.length === 0 && (hasChangedWorkDays || hasChangedCalendarDays);
  const writeScheduleDates = effectiveDriver !== "workDays";
  const writeWorkDays = effectiveDriver !== "dates" && !staleDurationFromFullRowSave;
  const writeCalendarDays = effectiveDriver === undefined && !staleDurationFromFullRowSave;

  if (writeScheduleDates) for (const field of changedDateFields) fields.add(field);
  if (writeWorkDays && hasChangedWorkDays) fields.add("workDays");
  if (patch.calendarCode !== undefined && patch.calendarCode !== existing.calendarCode) fields.add("calendarCode");
  if (patch.leadLagDays !== undefined && patch.leadLagDays !== existing.leadLagDays) fields.add("leadLagDays");
  for (const field of PREDECESSOR_FIELDS) {
    if (patch[field] !== undefined && (patch[field] || null) !== existing[field]) {
      fields.add(field);
      fields.add("predecessors");
    }
  }

  return { changedFields: [...fields], scheduleDriver: effectiveDriver, staleDurationFromFullRowSave, writeCalendarDays, writeScheduleDates, writeWorkDays };
}

/** The dates a row edit writes: none when the duration drives; a date-driven edit moves the forecast with the plan. */
export function resolveScheduleDateWrites<T>(
  patch: { startDate?: T; dueDate?: T; forecastStartDate?: T; forecastDueDate?: T },
  schedulePatch: Pick<ReturnType<typeof resolveSchedulePatch>, "scheduleDriver" | "writeScheduleDates">,
) {
  if (!schedulePatch.writeScheduleDates) return { startDate: undefined, dueDate: undefined, forecastStartDate: undefined, forecastDueDate: undefined };
  return {
    startDate: patch.startDate,
    dueDate: patch.dueDate,
    forecastStartDate: schedulePatch.scheduleDriver === "dates" && patch.startDate !== undefined ? patch.startDate : patch.forecastStartDate,
    forecastDueDate: schedulePatch.scheduleDriver === "dates" && patch.dueDate !== undefined ? patch.dueDate : patch.forecastDueDate,
  };
}
