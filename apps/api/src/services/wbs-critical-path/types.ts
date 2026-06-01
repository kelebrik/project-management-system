import type {
  ProjectCalendarCode,
  WbsDependencyType,
  WbsItemType,
} from "@prisma/client";

export type WbsCriticalPathItemInput = {
  id: string;
  code: string;
  title: string;
  type: WbsItemType;
  startDate: Date | null;
  dueDate: Date | null;
  workDays: number | null;
  calendarCode: ProjectCalendarCode;
  sortOrder: number;
  predecessor1?: string | null;
  predecessor2?: string | null;
  predecessor3?: string | null;
  predecessor4?: string | null;
  predecessor5?: string | null;
  predecessor6?: string | null;
  leadLagDays?: number | null;
};

export type WbsCriticalPathDependencyInput = {
  id: string;
  predecessorId: string;
  successorId: string;
  type: WbsDependencyType;
  lagDays: number;
};

export type WbsCriticalPathCalendarOverride = {
  calendarCode: ProjectCalendarCode;
  date: Date;
  isWorkingDay: boolean;
};

export type WbsCriticalPathItem = {
  itemId: string;
  code: string;
  title: string;
  earlyStartDate: Date;
  earlyFinishDate: Date;
  lateStartDate: Date;
  lateFinishDate: Date;
  totalFloatWorkDays: number;
  isCritical: boolean;
  isNearCritical: boolean;
};

export type WbsCriticalPathResult = {
  projectStartDate: Date | null;
  projectFinishDate: Date | null;
  criticalItemIds: string[];
  criticalDependencyIds: string[];
  criticalItemCount: number;
  nearCriticalItemCount: number;
  warnings: string[];
  items: WbsCriticalPathItem[];
};

export type WbsCriticalPathComputedNode = {
  item: WbsCriticalPathItemInput;
  durationWorkDays: number;
  earlyStartDate: Date;
  earlyFinishDate: Date;
  lateStartDate: Date;
  lateFinishDate: Date;
};
