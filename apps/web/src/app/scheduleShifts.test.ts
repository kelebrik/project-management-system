import assert from "node:assert/strict";
import test from "node:test";
import { createTranslator } from "../i18n/translate";
import { shiftStepCause, type ShiftStep } from "./scheduleShifts";

const step = (trigger: string, extra: Partial<ShiftStep> = {}): ShiftStep => ({
  id: "s",
  operationId: "o",
  at: "2026-09-20T10:00:00.000Z",
  previousDate: null,
  newDate: null,
  deltaDays: 3,
  trigger,
  sourceItemId: null,
  sourceCode: null,
  sourceTitle: null,
  sourceIssueId: null,
  sourceNote: null,
  actorName: null,
  reason: null,
  needsReason: false,
  ...extra,
});

test("each step says in words what moved the checkpoint", () => {
  const t = createTranslator("en");
  assert.equal(shiftStepCause(step("MANUAL_EDIT", { sourceItemId: "m" }), "m", t), "The checkpoint's date was changed");
  assert.equal(shiftStepCause(step("MANUAL_EDIT", { sourceItemId: "w", sourceCode: "2.4", sourceTitle: "Firmware" }), "m", t), "Edit of 2.4 Firmware, carried over by links");
  assert.equal(shiftStepCause(step("BULK_EDIT"), "m", t), "Bulk edit of the structure");
  assert.equal(shiftStepCause(step("CALENDAR", { sourceNote: "2026-10-05 reset" }), "m", t, () => "5 Oct"), "Calendar: 5 Oct reset to the default");
  assert.equal(shiftStepCause(step("TARGET_DATE", { sourceNote: "Customer moved acceptance" }), "m", t), "New project target date: Customer moved acceptance");
  assert.equal(shiftStepCause(step("SYSTEM"), "m", t), "Recalculation at server start");
});
