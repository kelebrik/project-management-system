import assert from "node:assert/strict";
import test from "node:test";

import type { JiraSemanticAggregatePublic } from "@pms/shared";

import {
  findPublishedRiskAggregate,
  jiraRiskAggregateQuery,
  jiraRiskTicketsFromResult,
  type JiraRiskAggregateResult,
} from "./jiraRiskTickets";

test("risk section selects only the published critical risk aggregate", () => {
  const definitions = [
    {
      id: "issues",
      key: "issues",
      publishedVersion: 2,
      published: {},
    },
    {
      id: "risk-draft",
      key: "critical-blocker-risk",
      publishedVersion: null,
      published: null,
    },
    {
      id: "risk-published",
      key: "critical-blocker-risk",
      publishedVersion: 4,
      published: {},
    },
  ] as unknown as JiraSemanticAggregatePublic[];

  assert.equal(findPublishedRiskAggregate(definitions)?.id, "risk-published");
});

test("risk section queries the current aggregate revision without widget filters", () => {
  assert.deepEqual(jiraRiskAggregateQuery(4), {
    aggregateVersion: 4,
    selectedFields: [
      "issueKey",
      "summary",
      "status",
      "assignee",
      "priority",
    ],
    metric: "count",
    groupBy: "none",
    filters: [],
    filterLogic: "and",
    periodDays: null,
    dateField: null,
    assignee: "",
    sortBy: "durationHours",
    sortDirection: "desc",
    page: 1,
    pageSize: 100,
    asOf: null,
  });
});

test("risk section maps projected aggregate rows to Jira links", () => {
  const result = {
    totalRecords: 1,
    records: [
      {
        id: "risk-1",
        issueUrl: "https://jira.example/browse/CVTE-42",
        values: {
          issueKey: "CVTE-42",
          summary: "Critical defect",
          status: "In Progress",
          priority: "Critical",
          assignee: "Owner",
        },
      },
    ],
  } as unknown as JiraRiskAggregateResult;

  assert.deepEqual(jiraRiskTicketsFromResult(result), [
    {
      id: "risk-1",
      jiraTicketKey: "CVTE-42",
      jiraTicketUrl: "https://jira.example/browse/CVTE-42",
      title: "Critical defect",
      status: "In Progress",
      priority: "Critical",
      assignee: "Owner",
    },
  ]);
});
