import type { WbsLinkType } from '@pms/shared';
import type { ProjectCalendarCode } from '@prisma/client';
import { addWorkingDays, normalizedDate } from './calendar.js';

export type PredecessorConstraint = {
  predecessorId: string;
  type: WbsLinkType;
  lagDays: number;
  /** A start-to-start or finish-to-start link bounds the start; the others bound the finish. */
  kind: 'start' | 'finish';
  date: Date;
};

type ConstraintItem = { status?: string; calendarCode: ProjectCalendarCode };
type DatedItem = { startDate?: Date | null; dueDate?: Date | null; forecastStartDate?: Date | null; forecastDueDate?: Date | null };

/**
 * The dates each predecessor sets for an item, with the link behind each: a
 * finish-to-start starts the next working day after the predecessor ends (the
 * same day for a cancelled item), plus the lag in working days. The schedule
 * calculation and the "what holds this date" explanation both read links here.
 */
export function predecessorConstraints(
  item: ConstraintItem,
  predecessorRefs: Array<{ predecessorId: string; type: WbsLinkType; lagDays: number }>,
  lookup: {
    item: (id: string) => DatedItem | undefined;
    computed: (id: string) => DatedItem | undefined;
  },
  overridesByKey: Map<string, boolean>,
): PredecessorConstraint[] {
  const constraints: PredecessorConstraint[] = [];
  for (const ref of predecessorRefs) {
    const predecessor = lookup.item(ref.predecessorId);
    const computed = lookup.computed(ref.predecessorId);
    const start = computed?.forecastStartDate ?? computed?.startDate ?? normalizedDate(predecessor?.forecastStartDate ?? predecessor?.startDate ?? null);
    const due = computed?.forecastDueDate ?? computed?.dueDate ?? normalizedDate(predecessor?.forecastDueDate ?? predecessor?.dueDate ?? null);
    const add = (date: Date, days: number) => addWorkingDays(date, days, item.calendarCode, overridesByKey);
    if (ref.type === 'FS' && due) {
      constraints.push({ ...ref, kind: 'start', date: add(due, (item.status === 'CANCELLED' ? 0 : 1) + ref.lagDays) });
    } else if (ref.type === 'SS' && start) {
      constraints.push({ ...ref, kind: 'start', date: add(start, ref.lagDays) });
    } else if (ref.type === 'FF' && due) {
      constraints.push({ ...ref, kind: 'finish', date: add(due, ref.lagDays) });
    } else if (ref.type === 'SF' && start) {
      constraints.push({ ...ref, kind: 'finish', date: add(start, ref.lagDays) });
    }
  }
  return constraints;
}
