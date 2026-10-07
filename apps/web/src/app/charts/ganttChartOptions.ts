import type { Options, PointOptionsObject, SeriesOptionsType, XAxisPlotLinesOptions, XrangePointOptionsObject, YAxisPlotBandsOptions } from "highcharts";
import type { AppChartColors } from "./appChartTheme";

/**
 * The Gantt drawn by Highcharts: bars, phases, milestones and goals, the
 * baseline and forecast, the critical path, the time grid and today, laid out
 * exactly where the Gantt's own rows and handles are. The x axis runs over
 * the same shares of the range (0–100 %) the Gantt's model gives its bars, so
 * both use one geometry; one row of fixed height per item. The rows, labels,
 * handles and links of the Gantt stay its own and sit on top, so every
 * interaction works as before; Highcharts only paints.
 */

/** A span on the Gantt's scale: where it starts and how wide it is, in % of the range. */
export type GanttSpan = { offset: number; width: number };

export type GanttLayerItem = GanttSpan & {
  id: string;
  milestone: boolean;
  goal: boolean;
  rangeLine: boolean;
  summary: boolean;
  critical: boolean;
  nearCritical: boolean;
  toneClass: string;
  baseline: GanttSpan | null;
  forecast: (GanttSpan & { slipped: boolean }) | null;
};

export type GanttLayerInput = {
  rowHeight: number;
  /** The rows drawn — on a long Gantt only those around the visible ones. */
  items: GanttLayerItem[];
  /** The Gantt's row the first of them is, so the stripes keep their places. */
  firstRow?: number;
  /** The width of the timeline in pixels, given so the chart does not measure the page each time it is drawn. */
  width?: number;
  /** Where the periods drawn as grid lines begin (months, weeks or quarters), in %. */
  gridOffsets: number[];
  /** Finer lines inside them (weeks in months, months in quarters). */
  subGridOffsets: number[];
  todayOffset: number | null;
  showBaseline: boolean;
  showForecast: boolean;
  showCritical: boolean;
  colors: AppChartColors;
};

/** The colour of each tone of the Gantt, as the bars had it. */
export function ganttToneColor(toneClass: string, colors: AppChartColors) {
  const tones: Record<string, string> = {
    "tone-g": "#35b86f",
    "tone-r": "#ef5350",
    "tone-p": "#f472b6",
    "tone-o": colors.warning,
    "tone-b": colors.brand,
    "tone-x": "#a8b4c5",
  };
  return tones[toneClass] ?? colors.brand;
}

const GOAL_COLOR = "#8b5cf6";
const CRITICAL = "#dc2626";
const NEAR_CRITICAL = "#fb923c";
const TODAY = "#ef4b8c";

export function buildGanttOption(input: GanttLayerInput): Options {
  const { colors, items } = input;
  const rows = Math.max(1, items.length);
  const edge = (item: GanttLayerItem) => (input.showCritical && item.critical ? CRITICAL : input.showCritical && item.nearCritical ? NEAR_CRITICAL : undefined);
  const firstRow = input.firstRow ?? 0;
  const plotBands: YAxisPlotBandsOptions[] = items.flatMap((_, index) => ((firstRow + index) % 2 === 1 ? [{ from: index - 0.5, to: index + 0.5, color: "rgba(100, 116, 139, 0.035)" }] : []));
  const subLines: XAxisPlotLinesOptions[] = input.subGridOffsets.map((value) => ({ value, color: colors.grid, width: 1, dashStyle: "ShortDash", zIndex: 0 }));
  const todayLine: XAxisPlotLinesOptions[] = input.todayOffset === null ? [] : [{ value: input.todayOffset, color: TODAY, width: 2, dashStyle: "Solid", zIndex: 4 }];
  const span = (value: GanttSpan, y: number) => ({ x: value.offset, x2: value.offset + value.width, y });
  const bars = (summary: boolean) =>
    items.flatMap((item, y): XrangePointOptionsObject[] =>
      item.milestone || item.rangeLine || item.summary !== summary
        ? []
        : [{ ...span(item, y), color: ganttToneColor(item.toneClass, colors), borderColor: edge(item) ?? "rgba(15, 23, 42, 0.12)", borderWidth: edge(item) ? 2 : 1 } as XrangePointOptionsObject],
    );
  const phases = items.flatMap((item, y): XrangePointOptionsObject[] =>
    item.rangeLine ? [{ ...span(item, y + 0.27), color: ganttToneColor(item.toneClass, colors), borderColor: edge(item) ?? "transparent", borderWidth: edge(item) ? 1 : 0 } as XrangePointOptionsObject] : [],
  );
  const markers = (goal: boolean) =>
    items.flatMap((item, y): PointOptionsObject[] =>
      item.milestone && item.goal === goal
        ? [{ x: item.offset, y, marker: { lineColor: edge(item) ?? colors.surface, lineWidth: edge(item) ? 3 : 1.5 } }]
        : [],
    );
  const baselines = input.showBaseline ? items.flatMap((item, y): XrangePointOptionsObject[] => (item.baseline ? [span(item.baseline, y + 0.42)] : [])) : [];
  const forecasts = input.showForecast
    ? items.flatMap((item, y): XrangePointOptionsObject[] =>
        item.forecast ? [{ ...span(item.forecast, y), color: item.forecast.slipped ? "rgba(245, 158, 11, 0.65)" : "rgba(20, 184, 166, 0.7)" }] : [],
      )
    : [];

  // The shortest bars keep the Gantt's minimum widths (6 px, summaries 16, phases 42).
  const series: SeriesOptionsType[] = [
    { type: "xrange", name: "baseline", className: "gantt-hc-baseline", data: baselines, pointWidth: 3, minPointLength: 6, color: colors.muted, borderRadius: 2, borderWidth: 0, zIndex: 1 },
    { type: "xrange", name: "forecast", className: "gantt-hc-forecast", data: forecasts, pointWidth: 8, minPointLength: 6, borderRadius: 4, borderWidth: 0, zIndex: 2 },
    { type: "xrange", name: "phases", className: "gantt-hc-phases", data: phases, pointWidth: 4, minPointLength: 42, borderRadius: 2, opacity: 0.8, zIndex: 3 },
    { type: "xrange", name: "summaries", className: "gantt-hc-summaries", data: bars(true), pointWidth: 16, minPointLength: 16, borderRadius: 8, zIndex: 4 },
    { type: "xrange", name: "bars", className: "gantt-hc-bars", data: bars(false), pointWidth: 16, minPointLength: 6, borderRadius: 8, zIndex: 4 },
    { type: "scatter", name: "milestones", className: "gantt-hc-milestones", data: markers(false), color: colors.warning, marker: { symbol: "diamond", radius: 9 }, zIndex: 5 },
    { type: "scatter", name: "goals", className: "gantt-hc-goals", data: markers(true), color: GOAL_COLOR, marker: { symbol: "star", radius: 11 }, zIndex: 5 },
  ];

  return {
    chart: { backgroundColor: "transparent", margin: [0, 0, 0, 0], spacing: [0, 0, 0, 0], width: input.width, height: rows * input.rowHeight, animation: false, style: { fontFamily: "inherit" } },
    title: { text: undefined },
    // The credit stays while the library is used under its evaluation terms.
    credits: { enabled: true, position: { align: "right", verticalAlign: "bottom", x: -4, y: -2 }, style: { color: colors.muted, fontSize: "8px", cursor: "default" } },
    accessibility: { enabled: false },
    legend: { enabled: false },
    tooltip: { enabled: false },
    xAxis: {
      min: 0,
      max: 100,
      tickPositions: input.gridOffsets,
      gridLineWidth: 1,
      gridLineColor: colors.grid,
      labels: { enabled: false },
      lineWidth: 0,
      tickLength: 0,
      startOnTick: false,
      endOnTick: false,
      minPadding: 0,
      maxPadding: 0,
      plotLines: [...subLines, ...todayLine],
    },
    yAxis: {
      min: -0.5,
      max: rows - 0.5,
      reversed: true,
      startOnTick: false,
      endOnTick: false,
      tickPositions: [],
      gridLineWidth: 0,
      title: { text: undefined },
      labels: { enabled: false },
      plotBands,
    },
    plotOptions: {
      series: { animation: false, enableMouseTracking: false, states: { inactive: { enabled: false } }, dataLabels: { enabled: false } },
      // Each series keeps the centre of its row instead of sharing it with the others.
      xrange: { grouping: false },
      scatter: { marker: { lineColor: colors.surface } },
    },
    series,
  };
}
