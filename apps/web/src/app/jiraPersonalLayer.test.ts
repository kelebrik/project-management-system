import assert from "node:assert/strict";
import test from "node:test";
import { JIRA_EMPTY_PERSONAL_DASHBOARD, applyJiraPersonalDashboard, jiraPersonalDashboardSchema, type JiraSemanticWidget } from "@pms/shared";
import { addToLayer, hideInLayer, moveInLayer, removeFromLayer, showInLayer } from "./jiraPersonalLayer";

const widget = (id: string, placement: "active" | "retro" = "active") => ({ id, title: id, aggregateId: "a", aggregateVersion: 1, placement, selectedFields: ["issueKey"], filterLogic: "and", filters: [], dateField: null, asOf: null, metric: "count", groupBy: "none", sortBy: "default", sortDirection: "desc", visualization: "number", width: "half" }) as JiraSemanticWidget;
const shared = { version: 5, periodDays: 90, assignee: "", widgets: [widget("a"), widget("b"), widget("c"), widget("r", "retro")] };

test("a person hides shared widgets, adds their own and orders them, and new shared widgets come last", () => {
  let layer = hideInLayer(JIRA_EMPTY_PERSONAL_DASHBOARD, "b");
  layer = addToLayer(layer, widget("mine"));
  layer = moveInLayer(layer, ["a", "c", "my-mine"], "my-mine", -1);
  assert.deepEqual(applyJiraPersonalDashboard(shared, layer).widgets.map((entry) => entry.id), ["a", "my-mine", "c", "r"]);
  const later = { ...shared, widgets: [...shared.widgets, widget("d")] };
  assert.deepEqual(applyJiraPersonalDashboard(later, layer).widgets.map((entry) => entry.id), ["a", "my-mine", "c", "r", "d"]);
  layer = showInLayer(removeFromLayer(layer, "my-mine"), "b");
  // A shared widget shown again comes back near its own place.
  assert.deepEqual(applyJiraPersonalDashboard(shared, layer).widgets.map((entry) => entry.id), ["a", "c", "b", "r"]);
  assert.equal(jiraPersonalDashboardSchema.safeParse(layer).success, true);
});

test("a layer with repeated personal widgets is not accepted, and no layer leaves the dashboard as it is", () => {
  assert.equal(jiraPersonalDashboardSchema.safeParse({ version: 1, widgets: [widget("my-x"), widget("my-x")] }).success, false);
  assert.equal(jiraPersonalDashboardSchema.safeParse({ version: 1, widgets: [widget("shared-id")] }).success, false, "personal widgets keep the my- prefix");
  assert.equal(applyJiraPersonalDashboard(shared, null), shared);
});
