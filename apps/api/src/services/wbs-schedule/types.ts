import type {
  ProjectCalendarCode,
  WbsDependencyType,
  WbsItemStatus,
  WbsItemType,
} from "@prisma/client";

export type WbsScheduleItem = {
  id: string;
  parentId?: string | null;
  code: string;
  type: WbsItemType;
  status?: WbsItemStatus;
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
  wbsLevel?: number | null;
  sortOrder: number;
};

export type WbsScheduleDependency = {
  predecessorId: string;
  successorId: string;
  type?: WbsDependencyType;
  lagDays?: number;
};

export type WbsScheduleCalendarOverride = {
  calendarCode: ProjectCalendarCode;
  date: Date;
  isWorkingDay: boolean;
};

export type WbsScheduleUpdate = {
  id: string;
  startDate: Date | null;
  dueDate: Date | null;
  forecastStartDate: Date | null;
  forecastDueDate: Date | null;
  workDays: number | null;
  calendarDays: number | null;
};

export type WbsScheduleCalculationOptions = {
  changedItemId?: string;
  changedFields?: Iterable<string>;
  changedItems?: Iterable<{
    itemId: string;
    changedFields: Iterable<string>;
  }>;
};

export type WbsBaselineVarianceItem = {
  id: string;
  parentId?: string | null;
  code: string;
  title?: string;
  type: WbsItemType;
  baselineDueDate?: Date | null;
  dueDate: Date | null;
  predecessor1?: string | null;
  predecessor2?: string | null;
  predecessor3?: string | null;
  predecessor4?: string | null;
  predecessor5?: string | null;
  predecessor6?: string | null;
  sortOrder: number;
};

export type WbsBaselineVarianceDependency = {
  predecessorId: string;
  successorId: string;
};

export type WbsBaselineVarianceRootCause = {
  item: WbsBaselineVarianceItem;
  delayDays: number;
  rawDelayDays: number;
  inheritedDelayDays: number;
  inheritedFrom: WbsBaselineVarianceItem | null;
};

export type WbsBaselineVarianceResult = {
  scheduleVarianceDays: number;
  rootCauses: WbsBaselineVarianceRootCause[];
};

export type WbsPredecessorRef = {
  predecessorId: string;
  type: WbsDependencyType;
  lagDays: number;
};
