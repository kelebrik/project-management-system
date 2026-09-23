import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectDetails } from "./domainTypes";
import { isOverviewDecisionIssue } from "@pms/shared";
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

function raidItem(
  overrides: Partial<ProjectDetails["raidItems"][number]>,
): ProjectDetails["raidItems"][number] {
  return {
    id: overrides.id ?? "raid",
    type: "RISK",
    title: "Риск",
    description: "Описание риска",
    owner: "Owner",
    status: "OPEN",
    probability: 4,
    impact: 4,
    riskScore: 16,
    mitigationPlan: null,
    contingencyPlan: null,
    dueDate: null,
    residualRisk: 0,
    validationDate: null,
    linkedRiskId: null,
    dependencyType: null,
    predecessor: null,
    successor: null,
    supplier: null,
    jiraTicketKey: null,
    jiraTicketUrl: null,
    decisionRequired: false,
    escalationLevel: "Project",
    scheduleImpactDays: 0,
    budgetImpact: "0",
    statusUpdates: [],
    ...overrides,
  };
}

test("overview red zone includes high risks and problems", () => {
  const project = baseProject({
    raidItems: [
      raidItem({ id: "risk", type: "RISK", title: "Красный риск", riskScore: 16 }),
      raidItem({
        id: "problem",
        type: "DEPENDENCY",
        title: "Красная проблема",
        riskScore: 20,
      }),
      raidItem({
        id: "assumption",
        type: "ASSUMPTION",
        title: "Красное допущение",
        riskScore: 25,
      }),
      raidItem({
        id: "closed-risk",
        type: "RISK",
        status: "CLOSED",
        riskScore: 25,
      }),
      raidItem({
        id: "low-problem",
        type: "DEPENDENCY",
        title: "Желтая проблема",
        riskScore: 12,
      }),
    ],
  });

  const dashboard = createOverviewDashboard(project, []);

  assert.deepEqual(
    dashboard.redZoneRisks.map((item) => item.id),
    ["problem", "risk"],
  );
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

test("overview schedule delay items rank own delay impact within active goal branch", () => {
  const codebase = wbsItem({
    id: "codebase",
    code: "3.5.1",
    title: "Предоставление новой кодовой базы",
    status: "DONE",
    baselineDueDate: "2026-04-03",
    forecastDueDate: "2026-05-07",
    dueDate: "2026-05-07",
    sortOrder: 10,
  });
  const firstBuild = wbsItem({
    id: "first-build",
    code: "3.5.2",
    title: "Первая сборка StarOS",
    status: "DONE",
    baselineDueDate: "2026-04-10",
    forecastDueDate: "2026-05-15",
    dueDate: "2026-05-15",
    predecessor1: "3.5.1",
    sortOrder: 20,
  });
  const primaryRegression = wbsItem({
    id: "primary-regression",
    code: "3.5.4",
    title: "Первичные регрессионные тесты",
    status: "DONE",
    baselineDueDate: "2026-04-30",
    forecastDueDate: "2026-06-09",
    dueDate: "2026-06-09",
    predecessor1: "3.5.2",
    sortOrder: 30,
  });
  const ticketScope = wbsItem({
    id: "ticket-scope",
    code: "3.5.6",
    title: "Определение состава тикетов для MP",
    status: "DONE",
    baselineDueDate: "2026-05-08",
    forecastDueDate: "2026-06-17",
    dueDate: "2026-06-17",
    predecessor1: "3.5.4",
    sortOrder: 40,
  });
  const ambient = wbsItem({
    id: "ambient",
    code: "3.3.1.1",
    title: "Требования Ambient",
    status: "DONE",
    baselineDueDate: "2026-04-30",
    forecastDueDate: "2026-05-27",
    dueDate: "2026-05-27",
    sortOrder: 50,
  });
  const zigbee = wbsItem({
    id: "zigbee",
    code: "3.3.2.1",
    title: "Zigbee CVTE",
    status: "DONE",
    baselineDueDate: "2026-06-05",
    forecastDueDate: "2026-06-12",
    dueDate: "2026-06-12",
    sortOrder: 60,
  });
  const unrelatedLateWork = wbsItem({
    id: "unrelated-late-work",
    code: "4.1",
    title: "Нерелевантная будущая работа",
    baselineDueDate: "2026-05-01",
    forecastDueDate: "2026-07-01",
    dueDate: "2026-07-01",
    sortOrder: 80,
  });
  const activeGoal = wbsItem({
    id: "active-goal",
    code: "3.12",
    title: "Старт MP",
    type: "GOAL",
    baselineDueDate: "2026-09-04",
    forecastDueDate: "2026-09-03",
    dueDate: "2026-09-03",
    sortOrder: 70,
  });
  const project = baseProject({
    wbsItems: [
      codebase,
      firstBuild,
      primaryRegression,
      ticketScope,
      ambient,
      zigbee,
      activeGoal,
      unrelatedLateWork,
    ],
  });

  const dashboard = createOverviewDashboard(project, []);

  assert.deepEqual(
    dashboard.scheduleDelayItems.map(({ item, delay }) => [item.code, delay]),
    [
      ["3.5.1", 34],
      ["3.3.1.1", 27],
      ["3.3.2.1", 7],
    ],
  );
  assert.equal(
    dashboard.scheduleDelayItems.some(({ item }) => item.code === "3.5.6"),
    false,
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

test("overview schedule delay impact still shows raw delayed work when compensated", () => {
  const delayedSource = wbsItem({
    id: "delayed-source",
    code: "1.1",
    title: "Большое раннее отставание",
    baselineDueDate: "2026-05-01",
    forecastDueDate: "2026-05-21",
    dueDate: "2026-05-21",
  });
  const recoveredWork = wbsItem({
    id: "recovered-work",
    code: "1.2",
    title: "Частично восстановленная работа",
    baselineDueDate: "2026-05-10",
    forecastDueDate: "2026-05-21",
    dueDate: "2026-05-21",
    predecessor1: "1.1",
  });
  const acceleratedTask = wbsItem({
    id: "accelerated",
    code: "1.3",
    title: "Опережающая работа",
    baselineDueDate: "2026-06-10",
    forecastDueDate: "2026-05-20",
    dueDate: "2026-05-20",
  });
  const activeGoal = wbsItem({
    id: "goal",
    code: "2",
    title: "Цель",
    type: "GOAL",
    predecessor1: "1.2",
    predecessor2: "1.3",
    baselineDueDate: "2026-06-30",
    forecastDueDate: "2026-06-30",
    dueDate: "2026-06-30",
  });
  const project = baseProject({
    wbsItems: [delayedSource, recoveredWork, acceleratedTask, activeGoal],
    criticalPath: {
      projectStartDate: null,
      projectFinishDate: null,
      criticalItemIds: [
        delayedSource.id,
        recoveredWork.id,
        acceleratedTask.id,
        activeGoal.id,
      ],
      criticalDependencyIds: [],
      criticalItemCount: 4,
      nearCriticalItemCount: 0,
      warnings: [],
      items: [],
    },
  });

  const dashboard = createOverviewDashboard(project, []);

  assert.equal(dashboard.scheduleVarianceFromStructure, 0);
  assert.deepEqual(
    dashboard.scheduleDeltaItems.map(({ item, delay }) => [item.code, delay]),
    [["1.1", 20]],
  );
  assert.deepEqual(
    dashboard.scheduleDelayItems.map(({ item, delay }) => [item.code, delay]),
    [["1.1", 20]],
  );
  assert.deepEqual(
    dashboard.scheduleAccelerationItems.map(({ item, acceleration }) => [
      item.code,
      acceleration,
    ]),
    [["1.3", 21]],
  );
});

test("overview schedule delay impact includes active goal branch work before the goal", () => {
  const delayedWork = wbsItem({
    id: "delayed-work",
    code: "1.1",
    title: "Несвязанная отстающая работа до цели",
    baselineDueDate: "2026-05-01",
    forecastDueDate: "2026-05-16",
    dueDate: "2026-05-16",
    sortOrder: 10,
  });
  const acceleratedTask = wbsItem({
    id: "accelerated",
    code: "1.2",
    title: "Связанная опережающая работа",
    baselineDueDate: "2026-06-01",
    forecastDueDate: "2026-05-20",
    dueDate: "2026-05-20",
    sortOrder: 20,
  });
  const activeGoal = wbsItem({
    id: "goal",
    code: "1.3",
    title: "Цель",
    type: "GOAL",
    predecessor1: "1.2",
    baselineDueDate: "2026-06-30",
    forecastDueDate: "2026-06-30",
    dueDate: "2026-06-30",
    sortOrder: 30,
  });
  const futureDelayedWork = wbsItem({
    id: "future-delayed-work",
    code: "3.1",
    title: "Отставание после цели",
    baselineDueDate: "2026-05-01",
    forecastDueDate: "2026-07-01",
    dueDate: "2026-07-01",
    sortOrder: 40,
  });
  const project = baseProject({
    wbsItems: [delayedWork, acceleratedTask, activeGoal, futureDelayedWork],
    criticalPath: {
      projectStartDate: null,
      projectFinishDate: null,
      criticalItemIds: [acceleratedTask.id, activeGoal.id],
      criticalDependencyIds: [],
      criticalItemCount: 2,
      nearCriticalItemCount: 0,
      warnings: [],
      items: [],
    },
  });

  const dashboard = createOverviewDashboard(project, []);

  assert.equal(dashboard.scheduleVarianceFromStructure, 0);
  assert.deepEqual(
    dashboard.scheduleDelayItems.map(({ item, delay }) => [item.code, delay]),
    [["1.1", 15]],
  );
  assert.deepEqual(
    dashboard.scheduleAccelerationItems.map(({ item, acceleration }) => [
      item.code,
      acceleration,
    ]),
    [["1.2", 12]],
  );
});

function decisionIssue(
  overrides: Partial<ProjectDetails["issues"][number]>,
): ProjectDetails["issues"][number] {
  return {
    id: "issue",
    title: "Вопрос",
    status: "Open",
    severity: "HIGH",
    readiness: "AMBER",
    dueDate: null,
    ...overrides,
  } as unknown as ProjectDetails["issues"][number];
}

test("overview decisions cover critical questions off green and high ones in red", () => {
  const project = baseProject({
    issues: [
      decisionIssue({ id: "critical-red", severity: "CRITICAL", readiness: "RED" }),
      decisionIssue({ id: "critical-amber", severity: "CRITICAL", readiness: "AMBER" }),
      decisionIssue({ id: "critical-green", severity: "CRITICAL", readiness: "GREEN" }),
      decisionIssue({ id: "high-red", severity: "HIGH", readiness: "RED" }),
      decisionIssue({ id: "high-amber", severity: "HIGH", readiness: "AMBER" }),
      decisionIssue({ id: "high-green", severity: "HIGH", readiness: "GREEN" }),
      decisionIssue({ id: "medium-red", severity: "MEDIUM", readiness: "RED" }),
      decisionIssue({ id: "low-red", severity: "LOW", readiness: "RED" }),
      decisionIssue({ id: "critical-red-closed", severity: "CRITICAL", readiness: "RED", status: "Closed" }),
      decisionIssue({ id: "critical-red-resolved", severity: "CRITICAL", readiness: "RED", status: "Resolved" }),
    ],
  });

  const dashboard = createOverviewDashboard(project, []);

  assert.deepEqual(
    dashboard.openDecisionItems.map((item) => item.id),
    ["critical-red", "critical-amber", "high-red"],
  );
});

test("overview decisions are ordered by due date and capped at five", () => {
  const project = baseProject({
    issues: [
      decisionIssue({ id: "third", severity: "CRITICAL", readiness: "RED", dueDate: "2026-03-01" }),
      decisionIssue({ id: "first", severity: "CRITICAL", readiness: "RED", dueDate: "2026-01-01" }),
      decisionIssue({ id: "second", severity: "HIGH", readiness: "RED", dueDate: "2026-02-01" }),
      decisionIssue({ id: "fourth", severity: "CRITICAL", readiness: "AMBER", dueDate: "2026-04-01" }),
      decisionIssue({ id: "fifth", severity: "CRITICAL", readiness: "RED", dueDate: "2026-05-01" }),
      decisionIssue({ id: "sixth", severity: "CRITICAL", readiness: "RED", dueDate: "2026-06-01" }),
    ],
  });

  const dashboard = createOverviewDashboard(project, []);

  assert.deepEqual(
    dashboard.openDecisionItems.map((item) => item.id),
    ["first", "second", "third", "fourth", "fifth"],
  );
});

test("the overview decision rule is exhaustive over priority and readiness", () => {
  const expected: Record<string, string[]> = {
    CRITICAL: ["RED", "AMBER"],
    HIGH: ["RED"],
    MEDIUM: [],
    LOW: [],
  };
  for (const severity of ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const) {
    for (const readiness of ["RED", "AMBER", "GREEN"] as const) {
      assert.equal(
        isOverviewDecisionIssue({ severity, readiness }),
        expected[severity].includes(readiness),
        `${severity} + ${readiness}`,
      );
    }
  }
});
