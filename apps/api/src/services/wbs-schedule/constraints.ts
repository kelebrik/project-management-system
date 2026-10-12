import { predecessorConstraints as dayConstraints, type CalendarOverrides, type WbsLinkType } from '@pms/shared';
import type { ProjectCalendarCode } from '@prisma/client';
import { dateOfDay, dayOf } from './calendar.js';

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

const days = (item: DatedItem | undefined) =>
  item && {
    startDate: item.startDate ? dayOf(item.startDate) : item.startDate,
    dueDate: item.dueDate ? dayOf(item.dueDate) : item.dueDate,
    forecastStartDate: item.forecastStartDate ? dayOf(item.forecastStartDate) : item.forecastStartDate,
    forecastDueDate: item.forecastDueDate ? dayOf(item.forecastDueDate) : item.forecastDueDate,
  };

/** The dates each predecessor sets for an item, by the shared engine's rule; see predecessorConstraints in @pms/shared. */
export function predecessorConstraints(
  item: ConstraintItem,
  predecessorRefs: Array<{ predecessorId: string; type: WbsLinkType; lagDays: number }>,
  lookup: {
    item: (id: string) => DatedItem | undefined;
    computed: (id: string) => DatedItem | undefined;
  },
  overridesByKey: CalendarOverrides,
): PredecessorConstraint[] {
  return dayConstraints(item, predecessorRefs, { item: (id) => days(lookup.item(id)), computed: (id) => days(lookup.computed(id)) }, overridesByKey).map(
    ({ day, ...constraint }) => ({ ...constraint, date: dateOfDay(day) }),
  );
}
