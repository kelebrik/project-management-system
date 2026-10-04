import assert from "node:assert/strict";
import test from "node:test";
import { JIRA_EMPTY_SLICE, decodeJiraSlice, encodeJiraSlice, jiraAnalyticsSliceSchema, jiraIssueMatchesSlice } from "@pms/shared";
import type { JiraAnalyticsIssueData } from "@pms/shared";

const issue = (overrides: Partial<JiraAnalyticsIssueData>): JiraAnalyticsIssueData =>
  ({ id: "1", issueKey: "TV-1", issueUrl: "", summary: "", status: "In Progress", priority: "Major", assignee: "Иванов", reporter: null, issueType: "Task", resolution: null, sprint: "S1", sprintCount: 1, labels: ["tv"], issueCreatedAt: null, criticalPriorityAt: null, resolutionAt: null, criticalSlaTracked: false, commitCount: 0, mergeRequestCount: 0, developmentDataAvailable: false, transitionHistoryComplete: true, updatedAt: "", statusTransitions: [], developmentActivities: [], attributes: null, ...overrides }) as JiraAnalyticsIssueData;

const withAttributes = issue({ attributes: { statusCategoryKey: "indeterminate", parentKey: null, epicKey: "TV-100", components: ["Плата", "ПО"], fixVersions: ["1.0"], storyPoints: 3, dueDate: null, assigneeLogin: null, custom: {} } });

test("within a field any value matches, across fields all must", () => {
  const slice = jiraAnalyticsSliceSchema.parse({ assignees: ["Иванов", "Петров"], components: ["ПО"], statusCategories: ["indeterminate"] });
  assert.equal(jiraIssueMatchesSlice(withAttributes, slice), true);
  assert.equal(jiraIssueMatchesSlice({ ...withAttributes, assignee: "Сидоров" }, slice), false);
  assert.equal(jiraIssueMatchesSlice(issue({}), slice), false, "no attributes: the component and category are not set");
  assert.equal(jiraIssueMatchesSlice(issue({}), JIRA_EMPTY_SLICE), true);
});

test("an empty value picks issues without one", () => {
  const slice = jiraAnalyticsSliceSchema.parse({ assignees: [""], epics: [""] });
  assert.equal(jiraIssueMatchesSlice(issue({ assignee: null }), slice), true);
  assert.equal(jiraIssueMatchesSlice(issue({ assignee: null, attributes: withAttributes.attributes }), slice), false, "it has an epic");
});

test("a slice survives a link, and a broken link gives nothing", () => {
  const slice = jiraAnalyticsSliceSchema.parse({ assignees: ["Иванов"], labels: ["релиз 1"] });
  assert.deepEqual(decodeJiraSlice(encodeJiraSlice(slice)), slice);
  assert.equal(decodeJiraSlice("not-json"), null);
  assert.equal(decodeJiraSlice(encodeJiraSlice(slice).slice(0, 5)), null);
});

test("a slice narrows what a widget counts", async () => {
  const { evaluateJiraAnalyticsAggregate } = await import("@pms/shared");
  const definition = { name: "Все", description: "", source: "issues", metric: "count", groupBy: "none", scope: "retro", filterLogic: "and", filters: [], periodMode: "NONE", periodDays: null, timeZone: "Europe/Moscow", sortOrder: 0 } as const;
  const options = { now: "2026-03-01T00:00:00.000Z", assignee: "", page: 1, pageSize: 100 };
  const issues = [withAttributes, { ...issue({ id: "2", issueKey: "TV-2", assignee: "Петров" }) }];
  assert.equal(evaluateJiraAnalyticsAggregate(definition, issues, options).value, 2);
  assert.equal(evaluateJiraAnalyticsAggregate(definition, issues, { ...options, slice: jiraAnalyticsSliceSchema.parse({ components: ["Плата"] }) }).value, 1);
});

test("a slice rejects unknown fields and too many values, and replaces the old assignee box", async () => {
  const { evaluateJiraAnalyticsAggregate } = await import("@pms/shared");
  assert.equal(jiraAnalyticsSliceSchema.safeParse({ owners: ["x"] }).success, false);
  assert.equal(jiraAnalyticsSliceSchema.safeParse({ labels: Array.from({ length: 101 }, (_, index) => `l${index}`) }).success, false);
  assert.equal(jiraAnalyticsSliceSchema.safeParse({ statusCategories: ["closed"] }).success, false);
  const definition = { name: "Все", description: "", source: "issues", metric: "count", groupBy: "none", scope: "retro", filterLogic: "and", filters: [], periodMode: "NONE", periodDays: null, timeZone: "Europe/Moscow", sortOrder: 0 } as const;
  const issues = [withAttributes, issue({ id: "2", issueKey: "TV-2", assignee: "Петров" })];
  const options = { now: "2026-03-01T00:00:00.000Z", assignee: "Петров", page: 1, pageSize: 100 };
  assert.equal(evaluateJiraAnalyticsAggregate(definition, issues, options).value, 1, "the box alone still filters");
  assert.equal(evaluateJiraAnalyticsAggregate(definition, issues, { ...options, slice: jiraAnalyticsSliceSchema.parse({ assignees: ["Иванов"] }) }).value, 1, "with a slice the box is ignored");
});
