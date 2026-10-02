import type { WorkingDayTest } from "../../app/projectCalendar";
import type { WorkloadItem } from "../../app/workloadModel";
import { planDrag, type WorkloadDates } from "../../app/workloadPlanning";
import { useBarDrag, type BarDragPreview, type BarGrip } from "../timeline/useBarDrag";

export type WorkloadGrip = BarGrip;
export type WorkloadDragPreview = BarDragPreview<WorkloadItem, WorkloadDates>;

/** Bars of work: moves keep working days, edges land on working days, in the calendar of the work's project (see planDrag). */
export function useWorkloadDrag({
  dayWidth,
  calendarFor,
  onCommit,
}: {
  dayWidth: number;
  calendarFor: (item: WorkloadItem) => WorkingDayTest;
  onCommit: (preview: WorkloadDragPreview) => void;
}) {
  return useBarDrag<WorkloadItem, WorkloadDates>({
    dayWidth,
    datesOf: (item) => ({ startDate: item.startDate, dueDate: item.dueDate }),
    plan: (item, mode, deltaDays) => planDrag(item, mode, deltaDays, calendarFor(item)),
    onCommit,
  });
}
