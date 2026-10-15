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

test("createWbsGantt timescale follows the interface language", () => {
  const item = wbsTreeItem({});
  const en = createWbsGantt({ visibleWbsTree: [item], criticalPath: null, wbsDependencies: [], locale: "en" });
  const ru = createWbsGantt({ visibleWbsTree: [item], criticalPath: null, wbsDependencies: [] });

  // The scale opens a month before the work: June, in the second quarter.
  assert.equal(en.months[0]?.label, "Jun 2026");
  assert.equal(en.months[1]?.label, "Jul 2026");
  assert.equal(en.quarters[0]?.label, "Q2 2026");
  assert.doesNotMatch(en.weeks.map((week) => week.label).join(" "), /[А-Яа-яЁё]/);
  assert.match(ru.months[1]?.label ?? "", /июль/);
  assert.equal(ru.quarters[0]?.label, "2 кв. 2026");
});

test("the Gantt opens a month before the Structure's earliest date, collapsed rows included", () => {
  const day = (value: string) => `${value}T00:00:00.000Z`;
  // The window is laid out in the browser's days.
  const local = (value: Date | null | undefined) => (value ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}` : null);
  const phase = wbsTreeItem({ id: "phase", type: "PHASE", startDate: day("2026-10-15"), dueDate: day("2026-12-20") });
  // A row under the phase starts earlier, by its baseline.
  const early = wbsTreeItem({ id: "early", parentId: "phase", startDate: day("2026-10-20"), dueDate: day("2026-11-02"), baselineStartDate: day("2026-08-14"), baselineDueDate: day("2026-08-30") });
  const open = createWbsGantt({ visibleWbsTree: [phase, early], criticalPath: null, wbsDependencies: [] });
  assert.equal(local(open.start), "2026-07-01");
  // The phase collapsed: the window stays where it was.
  const collapsed = createWbsGantt({ visibleWbsTree: [phase], criticalPath: null, wbsDependencies: [], boundsTree: [phase, early] });
  assert.equal(local(collapsed.start), "2026-07-01");
  // Across the new year: work from 10 January opens in December.
  const january = wbsTreeItem({ startDate: day("2027-01-10"), dueDate: day("2027-01-20") });
  assert.equal(local(createWbsGantt({ visibleWbsTree: [january], criticalPath: null, wbsDependencies: [] }).start), "2026-12-01");
  // A cancelled row does not stretch the window.
  const cancelled = wbsTreeItem({ id: "gone", status: "CANCELLED", startDate: day("2025-01-10"), dueDate: day("2025-01-20") });
  assert.equal(local(createWbsGantt({ visibleWbsTree: [january], criticalPath: null, wbsDependencies: [], boundsTree: [january, cancelled] }).start), "2026-12-01");
});
