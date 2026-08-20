import assert from "node:assert/strict";
import test from "node:test";

import type { JiraIssueSnapshot } from "./domainTypes";
import {
  JIRA_ANALYTICS_DEFAULT_TEMPLATE,
  JIRA_ANALYTICS_TEMPLATES,
  JIRA_CRITICAL_BUG_SLA_HOURS,
  evaluateJiraAnalyticsWidget,
  jiraAnalyticsCsv,
  normalizeJiraAnalyticsConfig,
} from "./jiraAnalytics";

function issue(patch: Partial<JiraIssueSnapshot> = {}): JiraIssueSnapshot {
  return {
    id: "snapshot-1",
    projectId: "project-1",
    jiraId: "101",
    issueKey: "TV-101",
    issueUrl: "https://jira.example/browse/TV-101",
    summary: "Implement analytics",
    status: "In Progress",
    priority: "High",
    assignee: "Ivan",
    reporter: "Petr",
    issueType: "Task",
    resolution: null,
    resolutionAt: null,
    sprint: null,
    issueCreatedAt: "2026-07-01T09:00:00Z",
    criticalPriorityAt: null,
    criticalSlaTracked: true,
    commitCount: 4,
    mergeRequestCount: 1,
    developmentUpdatedAt: "2026-07-09T12:00:00Z",
    developmentDataAvailable: true,
    developmentBaselineCaptured: true,
    transitionHistoryComplete: true,
    updatedAt: "2026-07-10T12:00:00Z",
    syncedAt: "2026-07-10T12:05:00Z",
    statusTransitions: [
      {
        id: "transition-1",
        snapshotId: "snapshot-1",
        transitionKey: "history-1:0",
        fromStatus: "Open",
        toStatus: "In Progress",
        transitionedAt: "2026-07-03T09:00:00Z",
        actor: "Ivan",
        createdAt: "2026-07-10T12:05:00Z",
      },
      {
        id: "transition-2",
        snapshotId: "snapshot-1",
        transitionKey: "history-2:0",
        fromStatus: "In Progress",
        toStatus: "Review",
        transitionedAt: "2026-07-05T09:00:00Z",
        actor: "Ivan",
        createdAt: "2026-07-10T12:05:00Z",
      },
    ],
    developmentActivities: [
      {
        id: "activity-1",
        snapshotId: "snapshot-1",
        activityKey: "activity-1",
        activityAt: "2026-07-09T12:00:00Z",
        commitCount: 4,
        mergeRequestCount: 1,
        sprintAtObservation: null,
        isBaseline: false,
        observedAt: "2026-07-10T12:05:00Z",
      },
    ],
    ...patch,
  };
}

function template(id: "unplanned" | "flow" | "critical-bugs-sla") {
  const selected = JIRA_ANALYTICS_TEMPLATES.find((item) => item.id === id);
  assert.ok(selected);
  return selected;
}

test("unplanned work is the default Jira analytics template", () => {
  assert.equal(JIRA_ANALYTICS_DEFAULT_TEMPLATE.id, "unplanned");
  assert.equal(JIRA_ANALYTICS_TEMPLATES[0]?.id, "unplanned");
});

test("transition widget calculates duration percentiles from Jira changelog", () => {
  const widget = template("flow").config.widgets[0];
  const result = evaluateJiraAnalyticsWidget(widget, [issue()], {
    periodDays: 30,
    now: new Date("2026-07-11T00:00:00Z"),
  });

  assert.equal(result.records.length, 2);
  assert.equal(result.value, 48);
  assert.equal(result.formattedValue, "2 дн.");
});

test("transition widget excludes incomplete Jira changelog", () => {
  const widget = template("flow").config.widgets[0];
  const result = evaluateJiraAnalyticsWidget(
    widget,
    [issue({ transitionHistoryComplete: false })],
    { periodDays: 30, now: new Date("2026-07-11T00:00:00Z") },
  );

  assert.equal(result.records.length, 0);
  assert.equal(result.value, 0);
});

test("transition count measures transitions rather than distinct tickets", () => {
  const widget = {
    ...template("flow").config.widgets[0],
    metric: "count" as const,
  };
  const result = evaluateJiraAnalyticsWidget(widget, [issue()], {
    periodDays: 30,
    now: new Date("2026-07-11T00:00:00Z"),
  });

  assert.equal(result.value, 2);
});

test("unplanned template finds only tickets with empty sprint and development", () => {
  const widget = template("unplanned").config.widgets[0];
  const result = evaluateJiraAnalyticsWidget(
    widget,
    [
      issue(),
      issue({ id: "snapshot-2", issueKey: "TV-102", sprint: "Sprint 10" }),
      issue({
        id: "snapshot-3",
        issueKey: "TV-103",
        commitCount: 0,
        mergeRequestCount: 0,
        developmentActivities: [],
      }),
    ],
    { periodDays: 30, now: new Date("2026-07-11T00:00:00Z") },
  );

  assert.equal(result.value, 1);
  assert.deepEqual(result.records.map((record) => record.issue.issueKey), ["TV-101"]);
});

test("unplanned commit metric uses current issue sprint and linked totals", () => {
  const widget = template("unplanned").config.widgets[1];
  const result = evaluateJiraAnalyticsWidget(widget, [issue()], {
    periodDays: 30,
    now: new Date("2026-07-11T00:00:00Z"),
  });

  assert.equal(result.value, 4);
  assert.equal(result.records[0].sprint, null);
});

test("development event metrics ignore the initial cumulative baseline", () => {
  const widget = {
    ...template("unplanned").config.widgets[1],
    source: "development" as const,
  };
  const baselineIssue = issue({
    developmentActivities: [
      {
        ...issue().developmentActivities[0],
        isBaseline: true,
      },
    ],
  });
  const result = evaluateJiraAnalyticsWidget(widget, [baselineIssue], {
    periodDays: 30,
    now: new Date("2026-07-11T00:00:00Z"),
  });

  assert.equal(result.value, 0);
  assert.equal(result.records.length, 0);
});

test("CSV export contains source Jira records", () => {
  const widget = template("unplanned").config.widgets[0];
  const result = evaluateJiraAnalyticsWidget(widget, [issue()], {
    periodDays: 30,
    now: new Date("2026-07-11T00:00:00Z"),
  });
  const csv = jiraAnalyticsCsv(result.records);

  assert.match(csv, /TV-101/);
  assert.match(csv, /https:\/\/jira\.example\/browse\/TV-101/);
  assert.match(csv, /"Commits"/);
});

test("critical bug SLA report includes unresolved tickets after 30 calendar days", () => {
  const widget = template("critical-bugs-sla").config.widgets[2];
  const result = evaluateJiraAnalyticsWidget(
    widget,
    [
      issue({
        issueType: "Bug",
        priority: "Critical",
        criticalPriorityAt: "2026-06-01T00:00:00Z",
      }),
    ],
    { periodDays: 30, now: new Date("2026-07-02T00:00:01Z") },
  );

  assert.equal(result.value, 1);
  assert.equal(result.records[0]?.durationHours, 31 * 24 + 1 / 3_600);
});

test("critical bug SLA report uses Resolution date and keeps downgraded violations", () => {
  const widget = template("critical-bugs-sla").config.widgets[2];
  const startedAt = "2026-06-01T00:00:00Z";
  const result = evaluateJiraAnalyticsWidget(
    widget,
    [
      issue({
        id: "late",
        issueKey: "TV-201",
        issueType: "Bug",
        priority: "Blocker",
        criticalPriorityAt: startedAt,
        resolution: "Fixed",
        resolutionAt: "2026-07-02T00:00:00Z",
      }),
      issue({
        id: "on-time",
        issueKey: "TV-202",
        issueType: "Bug",
        priority: "Critical",
        criticalPriorityAt: startedAt,
        resolution: "Fixed",
        resolutionAt: "2026-07-01T00:00:00Z",
      }),
      issue({
        id: "major",
        issueKey: "TV-203",
        issueType: "Bug",
        priority: "Major",
        criticalPriorityAt: startedAt,
      }),
    ],
    { periodDays: 30, now: new Date("2026-08-01T00:00:00Z") },
  );

  assert.equal(result.value, 2);
  assert.deepEqual(result.records.map((record) => record.issue.issueKey), ["TV-201", "TV-203"]);
  assert.equal(result.records[0]?.durationHours, 31 * 24);
  assert.equal(
    JIRA_CRITICAL_BUG_SLA_HOURS,
    720,
  );
});

test("critical bug SLA widget applies its configured threshold", () => {
  const baseWidget = template("critical-bugs-sla").config.widgets[2];
  const widget = {
    ...baseWidget,
    filters: baseWidget.filters.map((condition) => ({
      ...condition,
      value: "1",
    })),
  };
  const result = evaluateJiraAnalyticsWidget(
    widget,
    [
      issue({
        issueType: "Bug",
        priority: "Critical",
        criticalPriorityAt: "2026-08-01T08:00:00Z",
      }),
    ],
    { periodDays: 30, now: new Date("2026-08-01T10:00:00Z") },
  );

  assert.equal(result.value, 1);
  assert.equal(result.records[0]?.durationHours, 2);
});

test("critical bug SLA report excludes tickets without complete priority history", () => {
  const widget = template("critical-bugs-sla").config.widgets[2];
  const result = evaluateJiraAnalyticsWidget(
    widget,
    [
      issue({
        issueType: "Bug",
        priority: "Critical",
        criticalPriorityAt: "2026-06-01T00:00:00Z",
        transitionHistoryComplete: false,
      }),
    ],
    { periodDays: 30, now: new Date("2026-08-01T00:00:00Z") },
  );

  assert.equal(result.value, 0);
  assert.equal(result.records.length, 0);
});

test("critical bug SLA report excludes stale snapshots outside the dedicated query", () => {
  const widget = template("critical-bugs-sla").config.widgets[2];
  const result = evaluateJiraAnalyticsWidget(
    widget,
    [
      issue({
        issueType: "Bug",
        priority: "Blocker",
        criticalPriorityAt: "2026-06-01T00:00:00Z",
        criticalSlaTracked: false,
      }),
    ],
    { periodDays: 30, now: new Date("2026-08-01T00:00:00Z") },
  );

  assert.equal(result.records.length, 0);
});

test("saved dashboard normalization drops malformed widget fields", () => {
  const config = normalizeJiraAnalyticsConfig({
    periodDays: 42,
    assignee: "Ivan",
    widgets: [
      {
        id: "valid",
        title: "Valid widget",
        source: "issues",
        metric: "count",
        visualization: "unknown",
        groupBy: "unknown",
        filters: [{ field: "missing", operator: "equals", value: "x" }],
      },
      { id: "broken" },
    ],
  });

  assert.equal(config.periodDays, 30);
  assert.equal(config.assignee, "Ivan");
  assert.equal(config.widgets.length, 1);
  assert.equal(config.widgets[0].visualization, "number");
  assert.equal(config.widgets[0].groupBy, "none");
  assert.deepEqual(config.widgets[0].filters, []);
});
