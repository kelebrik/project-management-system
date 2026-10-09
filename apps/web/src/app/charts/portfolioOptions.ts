import type { Chart, Options, PointOptionsObject, SeriesOptionsType, XAxisPlotBandsOptions, XrangePointOptionsObject } from "highcharts";
import type { PortfolioGoalTimelineProjectRow, PortfolioRedRaidItem, PortfolioRedRaidProject } from "../portfolioModels";
import type { AppChartColors } from "./appChartTheme";

/**
 * The Portfolio page drawn with Highcharts, like the project schedule: the
 * goals of every project as dumbbells from baseline to forecast, each project
 * from its start to its target with the share of work done, and blocking
 * problems and key risks as bubbles — days until due across, score up, the
 * schedule impact as the size. Every chart zooms and exports in the browser.
 * Pure, so the pictures can be tested; clicks go to the given callbacks.
 *
 * Missing data is never drawn as something it is not: a goal without a
 * baseline has an unknown slip, a project without work has no progress bar
 * fill, and a problem or risk without a due date is left to the list.
 */

const DAY = 86_400_000;
const time = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
const LATE = "#ef4444";
const EARLY = "#16a34a";
const GOAL = "#8b5cf6";

export type PortfolioChartText = {
  today: string;
  baseline: string;
  forecast: string;
  noBaseline: string;
  daysLater: (value: number) => string;
  daysEarlier: (value: number) => string;
  onTime: string;
  start: string;
  target: string;
  done: (percent: number) => string;
  noWork: string;
  overdue: string;
  daysUntil: string;
  score: string;
  impact: (days: number) => string;
  owner: string;
  dueDate: string;
  date: (day: string) => string;
  titles: { goals: string; progress: string; problems: string; risks: string };
};

/** What a click on a goal of the goals chart opens: its row in the project's structure. */
export type PortfolioGoalPick = { projectId: string; projectCode: string; goalId: string };

/**
 * Makes the category labels of an axis open what their row shows. Bound on
 * every render, since Highcharts redraws labels; assigning replaces the last
 * handler, so one click runs one callback.
 */
export function clickableCategoryLabels(axis: "xAxis" | "yAxis", onPick: (index: number) => void) {
  return function (this: Chart) {
    for (const [position, tick] of Object.entries(this[axis][0]?.ticks ?? {})) {
      const label = tick.label;
      if (!label) continue;
      label.css({ cursor: "pointer" });
      // The mouse shortcut to the row's point; from the keyboard, Highcharts' own
      // navigation reaches the point, and Enter on it does the same.
      label.element.onclick = () => onPick(Number(position));
    }
  };
}

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
    tooltip: { backgroundColor: colors.surface, borderColor: colors.grid, style: { color: colors.text }, useHTML: true },
  };
}

const todayLine = (today: string, text: PortfolioChartText) => ({
  value: time(today),
  color: LATE,
  width: 2,
  dashStyle: "ShortDash" as const,
  zIndex: 5,
  label: { text: text.today, rotation: 0, align: "center" as const, y: -8, style: { color: LATE, fontWeight: "bold", fontSize: "11px" } },
});

function slipText(text: PortfolioChartText, slip: number | null) {
  if (slip === null) return text.noBaseline;
  return slip > 0 ? text.daysLater(slip) : slip < 0 ? text.daysEarlier(-slip) : text.onTime;
}

/** All goals of the shown projects, one row each, grouped by project in bands; a click on a goal or its name opens its row in the structure. */
export function portfolioGoalsOption(input: { rows: PortfolioGoalTimelineProjectRow[]; from: string; to: string; today: string; colors: AppChartColors; text: PortfolioChartText; onPick: (goal: PortfolioGoalPick) => void }): Options | null {
  const { colors, text } = input;
  const goals = input.rows.flatMap((row, band) => row.items.map((item) => ({ item, band, row })));
  if (goals.length === 0) return null;
  const rows = goals.map(({ item, band, row }) => {
    const forecast = item.dueDate.slice(0, 10);
    const baseline = item.baselineDueDate ? item.baselineDueDate.slice(0, 10) : null;
    return { item, band, row, forecast, baseline, slip: item.delayDays };
  });
  // Each project's goals on a band of their own, every other band shaded.
  const bands: XAxisPlotBandsOptions[] = [];
  rows.forEach((row, index) => {
    const last = bands.at(-1) as (XAxisPlotBandsOptions & { band?: number }) | undefined;
    if (last && last.band === row.band) last.to = index + 0.5;
    else bands.push({ from: index - 0.5, to: index + 0.5, color: row.band % 2 ? "rgba(100, 116, 139, 0.07)" : "transparent", band: row.band } as XAxisPlotBandsOptions);
  });
  const options = base(colors, text.titles.goals, Math.max(240, 80 + rows.length * 34));
  const pickGoal = (index: number) => {
    const row = rows[index];
    if (row) input.onPick({ projectId: row.item.projectId, projectCode: row.item.projectCode, goalId: row.item.id });
  };
  return {
    ...options,
    chart: { ...options.chart, inverted: true, zooming: { type: "y" }, spacingTop: 24, events: { render: clickableCategoryLabels("xAxis", (index) => pickGoal(index)) } },
    xAxis: {
      categories: rows.map((row) => `<b>${row.row.projectCode}</b> · ${row.item.goalTitle}`),
      labels: { useHTML: false, style: { color: colors.text, fontSize: "12px", textOverflow: "ellipsis", width: 300 } },
      lineColor: colors.grid,
      plotBands: bands.map(({ from, to, color }) => ({ from, to, color })),
    },
    yAxis: {
      type: "datetime",
      min: time(input.from),
      max: time(input.to),
      title: { text: undefined },
      gridLineColor: colors.grid,
      tickPixelInterval: 110,
      units: [["month", [1, 2, 3, 6]]],
      labels: { autoRotation: [0], style: { color: colors.muted }, format: "{value:%b %Y}" },
      plotLines: [todayLine(input.today, text)],
    },
    legend: { ...options.legend, enabled: false },
    tooltip: {
      ...options.tooltip,
      formatter: function () {
        const row = rows[this.index];
        if (!row) return false;
        return `<b>${row.row.projectName}</b><br/>${row.item.goalTitle}<br/>${text.baseline}: ${row.baseline ? text.date(row.baseline) : "—"}<br/>${text.forecast}: <b>${text.date(row.forecast)}</b><br/>${slipText(text, row.slip)}`;
      },
    },
    plotOptions: { series: { cursor: "pointer", point: { events: { click: function () { pickGoal(this.index); } } } } },
    series: [
      {
        type: "dumbbell",
        name: text.forecast,
        data: rows.map((row) => ({
          low: time(row.baseline ?? row.forecast),
          high: time(row.forecast),
          connectorColor: row.slip !== null && row.slip > 0 ? LATE : row.slip !== null && row.slip < 0 ? EARLY : colors.muted,
          lowColor: colors.surface,
          color: row.item.status === "DONE" ? EARLY : row.slip !== null && row.slip > 0 ? LATE : GOAL,
          // Read out in words: the dates and the slip, not the numbers behind them.
          accessibility: { description: `${row.row.projectName}: ${row.item.goalTitle}. ${text.baseline} ${row.baseline ? text.date(row.baseline) : "—"}, ${text.forecast} ${text.date(row.forecast)}, ${slipText(text, row.slip)}` },
        })),
        connectorWidthPlus: 4,
        marker: { radius: 6 },
        lowMarker: { symbol: "circle", fillColor: colors.surface, lineWidth: 2, lineColor: colors.muted, radius: 5 },
      } as SeriesOptionsType,
      {
        type: "scatter",
        name: text.forecast,
        enableMouseTracking: false,
        marker: { enabled: false },
        data: rows.map((row, index) => ({ x: index, y: Math.max(time(row.forecast), time(row.baseline ?? row.forecast)) })),
        dataLabels: {
          enabled: true,
          align: "left",
          x: 12,
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

export type PortfolioProgressProject = { id: string; code: string; name: string; rag: string; startDate: string; targetDate: string; completedPercent: number | null };

const ragColor = (rag: string, colors: AppChartColors) => (rag === "GREEN" ? EARLY : rag === "AMBER" ? colors.warning : rag === "RED" ? LATE : colors.muted);

/**
 * The progress chart's geometry is fixed so its rows line up with the passport
 * fields shown next to it: a row of this height per project, between a top
 * margin (room for "Today") and the axis at the bottom.
 */
export const PROGRESS_ROW = 56;
export const PROGRESS_TOP = 28;
export const PROGRESS_BOTTOM = 34;

/** The projects the progress chart draws, in its order: those with a start and a target not before it. */
export function drawableProgressProjects(projects: PortfolioProgressProject[]) {
  return projects.filter((project) => project.startDate && project.targetDate && time(project.targetDate) >= time(project.startDate));
}

/** Each project from its start to its target, the share of work done filled in, coloured by its RAG; a click opens it. */
export function portfolioProgressOption(input: { projects: PortfolioProgressProject[]; today: string; colors: AppChartColors; text: PortfolioChartText; onPick: (projectId: string) => void }): Options | null {
  const { colors, text } = input;
  const projects = drawableProgressProjects(input.projects);
  if (projects.length === 0) return null;
  const options = base(colors, text.titles.progress, PROGRESS_TOP + projects.length * PROGRESS_ROW + PROGRESS_BOTTOM);
  return {
    ...options,
    chart: {
      ...options.chart, marginTop: PROGRESS_TOP, marginBottom: PROGRESS_BOTTOM, spacingTop: 0, spacingBottom: 0,
      events: { render: clickableCategoryLabels("yAxis", (index) => { const project = projects[index]; if (project) input.onPick(project.id); }) },
    },
    xAxis: { type: "datetime", gridLineWidth: 1, gridLineColor: colors.grid, lineColor: colors.grid, labels: { style: { color: colors.muted } }, plotLines: [{ ...todayLine(input.today, text), label: { ...todayLine(input.today, text).label, y: 12 } }] },
    yAxis: { categories: projects.map((project) => `${project.code} · ${project.name}`), reversed: true, title: { text: undefined }, gridLineColor: colors.grid, labels: { style: { color: colors.text, fontSize: "12px", textOverflow: "ellipsis", width: 260 } } },
    legend: { ...options.legend, enabled: false },
    tooltip: {
      ...options.tooltip,
      formatter: function () {
        const project = projects[(this as unknown as { y: number }).y];
        if (!project) return false;
        return `<b>${project.code} · ${project.name}</b><br/>${text.start}: ${text.date(project.startDate)}<br/>${text.target}: ${text.date(project.targetDate)}<br/>${project.completedPercent === null ? text.noWork : text.done(project.completedPercent)}`;
      },
    },
    plotOptions: { series: { cursor: "pointer", point: { events: { click: function () { const project = projects[(this as unknown as { y: number }).y]; if (project) input.onPick(project.id); } } } } },
    series: [
      {
        type: "xrange",
        name: text.titles.progress,
        borderRadius: 6,
        pointWidth: 22,
        dataLabels: {
          enabled: true,
          style: { color: colors.text, fontSize: "11px", fontWeight: "600", textOutline: "none" },
          formatter: function () {
            const project = projects[(this as unknown as { y: number }).y];
            return !project ? "" : project.completedPercent === null ? text.noWork : `${project.completedPercent}%`;
          },
        },
        data: projects.map((project, index): XrangePointOptionsObject => ({
          x: time(project.startDate),
          x2: time(project.targetDate) + DAY,
          y: index,
          color: `${ragColor(project.rag, colors)}40`,
          // No work, no fill: an empty bar is not "0 % done".
          ...(project.completedPercent === null ? {} : { partialFill: { amount: project.completedPercent / 100, fill: ragColor(project.rag, colors) } }),
          accessibility: { description: `${project.code} · ${project.name}: ${text.start} ${text.date(project.startDate)}, ${text.target} ${text.date(project.targetDate)}, ${project.completedPercent === null ? text.noWork : text.done(project.completedPercent)}` },
        })),
      },
    ],
  };
}

/** Days from today to a due date: negative when overdue. */
export const portfolioDaysUntil = (dueDate: string, today: string) => Math.round((time(dueDate) - time(today)) / DAY);

/**
 * Problems or risks as bubbles: days until due across (overdue on the left of
 * today), score up, the schedule impact as the size, a colour per project; a
 * click opens the item. Items without a due date are not drawn (they are in
 * the list under the chart).
 */
export function portfolioRaidBubbleOption(input: { projects: PortfolioRedRaidProject[]; title: string; today: string; colors: AppChartColors; text: PortfolioChartText; projectColor: (projectId: string) => string; onPick: (item: PortfolioRedRaidItem) => void }): Options | null {
  const { colors, text } = input;
  const dated = input.projects.map((project) => ({ project, items: project.items.filter((item) => item.dueDate) })).filter((entry) => entry.items.length > 0);
  if (dated.length === 0) return null;
  const options = base(colors, input.title, 320);
  return {
    ...options,
    chart: { ...options.chart, type: "bubble", zooming: { type: "xy" } },
    xAxis: {
      // Today always in sight, however overdue or far everything is.
      softMin: -7,
      softMax: 7,
      title: { text: text.daysUntil, style: { color: colors.muted } },
      gridLineWidth: 1,
      gridLineColor: colors.grid,
      lineColor: colors.grid,
      labels: { style: { color: colors.muted } },
      plotBands: [{ from: -10_000, to: 0, color: "rgba(239, 68, 68, 0.06)", label: { text: text.overdue, align: "left", x: 8, y: 14, style: { color: LATE, fontSize: "11px" } } }],
      plotLines: [{ value: 0, color: LATE, width: 2, dashStyle: "ShortDash", zIndex: 3, label: { text: text.today, rotation: 0, y: 12, x: 4, style: { color: LATE, fontWeight: "bold", fontSize: "11px" } } }],
    },
    yAxis: { title: { text: text.score, style: { color: colors.muted } }, gridLineColor: colors.grid, labels: { style: { color: colors.muted } }, startOnTick: false, endOnTick: false },
    legend: { ...options.legend, enabled: true },
    tooltip: {
      ...options.tooltip,
      formatter: function () {
        const item = (this as unknown as { options: { custom?: { item: PortfolioRedRaidItem } } }).options.custom?.item;
        if (!item) return false;
        return `<b>${item.title}</b><br/>${item.projectName}<br/>${text.score}: <b>${item.riskScore}</b><br/>${text.owner}: ${item.owner || "—"}<br/>${text.dueDate}: ${item.dueDate ? text.date(item.dueDate) : "—"}${item.scheduleImpactDays > 0 ? `<br/>${text.impact(item.scheduleImpactDays)}` : ""}`;
      },
    },
    plotOptions: {
      bubble: { minSize: 12, maxSize: 46, cursor: "pointer", marker: { fillOpacity: 0.7, lineWidth: 1, lineColor: colors.surface }, point: { events: { click: function () { const item = (this as unknown as { options: { custom?: { item: PortfolioRedRaidItem } } }).options.custom?.item; if (item) input.onPick(item); } } } },
    },
    // A project keeps its colour whatever is filtered, in problems and in risks alike.
    series: dated.map(({ project, items }): SeriesOptionsType => ({
      type: "bubble",
      name: project.projectName,
      color: input.projectColor(project.projectId),
      data: items.map((item): PointOptionsObject => ({
        x: portfolioDaysUntil(item.dueDate!, input.today),
        y: item.riskScore,
        z: Math.max(1, item.scheduleImpactDays),
        name: item.title,
        custom: { item },
        accessibility: { description: `${item.projectName}: ${item.title}. ${text.score} ${item.riskScore}. ${text.dueDate} ${text.date(item.dueDate!)}${item.scheduleImpactDays > 0 ? `. ${text.impact(item.scheduleImpactDays)}` : ""}` },
      })),
    })),
  };
}
