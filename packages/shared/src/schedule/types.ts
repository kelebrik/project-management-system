import type { WbsLinkType } from "../wbs-predecessors.js";
import type { ScheduleCalendarCode } from "./calendar.js";
import type { PlainDate } from "./plain-date.js";

import type { WbsItemStatus, WbsItemType } from "../index.js";

export type ScheduleItemType = WbsItemType;
export type ScheduleItemStatus = WbsItemStatus;

/** A Structure row as the schedule reads it; dates are calendar days. */
export type ScheduleItem = {
  id: string;
  parentId?: string | null;
  code: string;
  type: ScheduleItemType;
  status?: ScheduleItemStatus;
  startDate: PlainDate | null;
  dueDate: PlainDate | null;
  forecastStartDate?: PlainDate | null;
  forecastDueDate?: PlainDate | null;
  predecessor1: string | null;
  predecessor2: string | null;
  predecessor3: string | null;
  predecessor4: string | null;
  predecessor5: string | null;
  predecessor6: string | null;
  leadLagDays: number;
  workDays: number | null;
  calendarDays: number | null;
  calendarCode: ScheduleCalendarCode;
  wbsLevel?: number | null;
  sortOrder: number;
};

export type ScheduleDependency = {
  predecessorId: string;
  successorId: string;
  type?: WbsLinkType;
  lagDays?: number;
};

export type ScheduleUpdate = {
  id: string;
  startDate: PlainDate | null;
  dueDate: PlainDate | null;
  forecastStartDate: PlainDate | null;
  forecastDueDate: PlainDate | null;
  workDays: number | null;
  calendarDays: number | null;
};

/**
 * What a write changed, which decides the circle between dates and working
 * days: a changed duration moves the finish, changed dates set the duration,
 * and without either the duration holds and the row moves whole.
 */
export type ScheduleOptions = {
  /** Temporary scenario constraints; live callers leave this unset. */
  startNotBeforeById?: ReadonlyMap<string, PlainDate>;
  changedItemId?: string;
  changedFields?: Iterable<string>;
  changedItems?: Iterable<{ itemId: string; changedFields: Iterable<string> }>;
};

/** The same row inside the calculation, with dates as day numbers. */
export type DayItem = Omit<ScheduleItem, "startDate" | "dueDate" | "forecastStartDate" | "forecastDueDate"> & {
  startDate: number | null;
  dueDate: number | null;
  forecastStartDate?: number | null;
  forecastDueDate?: number | null;
};

export type DayUpdate = Omit<ScheduleUpdate, "startDate" | "dueDate" | "forecastStartDate" | "forecastDueDate"> & {
  startDate: number | null;
  dueDate: number | null;
  forecastStartDate: number | null;
  forecastDueDate: number | null;
};
