import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectListItem, RaidItem, WbsItem } from "./domainTypes";
import {
  createPortfolioBlockingProblemGroups,
  createPortfolioGoalTimeline,
  createPortfolioKeyRiskGroups,
  createPortfolioRedZoneProjectIds,
  createPortfolioSummary,
  visiblePortfolioBlockingProblemProjects,
  visiblePortfolioKeyRiskProjects,
} from "./portfolioModels";

function localDateKey(value: Date | null | undefined) {
  if (!value) return null;
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function wbsGoal(overrides: Partial<WbsItem>): WbsItem {
  return {
    id: "goal",
    parentId: null,
    code: "G",
    title: "Цель",
    type: "GOAL",
    status: "NOT_STARTED",
    owner: "",
    startDate: null,
    dueDate: "2026-09-03",
    baselineStartDate: null,
    baselineDueDate: null,
    forecastStartDate: null,
    forecastDueDate: null,
    wbsLevel: 1,
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
    effortPercent: 0,
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

function project(overrides: Partial<ProjectListItem>): ProjectListItem {
  return {
    id: "project",
    parentId: "parent",
    code: "P",
    name: "Project",
    portfolio: "",
    sponsor: "",
    projectManager: "",
    status: "ACTIVE",
    rag: "GREEN",
    startDate: "2026-01-01",
    initialTargetDate: "2026-09-03",
    targetDate: "2026-09-03",
    progress: 0,
    scheduleVariance: 0,
    budgetPlanned: "0",
    budgetForecast: "0",
    summary: "",
    sortOrder: 0,
    uiState: null,
    jiraIntegration: null,
    targetDateChanges: [],
    wbsItems: [],
    raidItems: [],
    currentUserAccessLevel: "ADMIN",
    _count: {
      tasks: 0,
      issues: 0,
      jiraSnapshots: 0,
    },
    ...overrides,
  };
}

function raidProblem(overrides: Partial<RaidItem>): RaidItem {
  return {
    id: "problem",
    type: "DEPENDENCY",
    title: "Блокирующая проблема",
    description: "",
    owner: "",
    status: "OPEN",
    probability: 5,
    impact: 4,
    riskScore: 20,
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
    escalationLevel: "",
    scheduleImpactDays: 0,
    budgetImpact: "0",
    statusUpdates: [],
    ...overrides,
  };
}

test("portfolio goal timeline uses active project goals only", () => {
  const timeline = createPortfolioGoalTimeline(
    [
      project({
        id: "parent",
        parentId: null,
        code: "ROOT",
        wbsItems: [
          wbsGoal({
            id: "parent-goal",
            dueDate: "2026-08-15",
          }),
        ],
      }),
      project({
        id: "child-a",
        code: "A",
        wbsItems: [
          wbsGoal({
            id: "goal-a",
            title: "Релиз заводской прошивки",
            dueDate: "2026-09-03",
            baselineDueDate: "2026-08-20",
          }),
          wbsGoal({ id: "cancelled-goal", status: "CANCELLED" }),
          wbsGoal({ id: "task-like", type: "TASK" }),
          wbsGoal({
            id: "out-of-window",
            dueDate: "2027-03-01",
          }),
        ],
      }),
      project({
        id: "closed-child",
        code: "CLOSED",
        status: "CLOSED",
        wbsItems: [wbsGoal({ id: "closed-goal" })],
      }),
      project({
        id: "child-b",
        code: "B",
        wbsItems: [
          wbsGoal({
            id: "goal-b",
            title: "OTA",
            dueDate: "2026-10-14",
          }),
        ],
      }),
    ],
    new Date(2026, 5, 10),
  );

  assert.equal(timeline.items.length, 3);
  assert.deepEqual(
    timeline.items.map((item) => item.id),
    ["parent-goal", "goal-a", "goal-b"],
  );
  assert.equal(timeline.items[1]?.projectCode, "A");
  assert.equal(timeline.items[1]?.baselineDueDate, "2026-08-20");
  assert.equal(timeline.items[1]?.delayDays, 14);
  assert.equal(localDateKey(timeline.startDate), "2026-02-10");
  assert.equal(localDateKey(timeline.endDate), "2027-02-10");
  assert.equal(Math.round(timeline.todayOffset), 33);
  assert.ok(timeline.monthTicks.length >= 12);
});

test("portfolio blocking problem groups use active red dependency problems by portfolio", () => {
  const groups = createPortfolioBlockingProblemGroups([
    project({
      id: "project-a",
      name: "Project A",
      portfolio: "TV",
      raidItems: [
        raidProblem({
          id: "red-problem",
          title: "Нет заводского образца",
          riskScore: 20,
          scheduleImpactDays: 12,
        }),
        raidProblem({ id: "yellow-problem", riskScore: 12 }),
        raidProblem({ id: "risk", type: "RISK", riskScore: 25 }),
        raidProblem({ id: "closed-problem", status: "CLOSED", riskScore: 25 }),
      ],
    }),
    project({
      id: "project-b",
      name: "Project B",
      portfolio: "Audio",
      raidItems: [],
    }),
  ]);

  assert.deepEqual(
    groups.map((group) => group.portfolio),
    ["Audio", "TV"],
  );
  assert.equal(groups[0]?.projects.length, 1);
  assert.equal(groups[0]?.projects[0]?.problems.length, 0);
  assert.equal(groups[1]?.projects.length, 1);
  assert.equal(groups[1]?.projects[0]?.problems.length, 1);
  assert.equal(groups[1]?.projects[0]?.problems[0]?.id, "red-problem");
  assert.equal(groups[1]?.projects[0]?.projectName, "Project A");
});

test("portfolio key risk groups use active red risks by portfolio", () => {
  const groups = createPortfolioKeyRiskGroups([
    project({
      id: "project-a",
      name: "Project A",
      portfolio: "TV",
      raidItems: [
        raidProblem({
          id: "red-risk",
          type: "RISK",
          title: "Не подтверждена компонентная база",
          riskScore: 20,
          scheduleImpactDays: 8,
        }),
        raidProblem({ id: "yellow-risk", type: "RISK", riskScore: 12 }),
        raidProblem({ id: "problem", type: "DEPENDENCY", riskScore: 25 }),
        raidProblem({
          id: "validated-risk",
          type: "RISK",
          status: "VALIDATED",
          riskScore: 25,
        }),
      ],
    }),
    project({
      id: "project-b",
      name: "Project B",
      portfolio: "Audio",
      raidItems: [],
    }),
  ]);

  assert.deepEqual(
    groups.map((group) => group.portfolio),
    ["Audio", "TV"],
  );
  assert.equal(groups[0]?.projects.length, 1);
  assert.equal(groups[0]?.projects[0]?.risks.length, 0);
  assert.equal(groups[1]?.projects.length, 1);
  assert.equal(groups[1]?.projects[0]?.risks.length, 1);
  assert.equal(groups[1]?.projects[0]?.risks[0]?.id, "red-risk");
  assert.equal(groups[1]?.projects[0]?.projectName, "Project A");
});

test("portfolio summary and visible red zone projects ignore empty projects", () => {
  const projects = [
    project({
      id: "project-a",
      name: "Project A",
      portfolio: "TV",
      wbsItems: [
        wbsGoal({
          id: "delayed-goal",
          dueDate: "2026-09-20",
          baselineDueDate: "2026-09-01",
        }),
      ],
      raidItems: [
        raidProblem({ id: "red-problem", riskScore: 20 }),
        raidProblem({ id: "red-risk", type: "RISK", riskScore: 16 }),
      ],
    }),
    project({
      id: "project-b",
      name: "Project B",
      portfolio: "Audio",
      raidItems: [],
    }),
    project({
      id: "closed-project",
      status: "CLOSED",
      raidItems: [raidProblem({ id: "closed-project-risk", type: "RISK", riskScore: 25 })],
    }),
  ];
  const goalTimeline = createPortfolioGoalTimeline(projects, new Date(2026, 5, 10));
  const problemProjects = visiblePortfolioBlockingProblemProjects(
    createPortfolioBlockingProblemGroups(projects),
  );
  const riskProjects = visiblePortfolioKeyRiskProjects(
    createPortfolioKeyRiskGroups(projects),
  );
  const redZoneProjectIds = createPortfolioRedZoneProjectIds(
    problemProjects,
    riskProjects,
  );

  assert.deepEqual(createPortfolioSummary(projects, goalTimeline), {
    projectCount: 2,
    redRiskCount: 1,
    blockerCount: 1,
    delayedGoalCount: 1,
  });
  assert.deepEqual(
    problemProjects.map((item) => item.projectId),
    ["project-a"],
  );
  assert.deepEqual(
    riskProjects.map((item) => item.projectId),
    ["project-a"],
  );
  assert.deepEqual([...redZoneProjectIds], ["project-a"]);
});
