import assert from "node:assert/strict";
import test from "node:test";

import type { SeriesXrangeOptions, XrangePointOptionsObject } from "highcharts";
import type { AppChartColors } from "./appChartTheme";
import { buildGanttOption, type GanttLayerItem } from "./ganttChartOptions";
import { jiraFlowOption, jiraGroupsOption, jiraStackedOption } from "./jiraChartOptions";

const colors: AppChartColors = { text: "#111", muted: "#666", grid: "#ddd", surface: "#fff", brand: "#0f766e", danger: "#dc2626", warning: "#d97706", success: "#16a34a", series: ["#a", "#b", "#c"] };
const item = (patch: Partial<GanttLayerItem>): GanttLayerItem => ({
  id: "x", offset: 10, width: 5, milestone: false, goal: false, rangeLine: false, summary: false, critical: false, nearCritical: false, toneClass: "tone-g", baseline: null, forecast: null, ...patch,
});
const seriesOf = (options: ReturnType<typeof buildGanttOption>, name: string) => (options.series ?? []).find((series) => series.name === name) as SeriesXrangeOptions;
const seriesData = (options: ReturnType<typeof buildGanttOption>, name: string) => seriesOf(options, name).data as XrangePointOptionsObject[];
const layer = { rowHeight: 24, gridOffsets: [0, 50], subGridOffsets: [], todayOffset: 40, colors };

test("gantt: one row per item on the model's own scale, markers at their offset", () => {
  const options = buildGanttOption({
    ...layer, showBaseline: false, showForecast: false, showCritical: true,
    items: [
      item({ id: "task", critical: true }),
      item({ id: "phase", rangeLine: true, summary: true, offset: 0, width: 60 }),
      item({ id: "milestone", milestone: true, offset: 30, width: 0.8 }),
      item({ id: "goal", milestone: true, goal: true, offset: 70, width: 0.8 }),
      item({ id: "parent", summary: true, offset: 20, width: 30 }),
    ],
  });
  assert.equal(options.chart?.height, 5 * 24);
  assert.deepEqual([options.yAxis && "min" in options.yAxis ? options.yAxis.min : null, options.yAxis && "max" in options.yAxis ? options.yAxis.max : null], [-0.5, 4.5]);
  assert.deepEqual(options.xAxis && "min" in options.xAxis ? [options.xAxis.min, options.xAxis.max, options.xAxis.tickPositions] : null, [0, 100, [0, 50]]);
  assert.deepEqual(seriesData(options, "bars").map((point) => [point.x, point.x2, point.y, point.borderColor]), [[10, 15, 0, "#dc2626"]]);
  assert.deepEqual(seriesData(options, "summaries").map((point) => [point.x, point.x2, point.y]), [[20, 50, 4]]);
  assert.deepEqual(seriesData(options, "phases").map((point) => [point.x, point.x2, point.y]), [[0, 60, 1.27]]);
  assert.deepEqual(seriesData(options, "milestones").map((point) => [point.x, point.y]), [[30, 2]]);
  assert.deepEqual(seriesData(options, "goals").map((point) => point.y), [3]);
  // Series do not share a row between them, and short bars keep the Gantt's minimum widths.
  assert.equal(options.plotOptions?.xrange?.grouping, false);
  assert.deepEqual(["bars", "summaries", "phases"].map((name) => seriesOf(options, name).minPointLength), [6, 16, 42]);
  // Interaction stays with the Gantt's own rows on top.
  assert.equal(options.plotOptions?.series?.enableMouseTracking, false);
  assert.equal(options.credits?.enabled, true);
});

test("gantt: baseline, forecast and the critical edge only when switched on", () => {
  const items = [item({ critical: true, baseline: { offset: 5, width: 4 }, forecast: { offset: 12, width: 6, slipped: true } })];
  const off = buildGanttOption({ ...layer, items, showBaseline: false, showForecast: false, showCritical: false });
  assert.equal(seriesData(off, "baseline").length, 0);
  assert.equal(seriesData(off, "forecast").length, 0);
  assert.notEqual(seriesData(off, "bars")[0]?.borderColor, "#dc2626");
  const on = buildGanttOption({ ...layer, items, showBaseline: true, showForecast: true, showCritical: true });
  assert.deepEqual(seriesData(on, "baseline").map((point) => [point.x, point.x2, point.y]), [[5, 9, 0.42]]);
  assert.match(String(seriesData(on, "forecast")[0]?.color), /245, 158, 11/);
  assert.equal(on.xAxis && "plotLines" in on.xAxis ? on.xAxis.plotLines?.at(-1)?.value : null, 40);
});

test("jira: columns go in time order, bars keep their order, a click opens the group", () => {
  const picked: string[] = [];
  const groups = [{ key: "2026-10", label: "октябрь", value: 3 }, { key: "2026-08", label: "август", value: 1 }, { key: "2026-09", label: "сентябрь", value: 2 }];
  const columns = jiraGroupsOption({ kind: "columns", groups, title: "t", seriesName: "s", colors, format: String, onPick: (group) => picked.push(group.key) });
  assert.deepEqual((columns.xAxis as { categories: string[] }).categories, ["август", "сентябрь", "октябрь"]);
  const click = columns.plotOptions?.series?.point?.events?.click as unknown as (this: { index: number }) => void;
  click.call({ index: 1 });
  assert.deepEqual(picked, ["2026-09"]);
  const bars = jiraGroupsOption({ kind: "bars", groups, title: "t", seriesName: "s", colors, format: String, onPick: () => undefined });
  assert.deepEqual((bars.xAxis as { categories: string[] }).categories, ["октябрь", "август", "сентябрь"]);
  assert.equal(bars.chart?.type, "bar");
});

test("jira: stacked bars have one series per key and open the cell", () => {
  const picked: Array<[string, string | undefined]> = [];
  const groups = [{ key: "anna", label: "Anna", value: 3, breakdown: [{ key: "open", label: "Open", value: 2 }, { key: "done", label: "Done", value: 1 }] }];
  const keys = [{ key: "open", label: "Open" }, { key: "done", label: "Done" }, { key: "blocked", label: "Blocked" }];
  const options = jiraStackedOption({ groups, keys, title: "t", colors, format: String, onPick: (group, cell) => picked.push([group.key, cell?.key]) });
  assert.deepEqual(options.series?.map((series) => (series as { data: number[] }).data), [[2], [1], [0]]);
  const click = (options.series?.[1] as { point: { events: { click: (this: { index: number }) => void } } }).point.events.click;
  click.call({ index: 0 });
  assert.deepEqual(picked, [["anna", "done"]]);
  // The total is the group's own value, not the sum of its parts (an issue may sit in two parts).
  const multi = jiraStackedOption({ groups: [{ ...groups[0]!, value: 2 }], keys, title: "t", colors, format: String, onPick: () => undefined });
  const total = (multi.yAxis as { stackLabels: { formatter: (this: { x: number; total: number }) => string } }).stackLabels.formatter;
  assert.equal(total.call({ x: 0, total: 3 }), "2");
  assert.equal((multi.yAxis as { reversedStacks: boolean }).reversedStacks, false);
});

test("jira: the cumulative flow is stacked areas, other flows are lines", () => {
  const series = [{ key: "todo", label: "To do", color: "#1", values: [1, 2] }];
  const flow = jiraFlowOption({ title: "t", labels: ["a", "b"], series, stacked: true, colors, format: String });
  assert.equal(flow.series?.[0]?.type, "area");
  // Done stays at the bottom, and the legend names the latest value.
  assert.equal((flow.yAxis as { reversedStacks: boolean }).reversedStacks, false);
  const legend = flow.legend?.labelFormatter as unknown as (this: { index: number; name: string }) => string;
  assert.equal(legend.call({ index: 0, name: "To do" }), "To do: <b>2</b>");
  const lines = jiraFlowOption({ title: "t", labels: ["a", "b"], series, stacked: false, colors, format: String });
  assert.equal(lines.series?.[0]?.type, "line");
  assert.equal(lines.tooltip?.shared, true);
});
