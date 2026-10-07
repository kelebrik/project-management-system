import type { Chart, Options, PointOptionsObject, SeriesOptionsType, SVGElement } from "highcharts";
import type { AppChartColors } from "./appChartTheme";

/**
 * Highcharts options of the Jira widgets and of the flow charts. Pure, so the
 * pictures can be tested: which points in which order, and what a click on
 * a point opens.
 */

export type JiraChartGroup = { key: string; label: string; value: number; recordCount?: number; breakdown?: Array<{ key: string; label: string; value: number; recordCount?: number }> };
export type JiraChartPick = (group: { key: string; label: string }, cell?: { key: string; label: string }) => void;

function base(colors: AppChartColors, title: string, format: (value: number) => string): Options {
  return {
    chart: { backgroundColor: "transparent", style: { fontFamily: "inherit" }, spacing: [8, 6, 14, 4], animation: { duration: 300 } },
    title: { text: undefined },
    // Points are reached from the keyboard through the buttons under the chart; the legend through Highcharts.
    accessibility: { enabled: true, description: title, keyboardNavigation: { order: ["legend"] } },
    // The credit stays while the library is used under its evaluation terms.
    credits: { enabled: true, position: { align: "right", verticalAlign: "bottom", x: -2, y: -1 }, style: { color: colors.muted, fontSize: "8px", cursor: "default" } },
    legend: { enabled: false, itemStyle: { color: colors.text, fontSize: "11px", fontWeight: "normal" }, symbolRadius: 2 },
    tooltip: {
      outside: true,
      backgroundColor: colors.surface,
      borderColor: colors.grid,
      style: { color: colors.text, fontSize: "12px" },
      pointFormatter: function () {
        return `<span style="color:${String(this.color)}">●</span> ${this.series.name}: <b>${format(this.y ?? 0)}</b><br/>`;
      },
    },
    plotOptions: {
      series: { animation: { duration: 350 } },
      column: { borderRadius: 4, borderWidth: 0, maxPointWidth: 34 },
      bar: { borderRadius: 4, borderWidth: 0, maxPointWidth: 18 },
    },
  };
}

const linked = new WeakSet<SVGElement>();

/** Names of the groups on the axis open their rows on a click, as the group labels did. */
function clickableCategories(groups: JiraChartGroup[], onPick: JiraChartPick) {
  return function (this: Chart) {
    for (const [position, tick] of Object.entries(this.xAxis[0]?.ticks ?? {})) {
      const group = groups[Number(position)];
      const label = tick.label;
      if (!group || !label || linked.has(label)) continue;
      linked.add(label);
      label.css({ cursor: "pointer" }).on("click", () => onPick(group));
    }
  };
}

const axis = (colors: AppChartColors, categories: string[], step = 1) => ({
  categories,
  lineColor: colors.grid,
  tickLength: 0,
  labels: { autoRotation: [0], step, style: { color: colors.muted, fontSize: "11px", textOverflow: "ellipsis" } },
});

const valueAxis = (colors: AppChartColors, format: (value: number) => string) => ({
  title: { text: undefined },
  gridLineColor: colors.grid,
  allowDecimals: false,
  labels: { style: { color: colors.muted, fontSize: "11px" }, formatter: function (this: { value: number | string }) { return format(Number(this.value)); } },
});

/** Columns and lines run through time, so in the order of their keys; bars keep the order they come in (by value). */
export function jiraOrderedGroups(kind: "columns" | "line" | "bars", groups: JiraChartGroup[]) {
  return kind === "bars" ? groups : [...groups].sort((left, right) => left.key.localeCompare(right.key));
}

/**
 * A widget split by one field: columns along time (in time order, empty steps
 * as zero), a line along time, or horizontal bars by value. A click on a point
 * opens its rows.
 */
export function jiraGroupsOption(input: { kind: "columns" | "line" | "bars"; groups: JiraChartGroup[]; title: string; seriesName: string; colors: AppChartColors; format: (value: number) => string; onPick: JiraChartPick }): Options {
  const { colors, format } = input;
  const groups = jiraOrderedGroups(input.kind, input.groups);
  const labels = groups.map((group) => group.label);
  const horizontal = input.kind === "bars";
  const type = input.kind === "columns" ? "column" : input.kind === "line" ? "line" : "bar";
  const options = base(colors, input.title, format);
  return {
    ...options,
    chart: { ...options.chart, type, ...(horizontal ? { events: { render: clickableCategories(groups, input.onPick) } } : {}) },
    xAxis: { ...axis(colors, labels, horizontal ? 1 : Math.max(1, Math.ceil(labels.length / 9))), ...(horizontal ? { labels: { style: { color: colors.brand, fontSize: "12px", textOverflow: "ellipsis", width: 160 } } } : {}) },
    yAxis: valueAxis(colors, format),
    plotOptions: {
      ...options.plotOptions,
      series: {
        ...options.plotOptions?.series,
        cursor: "pointer",
        dataLabels: { enabled: input.kind !== "line", style: { color: colors.text, fontSize: "11px", fontWeight: "normal", textOutline: "none" }, formatter: function () { return this.y ? format(this.y) : ""; } },
        point: { events: { click: function () { const group = groups[this.index]; if (group) input.onPick(group); } } },
      },
      line: { lineWidth: 2, marker: { radius: 3 } },
    },
    series: [{
      type,
      name: input.seriesName,
      color: input.kind === "bars" ? colors.brand : colors.series[0],
      data: groups.map((group): PointOptionsObject => ({ y: group.value, name: group.label })),
    } as SeriesOptionsType],
  };
}

/** Horizontal bars split by a second field; a click on a part opens the rows of that cell. */
export function jiraStackedOption(input: { groups: JiraChartGroup[]; keys: Array<{ key: string; label: string }>; title: string; colors: AppChartColors; format: (value: number) => string; onPick: JiraChartPick }): Options {
  const { colors, format, groups, keys } = input;
  const options = base(colors, input.title, format);
  return {
    ...options,
    chart: { ...options.chart, type: "bar", events: { render: clickableCategories(groups, input.onPick) } },
    legend: { ...options.legend, enabled: true, align: "center", verticalAlign: "bottom" },
    xAxis: { ...axis(colors, groups.map((group) => group.label)), labels: { style: { color: colors.brand, fontSize: "12px", textOverflow: "ellipsis", width: 160 } } },
    // Parts run left to right in the order of the legend. The total is the group's own value from the
    // server, not the sum of its parts: an issue in two components is one issue, and averages do not add up.
    yAxis: { ...valueAxis(colors, format), reversedStacks: false, stackLabels: { enabled: true, style: { color: colors.text, fontSize: "11px", fontWeight: "bold", textOutline: "none" }, formatter: function () { return format(groups[Number(this.x)]?.value ?? 0); } } },
    plotOptions: {
      ...options.plotOptions,
      bar: { ...options.plotOptions?.bar, stacking: "normal" },
      series: { ...options.plotOptions?.series, cursor: "pointer" },
    },
    series: keys.map((cell, index): SeriesOptionsType => ({
      type: "bar",
      name: cell.label,
      color: colors.series[index % colors.series.length],
      data: groups.map((group) => group.breakdown?.find((entry) => entry.key === cell.key)?.value ?? 0),
      point: { events: { click: function () { const group = groups[this.index]; if (group) input.onPick(group, cell); } } },
    })),
  };
}

export type JiraFlowSeries = { key: string; label: string; color: string; values: number[] };

/** Lines over the steps of time, or stacked areas for the cumulative flow. */
export function jiraFlowOption(input: { title: string; labels: string[]; series: JiraFlowSeries[]; stacked: boolean; colors: AppChartColors; format: (value: number) => string }): Options {
  const { colors, format } = input;
  const options = base(colors, input.title, format);
  return {
    ...options,
    chart: { ...options.chart, type: input.stacked ? "area" : "line" },
    // The legend names each line with its latest value, as before.
    legend: { ...options.legend, enabled: true, align: "center", verticalAlign: "bottom", labelFormatter: function () { const values = input.series[this.index]?.values ?? []; return `${this.name}: <b>${format(values.at(-1) ?? 0)}</b>`; } },
    xAxis: axis(colors, input.labels, Math.max(1, Math.ceil(input.labels.length / 8))),
    // The cumulative flow keeps its first category (done) at the bottom.
    yAxis: { ...valueAxis(colors, format), reversedStacks: false },
    tooltip: { ...options.tooltip, shared: true },
    plotOptions: {
      ...options.plotOptions,
      area: { stacking: input.stacked ? "normal" : undefined, fillOpacity: 0.75, lineWidth: 1, marker: { enabled: false } },
      line: { lineWidth: 2, marker: { enabled: input.labels.length <= 30, radius: 2 } },
    },
    series: input.series.map((line): SeriesOptionsType => ({ type: input.stacked ? "area" : "line", name: line.label, color: line.color, data: line.values })),
  };
}
