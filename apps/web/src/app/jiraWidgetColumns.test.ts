import assert from "node:assert/strict";
import test from "node:test";

import type { JiraSemanticWidget } from "@pms/shared";

import {
  jiraWidgetColumnWidth,
  jiraWidgetTableWidth,
  jiraWidgetWithColumnWidth,
  jiraWidgetWithoutColumnWidth,
  jiraWidgetWithSelectedFields,
} from "./jiraWidgetColumns";

const widget = {
  id: "widget-1",
  title: "Тикеты",
  aggregateId: "aggregate-1",
  aggregateVersion: 1,
  placement: "active",
  selectedFields: ["issueKey", "summary"],
  filterLogic: "and",
  filters: [],
  dateField: null,
  asOf: null,
  metric: "count",
  groupBy: "none",
  sortBy: "default",
  sortDirection: "desc",
  visualization: "table",
  width: "full",
} satisfies JiraSemanticWidget;

test("widget columns use stable defaults and saved widths", () => {
  assert.equal(jiraWidgetColumnWidth(widget, "issueKey"), 110);
  assert.equal(jiraWidgetColumnWidth(widget, "summary"), 300);

  const changed = jiraWidgetWithColumnWidth(widget, "summary", 360);
  assert.equal(jiraWidgetColumnWidth(changed, "summary"), 360);
  assert.equal(jiraWidgetTableWidth(changed), 470);
  assert.equal(jiraWidgetColumnWidth({ ...widget, selectedFields: ["project"] }, "project"), 140);
});

test("widget column widths are clamped to the supported range", () => {
  assert.equal(jiraWidgetColumnWidth(jiraWidgetWithColumnWidth(widget, "issueKey", 20), "issueKey"), 60);
  assert.equal(jiraWidgetColumnWidth(jiraWidgetWithColumnWidth(widget, "issueKey", 900), "issueKey"), 600);
});

test("removing a selected field also removes its saved width", () => {
  const changed = jiraWidgetWithColumnWidth(jiraWidgetWithColumnWidth(widget, "issueKey", 150), "summary", 400);
  const reduced = jiraWidgetWithSelectedFields(changed, ["issueKey"]);

  assert.deepEqual(reduced.columnWidths, { issueKey: 150 });
  assert.equal("columnWidths" in jiraWidgetWithSelectedFields(widget, ["issueKey"]), false);
});

test("widget column width can be reset to its field default", () => {
  const changed = jiraWidgetWithColumnWidth(widget, "summary", 400);
  const reset = jiraWidgetWithoutColumnWidth(changed, "summary");

  assert.equal(jiraWidgetColumnWidth(reset, "summary"), 300);
  assert.equal("columnWidths" in reset, false);
});
