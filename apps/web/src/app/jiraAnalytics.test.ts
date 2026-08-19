import assert from "node:assert/strict";
import test from "node:test";

import type { JiraIssueSnapshot } from "./domainTypes";
import {
  JIRA_ANALYTICS_TEMPLATES,
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
    sprint: null,
    issueCreatedAt: "2026-07-01T09:00:00Z",
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

test("transition widget calculates duration percentiles from Jira changelog", () => {
  const widget = JIRA_ANALYTICS_TEMPLATES[0].config.widgets[0];
  const result = evaluateJiraAnalyticsWidget(widget, [issue()], {
    periodDays: 30,
    now: new Date("2026-07-11T00:00:00Z"),
  });

  assert.equal(result.records.length, 2);
  assert.equal(result.value, 48);
  assert.equal(result.formattedValue, "2 дн.");
});

test("transition widget excludes incomplete Jira changelog", () => {
  const widget = JIRA_ANALYTICS_TEMPLATES[0].config.widgets[0];
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
    ...JIRA_ANALYTICS_TEMPLATES[0].config.widgets[0],
    metric: "count" as const,
  };
  const result = evaluateJiraAnalyticsWidget(widget, [issue()], {
    periodDays: 30,
    now: new Date("2026-07-11T00:00:00Z"),
  });

  assert.equal(result.value, 2);
});

test("unplanned template finds only tickets with empty sprint and development", () => {
  const widget = JIRA_ANALYTICS_TEMPLATES[1].config.widgets[0];
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
  const widget = JIRA_ANALYTICS_TEMPLATES[1].config.widgets[1];
  const result = evaluateJiraAnalyticsWidget(widget, [issue()], {
    periodDays: 30,
    now: new Date("2026-07-11T00:00:00Z"),
  });

  assert.equal(result.value, 4);
  assert.equal(result.records[0].sprint, null);
});

test("development event metrics ignore the initial cumulative baseline", () => {
  const widget = {
    ...JIRA_ANALYTICS_TEMPLATES[1].config.widgets[1],
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
  const widget = JIRA_ANALYTICS_TEMPLATES[1].config.widgets[0];
  const result = evaluateJiraAnalyticsWidget(widget, [issue()], {
    periodDays: 30,
    now: new Date("2026-07-11T00:00:00Z"),
  });
  const csv = jiraAnalyticsCsv(result.records);

  assert.match(csv, /TV-101/);
  assert.match(csv, /https:\/\/jira\.example\/browse\/TV-101/);
  assert.match(csv, /"Commits"/);
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

  assert.equal(config.periodDays, 90);
  assert.equal(config.assignee, "Ivan");
  assert.equal(config.widgets.length, 1);
  assert.equal(config.widgets[0].visualization, "number");
  assert.equal(config.widgets[0].groupBy, "none");
  assert.deepEqual(config.widgets[0].filters, []);
});
