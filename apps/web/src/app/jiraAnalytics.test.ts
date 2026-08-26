import assert from "node:assert/strict";
import test from "node:test";

import {
  JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1,
  jiraAnalyticsDashboardV1Schema,
} from "@pms/shared";

import {
  JIRA_ANALYTICS_LIST_RESULT,
  createJiraAnalyticsFilter,
  formatJiraAnalyticsMetric,
  jiraAnalyticsFieldIsNumeric,
  jiraAnalyticsOperatorsFor,
  jiraAnalyticsPinnedRevisionUpdate,
  jiraAnalyticsWidgetResultMode,
  jiraAnalyticsWidgetResultPatch,
} from "./jiraAnalytics";

test("shared default dashboard remains a strict v1 configuration", () => {
  assert.equal(jiraAnalyticsDashboardV1Schema.safeParse(JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1).success, true);
});

test("only retro widgets offer an explicit update to the current aggregate revision", () => {
  assert.equal(jiraAnalyticsPinnedRevisionUpdate("retro", 3, 7), 7);
  assert.equal(jiraAnalyticsPinnedRevisionUpdate("retro", 7, 7), null);
  assert.equal(jiraAnalyticsPinnedRevisionUpdate("active", null, 7), null);
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

test("ticket list is an explicit result mode backed by count and table", () => {
  assert.equal(jiraAnalyticsWidgetResultMode({
    metric: "count",
    groupBy: "none",
    visualization: "table",
  }), JIRA_ANALYTICS_LIST_RESULT);
  assert.deepEqual(jiraAnalyticsWidgetResultPatch(JIRA_ANALYTICS_LIST_RESULT, {
    visualization: "number",
  }), {
    metric: "count",
    groupBy: "none",
    visualization: "table",
  });
});

test("legacy duration tables stay duration metrics until explicitly changed", () => {
  assert.equal(jiraAnalyticsWidgetResultMode({
    metric: "averageDuration",
    groupBy: "none",
    visualization: "table",
  }), "averageDuration");
  assert.deepEqual(jiraAnalyticsWidgetResultPatch("averageDuration", {
    visualization: "table",
  }), {
    metric: "averageDuration",
    visualization: "number",
  });
});

test("changing a scalar metric preserves an existing bar visualization", () => {
  assert.deepEqual(jiraAnalyticsWidgetResultPatch("averageDuration", {
    visualization: "bar",
  }), {
    metric: "averageDuration",
  });
});
