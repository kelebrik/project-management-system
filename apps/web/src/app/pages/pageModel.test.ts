import assert from "node:assert/strict";
import test from "node:test";
import { PAGE_QUESTIONS, PAGE_SOURCES, PAGE_TEMPLATES, pageFromTemplate, pageLayoutProblem, type PageQueryResult, type PageWidget } from "@pms/shared";
import { chartSummary } from "./chartOption";
import { pushHistory, redoHistory, startHistory, undoHistory } from "./pageHistory";
import { beyondAlert, changeFormat, duplicateWidget, fitRows, formatNumber, groupLabel, pageQueries, pageQueryFingerprint, placeNewWidget, sheetGeometry, trafficLevel, widgetPassport, widgetSource } from "./pageModel";
import { widgetTable } from "./pageExport";
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

test("charts: a summary for screen readers", () => {
  const rag = PAGE_SOURCES.projects.fields.find((field) => field.key === "rag")!;
  const result: Extract<PageQueryResult, { kind: "groups" }> = { kind: "groups", groups: [{ key: "RED", value: 2, count: 2 }, { key: "GREEN", value: 5, count: 5 }], subKeys: [], total: 7, rowCount: 7, multiValued: false, bucket: null, warnings: [] };
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

test("alerts, traffic lights and the Excel table of a widget", () => {
  assert.equal(beyondAlert(6, { above: 5 }), true);
  assert.equal(beyondAlert(5, { above: 5 }), false);
  assert.equal(beyondAlert(30, { below: 40 }), true);
  assert.equal(trafficLevel(3, undefined, true, "count"), "AMBER");
  assert.equal(trafficLevel(35, undefined, false, "percent"), "RED");
  assert.equal(trafficLevel(0, { amber: 1, red: 5 }, true, "count"), "GREEN");
  const table = portfolio.widgets.find((widget) => widget.id === "t-projects")!;
  const rows: PageQueryResult = { kind: "rows", columns: ["project", "rag", "overdueWork"], rows: [{ id: "a", projectId: "a", values: { project: "TV", rag: "RED", overdueWork: 4 } }], total: 1, truncated: false, warnings: [] };
  const sheet = widgetTable(table, rows, "ru")!;
  assert.deepEqual(sheet.headers, ["Проект", "Светофор", "Просрочено работ"]);
  assert.deepEqual(sheet.rows, [["TV", "Красный", "4"]]);
  assert.deepEqual([...sheet.numeric], [2]);
});

test("a source that is not one of ours, even an inherited name, reads as none", () => {
  for (const source of ["lessons", "constructor", "__proto__", "toString"]) {
    assert.equal(widgetSource({ data: { metric: "custom", source, filters: [] } }), null, source);
  }
});

test("Highcharts draws the same bars in the same order and colours, and keeps its credit", async () => {
  const { buildHighchartsOption } = await import("./highchartsOption");
  const rag = PAGE_SOURCES.projects.fields.find((field) => field.key === "rag")!;
  const result: Extract<PageQueryResult, { kind: "groups" }> = { kind: "groups", groups: [{ key: "RED", value: 2, count: 2 }, { key: "GREEN", value: 5, count: 5 }], subKeys: [], total: 7, rowCount: 7, multiValued: false, bucket: null, warnings: [] };
  const input = { result, kind: "bars" as const, field: rag, subField: null, unit: "count" as const, showValues: true, colors, locale: "ru" as const, title: "Светофор" };
  const bars = buildHighchartsOption(input) as { chart: { type: string }; xAxis: { categories: string[] }; series: Array<{ data: Array<{ y: number; color: string }> }>; credits: { enabled: boolean } };
  assert.equal(bars.chart.type, "bar");
  assert.deepEqual(bars.xAxis.categories, ["Красный", "Зелёный"]);
  assert.deepEqual(bars.series[0].data.map((point) => [point.y, point.color]), [[2, "#f00"], [5, "#0f0"]]);
  assert.equal(bars.credits.enabled, true);
  const donut = buildHighchartsOption({ ...input, kind: "donut" }) as { plotOptions: { pie: { innerSize: string } } };
  assert.equal(donut.plotOptions.pie.innerSize, "58%");
  const stacked = buildHighchartsOption({ ...input, kind: "stacked", result: { ...result, subKeys: ["a", "b"], groups: result.groups.map((group) => ({ ...group, sub: [{ key: "a", value: 1 }, { key: "b", value: 1 }] })) } }) as { series: unknown[] };
  assert.equal(stacked.series.length, 2);
});

test("show as: a roadmap reads milestones and goals only, all of them, and exports one line per goal", () => {
  const upcoming: PageWidget = { id: "w1", type: "timeline", x: 0, y: 0, w: 8, h: 5, title: "Вехи", data: { metric: "checkpoints.upcoming", filters: [], columns: ["project", "title", "forecastDate"] } };
  const roadmap = applyViz(upcoming, "roadmap")!;
  assert.equal(roadmap.type, "roadmap");
  assert.equal(vizOf(roadmap), "roadmap");
  // The next four weeks would empty the window: all milestones and goals are read.
  assert.equal(roadmap.data?.metric, "checkpoints.all");
  assert.deepEqual(roadmap.roadmap, { before: 4, after: 8 });
  assert.equal(pageQueries({ ...pageFromTemplate(PAGE_TEMPLATES[0], { mode: "all" }, "ru").document, widgets: [roadmap] })[0]?.widget.type, "roadmap");
  const work: PageWidget = { id: "w2", type: "list", x: 0, y: 0, w: 4, h: 4, title: "Работы", data: { metric: "work.overdue", filters: [] } };
  assert.equal(vizProblem(work, "roadmap"), "needsCheckpoints");
  assert.equal(applyViz(work, "roadmap"), null);
  const result: PageQueryResult = {
    kind: "roadmap",
    totalLanes: 2,
    items: 1,
    warnings: [],
    lanes: [
      { projectId: "TV", project: "TV", projectName: "Телевизор", href: "/TV/schedule", items: [{ id: "g", projectId: "TV", values: { title: "Старт продаж", type: "GOAL", plannedDate: "2026-11-01", forecastDate: "2026-11-05", slipDays: 4 } }] },
      { projectId: "AU", project: "AU", projectName: "Аудио", href: "/AU/schedule", items: [] },
    ],
  };
  const table = widgetTable(roadmap, result, "ru")!;
  assert.deepEqual(table.rows, [["TV", "Старт продаж", "Цель", "01.11.26", "05.11.26", "4"], ["AU", "", "", "", "", ""]]);
  const template = PAGE_TEMPLATES.find((entry) => entry.id === "portfolio-roadmap")!;
  assert.equal(pageLayoutProblem(pageFromTemplate(template, { mode: "all" }, "ru").document.widgets, 14), null);
  assert.ok(PAGE_QUESTIONS.some((question) => question.widget.type === "roadmap"));
});

test("every kind of widget and every display has its name in both languages", async () => {
  const { pagesMessages } = await import("../../i18n/messages/pages");
  const shared = await import("@pms/shared");
  const { PAGE_VIZ } = await import("./pageViz");
  const keys = [
    ...shared.pageWidgetTypes.map((type) => `ui.pages.palette.kind.${type}`),
    ...PAGE_VIZ.map((viz) => `ui.pages.viz.${viz}`),
    ...["needsTime", "needsTwo", "needsDates", "needsCheckpoints"].map((problem) => `ui.pages.viz.problem.${problem}`),
    ...shared.pageFilterOps.map((op) => `ui.pages.op.${op}`),
    ...shared.pageBuckets.map((bucket) => `ui.pages.bucket.${bucket}`),
    ...shared.pageTones.map((tone) => `ui.pages.tone.${tone}`),
    ...shared.pageMeasureFns.map((fn) => `ui.pages.expert.fn.${fn}`),
    ...shared.pageFormulaOps.map((op) => `ui.pages.expert.op.${op}`),
  ];
  const messages = pagesMessages as Record<string, { en: string; ru: string } | undefined>;
  assert.deepEqual(keys.filter((key) => !messages[key]?.en || !messages[key]?.ru), []);
});
