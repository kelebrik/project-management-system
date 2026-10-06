import assert from "node:assert/strict";
import test from "node:test";
import { PAGE_QUESTIONS, PAGE_SOURCES, PAGE_TEMPLATES, pageFromTemplate, pageLayoutProblem, type PageQueryResult, type PageWidget } from "@pms/shared";
import { buildChartOption, chartSummary } from "./chartOption";
import { pushHistory, redoHistory, startHistory, undoHistory } from "./pageHistory";
import { changeFormat, duplicateWidget, fitRows, formatNumber, groupLabel, pageQueries, pageQueryFingerprint, placeNewWidget, sheetGeometry, widgetPassport } from "./pageModel";
import { applyViz, vizOf, vizProblem } from "./pageViz";

const portfolio = pageFromTemplate(PAGE_TEMPLATES[0], { mode: "all" }, "ru").document;
const blank = pageFromTemplate(PAGE_TEMPLATES.find((template) => template.id === "blank")!, { mode: "all" }, "en").document;
const colors = { series: ["#111", "#222"], text: "#000", muted: "#999", grid: "#eee", surface: "#fff", rag: { GREEN: "#0f0", AMBER: "#fa0", RED: "#f00" } as const };

test("the batch asks only data widgets, and moving one does not ask again", () => {
  const withText = placeNewWidget(blank, PAGE_QUESTIONS.find((question) => question.id === "q.design.callout")!.widget, "en")!;
  assert.equal(pageQueries(withText).length, 0);
  assert.equal(pageQueries(portfolio).length, 9);
  const moved = { ...portfolio, widgets: portfolio.widgets.map((widget) => (widget.id === "k-red" ? { ...widget, title: "Другое" } : widget)) };
  assert.equal(pageQueryFingerprint(moved), pageQueryFingerprint(portfolio));
  assert.notEqual(pageQueryFingerprint({ ...portfolio, periodDays: 30 }), pageQueryFingerprint(portfolio));
});

test("a new widget lands in a free spot, smaller if needed, and never on a full sheet", () => {
  const question = PAGE_QUESTIONS.find((entry) => entry.id === "q.projects.table")!;
  const placed = placeNewWidget(blank, question.widget, "en")!;
  const widget = placed.widgets[0];
  assert.deepEqual([widget.x, widget.y, widget.w, widget.h, widget.title], [0, 0, 8, 6, "Projects"]);
  assert.equal(placeNewWidget(portfolio, question.widget, "ru"), null);
  assert.equal(duplicateWidget(portfolio, "k-red"), null);
  const copy = duplicateWidget(placed, widget.id)!;
  assert.equal(copy.widgets.length, 2);
  assert.equal(pageLayoutProblem(copy.widgets, 14), null);
});

test("a smaller format lifts widgets up or refuses", () => {
  const sparse = { ...blank, widgets: [{ id: "a", type: "text", x: 0, y: 10, w: 4, h: 3, title: "" } as PageWidget] };
  assert.equal(changeFormat(sparse, "a4-landscape")!.widgets[0].y, 10);
  assert.equal(changeFormat(portfolio, "a4-portrait")!.format, "a4-portrait");
  const tall = { ...blank, format: "a4-portrait" as const, widgets: [{ id: "a", type: "text", x: 0, y: 0, w: 12, h: 20, title: "" } as PageWidget] };
  assert.equal(changeFormat(tall, "wide"), null);
});

test("labels of groups and numbers", () => {
  const reason = PAGE_SOURCES.shifts.fields.find((field) => field.key === "reasonCategory")!;
  const created = PAGE_SOURCES.shifts.fields.find((field) => field.key === "createdAt")!;
  assert.equal(groupLabel(null, reason, null, "ru"), "Причина не указана");
  assert.equal(groupLabel("SUPPLIER", reason, null, "en"), "Supplier");
  assert.equal(groupLabel("2026-10-05", created, "week", "ru"), "05.10");
  assert.equal(groupLabel("2026-10-01", created, "quarter", "en"), "Q4 2026");
  assert.equal(groupLabel("__other__", reason, null, "ru"), "Остальные");
  assert.equal(formatNumber(4, "days", "ru"), "+4 дн.");
  assert.equal(formatNumber(12.5, "percent", "en"), "12.5%");
  assert.equal(formatNumber(null, "count", "ru"), "—");
});

test("rows that fit, keeping a line for “N more”", () => {
  assert.deepEqual(fitRows(240, 24, 5), { shown: 5, more: 0 });
  assert.deepEqual(fitRows(240, 24, 42, 30), { shown: 9, more: 33 });
  assert.deepEqual(fitRows(10, 24, 3), { shown: 0, more: 3 });
});

test("looks: what each needs, and switching fills in what is missing", () => {
  const reasons = portfolio.widgets.find((widget) => widget.id === "c-reasons")!;
  assert.equal(vizOf(reasons), "donut");
  const asNumber = applyViz(reasons, "kpi")!;
  assert.equal(asNumber.type, "kpi");
  assert.equal(asNumber.data?.groupBy, null);
  const asLine = applyViz(asNumber, "line")!;
  assert.deepEqual([asLine.type, asLine.chart, asLine.data?.groupBy, asLine.data?.bucket], ["chart", "line", "createdAt", "week"]);
  const stacked = applyViz(asLine, "stacked")!;
  assert.ok(stacked.data?.groupBy2 && stacked.data.groupBy2 !== stacked.data.groupBy);
  const projects = portfolio.widgets.find((widget) => widget.id === "k-projects")!;
  assert.equal(vizProblem(projects, "line"), "needsTime");
  assert.equal(applyViz(projects, "line"), null);
  const tiles = applyViz(projects, "tiles")!;
  assert.equal(tiles.type, "status-grid");
  assert.ok(tiles.data?.columns?.includes("rag"));
});

test("undo and redo, with a run of small changes as one step", () => {
  let history = startHistory(1);
  history = pushHistory(history, 2);
  history = pushHistory(history, 3, "typing");
  history = pushHistory(history, 4, "typing");
  assert.deepEqual(history.past, [1, 2]);
  history = undoHistory(history);
  assert.equal(history.present, 2);
  history = redoHistory(history);
  assert.equal(history.present, 4);
  history = pushHistory(undoHistory(history), 5);
  assert.deepEqual([history.present, history.future.length], [5, 0]);
});

test("charts: bars in order with RAG colours, a summary for screen readers", () => {
  const rag = PAGE_SOURCES.projects.fields.find((field) => field.key === "rag")!;
  const result: Extract<PageQueryResult, { kind: "groups" }> = { kind: "groups", groups: [{ key: "RED", value: 2, count: 2 }, { key: "GREEN", value: 5, count: 5 }], subKeys: [], total: 7, rowCount: 7, multiValued: false, bucket: null, warnings: [] };
  const option = buildChartOption({ result, kind: "bars", field: rag, subField: null, unit: "count", showValues: true, colors, locale: "ru", title: "Светофор" }) as { yAxis: { data: string[] }; series: Array<{ data: Array<{ itemStyle: { color: string } }> }> };
  assert.deepEqual(option.yAxis.data, ["Красный", "Зелёный"]);
  assert.deepEqual(option.series[0].data.map((entry) => entry.itemStyle.color), ["#f00", "#0f0"]);
  assert.equal(chartSummary({ result, field: rag, unit: "count", locale: "ru", title: "Светофор" }), "Светофор. Красный: 2; Зелёный: 5");
});

test("the passport says what a widget counts and whether the period applies", () => {
  const shifts = portfolio.widgets.find((widget) => widget.id === "c-shifts")!;
  assert.match(widgetPassport(shifts, "ru", 90), /последние 90 дн\./);
  const projects = portfolio.widgets.find((widget) => widget.id === "k-projects")!;
  assert.match(widgetPassport(projects, "en", 90), /does not apply/);
});

test("the sheet geometry fills the sheet exactly", () => {
  const geometry = sheetGeometry("wide");
  const last = geometry.rect({ x: 11, y: 13, w: 1, h: 1 });
  assert.ok(Math.abs(last.left + last.width - (1280 - 24)) < 0.01);
  assert.ok(Math.abs(last.top + last.height - (720 - 24)) < 0.01);
});
