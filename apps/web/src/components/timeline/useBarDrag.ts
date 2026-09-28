import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/** Pointer travel below this many pixels is a click, not a drag. */
const DRAG_THRESHOLD = 4;

/**
 * What a drag grabs: the whole bar, its start or finish edge, or — when the
 * dates may not change — the bar only to hand it to another row.
 */
export type BarGrip = "move" | "start" | "end" | "reassign";

export type BarDragPreview<T, D> = {
  item: T;
  mode: BarGrip;
  dates: D;
  /** The row the bar is over; differs from `fromRowKey` when handing it to someone else. */
  rowKey: string;
  fromRowKey: string;
  /** How far the pointer went in days, even when the dates could not follow. */
  deltaDays: number;
};

type Pending<T> = {
  item: T;
  mode: BarGrip;
  rowKey: string;
  canReassign: boolean;
  pointerId: number;
  x: number;
  y: number;
  dragging: boolean;
};

/**
 * Dragging bars on a people × days grid: the body moves the dates and, over
 * another row marked with data-row-owner, hands the bar over; the edges move the
 * start or the finish. Escape cancels from the moment of the press; a press
 * without movement stays a click.
 */
export function useBarDrag<T, D>({
  dayWidth,
  datesOf,
  plan,
  onCommit,
}: {
  dayWidth: number;
  datesOf: (item: T) => D;
  /** New dates for a drag by whole days, or null when they do not change. */
  plan: (item: T, mode: Exclude<BarGrip, "reassign">, deltaDays: number) => D | null;
  onCommit: (preview: BarDragPreview<T, D>) => void;
}) {
  const [preview, setPreview] = useState<BarDragPreview<T, D> | null>(null);
  // A press is in progress from pointerdown on, before the pointer passes the threshold too.
  const [pressing, setPressing] = useState(false);
  const pendingRef = useRef<Pending<T> | null>(null);
  const previewRef = useRef<BarDragPreview<T, D> | null>(null);
  // The click that ends a drag must not also open the bar.
  const swallowClickRef = useRef(false);

  const show = (next: BarDragPreview<T, D> | null) => {
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

  const start = (event: ReactPointerEvent<HTMLElement>, item: T, mode: BarGrip, rowKey: string, canReassign: boolean) => {
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
    const dates =
      (pending.mode === "reassign" ? null : plan(pending.item, pending.mode, deltaDays)) ?? datesOf(pending.item);
    let rowKey = pending.rowKey;
    if (pending.canReassign && (pending.mode === "move" || pending.mode === "reassign")) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-row-owner]");
      rowKey = target?.dataset.rowOwner ?? pending.rowKey;
    }
    show({ item: pending.item, mode: pending.mode, dates, rowKey, fromRowKey: pending.rowKey, deltaDays });
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

  /** True once for the click that follows a drag or a cancelled press. */
  const consumeClick = () => {
    const swallow = swallowClickRef.current;
    swallowClickRef.current = false;
    return swallow;
  };

  return { preview, start, move, end, cancel: stop, consumeClick };
}
