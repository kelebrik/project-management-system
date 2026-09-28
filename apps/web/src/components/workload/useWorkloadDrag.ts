import type { LeaveCalendarDay } from "../../app/leaveScheduleModel";
import type { WorkloadItem } from "../../app/workloadModel";
import { planDrag, type WorkloadDates } from "../../app/workloadPlanning";
import { useBarDrag, type BarDragPreview, type BarGrip } from "../timeline/useBarDrag";

export type WorkloadGrip = BarGrip;
export type WorkloadDragPreview = BarDragPreview<WorkloadItem, WorkloadDates>;

/** Bars of work: moves keep working days, edges land on working days (see planDrag). */
export function useWorkloadDrag({
  dayWidth,
  overrides,
  onCommit,
}: {
  dayWidth: number;
  overrides: Map<string, LeaveCalendarDay>;
  onCommit: (preview: WorkloadDragPreview) => void;
}) {
  return useBarDrag<WorkloadItem, WorkloadDates>({
    dayWidth,
    datesOf: (item) => ({ startDate: item.startDate, dueDate: item.dueDate }),
    plan: (item, mode, deltaDays) => planDrag(item, mode, deltaDays, overrides),
    onCommit,
  });
}
