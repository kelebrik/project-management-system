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

test("milestone timeline today offset follows calendar date, not milestone count", () => {
  const items = [
    milestone("1", "2025-12-01"),
    milestone("2", "2026-03-17"),
    milestone("3", "2026-04-06"),
    milestone("4", "2026-04-27"),
    milestone("5", "2026-06-17"),
    milestone("6", "2026-07-01"),
  ];
  const timelineStart = new Date(2025, 11, 1);
  const timelineEnd = new Date(2026, 6, 1);
  const today = new Date(2026, 5, 9);
  const range = timelineEnd.getTime() - timelineStart.getTime();
  const expectedOffset = (today.getTime() - timelineStart.getTime()) / range;

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
  });

  assert.equal(model.todayOffset, expectedOffset);
  assert.ok(model.todayOffset !== null && model.todayOffset > 0.88);
  assert.ok(
    mapSnakeTimelineOffset(model.todayOffset) > 0.84,
    "snake marker should stay near the June date, not near February or March",
  );
});
