import assert from "node:assert/strict";
import test from "node:test";

import type { WbsItem } from "./domainTypes";
import {
  createMilestoneTimelineModel,
  mapSnakeTimelineOffset,
} from "./milestoneTimeline";

function milestone(id: string, dueDate: string): WbsItem {
  return {
    id,
    parentId: null,
    code: id,
    title: `Milestone ${id}`,
    type: "MILESTONE",
    status: "NOT_STARTED",
    owner: "",
    startDate: null,
    dueDate,
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
    plannedCost: "0",
    forecastCost: "0",
    progress: 0,
    jiraTicketKey: null,
    jiraTicketUrl: null,
    description: null,
    closedAt: null,
    sortOrder: Number(id),
  };
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
