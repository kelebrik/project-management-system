import { calculateCriticalPath, type PlainDate } from "@pms/shared";
import type { ProjectCalendarOverride, WbsCriticalPath, WbsDependency, WbsItem } from "./domainTypes";

/** The calendar day of a date as the server sends it ("2026-10-13T00:00:00.000Z"). */
const day = (value: string | null) => (value ? value.slice(0, 10) : null);
/** A calendar day as the server sends dates, so pages cannot tell who worked it out. */
const instant = (value: PlainDate) => `${value}T00:00:00.000Z`;

/**
 * The critical path of a Structure, worked out in the browser by the same
 * engine the server runs, for the day the server names as today. A failure
 * leaves an empty path with the reason, as the server answers then: the
 * change itself is saved and stays applied.
 */
export function browserCriticalPath(items: WbsItem[], dependencies: WbsDependency[], calendarOverrides: ProjectCalendarOverride[], today: PlainDate): WbsCriticalPath {
  try {
    const result = calculateCriticalPath(
      items.map((item) => ({ ...item, startDate: day(item.startDate), dueDate: day(item.dueDate) })),
      dependencies,
      calendarOverrides.map((override) => ({ ...override, date: day(override.date)! })),
      today,
    );
    return {
      ...result,
      projectStartDate: result.projectStartDate && instant(result.projectStartDate),
      projectFinishDate: result.projectFinishDate && instant(result.projectFinishDate),
      items: result.items.map((item) => ({
        ...item,
        earlyStartDate: instant(item.earlyStartDate),
        earlyFinishDate: instant(item.earlyFinishDate),
        lateStartDate: instant(item.lateStartDate),
        lateFinishDate: instant(item.lateFinishDate),
      })),
    };
  } catch (error) {
    console.error("Failed to calculate WBS critical path", error);
    const message = error instanceof Error ? error.message : "Не удалось рассчитать критический путь";
    return {
      projectStartDate: null,
      projectFinishDate: null,
      criticalItemIds: [],
      criticalDependencyIds: [],
      criticalItemCount: 0,
      nearCriticalItemCount: 0,
      warnings: [`Расчет критического пути временно недоступен: ${message}`],
      items: [],
    };
  }
}
