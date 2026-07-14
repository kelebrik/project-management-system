import assert from "node:assert/strict";
import test from "node:test";
import {
  addWorkingDays as addScheduleWorkingDays,
  buildCalendarOverrides as buildScheduleOverrides,
  workingDaysInclusive as scheduleWorkingDaysInclusive,
} from "./wbs-schedule/calendar.js";
import {
  buildCalendarOverrides as buildCriticalPathOverrides,
  isWorkingDay as isCriticalPathWorkingDay,
  workingDayDistance,
} from "./wbs-critical-path/calendar.js";

const overrides = [
  {
    calendarCode: "RU" as const,
    date: new Date("2026-05-19T00:00:00.000Z"),
    isWorkingDay: false,
  },
  {
    calendarCode: "CN" as const,
    date: new Date("2026-05-20T00:00:00.000Z"),
    isWorkingDay: false,
  },
  {
    calendarCode: "RU" as const,
    date: new Date("2026-05-23T00:00:00.000Z"),
    isWorkingDay: true,
  },
];

test("RU+CN excludes holidays from either base calendar", () => {
  const calendarOverrides = buildScheduleOverrides(overrides);

  assert.equal(
    scheduleWorkingDaysInclusive(
      new Date("2026-05-18T00:00:00.000Z"),
      new Date("2026-05-22T00:00:00.000Z"),
      "RU_CN",
      calendarOverrides,
    ),
    3,
  );
  assert.equal(
    addScheduleWorkingDays(
      new Date("2026-05-18T00:00:00.000Z"),
      2,
      "RU_CN",
      calendarOverrides,
    ).toISOString().slice(0, 10),
    "2026-05-22",
  );
});

test("RU+CN requires both calendars to override a weekend as working", () => {
  const oneCalendarOverride = buildCriticalPathOverrides(overrides);
  assert.equal(
    isCriticalPathWorkingDay(
      new Date("2026-05-23T00:00:00.000Z"),
      "RU_CN",
      oneCalendarOverride,
    ),
    false,
  );

  const bothCalendarOverrides = buildCriticalPathOverrides([
    ...overrides,
    {
      calendarCode: "CN",
      date: new Date("2026-05-23T00:00:00.000Z"),
      isWorkingDay: true,
    },
  ]);
  assert.equal(
    isCriticalPathWorkingDay(
      new Date("2026-05-23T00:00:00.000Z"),
      "RU_CN",
      bothCalendarOverrides,
    ),
    true,
  );
});

test("critical path distance uses both RU and CN holidays", () => {
  assert.equal(
    workingDayDistance(
      new Date("2026-05-18T00:00:00.000Z"),
      new Date("2026-05-22T00:00:00.000Z"),
      "RU_CN",
      buildCriticalPathOverrides(overrides),
    ),
    2,
  );
});
