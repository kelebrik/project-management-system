import assert from "node:assert/strict";
import test from "node:test";

import type { WbsItem } from "./domainTypes";
import {
  createMilestoneTimeline,
  createStructureMilestones,
} from "./milestoneModels";
import {
  createMilestoneTimelineModel,
  mapSnakeTimelineOffset,
} from "./milestoneTimeline";

function wbsItem(overrides: Partial<WbsItem> & Pick<WbsItem, "id" | "type">): WbsItem {
  return {
    id: overrides.id,
    parentId: null,
    code: overrides.id,
    title: `Item ${overrides.id}`,
    type: overrides.type,
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
    sortOrder: Number(overrides.id.replace(/\D/g, "")) || 0,
    ...overrides,
  };
}

function milestone(id: string, dueDate: string, overrides: Partial<WbsItem> = {}): WbsItem {
  return wbsItem({
    id,
    type: "MILESTONE",
    dueDate,
    ...overrides,
  });
}

function phase(id: string, sortOrder: number): WbsItem {
  return wbsItem({
    id,
    code: String(sortOrder),
    title: `Phase ${sortOrder}`,
    type: "PHASE",
    sortOrder,
  });
}

test("milestone count timeline places today after the completed share of milestones", () => {
  const beforeTodayDates = [
    "2025-12-01",
    "2026-03-17",
    "2026-04-06",
    "2026-04-27",
  ];
  const afterTodayDates = [
    "2026-06-17",
    "2026-07-01",
    "2026-07-21",
    "2026-08-04",
    "2026-08-05",
    "2026-08-11",
    "2026-08-24",
    "2026-08-25",
    "2026-09-03",
    "2026-09-10",
    "2026-09-17",
    "2026-09-24",
    "2026-10-01",
  ];
  const items = [...beforeTodayDates, ...afterTodayDates].map((dueDate, index) =>
    milestone(String(index + 1), dueDate),
  );
  const timelineStart = new Date(2025, 11, 1);
  const timelineEnd = new Date(2026, 9, 1);
  const today = new Date(2026, 5, 9);
  const expectedOffset = beforeTodayDates.length / items.length;

  const model = createMilestoneTimelineModel({
    milestones: items.map((item) => ({
      milestone: item,
      calendarDaysLeft: null,
      workDaysLeft: null,
      state: { label: "", tone: "gray" },
    })),
    lanes: [{ id: "all", code: "", title: "Все вехи", items: [] }],
    today,
    timelineStart,
    timelineEnd,
    todayOffsetMode: "milestone-count",
  });

  assert.equal(model.todayOffset, expectedOffset);
  assert.ok(
    model.todayOffset !== null &&
      Math.abs(mapSnakeTimelineOffset(model.todayOffset) - 0.2368235294117647) <
        0.000001,
    "snake marker should reserve 4/17 of the path before today",
  );
});

test("phase milestone timeline hides lanes without visible milestones", () => {
  const item = milestone("m1", "2026-06-10");
  const model = createMilestoneTimelineModel({
    milestones: [
      {
        milestone: item,
        calendarDaysLeft: null,
        workDaysLeft: null,
        state: { label: "", tone: "gray" },
      },
    ],
    lanes: [
      { id: "phase-1", code: "1", title: "Phase 1", items: [] },
      { id: "phase-2", code: "2", title: "Phase 2", items: [] },
      { id: "phase-3", code: "3", title: "Phase 3", items: [] },
    ],
    laneIdByMilestoneId: new Map([[item.id, "phase-2"]]),
    today: new Date(2026, 5, 1),
    timelineStart: new Date(2026, 4, 1),
    timelineEnd: new Date(2026, 6, 1),
  });

  assert.deepEqual(
    model.lanes.map((lane) => lane.id),
    ["phase-2"],
  );
});

test("phase milestone timeline hides phases completed more than three weeks ago", () => {
  const stalePhase = phase("phase-1", 1);
  const activePhase = phase("phase-2", 2);
  const staleMilestone = milestone("m1", "2026-06-01", {
    parentId: stalePhase.id,
    status: "DONE",
    sortOrder: 1,
  });
  const activeMilestone = milestone("m2", "2026-06-20", {
    parentId: activePhase.id,
    status: "DONE",
    sortOrder: 2,
  });
  const wbsItems = [
    stalePhase,
    staleMilestone,
    activePhase,
    activeMilestone,
  ];
  const timeline = createMilestoneTimeline(
    wbsItems,
    createStructureMilestones(wbsItems),
    new Date(2026, 6, 4),
  );

  assert.deepEqual(
    timeline.byPhase.lanes.map((lane) => lane.id),
    [activePhase.id],
  );
  assert.equal(timeline.byPhase.hiddenStaleLaneCount, 1);
  assert.deepEqual(
    timeline.all.lanes.flatMap((lane) =>
      lane.items.map((item) => item.milestone.id),
    ),
    [staleMilestone.id, activeMilestone.id],
  );
});

test("phase milestone timeline keeps old overdue phases visible", () => {
  const overduePhase = phase("phase-1", 1);
  const overdueMilestone = milestone("m1", "2026-06-01", {
    parentId: overduePhase.id,
    status: "NOT_STARTED",
    sortOrder: 1,
  });
  const wbsItems = [overduePhase, overdueMilestone];
  const timeline = createMilestoneTimeline(
    wbsItems,
    createStructureMilestones(wbsItems),
    new Date(2026, 6, 4),
  );

  assert.deepEqual(
    timeline.byPhase.lanes.map((lane) => lane.id),
    [overduePhase.id],
  );
  assert.equal(timeline.byPhase.hiddenStaleLaneCount, 0);
});
