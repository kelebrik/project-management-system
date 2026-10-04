import { addDays, isWorkingDay, type LeaveCalendarDay, type LeaveRange } from "./leaveScheduleModel";
import type { WorkloadLeave, WorkloadProject } from "./workloadModel";

/**
 * A share of a person's time planned for a project: 50 means half of their
 * working days. A share on a project the user may not read comes without the
 * project and without an id; it still counts against the person's capacity.
 */
export type WorkloadAllocation = {
  id: string | null;
  employeeId: string;
  project: WorkloadProject | null;
  percent: number;
  startsOn: string;
  endsOn: string | null;
  editable: boolean;
};

export type AllocationLoad = {
  /** The highest sum of shares on a working day of the window, 0 without shares. */
  peak: number;
  /** The same for the shares on projects the user may not read. */
  hiddenPeak: number;
  /** Working days of the window, off leave, where the shares add up to more than the capacity. */
  overloadDays: number;
  /** Those days joined into stretches, for drawing; a weekend inside a stretch does not break it. */
  overloads: LeaveRange[];
};

/** A person's shares on the page: over the loaded period for drawing, over the visible window for the numbers. */
export type RowShares = { capacity: number; hasShares: boolean; whole: AllocationLoad; visible: AllocationLoad };

const activeOn = (allocation: WorkloadAllocation, day: string) => allocation.startsOn <= day && (!allocation.endsOn || allocation.endsOn >= day);

/**
 * How a person's shares stand against their capacity over the window, day by
 * day. Days off and days on leave are skipped: a share is of the days one
 * works. Work rows themselves do not count here, only the shares.
 */
export function allocationLoad(
  allocations: WorkloadAllocation[],
  leaves: WorkloadLeave[],
  capacityPercent: number,
  window: LeaveRange,
  overrides: Map<string, LeaveCalendarDay>,
): AllocationLoad {
  const load: AllocationLoad = { peak: 0, hiddenPeak: 0, overloadDays: 0, overloads: [] };
  if (allocations.length === 0) return load;
  let open: LeaveRange | null = null;
  for (let day = window.from; day <= window.to; day = addDays(day, 1)) {
    if (!isWorkingDay(day, overrides)) continue;
    if (leaves.some((leave) => leave.startDate <= day && leave.endDate >= day)) {
      open = null;
      continue;
    }
    const total = allocations.reduce((sum, allocation) => sum + (activeOn(allocation, day) ? allocation.percent : 0), 0);
    load.peak = Math.max(load.peak, total);
    load.hiddenPeak = Math.max(load.hiddenPeak, allocations.reduce((sum, allocation) => sum + (!allocation.project && activeOn(allocation, day) ? allocation.percent : 0), 0));
    if (total > capacityPercent) {
      load.overloadDays += 1;
      if (open) open.to = day;
      else load.overloads.push((open = { from: day, to: day }));
    } else {
      open = null;
    }
  }
  return load;
}

/** The shares that touch the window, the visible ones first by project code. */
export function allocationsInWindow(allocations: WorkloadAllocation[], window: LeaveRange) {
  return allocations
    .filter((allocation) => allocation.startsOn <= window.to && (!allocation.endsOn || allocation.endsOn >= window.from))
    .sort((left, right) => (left.project?.code ?? "￿").localeCompare(right.project?.code ?? "￿", "ru") || left.startsOn.localeCompare(right.startsOn));
}
