import assert from "node:assert/strict";
import test from "node:test";

import type { PortfolioGoalTimelineProjectRow, PortfolioRedRaidItem } from "../portfolioModels";
import type { AppChartColors } from "./appChartTheme";
import { PROGRESS_BOTTOM, PROGRESS_ROW, PROGRESS_TOP, drawableProgressProjects, portfolioDaysUntil, portfolioGoalsOption, portfolioProgressOption, portfolioRaidBubbleOption, type PortfolioChartText } from "./portfolioOptions";

const colors: AppChartColors = { text: "#111", muted: "#666", grid: "#ddd", surface: "#fff", brand: "#0f766e", danger: "#dc2626", warning: "#d97706", success: "#16a34a", series: ["#a", "#b", "#c"] };
const text: PortfolioChartText = {
  today: "Today", baseline: "Baseline", forecast: "Forecast", noBaseline: "no baseline", daysLater: (n) => `+${n} d`, daysEarlier: (n) => `-${n} d`, onTime: "on time",
  start: "Start", target: "Target", done: (p) => `${p}% done`, noWork: "no work", overdue: "Overdue", daysUntil: "Days until due", score: "Score", impact: (d) => `+${d} d`, owner: "Owner", dueDate: "Due",
  date: (d) => d.slice(0, 10), titles: { goals: "Goals", progress: "Progress", problems: "Problems", risks: "Risks" },
};
const today = "2026-10-08";
const series = (options: ReturnType<typeof portfolioGoalsOption>, index = 0) => (options!.series![index] as { data: Array<Record<string, unknown>> }).data;
const goal = (patch: Partial<PortfolioGoalTimelineProjectRow["items"][number]>) => ({ id: "g", projectId: "p1", projectCode: "TV", projectName: "TV", goalTitle: "Beta", status: "NOT_STARTED" as const, dueDate: "2026-11-11", baselineDueDate: "2026-11-01", delayDays: 10, offset: 0, ...patch });

test("portfolio goals: one row per goal named with its project, bands per project, slip known only with a baseline", () => {
  const picked: string[] = [];
  const rows: PortfolioGoalTimelineProjectRow[] = [
    { projectId: "p1", projectCode: "TV", projectName: "TV", portfolio: "", items: [goal({}), goal({ id: "g2", goalTitle: "Gamma", baselineDueDate: null, delayDays: null })] },
    { projectId: "p2", projectCode: "AU", projectName: "Audio", portfolio: "", items: [goal({ id: "g3", projectId: "p2", projectCode: "AU", goalTitle: "Alpha", delayDays: -3 })] },
  ];
  const options = portfolioGoalsOption({ rows, from: "2026-06-08", to: "2027-06-08", today, colors, text, onPick: (id) => picked.push(id) })!;
  assert.deepEqual((options.xAxis as { categories: string[] }).categories, ["<b>TV</b> · Beta", "<b>TV</b> · Gamma", "<b>AU</b> · Alpha"]);
  assert.deepEqual((options.xAxis as { plotBands: Array<{ from: number; to: number }> }).plotBands.map((band) => [band.from, band.to]), [[-0.5, 1.5], [1.5, 2.5]]);
  const [beta, gamma, alpha] = series(options);
  assert.equal(beta!.connectorColor, "#ef4444");
  assert.equal(alpha!.connectorColor, "#16a34a");
  // No baseline: no bar, no slip claimed, and so it is read out.
  assert.equal(gamma!.low, gamma!.high);
  assert.match((gamma!.accessibility as { description: string }).description, /no baseline/);
  const click = options.plotOptions!.series!.point!.events!.click as unknown as (this: { index: number }) => void;
  click.call({ index: 2 });
  assert.deepEqual(picked, ["p2"]);
  assert.equal(options.exporting?.fallbackToExportServer, false);
  assert.equal(portfolioGoalsOption({ rows: [], from: "2026-06-08", to: "2027-06-08", today, colors, text, onPick: () => undefined }), null);
});

test("portfolio progress: start to target with the share done filled in; a project without work has no fill", () => {
  const options = portfolioProgressOption({
    projects: [
      { id: "p1", code: "TV", name: "TV", rag: "GREEN", startDate: "2026-01-01", targetDate: "2026-12-31", completedPercent: 40 },
      { id: "p2", code: "AU", name: "Audio", rag: "RED", startDate: "2026-02-01", targetDate: "2026-10-31", completedPercent: null },
    ],
    today, colors, text, onPick: () => undefined,
  })!;
  const [tv, audio] = series(options);
  assert.deepEqual(tv!.partialFill, { amount: 0.4, fill: "#16a34a" });
  assert.equal("partialFill" in audio!, false);
  // A row of fixed height per project, so the passport fields beside it line up row for row.
  assert.equal(options.chart?.height, PROGRESS_TOP + 2 * PROGRESS_ROW + PROGRESS_BOTTOM);
  assert.deepEqual([options.chart?.marginTop, options.chart?.marginBottom], [PROGRESS_TOP, PROGRESS_BOTTOM]);
  // The passport list draws the same projects in the same order as the chart.
  assert.deepEqual(drawableProgressProjects([
    { id: "a", code: "A", name: "A", rag: "GREEN", startDate: "2026-05-01", targetDate: "2026-04-01", completedPercent: 0 },
    { id: "b", code: "B", name: "B", rag: "GREEN", startDate: "2026-01-01", targetDate: "2026-04-01", completedPercent: 0 },
  ]).map((project) => project.id), ["b"]);
});

const item = (patch: Partial<PortfolioRedRaidItem>): PortfolioRedRaidItem => ({ id: "r", type: "RISK", title: "Late parts", owner: "Anna", dueDate: "2026-10-01", riskScore: 20, scheduleImpactDays: 5, jiraTicketKey: null, jiraTicketUrl: null, status: "OPEN", projectId: "p1", projectName: "TV", ...patch }) as PortfolioRedRaidItem;

test("problems and risks: bubbles by days until due, score and impact; items without a due date are left to the list", () => {
  const picked: string[] = [];
  const options = portfolioRaidBubbleOption({
    projects: [
      { projectId: "p1", projectName: "TV", items: [item({}), item({ id: "r2", dueDate: null })] },
      { projectId: "p2", projectName: "Audio", items: [item({ id: "r3", dueDate: null })] },
    ],
    title: "Risks", today, colors, text, projectColor: (id) => (id === "p1" ? "#p1" : "#p2"), onPick: (entry) => picked.push(entry.id),
  })!;
  assert.equal(options.series!.length, 1, "a project with only undated items has no bubbles");
  assert.equal((options.series![0] as { color: string }).color, "#p1", "a project keeps its own colour");
  assert.deepEqual(series(options).map((point) => [point.x, point.y, point.z]), [[-7, 20, 5]]);
  assert.match((series(options)[0]!.accessibility as { description: string }).description, /TV: Late parts\. Score 20\. Due 2026-10-01\. \+5 d/);
  assert.equal(portfolioDaysUntil("2026-10-18", today), 10);
  assert.equal(portfolioRaidBubbleOption({ projects: [{ projectId: "p", projectName: "P", items: [item({ dueDate: null })] }], title: "Risks", today, colors, text, projectColor: () => "#p", onPick: () => undefined }), null);
});
