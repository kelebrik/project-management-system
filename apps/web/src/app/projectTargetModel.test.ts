import assert from "node:assert/strict";
import test from "node:test";

import { isoDate } from "./dateUtils";
import type { ProjectDetails, WbsItem } from "./domainTypes";
import { createProjectTargetSummary, findActiveProjectGoal } from "./projectTargetModel";

function wbsGoal(overrides: Partial<WbsItem>): WbsItem {
  return {
    id: "goal",
    parentId: null,
    code: "1",
    title: "Цель",
    type: "GOAL",
    status: "NOT_STARTED",
    owner: "PM",
    startDate: "2026-01-01T00:00:00.000Z",
    dueDate: "2026-01-01T00:00:00.000Z",
    baselineStartDate: "2026-01-01T00:00:00.000Z",
    baselineDueDate: "2026-01-01T00:00:00.000Z",
    forecastStartDate: "2026-01-01T00:00:00.000Z",
    forecastDueDate: "2026-01-01T00:00:00.000Z",
    wbsLevel: 1,
    predecessor1: null,
    predecessor2: null,
    predecessor3: null,
    predecessor4: null,
    predecessor5: null,
    predecessor6: null,
    leadLagDays: 0,
    workDays: 0,
    calendarDays: 1,
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
    sortOrder: 10,
    ...overrides,
  };
}

function baseProject(wbsItems: WbsItem[]): ProjectDetails {
  return {
    targetDate: "2026-09-03T00:00:00.000Z",
    initialTargetDate: "2026-09-03T00:00:00.000Z",
    targetDateChanges: [],
    wbsItems,
  } as unknown as ProjectDetails;
}

test("active project goal uses the first unfinished WBS goal", () => {
  const factoryRelease = wbsGoal({
    id: "factory-release",
    code: "2",
    title: "Релиз заводской прошивки",
    dueDate: "2026-07-01T00:00:00.000Z",
    baselineDueDate: "2026-06-29T00:00:00.000Z",
    forecastDueDate: "2026-07-03T00:00:00.000Z",
    sortOrder: 20,
  });
  const otaRelease = wbsGoal({
    id: "ota-release",
    code: "3",
    title: "Релиз первого OTA-обновления",
    dueDate: "2026-08-10T00:00:00.000Z",
    sortOrder: 30,
  });

  assert.equal(findActiveProjectGoal([factoryRelease, otaRelease])?.id, "factory-release");

  const summary = createProjectTargetSummary(
    baseProject([factoryRelease, otaRelease]),
  );

  assert.equal(summary?.activeGoal?.title, "Релиз заводской прошивки");
  assert.equal(
    summary?.activeGoal?.targetDate ? isoDate(summary.activeGoal.targetDate) : null,
    "2026-06-29",
  );
  assert.equal(
    summary?.activeGoal?.currentTargetDate
      ? isoDate(summary.activeGoal.currentTargetDate)
      : null,
    "2026-07-01",
  );
  assert.equal(
    summary?.initialTargetDate ? isoDate(summary.initialTargetDate) : null,
    "2026-09-03",
  );
  assert.equal(
    summary?.currentTargetDate ? isoDate(summary.currentTargetDate) : null,
    "2026-09-03",
  );
  assert.equal(
    summary?.forecastFinishDate ? isoDate(summary.forecastFinishDate) : null,
    "2026-07-03",
  );
  assert.equal(summary?.targetChangeDays, 0);
  assert.equal(summary?.effectiveDelayDays, 2);
  assert.equal(summary?.totalVarianceDays, -62);
});

test("project target change only appears after an explicit target date history entry", () => {
  const factoryRelease = wbsGoal({
    id: "factory-release",
    code: "2",
    title: "Релиз заводской прошивки",
    dueDate: "2026-07-01T00:00:00.000Z",
    baselineDueDate: "2026-06-29T00:00:00.000Z",
    forecastDueDate: "2026-07-03T00:00:00.000Z",
    sortOrder: 20,
  });
  const project = {
    ...baseProject([factoryRelease]),
    targetDate: "2026-07-01T00:00:00.000Z",
    targetDateChanges: [
      {
        id: "change-1",
        projectId: "project-1",
        previousDate: "2026-06-29T00:00:00.000Z",
        newDate: "2026-07-01T00:00:00.000Z",
        reason: "Согласованный перенос",
        approvedBy: "PMO",
        createdAt: "2026-06-10T00:00:00.000Z",
        createdById: null,
        createdBy: null,
      },
    ],
  } as unknown as ProjectDetails;

  const summary = createProjectTargetSummary(project);

  assert.equal(
    summary?.initialTargetDate ? isoDate(summary.initialTargetDate) : null,
    "2026-06-29",
  );
  assert.equal(
    summary?.currentTargetDate ? isoDate(summary.currentTargetDate) : null,
    "2026-07-01",
  );
  assert.equal(summary?.targetChangeDays, 2);
  assert.equal(summary?.effectiveDelayDays, 2);
});

test("active project goal switches to the next WBS goal after completion", () => {
  const completedFactoryRelease = wbsGoal({
    id: "factory-release",
    code: "2",
    title: "Релиз заводской прошивки",
    status: "DONE",
    dueDate: "2026-07-01T00:00:00.000Z",
    sortOrder: 20,
  });
  const otaRelease = wbsGoal({
    id: "ota-release",
    code: "3",
    title: "Релиз первого OTA-обновления",
    dueDate: "2026-08-10T00:00:00.000Z",
    baselineDueDate: null,
    forecastDueDate: "2026-08-10T00:00:00.000Z",
    sortOrder: 30,
  });

  const summary = createProjectTargetSummary(
    baseProject([completedFactoryRelease, otaRelease]),
  );

  assert.equal(summary?.activeGoal?.id, "ota-release");
  assert.equal(
    summary?.activeGoal?.targetDate ? isoDate(summary.activeGoal.targetDate) : null,
    "2026-08-10",
  );
  assert.equal(summary?.activeGoal?.baselineTargetDate, null);
  assert.equal(
    summary?.activeGoal?.currentTargetDate
      ? isoDate(summary.activeGoal.currentTargetDate)
      : null,
    "2026-08-10",
  );
  assert.equal(
    summary?.currentTargetDate ? isoDate(summary.currentTargetDate) : null,
    "2026-09-03",
  );
});
