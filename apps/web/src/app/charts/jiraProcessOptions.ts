import type { Options } from "highcharts";
import type { AppChartColors } from "./appChartTheme";

export type JiraProcessStatusStat = { status: string; samples: number; medianHours: number | null; p85Hours: number | null; totalHours: number; share: number; current: number };
export type JiraProcessEdge = { from: string; to: string; count: number; medianHoursBefore: number | null };
export type JiraProcessText = { median: string; p85: string; hours: (value: number) => string; moves: string; from: string; to: string; waitBefore: string; bottleneck: string; samples: string };

function base(colors: AppChartColors, description: string, height: number): Options {
  return {
    chart: { backgroundColor: "transparent", style: { fontFamily: "inherit" }, height, spacing: [8, 6, 12, 4] },
    title: { text: undefined },
    accessibility: { enabled: true, description },
    // The credit stays while the library is used under its evaluation terms.
    credits: { enabled: true, style: { color: colors.muted, fontSize: "8px" } },
    exporting: { enabled: false },
    tooltip: { outside: true, backgroundColor: colors.surface, borderColor: colors.grid, style: { color: colors.text, fontSize: "12px" } },
  };
}

/**
 * How long a stay in each status lasts — median and p85 of finished stays,
 * in the order work goes; the status holding most hours is the bottleneck.
 */
export function jiraProcessTimeOption(stats: JiraProcessStatusStat[], bottleneck: string | null, colors: AppChartColors, text: JiraProcessText, title: string): Options | null {
  const shown = stats.filter((stat) => stat.samples > 0);
  if (shown.length === 0) return null;
  const options = base(colors, title, Math.max(180, 60 + shown.length * 34));
  return {
    ...options,
    chart: { ...options.chart, type: "bar" },
    xAxis: { categories: shown.map((stat) => stat.status), labels: { style: { color: colors.text, fontSize: "12px" } }, lineColor: colors.grid },
    yAxis: { title: { text: undefined }, gridLineColor: colors.grid, labels: { style: { color: colors.muted }, format: "{value} h" } },
    legend: { enabled: true, itemStyle: { color: colors.text, fontWeight: "normal" } },
    tooltip: {
      ...options.tooltip,
      shared: true,
      formatter: function () {
        const stat = shown[(this as unknown as { points?: Array<{ point: { index: number } }> }).points?.[0]?.point.index ?? 0];
        if (!stat) return false;
        return `<b>${stat.status}</b>${stat.status === bottleneck ? ` · ${text.bottleneck}` : ""}<br/>${text.median}: ${text.hours(stat.medianHours ?? 0)}<br/>${text.p85}: ${text.hours(stat.p85Hours ?? 0)}<br/>${text.samples}: ${stat.samples}`;
      },
    },
    plotOptions: { bar: { borderRadius: 3, borderWidth: 0, grouping: true, pointPadding: 0.08, groupPadding: 0.12 } },
    series: [
      { type: "bar", name: text.median, data: shown.map((stat) => ({ y: stat.medianHours ?? 0, color: stat.status === bottleneck ? colors.danger : colors.series[0] })) },
      { type: "bar", name: text.p85, color: colors.grid, data: shown.map((stat) => ({ y: stat.p85Hours ?? 0, color: stat.status === bottleneck ? `${colors.danger}66` : `${colors.series[0]}55` })) },
    ],
  };
}

/** Which status work moves to from which, as a matrix: the colour is the number of moves. */
export function jiraProcessMatrixOption(statuses: string[], edges: JiraProcessEdge[], colors: AppChartColors, text: JiraProcessText, title: string): Options | null {
  if (edges.length === 0) return null;
  const index = new Map(statuses.map((status, position) => [status, position]));
  const axis = [...statuses];
  for (const edge of edges) {
    for (const status of [edge.from, edge.to]) {
      if (!index.has(status)) {
        index.set(status, axis.length);
        axis.push(status);
      }
    }
  }
  const max = Math.max(...edges.map((edge) => edge.count));
  const options = base(colors, title, Math.max(220, 80 + axis.length * 32));
  return {
    ...options,
    chart: { ...options.chart, type: "heatmap", plotBorderWidth: 0 },
    // Every status on both axes, also one nobody moved into or out of.
    xAxis: { categories: axis, min: 0, max: axis.length - 1, title: { text: text.to, style: { color: colors.muted } }, labels: { style: { color: colors.text, fontSize: "11px" } } },
    yAxis: { categories: axis, min: 0, max: axis.length - 1, title: { text: text.from, style: { color: colors.muted } }, reversed: true, labels: { style: { color: colors.text, fontSize: "11px" } } },
    colorAxis: { min: 0, max, minColor: colors.surface, maxColor: colors.series[0] },
    legend: { enabled: false },
    tooltip: {
      ...options.tooltip,
      formatter: function () {
        const point = (this as unknown as { point: { x: number; y: number; value: number; custom?: { median: number | null } } }).point;
        return `<b>${axis[point.y]} → ${axis[point.x]}</b><br/>${text.moves}: ${point.value}${point.custom?.median != null ? `<br/>${text.waitBefore}: ${text.hours(point.custom.median)}` : ""}`;
      },
    },
    series: [{
      type: "heatmap",
      name: text.moves,
      borderWidth: 1,
      borderColor: colors.grid,
      data: edges.map((edge) => ({ x: index.get(edge.to)!, y: index.get(edge.from)!, value: edge.count, custom: { median: edge.medianHoursBefore } })),
      dataLabels: { enabled: true, color: colors.text, style: { textOutline: "none", fontWeight: "600" } },
    }],
  };
}
