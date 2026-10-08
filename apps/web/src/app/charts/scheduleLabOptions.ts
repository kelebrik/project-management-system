import type { AnnotationsLabelsOptions, Options, PointOptionsObject, SeriesOptionsType, XrangePointOptionsObject } from "highcharts";
import type { WbsItem } from "../domainTypes";
import type { ShiftLadder } from "../scheduleShifts";
import type { AppChartColors } from "./appChartTheme";

/**
 * The charts of "Schedule 2.0", the lab copy of the project's schedule drawn
 * with what Highcharts can do beyond the plain charts: goals as dumbbells from
 * baseline to forecast, phases with their progress filled in, milestones on a
 * timeline of events, the reasons for shifts as a Pareto chart, shifts by
 * milestone that drill down into their steps, and the drift of a goal's
 * forecast with notes on the moves. Each chart can zoom, has an export menu
 * and full keyboard navigation. Pure, so the pictures can be tested.
 */

const DAY = 86_400_000;
const time = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
const days = (from: string, to: string) => Math.round((time(to) - time(from)) / DAY);

export type LabText = {
  today: string;
  baseline: string;
  forecast: string;
  noBaseline: string;
  daysLater: (value: number) => string;
  daysEarlier: (value: number) => string;
  onTime: string;
  progress: string;
  phaseless: string;
  status: (status: string) => string;
  type: (type: string) => string;
  reason: (category: string) => string;
  days: string;
  share: string;
  shiftsOf: (title: string) => string;
  drift: string;
  /** "N earlier moves", for the moves the journal folds into one. */
  earlier: (count: number) => string;
  /** The names of the charts: their exported files and data tables are called by them. */
  titles: { goals: string; phases: string; timeline: string; reasons: string; moves: string; drift: string };
  /** A calendar day and a day with its month, as the page writes them. */
  date: (day: string) => string;
  dayMonth: (day: string) => string;
};

export type LabInput = { items: WbsItem[]; today: string; colors: AppChartColors; text: LabText };

const GOAL = "#8b5cf6";
const LATE = "#ef4444";
const EARLY = "#16a34a";

/** The export menu every lab chart has: full screen, print, pictures, data. Exporting never leaves the browser. */
function base(colors: AppChartColors, title: string, height: number): Options {
  return {
    chart: { backgroundColor: "transparent", height, style: { fontFamily: "inherit" }, zooming: { type: "x" }, animation: { duration: 500 } },
    title: { text: undefined },
    accessibility: { enabled: true, description: title },
    // The credit stays while the library is used under its evaluation terms.
    credits: { enabled: true, style: { color: colors.muted, fontSize: "8px" } },
    exporting: {
      enabled: true,
      fallbackToExportServer: false,
      filename: title,
      tableCaption: title,
      buttons: { contextButton: { menuItems: ["viewFullscreen", "printChart", "separator", "downloadPNG", "downloadJPEG", "downloadSVG", "separator", "downloadCSV", "downloadXLS", "viewData"] } },
    },
    legend: { itemStyle: { color: colors.text, fontWeight: "normal" } },
    tooltip: { backgroundColor: colors.surface, borderColor: colors.grid, style: { color: colors.text } },
  };
}

const dueOf = (item: WbsItem) => item.dueDate ?? item.forecastDueDate;

function slipText(text: LabText, slip: number | null) {
  if (slip === null) return text.noBaseline;
  return slip > 0 ? text.daysLater(slip) : slip < 0 ? text.daysEarlier(-slip) : text.onTime;
}

/** Goals as dumbbells: the baseline ring, the forecast dot, a red bar when it is later and a green one when earlier. */
export function goalsDumbbellOption({ items, today, colors, text }: LabInput): Options | null {
  const goals = items
    .filter((item) => item.type === "GOAL" && item.status !== "CANCELLED" && dueOf(item))
    .sort((a, b) => dueOf(a)!.localeCompare(dueOf(b)!));
  if (goals.length === 0) return null;
  const rows = goals.map((goal) => {
    const forecast = dueOf(goal)!;
    const baseline = goal.baselineDueDate;
    const slip = baseline ? days(baseline, forecast) : null;
    return { goal, forecast, baseline, slip };
  });
  const options = base(colors, text.titles.goals, Math.max(220, 70 + rows.length * 46));
  return {
    ...options,
    chart: { ...options.chart, inverted: true, zooming: { type: "y" }, spacingTop: 24 },
    xAxis: { categories: rows.map((row) => row.goal.title), labels: { style: { color: colors.text, fontSize: "12px" } }, lineColor: colors.grid },
    yAxis: {
      type: "datetime",
      title: { text: undefined },
      gridLineColor: colors.grid,
      tickPixelInterval: 110,
      // Ticks on the first days of months, so a month is never written twice.
      units: [["month", [1, 2, 3, 6]]],
      labels: { autoRotation: [0], style: { color: colors.muted }, format: "{value:%b %Y}" },
      plotLines: [{ value: time(today), color: LATE, width: 2, dashStyle: "ShortDash", zIndex: 4, label: { text: text.today, rotation: 0, align: "center", y: -8, style: { color: LATE, fontWeight: "bold", fontSize: "11px" } } }],
    },
    legend: { ...options.legend, enabled: false },
    tooltip: {
      ...options.tooltip,
      useHTML: true,
      formatter: function () {
        const row = rows[this.index];
        if (!row) return false;
        return `<b>${row.goal.title}</b><br/>${text.baseline}: ${row.baseline ? text.date(row.baseline) : "—"}<br/>${text.forecast}: <b>${text.date(row.forecast)}</b><br/>${slipText(text, row.slip)}`;
      },
    },
    plotOptions: { series: { animation: { duration: 700 } } },
    series: [
      {
        type: "dumbbell",
        name: text.forecast,
        data: rows.map((row) => ({
          low: time(row.baseline ?? row.forecast),
          high: time(row.forecast),
          connectorColor: row.slip !== null && row.slip > 0 ? LATE : row.slip !== null && row.slip < 0 ? EARLY : colors.muted,
          lowColor: colors.surface,
          color: row.goal.status === "DONE" ? EARLY : row.slip !== null && row.slip > 0 ? LATE : GOAL,
          accessibility: { description: `${row.goal.title}. ${text.baseline} ${row.baseline ? text.date(row.baseline) : "—"}, ${text.forecast} ${text.date(row.forecast)}, ${slipText(text, row.slip)}` },
        })),
        connectorWidthPlus: 4,
        marker: { radius: 7 },
        lowMarker: { symbol: "circle", fillColor: colors.surface, lineWidth: 2, lineColor: colors.muted, radius: 6 },
      } as SeriesOptionsType,
      {
        // The slip written by each forecast.
        type: "scatter",
        name: text.forecast,
        enableMouseTracking: false,
        marker: { enabled: false },
        // Written past the later of the two ends, clear of the bar.
        data: rows.map((row, index) => ({ x: index, y: Math.max(time(row.forecast), time(row.baseline ?? row.forecast)) })),
        dataLabels: {
          enabled: true,
          align: "left",
          x: 14,
          style: { color: colors.text, fontSize: "11px", fontWeight: "600", textOutline: "none" },
          formatter: function () {
            const row = rows[this.index];
            return row && row.slip ? slipText(text, row.slip) : "";
          },
        },
      },
    ],
  };
}

/** The phase a milestone belongs to: its nearest ancestor of type PHASE. */
function phaseOf(item: WbsItem, byId: Map<string, WbsItem>) {
  for (let parent = item.parentId ? byId.get(item.parentId) : undefined; parent; parent = parent.parentId ? byId.get(parent.parentId) : undefined) {
    if (parent.type === "PHASE") return parent;
  }
  return null;
}

function statusColor(item: WbsItem, today: string, colors: AppChartColors) {
  if (item.status === "DONE") return EARLY;
  const due = dueOf(item);
  if (due && due.slice(0, 10) < today) return LATE;
  if (item.status === "IN_PROGRESS" || item.status === "IN_REVIEW") return colors.brand;
  if (item.status === "AT_RISK" || item.status === "BLOCKED") return colors.warning;
  return colors.muted;
}

/** Phases as bars with their progress filled in, their milestones and goals as diamonds and stars on them. */
export function phasesOption({ items, today, colors, text }: LabInput): Options | null {
  const byId = new Map(items.map((item) => [item.id, item]));
  const phases = items
    .filter((item) => item.type === "PHASE" && (item.startDate ?? item.baselineStartDate) && dueOf(item))
    .sort((a, b) => (a.startDate ?? a.baselineStartDate)!.localeCompare((b.startDate ?? b.baselineStartDate)!));
  if (phases.length === 0) return null;
  const row = new Map(phases.map((phase, index) => [phase.id, index]));
  const checkpoints = items.filter((item) => (item.type === "MILESTONE" || item.type === "GOAL") && item.status !== "CANCELLED" && dueOf(item));
  const marks = (goal: boolean) =>
    checkpoints
      .filter((item) => (item.type === "GOAL") === goal)
      .flatMap((item): PointOptionsObject[] => {
        const phase = phaseOf(item, byId);
        const y = phase ? row.get(phase.id) : undefined;
        return y === undefined ? [] : [{ x: time(dueOf(item)!), y, name: item.title, color: statusColor(item, today, colors), custom: { status: text.status(item.status) } }];
      });
  const options = base(colors, text.titles.phases, Math.max(240, 80 + phases.length * 48));
  return {
    ...options,
    xAxis: { type: "datetime", gridLineWidth: 1, gridLineColor: colors.grid, lineColor: colors.grid, labels: { style: { color: colors.muted } }, plotLines: [{ value: time(today), color: LATE, width: 2, dashStyle: "ShortDash", zIndex: 5, label: { text: text.today, rotation: 0, y: 12, style: { color: LATE, fontWeight: "bold", fontSize: "11px" } } }] },
    yAxis: { categories: phases.map((phase) => phase.title), reversed: true, title: { text: undefined }, gridLineColor: colors.grid, labels: { style: { color: colors.text, fontSize: "12px" } } },
    legend: { ...options.legend, enabled: true },
    tooltip: {
      ...options.tooltip,
      formatter: function () {
        const date = (value: number) => text.date(new Date(value).toISOString());
        const point = this as unknown as { x: number; x2?: number; name?: string; partialFill?: { amount: number }; custom?: { status: string } };
        if (point.x2 !== undefined) return `<b>${point.name}</b><br/>${date(point.x)} — ${date(point.x2)}<br/>${text.progress}: <b>${Math.round((point.partialFill?.amount ?? 0) * 100)}%</b>`;
        return `<b>${point.name}</b><br/>${date(point.x)}<br/>${point.custom?.status ?? ""}`;
      },
    },
    series: [
      {
        type: "xrange",
        name: text.progress,
        borderRadius: 6,
        pointWidth: 18,
        colorByPoint: false,
        color: colors.series[0],
        partialFill: { fill: colors.brand },
        dataLabels: { enabled: true, style: { color: colors.text, fontSize: "11px", fontWeight: "600", textOutline: "none" }, formatter: function () { return `${Math.round(((this as unknown as { partialFill?: { amount: number } }).partialFill?.amount ?? 0) * 100)}%`; } },
        data: phases.map((phase, index): XrangePointOptionsObject => ({
          x: time((phase.startDate ?? phase.baselineStartDate)!),
          x2: time(dueOf(phase)!) + DAY,
          y: index,
          name: phase.title,
          partialFill: { amount: Math.max(0, Math.min(1, (phase.progress ?? 0) / 100)) },
          color: `${colors.series[0]}55`,
        })),
      },
      { type: "scatter", name: text.type("MILESTONE"), marker: { symbol: "diamond", radius: 7, lineWidth: 1.5, lineColor: colors.surface }, data: marks(false), zIndex: 3 },
      { type: "scatter", name: text.type("GOAL"), marker: { symbol: "star", radius: 9, lineWidth: 1.5, lineColor: colors.surface }, data: marks(true), zIndex: 3 },
    ],
  };
}

/** Milestones and goals of the coming months as a timeline of events, labels above and below in turn. */
export function milestonesTimelineOption({ items, today, colors, text }: LabInput): Options | null {
  const byId = new Map(items.map((item) => [item.id, item]));
  const from = time(today) - 60 * DAY;
  const to = time(today) + 120 * DAY;
  const events = items
    .filter((item) => (item.type === "MILESTONE" || item.type === "GOAL") && item.status !== "CANCELLED" && dueOf(item))
    .map((item) => ({ item, at: time(dueOf(item)!) }))
    .filter((entry) => entry.at >= from && entry.at <= to)
    .sort((a, b) => a.at - b.at)
    .slice(0, 30);
  if (events.length === 0) return null;
  const options = base(colors, text.titles.timeline, 360);
  return {
    ...options,
    chart: { ...options.chart, zooming: { type: "x" } },
    xAxis: { type: "datetime", visible: true, lineColor: colors.grid, labels: { style: { color: colors.muted } }, plotLines: [{ value: time(today), color: LATE, width: 2, dashStyle: "ShortDash", zIndex: 5 }] },
    yAxis: { visible: false },
    legend: { ...options.legend, enabled: false },
    tooltip: { ...options.tooltip, formatter: function () { const point = this as unknown as { name: string; x: number; description?: string }; return `<b>${point.name}</b><br/>${text.date(new Date(point.x).toISOString())}${point.description ? `<br/>${point.description}` : ""}`; } },
    series: [
      {
        type: "timeline",
        name: text.today,
        marker: { symbol: "circle", radius: 6 },
        dataLabels: { allowOverlap: false, connectorColor: colors.muted, color: colors.text, backgroundColor: colors.surface, borderColor: colors.grid, borderRadius: 6, style: { fontSize: "11px", textOutline: "none", width: 150 }, format: '<span style="color:{point.color}">●</span> <b>{point.label}</b><br/>{point.name}' },
        data: events.map(({ item, at }) => ({
          x: at,
          name: item.title,
          label: text.dayMonth(new Date(at).toISOString()),
          description: [phaseOf(item, byId)?.title ?? text.phaseless, text.status(item.status)].join(" · "),
          color: item.type === "GOAL" ? GOAL : statusColor(item, today, colors),
          marker: { symbol: item.type === "GOAL" ? "star" : "diamond", radius: item.type === "GOAL" ? 9 : 7 },
        })),
      } as SeriesOptionsType,
    ],
  };
}

/** Days of later moves by reason over all milestones and goals, largest first, with the cumulative share. */
export function shiftReasonsParetoOption(ladders: ShiftLadder[], colors: AppChartColors, text: LabText): Options | null {
  const totals = new Map<string, number>();
  for (const ladder of ladders) for (const [reason, value] of Object.entries(ladder.reasonDays)) totals.set(reason, (totals.get(reason) ?? 0) + value);
  const ranked = [...totals.entries()].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  const options = base(colors, text.titles.reasons, 320);
  // The cumulative share, rounded as it is shown and exported.
  const total = ranked.reduce((sum, [, value]) => sum + value, 0);
  const cumulative = ranked.map((_, index) => Math.round((ranked.slice(0, index + 1).reduce((sum, [, value]) => sum + value, 0) / total) * 1000) / 10);
  return {
    ...options,
    chart: { ...options.chart, zooming: {} },
    xAxis: { categories: ranked.map(([reason]) => text.reason(reason)), labels: { style: { color: colors.text } }, lineColor: colors.grid },
    yAxis: [
      { title: { text: text.days, style: { color: colors.muted } }, gridLineColor: colors.grid, labels: { style: { color: colors.muted } } },
      { title: { text: text.share, style: { color: colors.muted } }, opposite: true, min: 0, max: 100, endOnTick: false, tickInterval: 25, gridLineWidth: 0, labels: { format: "{value}%", style: { color: colors.muted } } },
    ],
    legend: { ...options.legend, enabled: true },
    tooltip: { ...options.tooltip, shared: true, valueDecimals: 0 },
    series: [
      { type: "column", name: text.days, zIndex: 2, borderRadius: 6, colorByPoint: true, colors: ranked.map(([reason]) => (reason === "NONE" ? colors.muted : colors.series[Math.max(0, ranked.findIndex(([key]) => key === reason)) % colors.series.length])), data: ranked.map(([, value]) => value), dataLabels: { enabled: true, style: { color: colors.text, textOutline: "none" } } },
      { type: "spline", name: text.share, yAxis: 1, zIndex: 3, color: LATE, lineWidth: 3, marker: { radius: 5 }, data: cumulative, tooltip: { valueDecimals: 1, valueSuffix: "%" } },
    ],
  };
}

/** Days each milestone moved later; a click drills down into its moves, one column per step on its date. */
export function shiftsDrilldownOption(ladders: ShiftLadder[], colors: AppChartColors, text: LabText): Options | null {
  const moved = ladders
    // Days of later moves over the whole history, as in the Pareto chart; the journal sends only the latest steps.
    .map((ladder) => ({ ladder, later: Object.values(ladder.reasonDays).reduce((sum, value) => sum + Math.max(0, value), 0) }))
    .filter((entry) => entry.later > 0)
    .sort((a, b) => b.later - a.later)
    .slice(0, 15);
  if (moved.length === 0) return null;
  const options = base(colors, text.titles.moves, 320);
  return {
    ...options,
    chart: { ...options.chart, zooming: {}, type: "column" },
    xAxis: { type: "category", labels: { style: { color: colors.text } }, lineColor: colors.grid },
    yAxis: { title: { text: text.days, style: { color: colors.muted } }, gridLineColor: colors.grid, labels: { style: { color: colors.muted } } },
    legend: { ...options.legend, enabled: false },
    plotOptions: { column: { borderRadius: 6, dataLabels: { enabled: true, style: { color: colors.text, textOutline: "none" } } } },
    series: [{ type: "column", name: text.titles.moves, color: colors.series[1], data: moved.map(({ ladder, later }) => ({ name: ladder.title, y: later, drilldown: ladder.id, color: ladder.type === "GOAL" ? GOAL : colors.series[1] })) }],
    drilldown: {
      breadcrumbs: { position: { align: "left" }, style: { color: colors.text } },
      activeAxisLabelStyle: { color: colors.text, textDecoration: "none" },
      activeDataLabelStyle: { color: colors.text, textDecoration: "none" },
      series: moved.map(({ ladder }) => ({
        type: "column",
        id: ladder.id,
        name: text.shiftsOf(ladder.title),
        data: [
          // Older moves the journal folds into one, then each of the latest.
          ...(ladder.earlierSteps && ladder.earlierSteps.count > 0 ? [{ name: text.earlier(ladder.earlierSteps.count), y: ladder.earlierSteps.deltaDays, color: colors.muted }] : []),
          ...ladder.steps
            .filter((step) => step.deltaDays)
            .map((step) => ({
              name: `${text.dayMonth(step.at)} · ${step.reason ? text.reason(step.reason.category) : text.reason("NONE")}`,
              y: step.deltaDays!,
              color: (step.deltaDays ?? 0) > 0 ? LATE : EARLY,
            })),
        ],
      })),
    },
  };
}

/** How a goal's forecast drifted over time: a step line of its date, the baseline as a line, notes on the larger moves. */
export function forecastDriftOption(ladders: ShiftLadder[], colors: AppChartColors, text: LabText, today: string): Options | null {
  const goals = ladders.filter((ladder) => ladder.type === "GOAL" && ladder.steps.some((step) => step.newDate));
  // The journal sends only the latest steps: the folded earlier ones count too.
  const moves = (entry: ShiftLadder) => entry.steps.length + (entry.earlierSteps?.count ?? 0);
  const ladder = goals.find((entry) => entry.isActiveGoal) ?? [...goals].sort((a, b) => moves(b) - moves(a))[0];
  if (!ladder) return null;
  const steps = [...ladder.steps].filter((step) => step.newDate).sort((a, b) => a.at.localeCompare(b.at));
  const first = steps[0]!;
  // A date holds until the next move changes it ("left": the line jumps at the move), the last one until today.
  const last = steps[steps.length - 1]!;
  const span = Math.max(14 * DAY, time(today) - Date.parse(first.at));
  const points = [
    ...(first.previousDate ? [{ x: Date.parse(first.at) - span * 0.1, y: time(first.previousDate) }] : []),
    ...steps.map((step) => ({ x: Date.parse(step.at), y: time(step.newDate!), id: step.id })),
    { x: Math.max(time(today), Date.parse(last.at) + DAY), y: time(last.newDate!) },
  ];
  const notes = steps
    .filter((step) => Math.abs(step.deltaDays ?? 0) >= 1)
    .sort((a, b) => Math.abs(b.deltaDays ?? 0) - Math.abs(a.deltaDays ?? 0))
    .slice(0, 6);
  const options = base(colors, `${text.titles.drift}: ${ladder.title}`, 340);
  return {
    ...options,
    // Which goal it is, on the chart itself: the current goal, or the goal that moved most when the current one never moved.
    title: { text: ladder.title, align: "left", style: { color: colors.text, fontSize: "13px", fontWeight: "600" } },
    xAxis: { type: "datetime", minTickInterval: DAY, gridLineColor: colors.grid, lineColor: colors.grid, labels: { style: { color: colors.muted } } },
    yAxis: {
      type: "datetime",
      title: { text: undefined },
      gridLineColor: colors.grid,
      labels: { style: { color: colors.muted } },
      plotLines: ladder.baselineDate ? [{ value: time(ladder.baselineDate), color: colors.muted, dashStyle: "Dash", width: 2, label: { text: text.baseline, style: { color: colors.muted } } }] : [],
    },
    legend: { ...options.legend, enabled: false },
    tooltip: { ...options.tooltip, xDateFormat: "%e %b %Y", pointFormatter: function () { return `${text.forecast}: <b>${text.date(new Date(this.y ?? 0).toISOString())}</b>`; } },
    series: [{ type: "line", name: ladder.title, step: "left", color: GOAL, lineWidth: 3, marker: { enabled: true, radius: 4 }, data: points }],
    annotations: [
      {
        draggable: "",
        labelOptions: { backgroundColor: colors.surface, borderColor: colors.grid, borderRadius: 6, style: { color: colors.text, fontSize: "11px" }, y: -18 },
        labels: notes.map((step): AnnotationsLabelsOptions => ({
          point: { xAxis: 0, yAxis: 0, x: Date.parse(step.at), y: time(step.newDate!) },
          text: `${(step.deltaDays ?? 0) > 0 ? "+" : ""}${step.deltaDays} · ${step.reason ? text.reason(step.reason.category) : text.reason("NONE")}`,
        })),
      },
    ],
  };
}

/** The width of an A4 landscape page inside its margins, and the height a chart may take on it, in pixels. */
export const SCHEDULE_PRINT_WIDTH = 1040;
export const SCHEDULE_PRINT_HEIGHT = 560;

/**
 * A chart as it goes on paper: the page's width, at most a page's height
 * (the rows of a tall chart get closer), no animation and no menu. Each chart
 * prints on a page of its own.
 */
export function printScheduleOption(options: Options): Options {
  const height = typeof options.chart?.height === "number" ? options.chart.height : SCHEDULE_PRINT_HEIGHT;
  return {
    ...options,
    chart: { ...options.chart, width: SCHEDULE_PRINT_WIDTH, height: Math.min(height, SCHEDULE_PRINT_HEIGHT), animation: false },
    exporting: { ...options.exporting, enabled: false },
    plotOptions: { ...options.plotOptions, series: { ...options.plotOptions?.series, animation: false } },
  };
}
