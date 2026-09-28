import assert from "node:assert/strict";
import test from "node:test";

import { calendarOverrides } from "./leaveScheduleModel";
import type { WorkloadItem } from "./workloadModel";
import {
  endAfterWorkingDays,
  planDrag,
  reverseWorkloadChange,
  snapToWorkingDay,
  workloadChange,
  workloadEditRights,
} from "./workloadPlanning";

const none = calendarOverrides([]);
// A made-up holiday on Wednesday 2026-11-04.
const holidays = calendarOverrides([{ date: "2026-11-04", isWorkingDay: false, description: "Праздник" }]);

test("a working day is found in the direction of travel", () => {
  // 2026-10-03 is a Saturday.
  assert.equal(snapToWorkingDay("2026-10-03", 1, none), "2026-10-05");
  assert.equal(snapToWorkingDay("2026-10-03", -1, none), "2026-10-02");
  assert.equal(snapToWorkingDay("2026-10-05", 1, none), "2026-10-05");
  assert.equal(snapToWorkingDay("2026-11-04", 1, holidays), "2026-11-05");
});

test("working days are counted from the start, skipping weekends and holidays", () => {
  assert.equal(endAfterWorkingDays("2026-10-05", 1, none), "2026-10-05");
  assert.equal(endAfterWorkingDays("2026-10-05", 5, none), "2026-10-09");
  assert.equal(endAfterWorkingDays("2026-10-08", 3, none), "2026-10-12");
  assert.equal(endAfterWorkingDays("2026-11-03", 2, holidays), "2026-11-05");
});

test("moving keeps the number of working days", () => {
  // Monday to Friday, moved by three days, lands Thursday to the next Tuesday.
  assert.deepEqual(planDrag({ startDate: "2026-10-05", dueDate: "2026-10-09" }, "move", 3, none), {
    startDate: "2026-10-08",
    dueDate: "2026-10-14",
  });
  // A start dropped on Saturday goes on to Monday when moving forward…
  assert.deepEqual(planDrag({ startDate: "2026-10-05", dueDate: "2026-10-06" }, "move", 5, none), {
    startDate: "2026-10-12",
    dueDate: "2026-10-13",
  });
  // …and back to Friday when moving backward.
  assert.deepEqual(planDrag({ startDate: "2026-10-12", dueDate: "2026-10-13" }, "move", -2, none), {
    startDate: "2026-10-09",
    dueDate: "2026-10-12",
  });
});

test("an edge lands on a working day and never passes the other edge", () => {
  const dates = { startDate: "2026-10-05", dueDate: "2026-10-09" };
  // Saturday snaps back to Friday, where the bar already ends.
  assert.equal(planDrag(dates, "end", 1, none), null);
  assert.deepEqual(planDrag(dates, "end", 3, none), { startDate: "2026-10-05", dueDate: "2026-10-12" });
  assert.deepEqual(planDrag(dates, "end", -10, none), { startDate: "2026-10-05", dueDate: "2026-10-05" });
  assert.equal(planDrag(dates, "start", -2, none), null);
  assert.deepEqual(planDrag(dates, "start", -3, none), { startDate: "2026-10-02", dueDate: "2026-10-09" });
  assert.deepEqual(planDrag(dates, "start", 10, none), { startDate: "2026-10-09", dueDate: "2026-10-09" });
});

test("no change gives nothing to save", () => {
  assert.equal(planDrag({ startDate: "2026-10-05", dueDate: "2026-10-09" }, "move", 0, none), null);
});

function work(overrides: Partial<WorkloadItem> = {}): WorkloadItem {
  return {
    id: "w1",
    projectId: "p1",
    code: "1.1",
    title: "Работа",
    owner: "Иванов",
    type: "TASK",
    status: "IN_PROGRESS",
    startDate: "2026-10-05",
    dueDate: "2026-10-09",
    updatedAt: "2026-09-27T10:00:00.000Z",
    ...overrides,
  };
}

const editable = new Set(["p1"]);

test("links keep the dates they set; the owner stays free", () => {
  assert.deepEqual(workloadEditRights(work(), editable), { reason: null, owner: true, start: true, end: true, move: true });
  assert.deepEqual(workloadEditRights(work({ startLocked: true }), editable), {
    reason: null, owner: true, start: false, end: true, move: false,
  });
  assert.deepEqual(workloadEditRights(work({ finishLocked: true }), editable), {
    reason: null, owner: true, start: true, end: false, move: false,
  });
  assert.deepEqual(workloadEditRights(work({ startLocked: true, finishLocked: true }), editable), {
    reason: null, owner: true, start: false, end: false, move: false,
  });
});

test("work outside the user's projects, managed by an issue or done is not changed", () => {
  const none = { owner: false, start: false, end: false, move: false };
  assert.deepEqual(workloadEditRights(work({ projectId: "p2" }), editable), { reason: "access", ...none });
  // An answer without versions comes from an older server: nothing can be saved safely.
  assert.deepEqual(workloadEditRights(work({ updatedAt: undefined }), editable), { reason: "access", ...none });
  assert.deepEqual(workloadEditRights(work({ lockedByIssue: true }), editable), { reason: "issue", ...none });
  assert.deepEqual(workloadEditRights(work({ status: "DONE" }), editable), { reason: "done", ...none });
});

test("a change keeps only what differs and can be put back", () => {
  const item = work();
  assert.equal(workloadChange(item, { owner: " Иванов ", startDate: "2026-10-05" }), null);
  assert.equal(workloadChange(item, { owner: "   " }), null);
  const change = workloadChange(item, { owner: "Петров", startDate: "2026-10-05", dueDate: "2026-10-12" });
  assert.deepEqual(change, { owner: "Петров", dueDate: "2026-10-12" });
  assert.deepEqual(reverseWorkloadChange(item, change!), { owner: "Иванов", dueDate: "2026-10-09" });
});
