import assert from "node:assert/strict";
import test from "node:test";

import { inferWbsScheduleDriver } from "./wbsScheduleDriver";

test("WBS due date edit is date-driven even when work days are still stale", () => {
  const current = {
    startDate: "2026-06-02",
    dueDate: "2026-06-03",
    forecastStartDate: "2026-06-02",
    forecastDueDate: "2026-06-03",
    workDays: 2,
  };
  const next = {
    ...current,
    dueDate: "2026-06-05",
    forecastDueDate: "2026-06-05",
    workDays: 2,
  };

  assert.equal(inferWbsScheduleDriver(current, next), "dates");
});

test("WBS work days edit is work-day-driven when dates are unchanged", () => {
  const current = {
    startDate: "2026-06-02",
    dueDate: "2026-06-03",
    forecastStartDate: "2026-06-02",
    forecastDueDate: "2026-06-03",
    workDays: 2,
  };
  const next = {
    ...current,
    workDays: 4,
  };

  assert.equal(inferWbsScheduleDriver(current, next), "workDays");
});
