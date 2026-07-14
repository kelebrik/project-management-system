import assert from "node:assert/strict";
import test from "node:test";
import type { WbsItem } from "./domainTypes";
import { createProjectWorkProgress } from "./projectWorkProgress";

function item(overrides: Partial<WbsItem>): WbsItem {
  return {
    id: "item-1",
    parentId: null,
    code: "1.1",
    title: "Работа",
    type: "TASK",
    status: "NOT_STARTED",
    owner: "",
    startDate: null,
    dueDate: null,
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
    workDays: 0,
    calendarDays: 0,
    excelStartDate: null,
    excelEndDate: null,
    planWorkDays: 0,
    planCalendarDays: 0,
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

test("project work progress weights leaf items by working days", () => {
  const progress = createProjectWorkProgress([
    item({ id: "done", status: "DONE", workDays: 4 }),
    item({ id: "active", status: "IN_PROGRESS", workDays: 3 }),
    item({ id: "risk", status: "AT_RISK", workDays: 2 }),
    item({ id: "future", status: "NOT_STARTED", workDays: 1 }),
  ]);

  assert.deepEqual(progress, {
    completedDays: 4,
    inProgressDays: 5,
    notStartedDays: 1,
    totalDays: 10,
    completedPercent: 40,
    inProgressPercent: 50,
    notStartedPercent: 10,
  });
});

test("project work progress excludes hierarchy parents and cancelled work", () => {
  const progress = createProjectWorkProgress([
    item({ id: "phase", type: "PHASE", workDays: 20 }),
    item({ id: "done", parentId: "phase", status: "DONE", workDays: 6 }),
    item({ id: "active", parentId: "phase", status: "BLOCKED", workDays: 3 }),
    item({ id: "cancelled", status: "CANCELLED", workDays: 40 }),
  ]);

  assert.equal(progress.totalDays, 9);
  assert.equal(progress.completedDays, 6);
  assert.equal(progress.inProgressDays, 3);
  assert.equal(progress.notStartedDays, 0);
  assert.equal(
    progress.completedPercent +
      progress.inProgressPercent +
      progress.notStartedPercent,
    100,
  );
});

test("project work progress falls back to planned working days", () => {
  const progress = createProjectWorkProgress([
    item({ status: "NOT_STARTED", workDays: null, planWorkDays: 7 }),
  ]);

  assert.equal(progress.totalDays, 7);
  assert.equal(progress.notStartedPercent, 100);
});

test("project work progress distributes rounding remainder to total 100", () => {
  const progress = createProjectWorkProgress([
    item({ id: "done", status: "DONE", workDays: 1 }),
    item({ id: "active", status: "IN_PROGRESS", workDays: 1 }),
    item({ id: "future", status: "NOT_STARTED", workDays: 1 }),
  ]);

  assert.deepEqual(
    [
      progress.completedPercent,
      progress.inProgressPercent,
      progress.notStartedPercent,
    ],
    [34, 33, 33],
  );
});
