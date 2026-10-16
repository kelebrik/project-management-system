import assert from "node:assert/strict";
import test from "node:test";
import type { AppChartColors } from "./appChartTheme";
import { jiraProcessMatrixOption, jiraProcessTimeOption, type JiraProcessText } from "./jiraProcessOptions";

const colors: AppChartColors = { text: "#111", muted: "#666", grid: "#ddd", surface: "#fff", brand: "#0f766e", danger: "#dc2626", warning: "#d97706", success: "#16a34a", series: ["#3b82f6", "#b", "#c"] };
const text: JiraProcessText = { median: "Median", p85: "p85", hours: (value) => `${value} h`, moves: "Moves", from: "From", to: "To", waitBefore: "Before", bottleneck: "Bottleneck", samples: "Samples" };
const stat = (status: string, samples: number, medianHours: number | null) => ({ status, samples, medianHours, p85Hours: medianHours === null ? null : medianHours * 2, totalHours: 10, share: 0.1, current: 0 });

test("the time chart shows statuses with finished stays, the bottleneck in red", () => {
  const options = jiraProcessTimeOption([stat("Open", 3, 4), stat("Review", 7, 48), stat("Done", 0, null)], "Review", colors, text, "Time")!;
  assert.deepEqual((options.xAxis as { categories: string[] }).categories, ["Open", "Review"]);
  const median = (options.series![0] as { data: Array<{ y: number; color: string }> }).data;
  assert.deepEqual(median.map((point) => [point.y, point.color]), [[4, "#3b82f6"], [48, "#dc2626"]]);
  assert.equal(options.exporting?.enabled, false);
  assert.equal(jiraProcessTimeOption([stat("Done", 0, null)], null, colors, text, "Time"), null);
});

test("the matrix puts the status left on rows and the one entered on columns", () => {
  const options = jiraProcessMatrixOption(["Open", "Review"], [{ from: "Open", to: "Review", count: 5, medianHoursBefore: 12 }, { from: "?", to: "Open", count: 1, medianHoursBefore: null }], colors, text, "Moves")!;
  const axis = (options.xAxis as { categories: string[] }).categories;
  assert.deepEqual(axis, ["Open", "Review", "?"]);
  const data = (options.series![0] as { data: Array<{ x: number; y: number; value: number }> }).data;
  assert.deepEqual(data.map((point) => [axis[point.y], axis[point.x], point.value]), [["Open", "Review", 5], ["?", "Open", 1]]);
  assert.equal(jiraProcessMatrixOption([], [], colors, text, "Moves"), null);
});
