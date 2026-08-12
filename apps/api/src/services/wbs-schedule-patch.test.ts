import assert from "node:assert/strict";
import test from "node:test";
import { calculateWbsScheduleUpdates } from "./wbs-schedule/calculate.js";
import { resolveWbsScheduleDateWrites, resolveWbsSchedulePatch } from "./wbs-schedule-patch.js";
import { applyTestScheduleUpdates, emptyPredecessors } from "./wbs-test-helpers.js";

test("resolveWbsSchedulePatch ignores stale duration from later full-row save after due date edit", () => {
  const existing = {
    startDate: new Date("2026-06-02T00:00:00.000Z"),
    dueDate: new Date("2026-06-05T00:00:00.000Z"),
    forecastStartDate: new Date("2026-06-02T00:00:00.000Z"),
    forecastDueDate: new Date("2026-06-05T00:00:00.000Z"),
    ...emptyPredecessors,
    leadLagDays: 0,
    workDays: 4,
    calendarDays: 4,
    calendarCode: "RU" as const,
  };

  const patch = resolveWbsSchedulePatch(
    {
      startDate: "2026-06-02",
      dueDate: "2026-06-05",
      forecastStartDate: "2026-06-02",
      forecastDueDate: "2026-06-05",
      workDays: 2,
      calendarDays: 2,
    },
    existing,
  );

  assert.equal(patch.staleDurationFromFullRowSave, true);
  assert.equal(patch.writeWorkDays, false);
  assert.equal(patch.writeCalendarDays, false);
  assert.deepEqual(patch.changedFields, []);
});

test("resolveWbsSchedulePatch treats edited due date as date-driven even with stale work days", () => {
  const existing = {
    startDate: new Date("2026-06-02T00:00:00.000Z"),
    dueDate: new Date("2026-06-03T00:00:00.000Z"),
    forecastStartDate: new Date("2026-06-02T00:00:00.000Z"),
    forecastDueDate: new Date("2026-06-03T00:00:00.000Z"),
    ...emptyPredecessors,
    leadLagDays: 0,
    workDays: 2,
    calendarDays: 2,
    calendarCode: "RU" as const,
  };

  const patch = resolveWbsSchedulePatch(
    {
      startDate: "2026-06-02",
      dueDate: "2026-06-05",
      forecastStartDate: "2026-06-02",
      forecastDueDate: "2026-06-05",
      workDays: 2,
      calendarDays: 2,
    },
    existing,
  );

  assert.equal(patch.scheduleDriver, "dates");
  assert.equal(patch.writeScheduleDates, true);
  assert.equal(patch.writeWorkDays, false);
  assert.deepEqual(patch.changedFields, ["dueDate", "forecastDueDate"]);
});

test("resolveWbsScheduleDateWrites mirrors edited visible due date over stale forecast due date", () => {
  const existing = {
    startDate: new Date("2026-06-02T00:00:00.000Z"),
    dueDate: new Date("2026-06-03T00:00:00.000Z"),
    forecastStartDate: new Date("2026-06-02T00:00:00.000Z"),
    forecastDueDate: new Date("2026-06-03T00:00:00.000Z"),
    ...emptyPredecessors,
    leadLagDays: 0,
    workDays: 2,
    calendarDays: 2,
    calendarCode: "RU" as const,
  };
  const patchPayload = {
    startDate: "2026-06-02",
    dueDate: "2026-06-05",
    forecastStartDate: "2026-06-02",
    forecastDueDate: "2026-06-03",
    workDays: 2,
    calendarDays: 2,
    scheduleDriver: "dates" as const,
  };

  const patch = resolveWbsSchedulePatch(patchPayload, existing);
  const writes = resolveWbsScheduleDateWrites(patchPayload, patch);

  assert.equal(patch.scheduleDriver, "dates");
  assert.equal(patch.writeWorkDays, false);
  assert.deepEqual(patch.changedFields, ["dueDate"]);
  assert.equal(writes.dueDate, "2026-06-05");
  assert.equal(writes.forecastDueDate, "2026-06-05");
});

test("WBS date edit survives stale full-row payload and recalculates duration", () => {
  const existingTask = {
    id: "task-a",
    code: "1.1.15",
    parentId: "phase",
    type: "TASK" as const,
    startDate: new Date("2026-06-02T00:00:00.000Z"),
    dueDate: new Date("2026-06-03T00:00:00.000Z"),
    forecastStartDate: new Date("2026-06-02T00:00:00.000Z"),
    forecastDueDate: new Date("2026-06-03T00:00:00.000Z"),
    ...emptyPredecessors,
    leadLagDays: 0,
    workDays: 2,
    calendarDays: 2,
    calendarCode: "RU" as const,
    sortOrder: 10,
  };
  const phase = {
    id: "phase",
    code: "1.1",
    type: "PHASE" as const,
    startDate: new Date("2026-06-02T00:00:00.000Z"),
    dueDate: new Date("2026-06-03T00:00:00.000Z"),
    forecastStartDate: new Date("2026-06-02T00:00:00.000Z"),
    forecastDueDate: new Date("2026-06-03T00:00:00.000Z"),
    ...emptyPredecessors,
    leadLagDays: 0,
    workDays: 2,
    calendarDays: 2,
    calendarCode: "RU" as const,
    sortOrder: 5,
  };
  const patchPayload = {
    startDate: "2026-06-02",
    dueDate: "2026-06-05",
    forecastStartDate: "2026-06-02",
    forecastDueDate: "2026-06-03",
    workDays: 2,
    calendarDays: 2,
    scheduleDriver: "dates" as const,
  };

  const patch = resolveWbsSchedulePatch(patchPayload, existingTask);
  const writes = resolveWbsScheduleDateWrites(patchPayload, patch);
  const taskAfterPatch = {
    ...existingTask,
    startDate: writes.startDate ? new Date(writes.startDate) : existingTask.startDate,
    dueDate: writes.dueDate ? new Date(writes.dueDate) : existingTask.dueDate,
    forecastStartDate: writes.forecastStartDate
      ? new Date(writes.forecastStartDate)
      : existingTask.forecastStartDate,
    forecastDueDate: writes.forecastDueDate
      ? new Date(writes.forecastDueDate)
      : existingTask.forecastDueDate,
  };

  const updates = calculateWbsScheduleUpdates([phase, taskAfterPatch], [], [], {
    changedItemId: "task-a",
    changedFields: patch.changedFields,
  });
  const taskUpdate = updates.find((item) => item.id === "task-a");
  const phaseUpdate = updates.find((item) => item.id === "phase");

  assert.equal(patch.scheduleDriver, "dates");
  assert.equal(patch.writeWorkDays, false);
  assert.deepEqual(patch.changedFields, ["dueDate"]);
  assert.equal(taskUpdate?.dueDate?.toISOString().slice(0, 10), "2026-06-05");
  assert.equal(taskUpdate?.forecastDueDate?.toISOString().slice(0, 10), "2026-06-05");
  assert.equal(taskUpdate?.workDays, 4);
  assert.equal(taskUpdate?.calendarDays, 4);
  assert.equal(phaseUpdate?.dueDate?.toISOString().slice(0, 10), "2026-06-05");
  assert.equal(phaseUpdate?.workDays, 4);
});

test("WBS bulk date edit keeps the requested 3.11.6 due date", () => {
  const predecessor = {
    id: "predecessor",
    code: "3.11.5",
    type: "TASK" as const,
    status: "DONE" as const,
    startDate: new Date("2026-07-07T00:00:00.000Z"),
    dueDate: new Date("2026-08-07T00:00:00.000Z"),
    forecastStartDate: new Date("2026-07-07T00:00:00.000Z"),
    forecastDueDate: new Date("2026-08-07T00:00:00.000Z"),
    ...emptyPredecessors,
    leadLagDays: 0,
    workDays: 24,
    calendarDays: 32,
    calendarCode: "CN" as const,
    sortOrder: 10,
  };
  const task = {
    id: "task-a",
    code: "3.11.6",
    type: "TASK" as const,
    status: "IN_PROGRESS" as const,
    startDate: new Date("2026-08-10T00:00:00.000Z"),
    dueDate: new Date("2026-08-13T00:00:00.000Z"),
    forecastStartDate: new Date("2026-08-10T00:00:00.000Z"),
    forecastDueDate: new Date("2026-08-13T00:00:00.000Z"),
    ...emptyPredecessors,
    predecessor3: "3.11.5",
    leadLagDays: 0,
    workDays: 16,
    calendarDays: 22,
    calendarCode: "CN" as const,
    sortOrder: 20,
  };

  const updates = calculateWbsScheduleUpdates(
    [predecessor, task],
    [
      {
        predecessorId: predecessor.id,
        successorId: task.id,
        type: "FS",
        lagDays: 0,
      },
    ],
    [],
    {
      changedItems: [
        {
          itemId: task.id,
          changedFields: ["dueDate", "forecastDueDate"],
        },
      ],
    },
  );
  const finalItems = applyTestScheduleUpdates([predecessor, task], updates);

  assert.equal(
    finalItems.find((item) => item.id === task.id)?.dueDate?.toISOString().slice(0, 10),
    "2026-08-13",
  );
  assert.equal(finalItems.find((item) => item.id === task.id)?.workDays, 4);
});

test("WBS due date edit remains stable after a late stale full-row save", () => {
  const existingTask = {
    id: "task-a",
    code: "1.1.15",
    parentId: "phase",
    type: "TASK" as const,
    startDate: new Date("2026-06-02T00:00:00.000Z"),
    dueDate: new Date("2026-06-03T00:00:00.000Z"),
    forecastStartDate: new Date("2026-06-02T00:00:00.000Z"),
    forecastDueDate: new Date("2026-06-03T00:00:00.000Z"),
    ...emptyPredecessors,
    leadLagDays: 0,
    workDays: 2,
    calendarDays: 2,
    calendarCode: "RU" as const,
    sortOrder: 10,
  };
  const phase = {
    id: "phase",
    code: "1.1",
    type: "PHASE" as const,
    startDate: new Date("2026-06-02T00:00:00.000Z"),
    dueDate: new Date("2026-06-03T00:00:00.000Z"),
    forecastStartDate: new Date("2026-06-02T00:00:00.000Z"),
    forecastDueDate: new Date("2026-06-03T00:00:00.000Z"),
    ...emptyPredecessors,
    leadLagDays: 0,
    workDays: 2,
    calendarDays: 2,
    calendarCode: "RU" as const,
    sortOrder: 5,
  };
  const dateEditPayload = {
    startDate: "2026-06-02",
    dueDate: "2026-06-05",
    forecastStartDate: "2026-06-02",
    forecastDueDate: "2026-06-03",
    workDays: 2,
    calendarDays: 2,
    scheduleDriver: "dates" as const,
  };

  const dateEditPatch = resolveWbsSchedulePatch(dateEditPayload, existingTask);
  const dateWrites = resolveWbsScheduleDateWrites(dateEditPayload, dateEditPatch);
  const taskAfterDatePatch = {
    ...existingTask,
    startDate: dateWrites.startDate
      ? new Date(dateWrites.startDate)
      : existingTask.startDate,
    dueDate: dateWrites.dueDate ? new Date(dateWrites.dueDate) : existingTask.dueDate,
    forecastStartDate: dateWrites.forecastStartDate
      ? new Date(dateWrites.forecastStartDate)
      : existingTask.forecastStartDate,
    forecastDueDate: dateWrites.forecastDueDate
      ? new Date(dateWrites.forecastDueDate)
      : existingTask.forecastDueDate,
  };
  const firstUpdates = calculateWbsScheduleUpdates([phase, taskAfterDatePatch], [], [], {
    changedItemId: "task-a",
    changedFields: dateEditPatch.changedFields,
  });
  const afterFirstSave = applyTestScheduleUpdates(
    [phase, taskAfterDatePatch],
    firstUpdates,
  );
  const savedTask = afterFirstSave.find((item) => item.id === "task-a");

  assert.equal(savedTask?.dueDate?.toISOString().slice(0, 10), "2026-06-05");
  assert.equal(savedTask?.forecastDueDate?.toISOString().slice(0, 10), "2026-06-05");
  assert.equal(savedTask?.workDays, 4);
  assert.equal(savedTask?.calendarDays, 4);

  const staleFullRowPatch = resolveWbsSchedulePatch(
    {
      startDate: "2026-06-02",
      dueDate: "2026-06-05",
      forecastStartDate: "2026-06-02",
      forecastDueDate: "2026-06-05",
      workDays: 2,
      calendarDays: 2,
    },
    savedTask,
  );
  const secondUpdates = calculateWbsScheduleUpdates(afterFirstSave, [], [], {
    changedItemId: "task-a",
    changedFields: staleFullRowPatch.changedFields,
  });
  const secondTaskUpdate = secondUpdates.find((item) => item.id === "task-a");

  assert.equal(staleFullRowPatch.staleDurationFromFullRowSave, true);
  assert.equal(staleFullRowPatch.writeWorkDays, false);
  assert.equal(staleFullRowPatch.writeCalendarDays, false);
  assert.equal(secondTaskUpdate, undefined);
});
