import { calculateScheduleUpdates } from "@pms/shared";
import { fromPlainDate, toPlainDate } from "./calendar.js";
import type {
  WbsScheduleCalculationOptions,
  WbsScheduleCalendarOverride,
  WbsScheduleDependency,
  WbsScheduleItem,
  WbsScheduleUpdate,
} from "./types.js";

export function applyScheduleUpdates(
  items: WbsScheduleItem[],
  updates: WbsScheduleUpdate[],
): WbsScheduleItem[] {
  const updatesById = new Map(updates.map((update) => [update.id, update]));
  return items.map((item) => {
    const update = updatesById.get(item.id);
    if (!update) return item;
    return {
      ...item,
      startDate: update.startDate,
      dueDate: update.dueDate,
      forecastStartDate: update.forecastStartDate,
      forecastDueDate: update.forecastDueDate,
      workDays: update.workDays,
      calendarDays: update.calendarDays,
    };
  });
}

/** The schedule of the shared engine (calculateScheduleUpdates in @pms/shared) on the server's Date rows. */
export function calculateWbsScheduleUpdates(
  items: WbsScheduleItem[],
  dependencies: WbsScheduleDependency[],
  calendarOverrides: WbsScheduleCalendarOverride[],
  options: WbsScheduleCalculationOptions = {},
): WbsScheduleUpdate[] {
  const updates = calculateScheduleUpdates(
    items.map((item) => ({
      ...item,
      startDate: toPlainDate(item.startDate),
      dueDate: toPlainDate(item.dueDate),
      forecastStartDate: item.forecastStartDate === undefined ? undefined : toPlainDate(item.forecastStartDate),
      forecastDueDate: item.forecastDueDate === undefined ? undefined : toPlainDate(item.forecastDueDate),
    })),
    dependencies,
    calendarOverrides.map((override) => ({ ...override, date: toPlainDate(override.date) })),
    {
      ...options,
      startNotBeforeById: options.startNotBeforeById
        ? new Map([...options.startNotBeforeById.entries()].map(([id, date]) => [id, toPlainDate(date)]))
        : undefined,
    },
  );
  return updates.map((update) => ({
    ...update,
    startDate: fromPlainDate(update.startDate),
    dueDate: fromPlainDate(update.dueDate),
    forecastStartDate: fromPlainDate(update.forecastStartDate),
    forecastDueDate: fromPlainDate(update.forecastDueDate),
  }));
}
