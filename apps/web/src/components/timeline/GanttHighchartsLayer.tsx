import { useEffect, useMemo, useRef, useState } from "react";
import { useAppChartColors } from "../../app/charts/appChartTheme";
import { buildGanttOption, type GanttLayerItem, type GanttSpan } from "../../app/charts/ganttChartOptions";
import { GANTT_ROW_HEIGHT } from "../../ganttDependencyPath";
import { HighchartsChart } from "../charts/HighchartsChart";
import { useElementWidth } from "../../hooks/useElementWidth";

type GanttModel = {
  todayOffset: number | null;
  items: Array<GanttSpan & {
    item: { id: string; type: string };
    milestone: boolean;
    summary: boolean;
    rangeLine: boolean;
    critical: boolean;
    nearCritical: boolean;
    toneClass: string;
    scheduleVarianceDays: number;
    baselineRange: GanttSpan | null;
    forecastRange: GanttSpan | null;
  }>;
};

/** Rows are drawn in blocks of this many, with one block of spare rows above and below the visible ones. */
const BLOCK = 150;

/** The rows of the Gantt that can be seen now: where its timeline crosses every scrolling box around it and the window. */
function visibleRows(element: HTMLElement, rowHeight: number) {
  const timeline = element.parentElement;
  if (!timeline) return null;
  const box = timeline.getBoundingClientRect();
  let top = 0;
  let bottom = window.innerHeight;
  for (let parent = timeline.parentElement; parent; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY;
    if (overflow === "auto" || overflow === "scroll" || overflow === "hidden") {
      const rect = parent.getBoundingClientRect();
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
  }
  return { first: Math.floor((top - box.top) / rowHeight), last: Math.ceil((bottom - box.top) / rowHeight) };
}

/**
 * The block of rows to draw for the visible ones. A Gantt of thousands of rows
 * drawn whole is a picture tens of thousands of pixels tall the browser would
 * repaint on every hover; only the rows around the visible ones are drawn, and
 * the block moves as the Gantt scrolls.
 */
function useDrawnRows(ref: React.RefObject<HTMLDivElement | null>, count: number) {
  const [block, setBlock] = useState({ start: 0, end: Math.min(count, BLOCK * 3) });
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const element = ref.current;
      const rows = element && visibleRows(element, GANTT_ROW_HEIGHT);
      if (!rows) return;
      const start = Math.max(0, Math.min(Math.floor(Math.max(0, rows.first) / BLOCK) * BLOCK - BLOCK, count));
      const end = Math.min(count, Math.max(start, (Math.ceil(Math.max(0, rows.last) / BLOCK) + 1) * BLOCK));
      setBlock((current) => (current.start === start && current.end === end ? current : { start, end }));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    document.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [count, ref]);
  return block;
}

/**
 * The painted layer of the Gantt, under its own rows, handles and links:
 * Highcharts draws the bars, phases, milestones, goals, baseline, forecast,
 * critical path, grid and today from the same offsets and widths the Gantt's
 * model gives its rows. The chart is drawn anew only when what it shows
 * changes — not when a row is hovered or a link is drawn.
 */
export function GanttHighchartsLayer({ gantt, primaryPeriods, subPeriods, showBaseline, showForecast, showCritical }: { gantt: GanttModel; primaryPeriods: Array<{ offset: number }>; subPeriods: Array<{ offset: number }>; showBaseline: boolean; showForecast: boolean; showCritical: boolean }) {
  const colors = useAppChartColors();
  const items = useMemo<GanttLayerItem[]>(
    () =>
      gantt.items.map((entry) => ({
        id: entry.item.id,
        offset: entry.offset,
        width: entry.width,
        milestone: entry.milestone,
        goal: entry.item.type === "GOAL",
        rangeLine: entry.rangeLine,
        summary: entry.summary,
        critical: entry.critical,
        nearCritical: entry.nearCritical,
        toneClass: entry.toneClass,
        baseline: entry.baselineRange,
        forecast: entry.forecastRange ? { ...entry.forecastRange, slipped: entry.scheduleVarianceDays > 0 } : null,
      })),
    [gantt.items],
  );
  const ref = useRef<HTMLDivElement>(null);
  const { start, end } = useDrawnRows(ref, items.length);
  const width = useElementWidth(ref);
  const drawn = useMemo(() => items.slice(start, end), [items, start, end]);
  const gridOffsets = primaryPeriods.map((period) => period.offset);
  const subGridOffsets = subPeriods.map((period) => period.offset);
  // The rows come memoised with the model; the grid is rebuilt on each render, so it is compared by value.
  const gridKey = JSON.stringify([gridOffsets, subGridOffsets]);
  const options = useMemo(
    () => buildGanttOption({ rowHeight: GANTT_ROW_HEIGHT, items: drawn, firstRow: start, width, gridOffsets, subGridOffsets, todayOffset: gantt.todayOffset, showBaseline, showForecast, showCritical, colors }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the grid is compared by value through gridKey
    [colors, drawn, start, width, gridKey, gantt.todayOffset, showBaseline, showForecast, showCritical],
  );
  return (
    <div aria-hidden="true" className="gantt-hc-layer" ref={ref} style={{ top: start * GANTT_ROW_HEIGHT, height: Math.max(1, end - start) * GANTT_ROW_HEIGHT }}>
      {width > 0 ? <HighchartsChart inPlace label="" options={options} /> : null}
    </div>
  );
}
