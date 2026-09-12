import assert from "node:assert/strict";
import test from "node:test";
import { goalScheduleHealth } from "./goalScheduleHealth";

const base = { status: "IN_PROGRESS" as const, baselineDueDate: "2026-09-10", dueDate: "2026-09-12", forecastDueDate: null };

test("goal schedule health uses the displayed due-date fallback", () => {
  assert.equal(goalScheduleHealth(base), "late-warning");
  assert.equal(goalScheduleHealth({ ...base, dueDate: "2026-09-20" }), "late-danger");
  assert.equal(goalScheduleHealth({ ...base, delayDays: 5 }), "late-warning");
  assert.equal(goalScheduleHealth({ ...base, delayDays: 6 }), "late-danger");
  assert.equal(goalScheduleHealth({ ...base, dueDate: null, forecastDueDate: "2026-09-12" }), "late-warning");
  assert.equal(goalScheduleHealth({ ...base, dueDate: "2026-09-10" }), "neutral");
  assert.equal(goalScheduleHealth({ ...base, dueDate: "2026-09-08" }), "neutral");
});

test("completed goals remain green and explicit risks remain visible without a baseline", () => {
  assert.equal(goalScheduleHealth({ ...base, status: "DONE" }), "done-late-warning");
  assert.equal(goalScheduleHealth({ ...base, status: "DONE", dueDate: "2026-09-20" }), "done-late-danger");
  assert.equal(goalScheduleHealth({ ...base, status: "DONE", delayDays: null, dueDate: "2026-09-10" }), "done");
  assert.equal(goalScheduleHealth({ ...base, status: "AT_RISK", baselineDueDate: null }), "risk");
  assert.equal(goalScheduleHealth({ ...base, status: "BLOCKED", baselineDueDate: null }), "risk");
  assert.equal(goalScheduleHealth({ ...base, baselineDueDate: null }), "neutral");
});
