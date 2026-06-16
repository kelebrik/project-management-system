import assert from "node:assert/strict";
import test from "node:test";

import type { WbsItem, WbsItemStatus, WbsItemType } from "./domainTypes";
import { wbsToForm } from "./formState";
import { createWorkSummaryData, weekRange } from "./workSummaryModel";

function wbsTask(
  overrides: Partial<WbsItem> & {
    id: string;
    code: string;
    type?: WbsItemType;
    status?: WbsItemStatus;
  },
): WbsItem {
  return {
    id: overrides.id,
    parentId: null,
    code: overrides.code,
    title: "Задача",
    type: overrides.type ?? "TASK",
    status: overrides.status ?? "NOT_STARTED",
    owner: "PM",
    startDate: "2026-06-15",
    dueDate: "2026-06-19",
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

function draftFor(item: WbsItem, overrides: Partial<ReturnType<typeof wbsToForm>>) {
  return {
    ...wbsToForm(item),
    ...overrides,
  };
}

function dateParts(value: Date) {
  return [value.getFullYear(), value.getMonth(), value.getDate()];
}

test("work summary weeks use Monday-based ranges", () => {
  const current = weekRange(0, new Date(2026, 5, 17, 12));
  const next = weekRange(1, new Date(2026, 5, 17, 12));

  assert.deepEqual(dateParts(current.start), [2026, 5, 15]);
  assert.deepEqual(dateParts(current.endInclusive), [2026, 5, 21]);
  assert.deepEqual(dateParts(next.start), [2026, 5, 22]);
  assert.deepEqual(dateParts(next.endInclusive), [2026, 5, 28]);
});

test("work summary uses draft values to derive current and next-week tasks", () => {
  const currentTask = wbsTask({
    id: "current",
    code: "2",
    status: "NOT_STARTED",
    startDate: "2026-06-18",
    dueDate: "2026-06-20",
    sortOrder: 20,
  });
  const nextWeekTask = wbsTask({
    id: "next",
    code: "3",
    status: "NOT_STARTED",
    startDate: "2026-06-22",
    dueDate: "2026-06-24",
    sortOrder: 30,
  });
  const reviewTask = wbsTask({
    id: "review",
    code: "1",
    status: "NOT_STARTED",
    startDate: "2026-06-29",
    dueDate: "2026-07-01",
    sortOrder: 10,
  });
  const shiftedByDraftTask = wbsTask({
    id: "shifted",
    code: "5",
    status: "NOT_STARTED",
    startDate: "2026-06-29",
    dueDate: "2026-07-02",
    sortOrder: 50,
  });
  const doneTask = wbsTask({
    id: "done",
    code: "4",
    status: "DONE",
    startDate: "2026-06-22",
    dueDate: "2026-06-23",
    sortOrder: 40,
  });
  const milestone = wbsTask({
    id: "milestone",
    code: "M1",
    type: "MILESTONE",
    startDate: "2026-06-22",
    dueDate: "2026-06-22",
  });

  const data = createWorkSummaryData(
    [
      milestone,
      reviewTask,
      shiftedByDraftTask,
      currentTask,
      nextWeekTask,
      doneTask,
    ],
    {
      review: draftFor(reviewTask, { status: "IN_REVIEW" }),
      shifted: draftFor(shiftedByDraftTask, { startDate: "2026-06-23" }),
    },
    new Date(2026, 5, 17, 12),
  );

  assert.deepEqual(
    data.currentTasks.map((item) => item.id),
    ["review", "current"],
  );
  assert.deepEqual(
    data.tasksStartingNextWeek.map((item) => item.id),
    ["next", "shifted"],
  );
});

test("work summary sorts tasks by WBS code", () => {
  const code310 = wbsTask({
    id: "code-3-10",
    code: "3.10",
    status: "IN_PROGRESS",
    startDate: "2026-06-14",
    dueDate: "2026-06-15",
    sortOrder: 1,
  });
  const code32 = wbsTask({
    id: "code-3-2",
    code: "3.2",
    status: "IN_PROGRESS",
    startDate: "2026-06-20",
    dueDate: "2026-06-21",
    sortOrder: 10,
  });
  const code311 = wbsTask({
    id: "code-3-11",
    code: "3.11",
    status: "IN_PROGRESS",
    startDate: "2026-06-15",
    dueDate: "2026-06-16",
    sortOrder: 5,
  });
  const code26 = wbsTask({
    id: "code-2-6",
    code: "2.6",
    status: "IN_PROGRESS",
    startDate: "2026-06-19",
    dueDate: "2026-06-20",
    sortOrder: 20,
  });

  const data = createWorkSummaryData(
    [code310, code32, code311, code26],
    {},
    new Date(2026, 5, 17, 12),
  );

  assert.deepEqual(
    data.currentTasks.map((item) => item.id),
    ["code-2-6", "code-3-2", "code-3-10", "code-3-11"],
  );
});
