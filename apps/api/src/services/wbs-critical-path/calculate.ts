import { calculateCriticalPath, plainDate } from "@pms/shared";
import { dayOf, fromPlainDate, toPlainDate } from "../wbs-schedule/calendar.js";
import type {
  WbsCriticalPathCalendarOverride,
  WbsCriticalPathDependencyInput,
  WbsCriticalPathItemInput,
  WbsCriticalPathResult,
} from "./types.js";

/**
 * The critical path of the shared engine (calculateCriticalPath in
 * @pms/shared) on the server's Date rows. A plan without dates starts on
 * today's UTC day unless the caller names the day.
 */
export function calculateWbsCriticalPath(
  inputItems: WbsCriticalPathItemInput[],
  inputDependencies: WbsCriticalPathDependencyInput[],
  calendarOverrides: WbsCriticalPathCalendarOverride[],
  today: Date = new Date(),
): WbsCriticalPathResult {
  const result = calculateCriticalPath(
    inputItems.map((item) => ({ ...item, startDate: toPlainDate(item.startDate), dueDate: toPlainDate(item.dueDate) })),
    inputDependencies,
    calendarOverrides.map((override) => ({ ...override, date: toPlainDate(override.date) })),
    plainDate(dayOf(today)),
  );
  return {
    ...result,
    projectStartDate: fromPlainDate(result.projectStartDate),
    projectFinishDate: fromPlainDate(result.projectFinishDate),
    items: result.items.map((item) => ({
      ...item,
      earlyStartDate: fromPlainDate(item.earlyStartDate),
      earlyFinishDate: fromPlainDate(item.earlyFinishDate),
      lateStartDate: fromPlainDate(item.lateStartDate),
      lateFinishDate: fromPlainDate(item.lateFinishDate),
    })),
  };
}
