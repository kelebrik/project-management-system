export type GanttScale = "week" | "month" | "quarter";

export const GANTT_PANEL_HEIGHT_DEFAULT = 456;
export const GANTT_PANEL_WIDTH_DEFAULT = 0;
export const GANTT_SCALE_WIDTH: Record<GanttScale, number> = {
  week: 64,
  month: 120,
  quarter: 72,
};
export const GANTT_HIERARCHY_LEVELS = [1, 2, 3, 4, 5] as const;
export const GANTT_PANEL_WIDTH_MIN = 760;

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ganttPanelWidthBounds(panel: Element | null) {
  const parentWidth = panel?.parentElement?.getBoundingClientRect().width;
  const viewportWidth =
    typeof window === "undefined" ? undefined : window.innerWidth - 36;
  const availableWidth = Math.max(
    320,
    Math.floor(parentWidth ?? viewportWidth ?? 1200),
  );

  return {
    max: availableWidth,
    min: Math.min(GANTT_PANEL_WIDTH_MIN, availableWidth),
  };
}
