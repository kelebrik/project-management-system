import assert from "node:assert/strict";
import test from "node:test";

import type { WbsItem } from "./domainTypes";
import { createTranslator } from "../i18n/translate";
import { createResourceDashboard } from "./resourceModels";

const ru = createTranslator("ru");
const en = createTranslator("en");

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

test("resource dashboard does not treat WBS duration as full-time demand", () => {
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
        effortPercent: 50,
        workDays: 3,
      }),
    ],
    new Date("2026-06-15T12:00:00.000Z"),
    ["api"],
    [],
    ru,
  );

  const alex = dashboard.rows.find((row) => row.owner === "Alex Dev");

  assert.ok(alex);
  assert.equal(alex.cells[0]?.demandHours, 0);
  assert.equal(dashboard.summary.overloadedCount, 0);
  assert.equal(dashboard.summary.roleGapHours, dashboard.unassignedRow?.remainingHours);
  assert.ok(dashboard.unassignedRow);
  assert.ok(!dashboard.conflicts.some((conflict) => conflict.title.includes("перегруз")));
  assert.ok(dashboard.requests.some((request) => request.hours > 0));
});

test("resource dashboard uses WBS effort percent as capacity share", () => {
  const dashboard = createResourceDashboard(
    [
      wbsTask({
        id: "half",
        code: "1.1",
        title: "Интеграция",
        owner: "Alex Dev",
        effortPercent: 10,
        workDays: 5,
      }),
      wbsTask({
        id: "full",
        code: "1.2",
        title: "Разработка",
        owner: "Alex Dev",
        effortPercent: 100,
        workDays: 5,
        startDate: "2026-06-22T00:00:00.000Z",
        dueDate: "2026-06-26T00:00:00.000Z",
      }),
    ],
    new Date("2026-06-15T12:00:00.000Z"),
    [],
    [],
    ru,
  );

  const alex = dashboard.rows.find((row) => row.owner === "Alex Dev");

  assert.ok(alex);
  assert.equal(alex.cells[0]?.demandHours, 4);
  assert.equal(alex.cells[1]?.demandHours, 40);
  assert.equal(alex.cells[0]?.utilization, 10);
  assert.equal(alex.cells[1]?.utilization, 100);
  assert.equal(dashboard.summary.overloadedCount, 0);
});

test("resource dashboard prorates effort for tasks shorter than one week", () => {
  const dashboard = createResourceDashboard(
    [
      wbsTask({
        id: "one-day",
        code: "1.1",
        title: "Однодневная проверка",
        owner: "Alex Dev",
        effortPercent: 100,
        workDays: 1,
        startDate: "2026-06-15T00:00:00.000Z",
        dueDate: "2026-06-15T00:00:00.000Z",
      }),
    ],
    new Date("2026-06-15T12:00:00.000Z"),
    [],
    [],
    ru,
  );

  const alex = dashboard.rows.find((row) => row.owner === "Alex Dev");

  assert.ok(alex);
  assert.equal(alex.cells[0]?.demandHours, 8);
  assert.equal(alex.cells[0]?.utilization, 20);
});

test("resource dashboard detects overload when overlapping effort exceeds capacity", () => {
  const dashboard = createResourceDashboard(
    [
      wbsTask({
        id: "api",
        code: "1.1",
        title: "Backend API",
        owner: "Alex Dev",
        effortPercent: 100,
        workDays: 5,
      }),
      wbsTask({
        id: "frontend",
        code: "1.2",
        title: "Frontend",
        owner: "Alex Dev",
        effortPercent: 100,
        workDays: 5,
      }),
    ],
    new Date("2026-06-15T12:00:00.000Z"),
    ["api"],
    [],
    ru,
  );

  const alex = dashboard.rows.find((row) => row.owner === "Alex Dev");

  assert.ok(alex);
  assert.equal(alex.cells[0]?.demandHours, 80);
  assert.equal(dashboard.summary.overloadedCount, 1);
  assert.ok(dashboard.summary.roleGapHours > 0);
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
    [],
    [],
    ru,
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
    [],
    [],
    ru,
  );

  const pm = dashboard.rows.find((row) => row.owner === "PM");

  assert.ok(pm);
  assert.equal(pm.overdue, 1);
  assert.equal(pm.cells[0]?.demandHours, 0);
  assert.ok(
    dashboard.conflicts.some((conflict) =>
      conflict.title.includes("просроченные"),
    ),
  );
});

test("resource dashboard treats CVTE as contractor team capacity", () => {
  const dashboard = createResourceDashboard(
    [
      wbsTask({
        id: "cvte-a",
        code: "4.1",
        owner: "CVTE",
        title: "EVT design",
        workDays: 10,
        startDate: "2026-06-15T00:00:00.000Z",
        dueDate: "2026-06-26T00:00:00.000Z",
      }),
      wbsTask({
        id: "cvte-b",
        code: "4.2",
        owner: "CVTE",
        title: "HW tests",
        workDays: 10,
        startDate: "2026-06-15T00:00:00.000Z",
        dueDate: "2026-06-26T00:00:00.000Z",
      }),
    ],
    new Date("2026-06-15T12:00:00.000Z"),
    [],
    [],
    ru,
  );

  const cvte = dashboard.rows.find((row) => row.owner === "CVTE");

  assert.ok(cvte);
  assert.equal(cvte.profile.kind, "contractor-team");
  assert.equal(cvte.capacityHoursPerWeek, 200);
  assert.equal(cvte.profile.role, "Подрядчик: РП + 5 инженеров");
  assert.equal(cvte.cells[0]?.demandHours, 0);
  assert.equal(dashboard.summary.overloadedCount, 0);
});

test("resource dashboard keeps coordinator capacity separate from WBS effort", () => {
  const dashboard = createResourceDashboard(
    [
      wbsTask({
        id: "pm-task",
        code: "5.1",
        owner: "Гладков",
        title: "Согласование плана",
        effortPercent: 10,
        workDays: 10,
        startDate: "2026-06-15T00:00:00.000Z",
        dueDate: "2026-06-26T00:00:00.000Z",
      }),
    ],
    new Date("2026-06-15T12:00:00.000Z"),
    [],
    [],
    ru,
  );

  const pm = dashboard.rows.find((row) => row.owner === "Гладков");

  assert.ok(pm);
  assert.equal(pm.profile.kind, "coordinator");
  assert.equal(pm.profile.executionFactorPercent, 1);
  assert.equal(pm.capacityHoursPerWeek, 16);
  assert.equal(pm.cells[0]?.demandHours, 4);
  assert.equal(pm.cells[1]?.demandHours, 4);
  assert.equal(dashboard.summary.overloadedCount, 0);
});

test("resource dashboard text follows the interface locale", () => {
  const items = [
    wbsTask({
      id: "overloaded",
      code: "6.1",
      title: "Frontend build",
      owner: "Alex Dev",
      effortPercent: 100,
      workDays: 5,
      startDate: "2026-06-15T00:00:00.000Z",
      dueDate: "2026-06-19T00:00:00.000Z",
    }),
    wbsTask({
      id: "unowned",
      code: "6.2",
      title: "Integration testing",
      owner: "",
      effortPercent: 50,
      workDays: 3,
    }),
  ];
  const now = new Date("2026-06-15T12:00:00.000Z");
  const english = createResourceDashboard(items, now, [], [], en);
  const russian = createResourceDashboard(items, now, [], [], ru);

  assert.equal(english.unassignedRow?.owner, "Unassigned");
  assert.equal(russian.unassignedRow?.owner, "Не назначен");
  assert.equal(english.rows[0]?.profile.role, "Development");
  assert.equal(russian.rows[0]?.profile.role, "Разработка");
  assert.ok(english.conflicts.every((conflict) => !/[А-Яа-яЁё]/u.test(`${conflict.title}${conflict.detail}`)));
  assert.ok(english.requests.every((request) => !/[А-Яа-яЁё]/u.test(`${request.role}${request.dueLabel}${request.reason}`)));
  assert.ok(english.recommendations.every((item) => !/[А-Яа-яЁё]/u.test(`${item.title}${item.detail}`)));
  assert.deepEqual(
    english.rows.map((row) => row.capacityHoursPerWeek),
    russian.rows.map((row) => row.capacityHoursPerWeek),
  );
});
