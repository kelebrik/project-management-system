import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectDetails } from "./domainTypes";
import { createOverviewDashboard } from "./overviewDashboardModel";

function baseProject(overrides: Partial<ProjectDetails> = {}) {
  return {
    issues: [],
    jiraWorkSections: [],
    raidItems: [],
    wbsDependencies: [],
    criticalPath: null,
    wbsItems: [],
    ...overrides,
  } as unknown as ProjectDetails;
}

function wbsItem(
  overrides: Partial<ProjectDetails["wbsItems"][number]>,
): ProjectDetails["wbsItems"][number] {
  return {
    id: overrides.id ?? "item",
    parentId: null,
    code: overrides.code ?? "1",
    title: overrides.title ?? "Работа",
    type: "TASK",
    status: "NOT_STARTED",
    owner: "Owner",
    startDate: null,
    dueDate: null,
    baselineStartDate: null,
    baselineDueDate: null,
    forecastStartDate: null,
    forecastDueDate: null,
    wbsLevel: null,
    predecessor1: null,
    predecessor2: null,
    predecessor3: null,
    predecessor4: null,
    predecessor5: null,
    predecessor6: null,
    leadLagDays: 0,
    workDays: null,
    calendarDays: null,
    excelStartDate: null,
    excelEndDate: null,
    planWorkDays: null,
    planCalendarDays: null,
    calendarCode: "RU",
    templateColor: null,
    priority: null,
    effortPercent: 100,
    plannedCost: "0",
    forecastCost: "0",
    progress: 0,
    jiraTicketKey: null,
    jiraTicketUrl: null,
    description: null,
    closedAt: null,
    sortOrder: 0,
    ...overrides,
  };
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

test("overview schedule deltas only include delayed leaf work on the critical path", () => {
  const criticalTask = wbsItem({
    id: "critical",
    code: "2.1",
    title: "Критическая работа",
    baselineDueDate: "2026-05-01",
    dueDate: "2026-05-11",
  });
  const nonCriticalTask = wbsItem({
    id: "non-critical",
    code: "1.1",
    title: "Некритическая работа",
    status: "BLOCKED",
    baselineDueDate: "2026-05-01",
    dueDate: "2026-06-20",
  });
  const project = baseProject({
    wbsItems: [nonCriticalTask, criticalTask],
    criticalPath: {
      projectStartDate: null,
      projectFinishDate: null,
      criticalItemIds: [criticalTask.id],
      criticalDependencyIds: [],
      criticalItemCount: 1,
      nearCriticalItemCount: 0,
      warnings: [],
      items: [],
    },
  });

  const dashboard = createOverviewDashboard(project, []);

  assert.deepEqual(
    dashboard.scheduleDeltaItems.map(({ item, delay }) => [item.code, delay]),
    [["2.1", 10]],
  );
});

test("overview schedule deltas are not filtered by closed date", () => {
  const oldClosedCriticalTask = wbsItem({
    id: "old-closed",
    code: "3.5.1",
    title: "Старая закрытая критическая работа",
    status: "DONE",
    baselineDueDate: "2026-04-03",
    dueDate: "2026-05-07",
    closedAt: "2026-05-08",
  });
  const project = baseProject({
    wbsItems: [oldClosedCriticalTask],
    criticalPath: {
      projectStartDate: null,
      projectFinishDate: null,
      criticalItemIds: [oldClosedCriticalTask.id],
      criticalDependencyIds: [],
      criticalItemCount: 1,
      nearCriticalItemCount: 0,
      warnings: [],
      items: [],
    },
  });

  const dashboard = createOverviewDashboard(project, []);

  assert.deepEqual(
    dashboard.scheduleDeltaItems.map(({ item, delay }) => [item.code, delay]),
    [["3.5.1", 34]],
  );
});

test("overview schedule deltas rank incremental impact instead of duplicated downstream delay", () => {
  const first = wbsItem({
    id: "first",
    code: "1.1",
    title: "Первичная причина",
    baselineDueDate: "2026-05-01",
    dueDate: "2026-05-11",
  });
  const second = wbsItem({
    id: "second",
    code: "1.2",
    title: "Зависимая работа",
    baselineDueDate: "2026-05-12",
    dueDate: "2026-05-25",
    predecessor1: "1.1",
  });
  const project = baseProject({
    wbsItems: [first, second],
    criticalPath: {
      projectStartDate: null,
      projectFinishDate: null,
      criticalItemIds: [first.id, second.id],
      criticalDependencyIds: [],
      criticalItemCount: 2,
      nearCriticalItemCount: 0,
      warnings: [],
      items: [],
    },
  });

  const dashboard = createOverviewDashboard(project, []);

  assert.deepEqual(
    dashboard.scheduleDeltaItems.map(({ item, delay }) => [item.code, delay]),
    [
      ["1.1", 10],
      ["1.2", 3],
    ],
  );
});

test("overview schedule deltas explain the active goal forecast shift", () => {
  const delayedTask = wbsItem({
    id: "task",
    code: "3.1",
    title: "Задача для цели",
    baselineDueDate: "2026-05-01",
    forecastDueDate: "2026-06-11",
    dueDate: "2026-06-11",
  });
  const unrelatedDelayedTask = wbsItem({
    id: "unrelated",
    code: "4",
    title: "Нерелевантная задержка",
    baselineDueDate: "2026-05-01",
    forecastDueDate: "2026-07-01",
    dueDate: "2026-07-01",
  });
  const activeGoal = wbsItem({
    id: "goal",
    code: "5",
    title: "Ближайшая цель",
    type: "GOAL",
    predecessor1: "3.1",
    baselineDueDate: "2026-05-01",
    dueDate: "2026-05-01",
    forecastDueDate: "2026-06-11",
  });
  const project = baseProject({
    wbsItems: [delayedTask, unrelatedDelayedTask, activeGoal],
    criticalPath: {
      projectStartDate: null,
      projectFinishDate: null,
      criticalItemIds: [delayedTask.id, activeGoal.id],
      criticalDependencyIds: [],
      criticalItemCount: 2,
      nearCriticalItemCount: 0,
      warnings: [],
      items: [],
    },
  });

  const dashboard = createOverviewDashboard(project, []);

  assert.equal(dashboard.scheduleVarianceFromStructure, 41);
  assert.deepEqual(
    dashboard.scheduleDeltaItems.map(({ item, delay }) => [item.code, delay]),
    [["3.1", 41]],
  );
});

test("overview schedule deltas do not duplicate parent delay explained by a child", () => {
  const delayedPhase = wbsItem({
    id: "phase",
    code: "2",
    title: "Этап",
    type: "PHASE",
    baselineDueDate: "2026-05-01",
    dueDate: "2026-06-11",
  });
  const delayedTask = wbsItem({
    id: "task",
    parentId: delayedPhase.id,
    code: "2.1",
    title: "Работа этапа",
    baselineDueDate: "2026-05-01",
    forecastDueDate: "2026-06-11",
    dueDate: "2026-06-11",
  });
  const activeGoal = wbsItem({
    id: "goal",
    code: "3",
    title: "Цель",
    type: "GOAL",
    predecessor1: "2",
    baselineDueDate: "2026-05-01",
    dueDate: "2026-05-01",
    forecastDueDate: "2026-06-11",
  });
  const project = baseProject({
    wbsItems: [delayedPhase, delayedTask, activeGoal],
    criticalPath: {
      projectStartDate: null,
      projectFinishDate: null,
      criticalItemIds: [delayedPhase.id, delayedTask.id, activeGoal.id],
      criticalDependencyIds: [],
      criticalItemCount: 3,
      nearCriticalItemCount: 0,
      warnings: [],
      items: [],
    },
  });

  const dashboard = createOverviewDashboard(project, []);

  assert.deepEqual(
    dashboard.scheduleDeltaItems.map(({ item, delay }) => [item.code, delay]),
    [["2.1", 41]],
  );
});

test("overview separates schedule delay and acceleration impacts when net variance is zero", () => {
  const delayedTask = wbsItem({
    id: "delayed",
    code: "1.1",
    title: "Отстающая работа",
    baselineDueDate: "2026-05-01",
    forecastDueDate: "2026-05-11",
    dueDate: "2026-05-11",
  });
  const acceleratedTask = wbsItem({
    id: "accelerated",
    code: "1.2",
    title: "Опережающая работа",
    baselineDueDate: "2026-05-21",
    forecastDueDate: "2026-05-11",
    dueDate: "2026-05-11",
  });
  const activeGoal = wbsItem({
    id: "goal",
    code: "2",
    title: "Цель",
    type: "GOAL",
    predecessor1: "1.1",
    predecessor2: "1.2",
    baselineDueDate: "2026-05-30",
    forecastDueDate: "2026-05-30",
    dueDate: "2026-05-30",
  });
  const project = baseProject({
    wbsItems: [delayedTask, acceleratedTask, activeGoal],
    criticalPath: {
      projectStartDate: null,
      projectFinishDate: null,
      criticalItemIds: [delayedTask.id, acceleratedTask.id, activeGoal.id],
      criticalDependencyIds: [],
      criticalItemCount: 3,
      nearCriticalItemCount: 0,
      warnings: [],
      items: [],
    },
  });

  const dashboard = createOverviewDashboard(project, []);

  assert.equal(dashboard.scheduleVarianceFromStructure, 0);
  assert.deepEqual(
    dashboard.scheduleDelayItems.map(({ item, delay }) => [item.code, delay]),
    [["1.1", 10]],
  );
  assert.deepEqual(
    dashboard.scheduleAccelerationItems.map(({ item, acceleration }) => [
      item.code,
      acceleration,
    ]),
    [["1.2", 10]],
  );
});
