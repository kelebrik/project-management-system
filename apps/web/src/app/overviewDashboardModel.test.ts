import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectDetails } from "./domainTypes";
import { createOverviewDashboard } from "./overviewDashboardModel";

function baseProject(overrides: Partial<ProjectDetails> = {}) {
  return {
    issues: [],
    jiraWorkSections: [],
    raidItems: [],
    wbsItems: [],
    ...overrides,
  } as unknown as ProjectDetails;
}

test("overview risk tickets only come from the first Jira work section", () => {
  const project = baseProject({
    jiraWorkSections: [
      {
        id: "section-1",
        projectId: "project-1",
        sortOrder: 0,
        title: "Раздел 1",
        jql: "",
        createdAt: "2026-06-09T00:00:00.000Z",
        updatedAt: "2026-06-09T00:00:00.000Z",
        issues: [],
      },
    ],
    wbsItems: [
      {
        id: "task-1",
        parentId: null,
        code: "1",
        title: "Просроченная заблокированная задача",
        type: "TASK",
        status: "BLOCKED",
        owner: "PM",
        dueDate: "2026-01-01",
        baselineDueDate: "2025-12-01",
        closedAt: null,
        predecessor1: null,
        predecessor2: null,
        predecessor3: null,
        predecessor4: null,
        predecessor5: null,
        predecessor6: null,
      },
    ],
  });

  const dashboard = createOverviewDashboard(project, []);

  assert.equal(dashboard.blockingTickets.length, 0);
});

test("overview risk tickets use synced issues from the first Jira work section", () => {
  const project = baseProject({
    jiraWorkSections: [
      {
        id: "section-1",
        projectId: "project-1",
        sortOrder: 0,
        title: "Тикеты под риском",
        jql: "project = PMS",
        createdAt: "2026-06-09T00:00:00.000Z",
        updatedAt: "2026-06-09T00:00:00.000Z",
        issues: [
          {
            sectionId: "section-1",
            snapshotId: "snapshot-1",
            syncedAt: "2026-06-09T10:00:00.000Z",
            snapshot: {
              id: "snapshot-1",
              projectId: "project-1",
              issueKey: "PMS-42",
              issueUrl: "https://jira.example/browse/PMS-42",
              summary: "Critical Jira issue",
              status: "In Progress",
              priority: "High",
              assignee: "Owner",
              issueType: "Bug",
              sprint: null,
              updatedAt: "2026-06-09T09:00:00.000Z",
              syncedAt: "2026-06-09T10:00:00.000Z",
            },
          },
        ],
      },
    ],
  });

  const dashboard = createOverviewDashboard(project, []);

  assert.equal(dashboard.blockingTickets.length, 1);
  assert.equal(dashboard.blockingTickets[0]?.jiraTicketKey, "PMS-42");
});
