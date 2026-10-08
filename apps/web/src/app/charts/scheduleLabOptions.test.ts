import assert from "node:assert/strict";
import test from "node:test";

import type { WbsItem } from "../domainTypes";
import type { ShiftLadder, ShiftStep } from "../scheduleShifts";
import type { AppChartColors } from "./appChartTheme";
import { forecastDriftOption, goalsDumbbellOption, milestonesTimelineOption, phasesOption, shiftReasonsParetoOption, shiftsDrilldownOption, type LabText } from "./scheduleLabOptions";

const colors: AppChartColors = { text: "#111", muted: "#666", grid: "#ddd", surface: "#fff", brand: "#0f766e", danger: "#dc2626", warning: "#d97706", success: "#16a34a", series: ["#a", "#b", "#c"] };
const text: LabText = {
  today: "Today", baseline: "Baseline", forecast: "Forecast", noBaseline: "no baseline", daysLater: (n) => `+${n} d`, daysEarlier: (n) => `-${n} d`, onTime: "on time",
  progress: "Progress", phaseless: "No phase", status: (s) => s, type: (s) => s, reason: (c) => c, days: "Days", share: "Share", shiftsOf: (t) => `Moves of ${t}`, drift: "Drift", earlier: (n) => `${n} earlier`,
  titles: { goals: "Goals", phases: "Phases", timeline: "Timeline", reasons: "Reasons", moves: "Moves", drift: "Drift" }, date: (d) => d.slice(0, 10), dayMonth: (d) => d.slice(5, 10),
};
const item = (patch: Partial<WbsItem>): WbsItem => ({ id: "x", parentId: null, code: "1", title: "Item", type: "TASK", status: "NOT_STARTED", startDate: null, dueDate: null, baselineStartDate: null, baselineDueDate: null, forecastStartDate: null, forecastDueDate: null, progress: 0, ...patch }) as WbsItem;
const series = (options: ReturnType<typeof goalsDumbbellOption>, index = 0) => (options!.series![index] as { data: Array<Record<string, unknown>> }).data;
const today = "2026-10-08";

test("goals are dumbbells from baseline to forecast, red when later, written with the slip", () => {
  const items = [
    item({ id: "g1", type: "GOAL", title: "Beta", baselineDueDate: "2026-11-01", dueDate: "2026-11-11" }),
    item({ id: "g2", type: "GOAL", title: "Alpha", baselineDueDate: "2026-10-20", dueDate: "2026-10-15" }),
    item({ id: "g3", type: "GOAL", title: "Gone", status: "CANCELLED", dueDate: "2026-10-01" }),
  ];
  const options = goalsDumbbellOption({ items, today, colors, text })!;
  assert.deepEqual((options.xAxis as { categories: string[] }).categories, ["Alpha", "Beta"]);
  const [alpha, beta] = series(options);
  assert.equal(beta!.connectorColor, "#ef4444");
  assert.equal(alpha!.connectorColor, "#16a34a");
  assert.equal((beta!.accessibility as { description: string }).description, "Beta. Baseline 2026-11-01, Forecast 2026-11-11, +10 d");
  assert.equal(options.exporting?.enabled, true);
  assert.equal(options.exporting?.fallbackToExportServer, false, "export never goes to Highcharts' server");
  assert.equal(options.exporting?.filename, "Goals");
  assert.equal(goalsDumbbellOption({ items: [], today, colors, text }), null);
});

test("phases carry their progress as a partial fill and their milestones on their row", () => {
  const items = [
    item({ id: "p1", type: "PHASE", title: "Design", startDate: "2026-09-01", dueDate: "2026-10-31", progress: 40 }),
    item({ id: "w1", parentId: "p1", type: "WORK_PACKAGE" }),
    item({ id: "m1", parentId: "w1", type: "MILESTONE", title: "Review", dueDate: "2026-10-01", status: "DONE" }),
    item({ id: "g1", parentId: "p1", type: "GOAL", title: "Ready", dueDate: "2026-10-31" }),
  ];
  const options = phasesOption({ items, today, colors, text })!;
  assert.deepEqual((series(options)[0]!.partialFill as { amount: number }).amount, 0.4);
  assert.deepEqual(series(options, 1).map((point) => [point.name, point.y, point.color]), [["Review", 0, "#16a34a"]]);
  assert.deepEqual(series(options, 2).map((point) => point.name), ["Ready"]);
});

test("the timeline keeps milestones from two months back to four ahead, in date order", () => {
  const items = [
    item({ id: "a", type: "MILESTONE", title: "Late", dueDate: "2026-12-01" }),
    item({ id: "b", type: "MILESTONE", title: "Soon", dueDate: "2026-10-10" }),
    item({ id: "c", type: "MILESTONE", title: "Old", dueDate: "2026-01-01" }),
  ];
  assert.deepEqual(series(milestonesTimelineOption({ items, today, colors, text })).map((point) => point.name), ["Soon", "Late"]);
});

const step = (patch: Partial<ShiftStep>): ShiftStep => ({ id: "s", operationId: "o", at: "2026-09-01T10:00:00Z", previousDate: "2026-11-01", newDate: "2026-11-06", deltaDays: 5, trigger: "MANUAL_EDIT", sourceItemId: null, sourceCode: null, sourceTitle: null, sourceIssueId: null, sourceNote: null, actorName: null, reason: null, needsReason: false, ...patch });
const ladder = (patch: Partial<ShiftLadder>): ShiftLadder => ({ id: "l", code: "1", title: "Beta", type: "MILESTONE", isActiveGoal: false, baselineDate: "2026-11-01", currentDate: "2026-11-10", varianceDays: 9, unexplainedDays: 0, earlierSteps: null, reasonDays: {}, steps: [], ...patch });

test("reasons are ranked with their cumulative share; moves drill down into their steps", () => {
  const ladders = [
    ladder({ id: "a", title: "Beta", reasonDays: { SUPPLIER: 6, NONE: 2 }, steps: [step({ id: "1", deltaDays: 6, reason: { category: "SUPPLIER", text: null, raidItemId: null } }), step({ id: "2", deltaDays: 2 })] }),
    ladder({ id: "b", title: "Gamma", reasonDays: { CUSTOMER: 2 }, steps: [step({ id: "3", deltaDays: 2 }), step({ id: "4", deltaDays: -1 })] }),
  ];
  const pareto = shiftReasonsParetoOption(ladders, colors, text)!;
  assert.deepEqual((pareto.xAxis as { categories: string[] }).categories, ["SUPPLIER", "NONE", "CUSTOMER"]);
  assert.deepEqual((pareto.series![1] as { data: number[] }).data, [60, 80, 100]);
  const moves = shiftsDrilldownOption(ladders, colors, text)!;
  assert.deepEqual(series(moves).map((point) => [point.name, point.y, point.drilldown]), [["Beta", 8, "a"], ["Gamma", 2, "b"]]);
  // Totals count the whole history; older moves the journal folded show as one column.
  const folded = shiftsDrilldownOption([ladder({ id: "c", title: "Delta", reasonDays: { SUPPLIER: 40 }, earlierSteps: { count: 31, deltaDays: 30 }, steps: [step({ id: "5", deltaDays: 10 })] })], colors, text)!;
  assert.equal(series(folded)[0]!.y, 40);
  assert.deepEqual((folded.drilldown!.series as Array<{ data: Array<{ name: string; y: number }> }>)[0]!.data.map((point) => [point.name, point.y]), [["31 earlier", 30], ["09-01 · NONE", 10]]);
  const drilled = (moves.drilldown!.series as Array<{ id: string; data: Array<{ y: number; name: string }> }>).find((entry) => entry.id === "b")!;
  assert.deepEqual(drilled.data.map((point) => point.y), [2, -1]);
  assert.equal(shiftReasonsParetoOption([], colors, text), null);
});

test("the drift of a goal holds each date until the next move and up to today", () => {
  const goal = ladder({ id: "g", type: "GOAL", isActiveGoal: true, steps: [step({ id: "2", at: "2026-09-10T10:00:00Z", previousDate: "2026-11-06", newDate: "2026-11-10", deltaDays: 4 }), step({ id: "1" })] });
  const options = forecastDriftOption([goal], colors, text, today)!;
  const line = options.series![0] as { step: string; data: Array<{ x: number; y: number }> };
  assert.equal(line.step, "left");
  assert.equal(options.title?.text, "Beta", "the goal is named on the chart");
  assert.deepEqual(line.data.slice(1).map((point) => new Date(point.y).toISOString().slice(0, 10)), ["2026-11-06", "2026-11-10", "2026-11-10"]);
  assert.equal(new Date(line.data.at(-1)!.x).toISOString().slice(0, 10), today);
  // With no current goal, the goal that moved most — folded earlier moves included.
  const few = ladder({ id: "f", title: "Few", type: "GOAL", steps: [step({ id: "a" }), step({ id: "b" })] });
  const many = ladder({ id: "m", title: "Many", type: "GOAL", earlierSteps: { count: 40, deltaDays: 0 }, steps: [step({ id: "c" })] });
  assert.equal(forecastDriftOption([few, many], colors, text, today)!.title?.text, "Many");
  // Earlier moves that cancel out still show as a column.
  const zero = shiftsDrilldownOption([ladder({ id: "z", reasonDays: { SUPPLIER: 5 }, earlierSteps: { count: 3, deltaDays: 0 }, steps: [step({ id: "d" })] })], colors, text)!;
  assert.equal((zero.drilldown!.series as Array<{ data: Array<{ name: string }> }>)[0]!.data[0]!.name, "3 earlier");
});
