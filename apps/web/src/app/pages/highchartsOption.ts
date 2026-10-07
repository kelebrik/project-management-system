import type { Options, PointOptionsObject, SeriesOptionsType, XAxisOptions, YAxisOptions, YAxisPlotLinesOptions } from "highcharts";
import { PAGE_OTHER_KEY } from "@pms/shared";
import { chartSummary, type ChartColors, type ChartInput } from "./chartOption";
import { beyondAlert, formatNumber, groupLabel } from "./pageModel";

/**
 * The Highcharts options of a chart widget, built from the server's groups
 * the same way as the ECharts option: the same bars in the same order with
 * the same colours. Pure (only Highcharts types here), so it can be tested.
 */

function colorFor(key: string | null, input: Pick<ChartInput, "colors">, field: ChartInput["field"], index: number) {
  const { colors } = input;
  if (field?.format === "rag" && key && key in colors.rag) return colors.rag[key as keyof ChartColors["rag"]];
  if (key === null || key === PAGE_OTHER_KEY) return colors.muted;
  // Yes/no splits here are mostly bad news when yes (overdue, later, critical).
  if (field?.kind === "boolean") return key === "true" ? colors.rag.RED : colors.rag.GREEN;
  return colors.series[index % colors.series.length];
}

export function buildHighchartsOption(input: ChartInput & { onPick?: (index: number) => void }): Options {
  const { result, kind, field, subField, colors, locale, unit } = input;
  const labels = result.groups.map((group) => groupLabel(group.key, field, result.bucket, locale));
  const format = (value: number | null | undefined) => formatNumber(value ?? 0, unit, locale);
  const axisFormat = (value: number) => formatNumber(value, unit === "days" ? "plain" : unit, locale);
  const text = { color: colors.text, fontSize: "11px", fontWeight: "normal", textOutline: "none" };
  const muted = { color: colors.muted, fontSize: "11px" };
  const pick = input.onPick;
  const base: Options = {
    chart: { backgroundColor: "transparent", style: { fontFamily: "inherit" }, spacing: [6, 6, 14, 4], animation: { duration: 350 } },
    title: { text: undefined },
    // The credit stays while the library is used under its evaluation terms; it sits below the axis.
    credits: { enabled: true, position: { align: "right", verticalAlign: "bottom", x: -2, y: -1 }, style: { color: colors.muted, fontSize: "8px", cursor: "default" } },
    accessibility: { enabled: true, description: chartSummary(input) },
    tooltip: {
      outside: true,
      backgroundColor: colors.surface,
      borderColor: colors.grid,
      style: { color: colors.text, fontSize: "12px" },
      pointFormatter: function () {
        const name = kind === "stacked" ? `<span style="color:${String(this.color)}">●</span> ${this.series.name}: ` : "";
        return `${name}<b>${format(this.y)}</b><br/>`;
      },
    },
    plotOptions: {
      series: {
        animation: { duration: 400 },
        cursor: pick ? "pointer" : undefined,
        point: pick ? { events: { click: function () { pick(this.index); } } } : undefined,
        dataLabels: { enabled: input.showValues, style: text, formatter: function () { return format(this.y); } },
      },
      column: { borderRadius: 4, borderWidth: 0, maxPointWidth: 36 },
      bar: { borderRadius: 4, borderWidth: 0, maxPointWidth: 20 },
    },
  };

  if (kind === "pie" || kind === "donut") {
    return {
      ...base,
      legend: { enabled: true, layout: "vertical", align: "right", verticalAlign: "middle", itemStyle: { ...text, textOverflow: "ellipsis", width: 110 }, symbolRadius: 2 },
      plotOptions: {
        ...base.plotOptions,
        pie: {
          innerSize: kind === "donut" ? "58%" : "0%",
          borderColor: colors.surface,
          borderWidth: 2,
          showInLegend: true,
          center: ["40%", "50%"],
          dataLabels: { enabled: input.showValues, distance: 8, style: text, formatter: function () { return format(this.y); } },
        },
      },
      series: [{
        type: "pie",
        name: input.title,
        data: result.groups.map((group, index): PointOptionsObject => ({ name: labels[index], y: group.value ?? 0, color: colorFor(group.key, input, field, index) })),
      }],
    };
  }

  const horizontal = kind === "bars";
  const xAxis: XAxisOptions = {
    categories: labels,
    lineColor: colors.grid,
    tickLength: 0,
    // Labels stay level; on a long time axis only every few are written.
    labels: { autoRotation: [0], step: horizontal ? 1 : Math.max(1, Math.ceil(labels.length / 8)), style: { ...muted, textOverflow: "ellipsis", ...(horizontal ? { width: 104 } : {}) } },
  };
  const plotLines = input.alert
    ? [input.alert.above, input.alert.below].filter((limit): limit is number => limit !== undefined).map((value): YAxisPlotLinesOptions => ({ value, color: colors.rag.RED, dashStyle: "Dash", width: 1, zIndex: 3 }))
    : [];
  const yAxis: YAxisOptions = {
    title: { text: undefined },
    gridLineColor: colors.grid,
    allowDecimals: unit !== "count",
    labels: { style: muted, formatter: function () { return axisFormat(Number(this.value)); } },
    plotLines,
    ...(kind === "stacked" ? { stackLabels: { enabled: false } } : {}),
  };

  if (kind === "stacked") {
    return {
      ...base,
      chart: { ...base.chart, type: "column" },
      legend: { enabled: true, align: "center", verticalAlign: "top", itemStyle: text, symbolRadius: 2, margin: 4, padding: 2 },
      xAxis,
      yAxis,
      plotOptions: { ...base.plotOptions, column: { ...base.plotOptions?.column, stacking: "normal", dataLabels: { enabled: false } } },
      series: result.subKeys.map((key, index): SeriesOptionsType => ({
        type: "column",
        name: groupLabel(key, subField, null, locale),
        color: colorFor(key, input, subField, index),
        data: result.groups.map((group) => group.sub?.[index]?.value ?? 0),
      })),
    };
  }

  const line = kind === "line" || kind === "area";
  const type = line ? kind : horizontal ? "bar" : "column";
  return {
    ...base,
    chart: { ...base.chart, type },
    legend: { enabled: false },
    xAxis,
    yAxis,
    plotOptions: {
      ...base.plotOptions,
      area: { fillOpacity: 0.18, lineWidth: 2, marker: { radius: 3 } },
      line: { lineWidth: 2, marker: { radius: 3 } },
    },
    series: [{
      type,
      name: input.title,
      color: colors.series[0],
      data: result.groups.map((group, index): PointOptionsObject => ({
        y: group.value ?? 0,
        ...(line ? {} : { color: beyondAlert(group.value, input.alert) ? colors.rag.RED : colorFor(group.key, input, field, field?.format === "rag" || field?.kind === "boolean" ? index : 0) }),
      })),
    } as SeriesOptionsType],
  };
}
