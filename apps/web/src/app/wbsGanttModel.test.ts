import assert from "node:assert/strict";
import test from "node:test";

import { GANTT_ROW_HEIGHT } from "../ganttDependencyPath";
import type { WbsTreeItem } from "./domainTypes";
import { createWbsGantt } from "./wbsGanttModel";

function wbsTreeItem(overrides: Partial<WbsTreeItem>): WbsTreeItem {
  return {
    id: "task",
    parentId: null,
    code: "1",
    title: "Работа",
    type: "TASK",
    status: "NOT_STARTED",
    owner: "",
    startDate: "2026-07-01T00:00:00.000Z",
    dueDate: "2026-07-03T00:00:00.000Z",
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
    workDays: 3,
    calendarDays: 3,
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
    children: [],
    level: 0,
    ...overrides,
  };
}

test("createWbsGantt excludes cancelled WBS items", () => {
  const activeTask = wbsTreeItem({ id: "active", code: "1.1" });
  const cancelledTask = wbsTreeItem({
    id: "cancelled",
    code: "1.2",
    status: "CANCELLED",
    workDays: 0,
  });

  const model = createWbsGantt({
    visibleWbsTree: [activeTask, cancelledTask],
    criticalPath: null,
    wbsDependencies: [],
  });

  assert.deepEqual(
    model.items.map((entry) => entry.item.id),
    ["active"],
  );
  assert.equal(model.height, GANTT_ROW_HEIGHT);
});

test("createWbsGantt renders phases and work packages as labeled range lines", () => {
  const phase = wbsTreeItem({
    id: "phase",
    code: "1",
    title: "Фаза",
    type: "PHASE",
  });
  const workPackage = wbsTreeItem({
    id: "package",
    code: "1.1",
    title: "Пакет работ",
    type: "WORK_PACKAGE",
  });

  const model = createWbsGantt({
    visibleWbsTree: [phase, workPackage],
    criticalPath: null,
    wbsDependencies: [],
  });

  const phaseEntry = model.items.find((entry) => entry.item.id === phase.id);
  const workPackageEntry = model.items.find(
    (entry) => entry.item.id === workPackage.id,
  );

  assert.equal(phaseEntry?.rangeLine, true);
  assert.equal(phaseEntry?.bracket, false);
  assert.equal(workPackageEntry?.rangeLine, true);
  assert.equal(workPackageEntry?.bracket, false);
});

test("createWbsGantt keeps historical work available in a selected range", () => {
  const now = new Date();
  const isoAfterDays = (days: number) => {
    const value = new Date(now);
    value.setDate(value.getDate() + days);
    return value.toISOString().slice(0, 10);
  };
  const old = wbsTreeItem({ id: "old", startDate: isoAfterDays(-180), dueDate: isoAfterDays(-170) });
  const near = wbsTreeItem({ id: "near", startDate: isoAfterDays(2), dueDate: isoAfterDays(8) });
  const far = wbsTreeItem({ id: "far", startDate: isoAfterDays(220), dueDate: isoAfterDays(230) });

  const model = createWbsGantt({
    visibleWbsTree: [old, near, far],
    criticalPath: null,
    wbsDependencies: [],
    rangeDays: 90,
  });

  assert.deepEqual(model.items.map((entry) => entry.item.id), ["old", "near", "far"]);
  assert.ok(model.start && model.start <= new Date(old.startDate!));
  assert.ok(model.end && model.end >= new Date(far.dueDate!));
});
