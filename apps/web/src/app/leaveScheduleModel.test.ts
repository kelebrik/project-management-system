import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLeaveTimeline,
  calendarOverrides,
  filterLeaveEmployees,
  findOverlappingLeave,
  groupLeaveEmployees,
  leaveCsv,
  extendLeaveRange,
  widenLeaveRange,
  initialLeaveRange,
  leaveScale,
  visibleLeaveWindow,
  leaveSegments,
  plannedWorkingDays,
  sortLeaveEmployees,
  workingDaysInRange,
  type LeaveEmployee,
  type LeaveRecord,
} from "./leaveScheduleModel";

const holidays2026 = calendarOverrides([
  { date: "2026-06-12", isWorkingDay: false, description: "День России" },
  { date: "2026-11-04", isWorkingDay: false, description: "День народного единства" },
]);

function employee(overrides: Partial<LeaveEmployee>): LeaveEmployee {
  return { id: "e1", name: "Иванов", department: "", userId: null, isActive: true, sortOrder: 0, ...overrides };
}

function leave(overrides: Partial<LeaveRecord>): LeaveRecord {
  return {
    id: "l1",
    employeeId: "e1",
    typeId: "vacation",
    startDate: "2026-06-08",
    endDate: "2026-06-19",
    comment: "",
    ...overrides,
  };
}

test("working days skip weekends and public holidays", () => {
  // 8–19 June 2026: two weeks, 12 June is Russia Day.
  assert.equal(workingDaysInRange("2026-06-08", "2026-06-19", holidays2026), 9);
  assert.equal(workingDaysInRange("2026-06-08", "2026-06-19", new Map()), 10);
});

test("the loaded stretch covers whole weeks around today and grows on either side", () => {
  const range = initialLeaveRange("2026-09-24", 3);
  assert.deepEqual(range, { from: "2026-03-23", to: "2027-06-27" });
  assert.deepEqual(extendLeaveRange(range, "before", 3), { from: "2025-12-22", to: "2027-06-27" });
  assert.deepEqual(extendLeaveRange(range, "after", 3), { from: "2026-03-23", to: "2027-10-03" });
});

test("the scale fits the horizon and switches to weeks for a year", () => {
  const quarter = leaveScale(3, 913);
  assert.equal(quarter.mode, "day");
  assert.ok(Math.abs(quarter.dayWidth * 91.3 - 913) < 1);
  assert.equal(leaveScale(6, 300).dayWidth, 6);
  assert.equal(leaveScale(3, 20000).dayWidth, 40);
  const year = leaveScale(12, 1043);
  assert.equal(year.mode, "week");
  assert.ok(Math.abs(year.dayWidth * 7 - 1043 / (365.25 / 7)) < 0.01);
  assert.equal(leaveScale(12, 100).dayWidth, 14 / 7);
});

test("the visible window follows the scroll position", () => {
  const range = { from: "2026-06-22", to: "2027-03-28" };
  assert.deepEqual(visibleLeaveWindow(range, 0, 100, 10), { from: "2026-06-22", to: "2026-07-01" });
  assert.deepEqual(visibleLeaveWindow(range, 95, 100, 10), { from: "2026-07-01", to: "2026-07-11" });
  assert.deepEqual(visibleLeaveWindow(range, 1e6, 100, 10), { from: "2027-03-28", to: "2027-03-28" });
});

test("the timeline marks months, weeks, weekends, holidays and today", () => {
  const timeline = buildLeaveTimeline("2026-06-08", "2026-06-21", holidays2026, "2026-06-10");
  assert.equal(timeline.days.length, 14);
  assert.deepEqual(
    timeline.weeks.map((week) => [week.date, week.span]),
    [
      ["2026-06-08", 7],
      ["2026-06-15", 7],
    ],
  );
  assert.equal(timeline.months.length, 1);
  const russiaDay = timeline.days[4];
  assert.equal(russiaDay.date, "2026-06-12");
  assert.equal(russiaDay.isWorking, false);
  assert.equal(russiaDay.holiday, "День России");
  assert.equal(timeline.days[5].isWorking, false);
  assert.equal(timeline.days[2].isToday, true);
});

test("segments are clipped to the visible period", () => {
  const segments = leaveSegments([leave({ startDate: "2026-06-01", endDate: "2026-06-10" })], "2026-06-08", "2026-06-21");
  const [segment] = segments.get("e1") ?? [];
  assert.equal(segment.start, 0);
  assert.equal(segment.span, 3);
  assert.equal(segment.continuesBefore, true);
  assert.equal(segment.continuesAfter, false);
});

test("planned days count only working days inside the period", () => {
  const totals = plannedWorkingDays([leave({})], "2026-06-15", "2026-06-30", holidays2026);
  assert.equal(totals.get("e1"), 5);
});

test("overlaps are found for the same person only, ignoring the edited leave", () => {
  const leaves = [leave({})];
  assert.ok(findOverlappingLeave(leaves, { employeeId: "e1", startDate: "2026-06-19", endDate: "2026-06-22" }));
  assert.equal(findOverlappingLeave(leaves, { employeeId: "e2", startDate: "2026-06-10", endDate: "2026-06-12" }), null);
  assert.equal(findOverlappingLeave(leaves, { id: "l1", employeeId: "e1", startDate: "2026-06-01", endDate: "2026-06-30" }), null);
  assert.equal(findOverlappingLeave(leaves, { employeeId: "e1", startDate: "2026-06-20", endDate: "2026-06-22" }), null);
});

test("filters by name, department, archive and who is away on a day", () => {
  const people = [
    employee({ id: "e1", name: "Иванов Иван", department: "Разработка" }),
    employee({ id: "e2", name: "Петров Пётр", department: "Маркетинг" }),
    employee({ id: "e3", name: "Сидоров", department: "Разработка", isActive: false }),
  ];
  const base = { search: "", departments: [], absentOn: null, showArchived: false };
  assert.deepEqual(filterLeaveEmployees(people, [], { ...base, search: "пётр" }, "ru").map((p) => p.id), ["e2"]);
  assert.deepEqual(filterLeaveEmployees(people, [], { ...base, departments: ["Разработка"] }, "ru").map((p) => p.id), ["e1"]);
  assert.deepEqual(
    filterLeaveEmployees(people, [], { ...base, departments: ["Разработка"], showArchived: true }, "ru").map((p) => p.id),
    ["e1", "e3"],
  );
  assert.deepEqual(filterLeaveEmployees(people, [leave({})], { ...base, absentOn: "2026-06-10" }, "ru").map((p) => p.id), ["e1"]);
});

test("sorting and grouping follow department and name", () => {
  const people = [
    employee({ id: "a", name: "Яковлев", department: "Аналитика" }),
    employee({ id: "b", name: "Абрамов", department: "Разработка" }),
    employee({ id: "c", name: "Борисов", department: "Аналитика" }),
  ];
  assert.deepEqual(sortLeaveEmployees(people, "name", "asc", new Map(), "ru").map((p) => p.id), ["b", "c", "a"]);
  assert.deepEqual(sortLeaveEmployees(people, "department", "asc", new Map(), "ru").map((p) => p.id), ["c", "a", "b"]);
  const sorted = sortLeaveEmployees(people, "planned", "desc", new Map([["a", 5]]), "ru");
  assert.equal(sorted[0].id, "a");
  assert.deepEqual(
    groupLeaveEmployees(sortLeaveEmployees(people, "department", "asc", new Map(), "ru")).map((group) => [
      group.department,
      group.employees.length,
    ]),
    [
      ["Аналитика", 2],
      ["Разработка", 1],
    ],
  );
});

test("CSV quotes separators and starts with a byte order mark", () => {
  const csv = leaveCsv(["Сотрудник", "Комментарий"], [["Иванов", 'Море; "юг"']]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.equal(csv, '\uFEFFСотрудник;Комментарий\r\nИванов;"Море; ""юг"""\r\n');
});

test("a wider scale loads enough around the day at the left edge", () => {
  const range = { from: "2026-03-23", to: "2027-06-27" };
  assert.deepEqual(widenLeaveRange(range, "2026-09-14", 12), { from: "2024-09-09", to: "2029-09-16" });
  assert.deepEqual(widenLeaveRange(range, "2026-09-14", 3), { from: "2026-03-09", to: "2027-06-27" });
  // Already loaded: nothing changes.
  assert.deepEqual(widenLeaveRange(range, "2026-09-23", 3), range);
});
