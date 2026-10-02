import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { addDays } from "../../app/leaveScheduleModel";

export type NewWorkRequest = { owner: string; startDate: string; dueDate: string };
type Selection = { rowKey: string; owner: string; anchor: number; current: number; pointerId: number };

/**
 * Picking days on the empty part of a person's row: press, drag across the
 * days, release; a click picks one day. Bars and other marks keep their own
 * handling, and Escape drops the selection.
 */
export function useNewWorkSelection({ dayWidth, rangeFrom, totalDays, onRequest }: { dayWidth: number; rangeFrom: string; totalDays: number; onRequest?: (request: NewWorkRequest) => void }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  // Escape drops a selection in progress wherever the focus is.
  const selecting = selection !== null;
  useEffect(() => {
    if (!selecting) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [selecting]);
  const dayAt = (event: ReactPointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(totalDays - 1, Math.floor((event.clientX - box.left) / dayWidth)));
  };
  const laneHandlers = (rowKey: string, owner: string) =>
    onRequest
      ? {
          onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
            // Only the empty lane itself: a bar, a leave or a handle is not a free day.
            if (event.button !== 0 || event.target !== event.currentTarget) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            const day = dayAt(event);
            setSelection({ rowKey, owner, anchor: day, current: day, pointerId: event.pointerId });
          },
          onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
            if (selection?.rowKey !== rowKey || selection.pointerId !== event.pointerId) return;
            const day = dayAt(event);
            if (day !== selection.current) setSelection({ ...selection, current: day });
          },
          onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
            // A selection dropped with Escape ends here without opening anything.
            if (selection?.rowKey !== rowKey || selection.pointerId !== event.pointerId) return;
            const [first, last] = [Math.min(selection.anchor, selection.current), Math.max(selection.anchor, selection.current)];
            setSelection(null);
            onRequest({ owner: selection.owner, startDate: addDays(rangeFrom, first), dueDate: addDays(rangeFrom, last) });
          },
          onPointerCancel: () => setSelection(null),
        }
      : {};
  const selected = (rowKey: string) =>
    selection?.rowKey === rowKey ? { start: Math.min(selection.anchor, selection.current), length: Math.abs(selection.current - selection.anchor) + 1 } : null;
  return { laneHandlers, selected };
}
