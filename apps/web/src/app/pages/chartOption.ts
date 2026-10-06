import { PAGE_OTHER_KEY, type PageChartKind, type PageFieldDef, type PageFieldFormat, type PageQueryResult } from "@pms/shared";
import { beyondAlert, formatNumber, groupLabel, type Locale } from "./pageModel";

/**
 * The ECharts option of a chart widget, built from the server's groups. Pure
 * (no ECharts here), so the picture can be tested: which bars, in which order,
 * with which colours. RAG values always take the RAG colours.
 */

export type ChartColors = { series: string[]; text: string; muted: string; grid: string; surface: string; rag: Record<"GREEN" | "AMBER" | "RED", string> };

type Groups = Extract<PageQueryResult, { kind: "groups" }>;

export type ChartInput = {
  result: Groups;
  kind: PageChartKind;
  field: PageFieldDef | null;
  subField: PageFieldDef | null;
  unit: PageFieldFormat;
  showValues: boolean;
  colors: ChartColors;
  locale: Locale;
  title: string;
  /** Values past these limits are drawn red. */
  alert?: { above?: number; below?: number };
};

function colorFor(key: string | null, field: PageFieldDef | null, index: number, colors: ChartColors) {
  if (field?.format === "rag" && key && key in colors.rag) return colors.rag[key as keyof ChartColors["rag"]];
  if (key === null || key === PAGE_OTHER_KEY) return colors.muted;
  // Yes/no splits here are mostly bad news when yes (overdue, later, critical).
  if (field?.kind === "boolean") return key === "true" ? colors.rag.RED : colors.rag.GREEN;
  return colors.series[index % colors.series.length];
}

/** A sentence a screen reader says instead of the picture. */
export function chartSummary(input: Pick<ChartInput, "result" | "field" | "unit" | "locale" | "title">) {
  const parts = input.result.groups.slice(0, 12).map((group) => `${groupLabel(group.key, input.field, input.result.bucket, input.locale)}: ${formatNumber(group.value, input.unit, input.locale)}`);
  return `${input.title}. ${parts.join("; ")}${input.result.groups.length > 12 ? "…" : ""}`;
}

export function buildChartOption(input: ChartInput): Record<string, unknown> {
  const { result, kind, field, subField, colors, locale, unit } = input;
  const labels = result.groups.map((group) => groupLabel(group.key, field, result.bucket, locale));
  const values = result.groups.map((group) => group.value ?? 0);
  const format = (value: number) => formatNumber(value, unit, locale);
  const base = {
    animation: false,
    aria: { enabled: true, label: { description: chartSummary(input) } },
    textStyle: { color: colors.text, fontFamily: "inherit" },
    tooltip: { trigger: kind === "pie" || kind === "donut" ? "item" : "axis", valueFormatter: (value: number) => format(value), confine: true },
  };
  const valueLabel = { show: input.showValues, color: colors.text, fontSize: 11, formatter: (params: { value: number }) => format(Number(params.value)) };
  const axisLabel = { color: colors.muted, fontSize: 11, hideOverlap: true };
  const splitLine = { lineStyle: { color: colors.grid } };

  if (kind === "pie" || kind === "donut") {
    return {
      ...base,
      legend: { type: "scroll", orient: "vertical", right: 6, top: "middle", textStyle: { color: colors.text, fontSize: 11 }, itemWidth: 10, itemHeight: 10, tooltip: { show: true }, formatter: (name: string) => (name.length > 16 ? `${name.slice(0, 15)}…` : name) },
      series: [{
        type: "pie",
        radius: kind === "donut" ? ["48%", "78%"] : [0, "78%"],
        center: ["35%", "50%"],
        avoidLabelOverlap: true,
        label: { show: input.showValues, formatter: "{c}", color: colors.text, fontSize: 11 },
        labelLine: { show: input.showValues },
        itemStyle: { borderColor: colors.surface, borderWidth: 1 },
        data: result.groups.map((group, index) => ({ name: labels[index], value: group.value ?? 0, itemStyle: { color: colorFor(group.key, field, index, colors) } })),
      }],
    };
  }

  const horizontal = kind === "bars";
  const category = { type: "category", data: labels, axisLabel: { ...axisLabel, ...(horizontal ? { width: 104, overflow: "truncate", margin: 6 } : { interval: "auto" }) }, axisTick: { show: false }, axisLine: { lineStyle: { color: colors.grid } }, ...(horizontal ? { inverse: true } : {}) };
  const value = { type: "value", axisLabel: { ...axisLabel, formatter: (number: number) => formatNumber(number, unit === "days" ? "plain" : unit, locale) }, splitLine, minInterval: unit === "count" ? 1 : undefined };
  const grid = { left: horizontal ? 12 : 4, right: horizontal ? 28 : 8, top: kind === "stacked" ? 26 : 10, bottom: 4, containLabel: true };

  if (kind === "stacked") {
    return {
      ...base,
      grid,
      legend: { type: "scroll", top: 0, textStyle: { color: colors.text, fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
      xAxis: category,
      yAxis: value,
      series: result.subKeys.map((key, index) => ({
        type: "bar",
        stack: "total",
        name: groupLabel(key, subField, null, locale),
        itemStyle: { color: colorFor(key, subField, index, colors) },
        label: { ...valueLabel, show: false },
        data: result.groups.map((group) => group.sub?.[index]?.value ?? 0),
      })),
    };
  }

  const line = kind === "line" || kind === "area";
  return {
    ...base,
    grid,
    xAxis: horizontal ? value : category,
    yAxis: horizontal ? category : value,
    series: [{
      type: line ? "line" : "bar",
      data: line ? values : result.groups.map((group, index) => ({ value: group.value ?? 0, itemStyle: { color: beyondAlert(group.value, input.alert) ? colors.rag.RED : colorFor(group.key, field, field?.format === "rag" ? index : 0, colors) } })),
      barMaxWidth: 36,
      label: { ...valueLabel, position: horizontal ? "right" : "top" },
      ...(line ? { smooth: false, symbolSize: 5, lineStyle: { width: 2, color: colors.series[0] }, itemStyle: { color: colors.series[0] }, ...(kind === "area" ? { areaStyle: { color: colors.series[0], opacity: 0.18 } } : {}) } : {}),
      ...(line && input.alert ? { markLine: { silent: true, symbol: "none", lineStyle: { color: colors.rag.RED, type: "dashed" }, label: { show: false }, data: [input.alert.above, input.alert.below].filter((limit) => limit !== undefined).map((limit) => ({ yAxis: limit })) } } : {}),
    }],
  };
}
