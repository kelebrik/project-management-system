import { useEffect, useLayoutEffect, useRef, useState, type UIEvent } from "react";
import {
  addDays,
  daysBetween,
  leaveScale,
  visibleLeaveWindow,
  type LeaveHorizon,
  type LeaveRange,
} from "../../app/leaveScheduleModel";

/** Days from the left edge to today when the grid opens or "Today" is pressed. */
const TODAY_LEAD_DAYS = 7;

/**
 * Scroll and scale for a people × days grid: fits the horizon into the width,
 * grows the loaded range near the edges, keeps the day at the left edge when
 * the range grows backwards or the scale changes, and reports the days on screen.
 */
export function useTimelineViewport({
  range,
  horizon,
  today,
  todayRequest,
  secondColumnWidth,
  onExtend,
  onVisibleWindowChange,
}: {
  range: LeaveRange;
  horizon: LeaveHorizon;
  today: string;
  /** Changes whenever the view should jump back to today. */
  todayRequest: number;
  secondColumnWidth: number;
  onExtend: (side: "before" | "after") => void;
  onVisibleWindowChange: (window: LeaveRange) => void;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [shellWidth, setShellWidth] = useState(0);
  const nameWidth = shellWidth > 0 && shellWidth < 900 ? 150 : 230;
  const leftWidth = nameWidth + secondColumnWidth;
  const viewportWidth = Math.max(0, shellWidth - leftWidth);
  const scale = leaveScale(horizon, viewportWidth);
  const dayWidth = scale.dayWidth;
  const totalDays = daysBetween(range.from, range.to) + 1;
  const timelineWidth = totalDays * dayWidth;

  const leftDateRef = useRef<string | null>(null);
  const layoutRef = useRef<{ from: string; dayWidth: number } | null>(null);
  const extendingRef = useRef(false);
  const windowKeyRef = useRef("");
  const frameRef = useRef(0);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver(() => setShellWidth(shell.clientWidth));
    observer.observe(shell);
    setShellWidth(shell.clientWidth);
    return () => observer.disconnect();
  }, []);

  const reportWindow = (shell: HTMLDivElement) => {
    const visible = visibleLeaveWindow(range, shell.scrollLeft, viewportWidth, dayWidth);
    const key = `${visible.from}:${visible.to}`;
    if (key !== windowKeyRef.current) {
      windowKeyRef.current = key;
      onVisibleWindowChange(visible);
    }
    leftDateRef.current = addDays(range.from, Math.floor(shell.scrollLeft / dayWidth));
  };

  const scrollToDay = (shell: HTMLDivElement, day: string) => {
    shell.scrollLeft = Math.max(0, daysBetween(range.from, day) * dayWidth);
  };

  // Keep the same date at the left edge when the range grows backwards or the scale changes.
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell || viewportWidth <= 0) return;
    const previous = layoutRef.current;
    layoutRef.current = { from: range.from, dayWidth };
    if (!previous) {
      scrollToDay(shell, addDays(today, -TODAY_LEAD_DAYS));
    } else if ((previous.from !== range.from || previous.dayWidth !== dayWidth) && leftDateRef.current) {
      scrollToDay(shell, leftDateRef.current);
    }
    extendingRef.current = false;
    reportWindow(shell);
    // reportWindow and scrollToDay read the current props; the keys below cover them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, dayWidth, viewportWidth]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || todayRequest === 0) return;
    scrollToDay(shell, addDays(today, -TODAY_LEAD_DAYS));
    reportWindow(shell);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayRequest]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const shell = event.currentTarget;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      reportWindow(shell);
      if (extendingRef.current) return;
      if (shell.scrollLeft < viewportWidth) {
        extendingRef.current = true;
        onExtend("before");
      } else if (shell.scrollLeft + shell.clientWidth > shell.scrollWidth - viewportWidth) {
        extendingRef.current = true;
        onExtend("after");
      }
    });
  };

  return {
    shellRef,
    handleScroll,
    nameWidth,
    leftWidth,
    scale,
    dayWidth,
    totalDays,
    timelineWidth,
    px: (days: number) => `${days * dayWidth}px`,
  };
}
