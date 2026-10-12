import type { WbsLinkType } from "../wbs-predecessors.js";
import { addWorkingDays, type CalendarOverrides, type ScheduleCalendarCode } from "./calendar.js";

export type PredecessorConstraint = {
  predecessorId: string;
  type: WbsLinkType;
  lagDays: number;
  /** A start-to-start or finish-to-start link bounds the start; the others bound the finish. */
  kind: "start" | "finish";
  day: number;
};

type ConstraintItem = { status?: string; calendarCode: ScheduleCalendarCode };
type DatedItem = { startDate?: number | null; dueDate?: number | null; forecastStartDate?: number | null; forecastDueDate?: number | null };

/**
 * The days each predecessor sets for an item, with the link behind each: a
 * finish-to-start starts the next working day after the predecessor ends (the
 * same day for a cancelled item), plus the lag in working days. The schedule
 * calculation and the "what holds this date" explanation both read links here.
 */
export function predecessorConstraints(
  item: ConstraintItem,
  predecessorRefs: Array<{ predecessorId: string; type: WbsLinkType; lagDays: number }>,
  lookup: { item: (id: string) => DatedItem | undefined; computed: (id: string) => DatedItem | undefined },
  overrides: CalendarOverrides,
): PredecessorConstraint[] {
  const constraints: PredecessorConstraint[] = [];
  for (const ref of predecessorRefs) {
    const predecessor = lookup.item(ref.predecessorId);
    const computed = lookup.computed(ref.predecessorId);
    const start = computed?.forecastStartDate ?? computed?.startDate ?? predecessor?.forecastStartDate ?? predecessor?.startDate ?? null;
    const due = computed?.forecastDueDate ?? computed?.dueDate ?? predecessor?.forecastDueDate ?? predecessor?.dueDate ?? null;
    const add = (day: number, days: number) => addWorkingDays(day, days, item.calendarCode, overrides);
    if (ref.type === "FS" && due !== null) {
      constraints.push({ ...ref, kind: "start", day: add(due, (item.status === "CANCELLED" ? 0 : 1) + ref.lagDays) });
    } else if (ref.type === "SS" && start !== null) {
      constraints.push({ ...ref, kind: "start", day: add(start, ref.lagDays) });
    } else if (ref.type === "FF" && due !== null) {
      constraints.push({ ...ref, kind: "finish", day: add(due, ref.lagDays) });
    } else if (ref.type === "SF" && start !== null) {
      constraints.push({ ...ref, kind: "finish", day: add(start, ref.lagDays) });
    }
  }
  return constraints;
}
