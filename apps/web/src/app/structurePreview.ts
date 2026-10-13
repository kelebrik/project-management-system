import {
  calculateHierarchyStatusUpdates,
  calculateScheduleUpdates,
  resolveScheduleDateWrites,
  resolveSchedulePatch,
  WBS_FIELDS_OUTSIDE_SCHEDULE,
  wbsPatchAffectsSchedule,
  type PlainDate,
  type ScheduleDriver,
} from "@pms/shared";
import type { ProjectCalendarOverride, WbsCriticalPath, WbsDependency, WbsItem } from "./domainTypes";
import { browserCriticalPath } from "./structureCriticalPath";

/** The fields a preview shows from its own calculation; the rest of a row is the page's. */
export const PREVIEW_FIELDS = ["startDate", "dueDate", "forecastStartDate", "forecastDueDate", "workDays", "calendarDays", "status"] as const;
export type PreviewField = (typeof PREVIEW_FIELDS)[number];

/** Fields of a row edit the preview repeats as the server writes them; an edit of any other field is not previewed. */
const PREVIEWED_FIELDS = new Set([
  ...WBS_FIELDS_OUTSIDE_SCHEDULE,
  "scheduleDriver", "status", "type", "calendarCode", "progress", "effortPercent",
  "startDate", "dueDate", "forecastStartDate", "forecastDueDate", "baselineStartDate", "baselineDueDate", "excelStartDate", "excelEndDate",
  "workDays", "calendarDays", "planWorkDays", "planCalendarDays",
]);
const DATE_FIELDS = ["startDate", "dueDate", "forecastStartDate", "forecastDueDate"] as const;
const COPIED_DATE_FIELDS = ["baselineStartDate", "baselineDueDate", "excelStartDate", "excelEndDate"] as const;
const COPIED_FIELDS = ["title", "type", "status", "calendarCode", "progress", "effortPercent", "planWorkDays", "planCalendarDays"] as const;

export type StructureBase = {
  items: readonly WbsItem[];
  dependencies: readonly WbsDependency[];
  calendarOverrides: readonly ProjectCalendarOverride[];
  /** The server's day, for the critical path. */
  today: PlainDate;
};

export type StructurePreview = {
  items: WbsItem[];
  criticalPath: WbsCriticalPath;
  /** Rows whose dates, durations or status the edit moves, the edited one included. */
  changedIds: Set<string>;
};

type PatchValue = string | number | null | undefined;

/** A date as the server stores what the page sent: `new Date(value)`, sent back as its ISO string. */
function storedDate(value: PatchValue) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return new Date(value).toISOString();
}

const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : null);

/** The server's order of a project's rows when it recalculates: plan order, then creation, then id. */
function serverOrder(left: WbsItem, right: WbsItem) {
  const leftAt = left.createdAt ?? "";
  const rightAt = right.createdAt ?? "";
  return left.sortOrder - right.sortOrder || (leftAt < rightAt ? -1 : leftAt > rightAt ? 1 : 0) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

/**
 * What a single row edit will do to the Structure, worked out in the browser
 * as the server does it (PATCH /wbs-items/:itemId): the fields written by the
 * same rules, the schedule, the statuses of phases and work packages, and the
 * critical path. Null when the edit is not one the preview repeats exactly:
 * links, hierarchy, order or codes, an edit that moves nothing, or rows
 * without a known creation time. The base is never altered.
 */
export function previewRowEdit(base: StructureBase, itemId: string, patch: Record<string, PatchValue>): StructurePreview | null {
  const existing = base.items.find((item) => item.id === itemId);
  if (!existing || !wbsPatchAffectsSchedule(patch)) return null;
  if (Object.entries(patch).some(([field, value]) => value !== undefined && !PREVIEWED_FIELDS.has(field))) return null;
  if (base.items.some((item) => typeof item.createdAt !== "string")) return null;

  const plainPatch = Object.fromEntries(DATE_FIELDS.filter((field) => patch[field] !== undefined).map((field) => [field, day(storedDate(patch[field]))]));
  const schedulePatch = resolveSchedulePatch(
    { ...(patch as Parameters<typeof resolveSchedulePatch>[0]), ...plainPatch, scheduleDriver: patch.scheduleDriver as ScheduleDriver | undefined },
    {
      ...existing,
      startDate: day(existing.startDate),
      dueDate: day(existing.dueDate),
      forecastStartDate: day(existing.forecastStartDate),
      forecastDueDate: day(existing.forecastDueDate),
    },
  );
  const dateWrites = resolveScheduleDateWrites<PatchValue>(patch, schedulePatch);
  const edited: WbsItem = { ...existing };
  const write = edited as unknown as Record<string, unknown>;
  for (const field of COPIED_FIELDS) if (patch[field] !== undefined) write[field] = patch[field];
  for (const field of DATE_FIELDS) if (dateWrites[field] !== undefined) write[field] = storedDate(dateWrites[field]);
  for (const field of COPIED_DATE_FIELDS) if (patch[field] !== undefined) write[field] = storedDate(patch[field]);
  if (schedulePatch.writeWorkDays && patch.workDays !== undefined) edited.workDays = (patch.workDays as number | null) ?? null;
  if (schedulePatch.writeCalendarDays && patch.calendarDays !== undefined) edited.calendarDays = (patch.calendarDays as number | null) ?? null;

  const ordered = base.items.map((item) => (item.id === itemId ? edited : item)).sort(serverOrder);
  const updates = calculateScheduleUpdates(
    ordered.map((item) => ({
      ...item,
      startDate: day(item.startDate),
      dueDate: day(item.dueDate),
      forecastStartDate: day(item.forecastStartDate),
      forecastDueDate: day(item.forecastDueDate),
    })),
    [...base.dependencies],
    base.calendarOverrides.map((override) => ({ ...override, date: day(override.date)! })),
    { changedItemId: itemId, changedFields: schedulePatch.changedFields },
  );
  const scheduled = new Map(updates.map((update) => [update.id, update]));
  const afterSchedule = ordered.map((item) => {
    const update = scheduled.get(item.id);
    if (!update) return item;
    return {
      ...item,
      startDate: update.startDate && `${update.startDate}T00:00:00.000Z`,
      dueDate: update.dueDate && `${update.dueDate}T00:00:00.000Z`,
      forecastStartDate: update.forecastStartDate && `${update.forecastStartDate}T00:00:00.000Z`,
      forecastDueDate: update.forecastDueDate && `${update.forecastDueDate}T00:00:00.000Z`,
      workDays: update.workDays,
      calendarDays: update.calendarDays,
    };
  });
  const statuses = new Map(calculateHierarchyStatusUpdates(afterSchedule).map((update) => [update.id, update.status]));
  const finalById = new Map(afterSchedule.map((item) => [item.id, statuses.has(item.id) ? { ...item, status: statuses.get(item.id)! } : item]));

  const items = base.items.map((item) => finalById.get(item.id)!);
  const changedIds = new Set(
    base.items
      .filter((item) => {
        const next = finalById.get(item.id)!;
        return PREVIEW_FIELDS.some((field) => (item[field] ?? null) !== (next[field] ?? null));
      })
      .map((item) => item.id),
  );
  return { items, criticalPath: browserCriticalPath(items, [...base.dependencies], [...base.calendarOverrides], base.today), changedIds };
}
