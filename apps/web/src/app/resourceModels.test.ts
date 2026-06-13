import assert from "node:assert/strict";
import test from "node:test";

import type { WbsItem } from "./domainTypes";
import { createResourceDashboard } from "./resourceModels";

function wbsTask(overrides: Partial<WbsItem>): WbsItem {
  return {
    id: "task",
    parentId: null,
    code: "1",
    title: "Задача",
    type: "TASK",
    status: "IN_PROGRESS",
    owner: "Dev",
    startDate: "2026-06-15T00:00:00.000Z",
    dueDate: "2026-06-19T00:00:00.000Z",
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
    workDays: 5,
    calendarDays: 5,
    excelStartDate: null,
    excelEndDate: null,
    planWorkDays: null,
    planCalendarDays: null,
    calendarCode: "RU",
    templateColor: null,
    priority: null,
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

test("resource dashboard detects overload and unassigned work", () => {
  const dashboard = createResourceDashboard(
    [
      wbsTask({
        id: "api",
        code: "1.1",
        title: "Backend API",
        owner: "Alex Dev",
        workDays: 5,
      }),
      wbsTask({
        id: "frontend",
        code: "1.2",
        title: "Frontend",
        owner: "Alex Dev",
        workDays: 5,
      }),
      wbsTask({
        id: "unassigned",
        code: "1.3",
        title: "Интеграционное тестирование",
        owner: "",
        workDays: 3,
      }),
    ],
    new Date("2026-06-15T12:00:00.000Z"),
    ["api"],
  );

  const alex = dashboard.rows.find((row) => row.owner === "Alex Dev");

  assert.ok(alex);
  assert.equal(dashboard.summary.overloadedCount, 1);
  assert.ok(dashboard.summary.roleGapHours > 0);
  assert.ok(dashboard.unassignedRow);
  assert.ok(
    dashboard.conflicts.some((conflict) =>
      conflict.title.includes("перегруз"),
    ),
  );
  assert.ok(
    dashboard.conflicts.some((conflict) =>
      conflict.title.includes("Критический путь"),
    ),
  );
  assert.ok(dashboard.requests.some((request) => request.hours > 0));
});

test("resource dashboard excludes done and cancelled work from demand", () => {
  const dashboard = createResourceDashboard(
    [
      wbsTask({
        id: "done",
        code: "2.1",
        status: "DONE",
        owner: "QA",
        workDays: 10,
        progress: 100,
      }),
      wbsTask({
        id: "cancelled",
        code: "2.2",
        status: "CANCELLED",
        owner: "QA",
        workDays: 10,
      }),
    ],
    new Date("2026-06-15T12:00:00.000Z"),
  );

  const qa = dashboard.rows.find((row) => row.owner === "QA");

  assert.ok(qa);
  assert.equal(qa.total, 1);
  assert.equal(qa.remainingHours, 0);
  assert.equal(Math.max(...qa.cells.map((cell) => cell.demandHours)), 0);
  assert.equal(dashboard.summary.activeWorkCount, 0);
  assert.equal(dashboard.summary.roleGapHours, 0);
});

test("resource dashboard moves unfinished past work into the current week", () => {
  const dashboard = createResourceDashboard(
    [
      wbsTask({
        id: "late",
        code: "3.1",
        title: "Просроченная работа",
        owner: "PM",
        startDate: "2026-06-01T00:00:00.000Z",
        dueDate: "2026-06-05T00:00:00.000Z",
        workDays: 5,
      }),
    ],
    new Date("2026-06-15T12:00:00.000Z"),
  );

  const pm = dashboard.rows.find((row) => row.owner === "PM");

  assert.ok(pm);
  assert.equal(pm.overdue, 1);
  assert.equal(pm.cells[0]?.demandHours, 40);
  assert.ok(
    dashboard.conflicts.some((conflict) =>
      conflict.title.includes("просроченные"),
    ),
  );
});
