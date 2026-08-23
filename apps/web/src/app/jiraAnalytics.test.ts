import assert from "node:assert/strict";
import test from "node:test";

import {
  JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1,
  jiraAnalyticsDashboardV1Schema,
} from "@pms/shared";

import {
  createJiraAnalyticsFilter,
  createJiraAnalyticsWidget,
  formatJiraAnalyticsMetric,
  jiraAnalyticsFieldIsNumeric,
  jiraAnalyticsOperatorsFor,
} from "./jiraAnalytics";

test("shared default dashboard remains a strict v1 configuration", () => {
  assert.equal(jiraAnalyticsDashboardV1Schema.safeParse(JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1).success, true);
});

test("new inline widget has a schema-compatible shape", () => {
  const widget = createJiraAnalyticsWidget("transitions", "retro");
  const parsed = jiraAnalyticsDashboardV1Schema.safeParse({
    version: 1,
    periodDays: 90,
    assignee: "",
    widgets: [widget],
  });
  assert.equal(parsed.success, true);
  assert.equal(widget.metric, "p50Duration");
  assert.equal(widget.section, "retro");
});

test("new filter uses an opaque id and explicit value", () => {
  const filter = createJiraAnalyticsFilter("durationHours", "greaterThan", "24");
  assert.match(filter.id, /^filter-/);
  assert.deepEqual(
    { field: filter.field, operator: filter.operator, value: filter.value },
    { field: "durationHours", operator: "greaterThan", value: "24" },
  );
});

test("numeric fields expose only numeric operators", () => {
  assert.equal(jiraAnalyticsFieldIsNumeric("commitCount"), true);
  assert.deepEqual(jiraAnalyticsOperatorsFor("commitCount"), ["greaterThan", "atLeast", "equals"]);
  assert.equal(jiraAnalyticsFieldIsNumeric("status"), false);
});

test("duration formatting uses hours below one day and days above it", () => {
  assert.equal(formatJiraAnalyticsMetric("p85Duration", 12), "12 ч");
  assert.equal(formatJiraAnalyticsMetric("p85Duration", 48), "2 дн.");
});
