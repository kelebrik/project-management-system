import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { LeaveCalendarDay } from "../../app/leaveScheduleModel";
import type { WorkloadItem } from "../../app/workloadModel";
import { planDrag, type WorkloadDates, type WorkloadDragMode } from "../../app/workloadPlanning";

/** Pointer travel below this many pixels is a click, not a drag. */
const DRAG_THRESHOLD = 4;

/** "reassign" moves work between people when its dates are fixed by links. */
export type WorkloadGrip = WorkloadDragMode | "reassign";

export type WorkloadDragPreview = {
  item: WorkloadItem;
  mode: WorkloadGrip;
  dates: WorkloadDates;
  /** The row the bar is over; differs from `fromRowKey` when handing work to someone else. */
  rowKey: string;
  fromRowKey: string;
};

type Pending = {
  item: WorkloadItem;
  mode: WorkloadGrip;
  rowKey: string;
  canReassign: boolean;
  pointerId: number;
  x: number;
  y: number;
  dragging: boolean;
};

/**
 * Dragging bars on the workload grid: the body moves the dates and, over another
 * person's row, hands the work over; the edges move the start or the finish.
 * Escape cancels; a press without movement stays a click.
 */
export function useWorkloadDrag({
  dayWidth,
  overrides,
  onCommit,
}: {
  dayWidth: number;
  overrides: Map<string, LeaveCalendarDay>;
  onCommit: (preview: WorkloadDragPreview) => void;
}) {
  const [preview, setPreview] = useState<WorkloadDragPreview | null>(null);
  // A press is in progress from pointerdown on, before the pointer passes the threshold too.
  const [pressing, setPressing] = useState(false);
  const pendingRef = useRef<Pending | null>(null);
  const previewRef = useRef<WorkloadDragPreview | null>(null);
  // The click that ends a drag must not also open the work.
  const swallowClickRef = useRef(false);

  const show = (next: WorkloadDragPreview | null) => {
    previewRef.current = next;
    setPreview(next);
  };

  const stop = () => {
    pendingRef.current = null;
    setPressing(false);
    show(null);
  };

  useEffect(() => {
    if (!pressing) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      swallowClickRef.current = true;
      pendingRef.current = null;
      previewRef.current = null;
      setPressing(false);
      setPreview(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [pressing]);

  const start = (
    event: ReactPointerEvent<HTMLElement>,
    item: WorkloadItem,
    mode: WorkloadGrip,
    rowKey: string,
    canReassign: boolean,
  ) => {
    if (event.button !== 0) return;
    // An edge handle sits inside the bar: only the innermost element starts the drag.
    event.stopPropagation();
    swallowClickRef.current = false;
    pendingRef.current = {
      item,
      mode,
      rowKey,
      canReassign,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
    setPressing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  /** Follows the pointer; true while a press on a bar is in progress. */
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const pending = pendingRef.current;
    if (!pending || pending.pointerId !== event.pointerId) return false;
    const dx = event.clientX - pending.x;
    const dy = event.clientY - pending.y;
    if (!pending.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return true;
    pending.dragging = true;
    const deltaDays = Math.round(dx / dayWidth);
    const unchanged = { startDate: pending.item.startDate, dueDate: pending.item.dueDate };
    const dates =
      pending.mode === "reassign" ? unchanged : (planDrag(pending.item, pending.mode, deltaDays, overrides) ?? unchanged);
    let rowKey = pending.rowKey;
    if (pending.canReassign && (pending.mode === "move" || pending.mode === "reassign")) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-row-owner]");
      rowKey = target?.dataset.rowOwner ?? pending.rowKey;
    }
    show({ item: pending.item, mode: pending.mode, dates, rowKey, fromRowKey: pending.rowKey });
    return true;
  };

  const end = (event: ReactPointerEvent<HTMLElement>) => {
    const pending = pendingRef.current;
    if (!pending || pending.pointerId !== event.pointerId) return;
    const result = previewRef.current;
    swallowClickRef.current = pending.dragging;
    stop();
    if (pending.dragging && result) onCommit(result);
  };

  /** True once for the click that follows a drag or a cancelled drag. */
  const consumeClick = () => {
    const swallow = swallowClickRef.current;
    swallowClickRef.current = false;
    return swallow;
  };

  return { preview, start, move, end, cancel: stop, consumeClick };
}
