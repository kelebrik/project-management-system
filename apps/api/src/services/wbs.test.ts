import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateWbsBaselineVariance,
  calculateWbsScheduleUpdates,
} from "./wbs-schedule.js";
import {
  resolveWbsScheduleDateWrites,
  resolveWbsSchedulePatch,
} from "./wbs-schedule-patch.js";
import { buildWbsRenumberPlan, levelFromWbsCode } from "./wbs.js";

test("levelFromWbsCode reads hierarchy depth from dotted code", () => {
  assert.equal(levelFromWbsCode("1"), 1);
  assert.equal(levelFromWbsCode("1.2.3.4.5"), 5);
});

test("buildWbsRenumberPlan recalculates codes, parents and predecessor codes", () => {
  const items = [
    { id: "phase", code: "1", wbsLevel: 1 },
    { id: "package", code: "1.1", wbsLevel: 2 },
    { id: "task-a", code: "1.1.11", wbsLevel: 4 },
    { id: "task-b", code: "1.1.12", wbsLevel: 3 },
  ];
  const dependencies = [{ predecessorId: "task-a", successorId: "task-b" }];

  const plan = buildWbsRenumberPlan(items, dependencies);

  assert.deepEqual(plan.normalizedRows, [
    { id: "phase", level: 1, parentId: null, code: "1" },
    { id: "package", level: 2, parentId: "phase", code: "1.1" },
    { id: "task-a", level: 4, parentId: "package", code: "1.1.1.1" },
    { id: "task-b", level: 3, parentId: "package", code: "1.1.2" },
  ]);
  assert.deepEqual(plan.predecessorsBySuccessor.get("task-b"), ["1.1.1.1"]);
});

test("buildWbsRenumberPlan keeps up to six predecessor codes", () => {
  const items = [
    { id: "a", code: "1", wbsLevel: 1 },
    { id: "b", code: "2", wbsLevel: 1 },
    { id: "c", code: "3", wbsLevel: 1 },
    { id: "d", code: "4", wbsLevel: 1 },
    { id: "e", code: "5", wbsLevel: 1 },
    { id: "f", code: "6", wbsLevel: 1 },
    { id: "target", code: "7", wbsLevel: 1 },
  ];
  const dependencies = ["a", "b", "c", "d", "e", "f"].map(
    (predecessorId) => ({
      predecessorId,
      successorId: "target",
    }),
  );

  const plan = buildWbsRenumberPlan(items, dependencies);

  assert.deepEqual(plan.predecessorsBySuccessor.get("target"), [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
  ]);
});

const emptyPredecessors = {
  predecessor1: null,
  predecessor2: null,
  predecessor3: null,
  predecessor4: null,
  predecessor5: null,
  predecessor6: null,
};

function applyTestScheduleUpdates<T extends { id: string }>(
  items: T[],
  updates: ReturnType<typeof calculateWbsScheduleUpdates>,
) {
  const updatesById = new Map(updates.map((update) => [update.id, update]));
  return items.map((item) => {
    const update = updatesById.get(item.id);
    if (!update) return item;
    return {
      ...item,
      startDate: update.startDate,
      dueDate: update.dueDate,
      forecastStartDate: update.forecastStartDate,
      forecastDueDate: update.forecastDueDate,
      workDays: update.workDays,
      calendarDays: update.calendarDays,
    };
  });
}

test("calculateWbsScheduleUpdates starts successor from latest predecessor plus one working day and dependency lag", () => {
  const items = [
    {
      id: "task-a",
      code: "1.1",
      type: "TASK" as const,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-18T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 1,
      calendarDays: 1,
      calendarCode: "RU" as const,
      sortOrder: 10,
    },
    {
      id: "task-b",
      code: "1.2",
      type: "TASK" as const,
      startDate: new Date("2026-05-19T00:00:00.000Z"),
      dueDate: new Date("2026-05-20T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-19T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-20T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 2,
      calendarDays: 2,
      calendarCode: "RU" as const,
      sortOrder: 20,
    },
    {
      id: "task-c",
      code: "1.3",
      type: "TASK" as const,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-18T00:00:00.000Z"),
      predecessor1: "1.1",
      predecessor2: "1.2",
      predecessor3: null,
      predecessor4: null,
      predecessor5: null,
      predecessor6: null,
      leadLagDays: 30,
      workDays: 3,
      calendarDays: 1,
      calendarCode: "RU" as const,
      sortOrder: 30,
    },
  ];

  const updates = calculateWbsScheduleUpdates(
    items,
    [
      {
        predecessorId: "task-b",
        successorId: "task-c",
        lagDays: 1,
      },
    ],
    [],
  );
  const taskC = updates.find((item) => item.id === "task-c");

  assert.equal(taskC?.startDate?.toISOString().slice(0, 10), "2026-05-22");
  assert.equal(taskC?.dueDate?.toISOString().slice(0, 10), "2026-05-26");
  assert.equal(taskC?.calendarDays, 5);
});

test("calculateWbsScheduleUpdates derives empty work days from dates", () => {
  const items = [
    {
      id: "task-a",
      code: "1.1",
      type: "TASK" as const,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-22T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-22T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: null,
      calendarDays: 5,
      calendarCode: "RU" as const,
      sortOrder: 10,
    },
  ];

  const updates = calculateWbsScheduleUpdates(items, [], []);
  const taskA = updates.find((item) => item.id === "task-a");

  assert.equal(taskA?.workDays, 5);
  assert.equal(taskA?.dueDate?.toISOString().slice(0, 10), "2026-05-22");
  assert.equal(taskA?.calendarDays, 5);
});

test("calculateWbsScheduleUpdates uses work days to calculate due date", () => {
  const items = [
    {
      id: "task-a",
      code: "1.1",
      type: "TASK" as const,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-18T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 5,
      calendarDays: 1,
      calendarCode: "RU" as const,
      sortOrder: 10,
    },
  ];

  const updates = calculateWbsScheduleUpdates(items, [], []);
  const taskA = updates.find((item) => item.id === "task-a");

  assert.equal(taskA?.dueDate?.toISOString().slice(0, 10), "2026-05-22");
  assert.equal(taskA?.workDays, 5);
  assert.equal(taskA?.calendarDays, 5);
});

test("calculateWbsScheduleUpdates recalculates work days when dates are edited", () => {
  const items = [
    {
      id: "task-a",
      code: "1.1",
      type: "TASK" as const,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-22T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-22T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 2,
      calendarDays: 5,
      calendarCode: "RU" as const,
      sortOrder: 10,
    },
  ];

  const updates = calculateWbsScheduleUpdates(items, [], [], {
    changedItemId: "task-a",
    changedFields: ["dueDate"],
  });
  const taskA = updates.find((item) => item.id === "task-a");

  assert.equal(taskA?.workDays, 5);
  assert.equal(taskA?.dueDate?.toISOString().slice(0, 10), "2026-05-22");
});

test("calculateWbsScheduleUpdates keeps edited due date when stale work days are still in payload", () => {
  const items = [
    {
      id: "task-a",
      code: "1.1.15",
      type: "TASK" as const,
      startDate: new Date("2026-06-02T00:00:00.000Z"),
      dueDate: new Date("2026-06-05T00:00:00.000Z"),
      forecastStartDate: new Date("2026-06-02T00:00:00.000Z"),
      forecastDueDate: new Date("2026-06-05T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 2,
      calendarDays: 2,
      calendarCode: "RU" as const,
      sortOrder: 10,
    },
    {
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
    },
  ];

  const updates = calculateWbsScheduleUpdates(items, [], [], {
    changedItemId: "task-a",
    changedFields: ["dueDate"],
  });
  const taskA = updates.find((item) => item.id === "task-a");

  assert.equal(taskA?.dueDate?.toISOString().slice(0, 10), "2026-06-05");
  assert.equal(taskA?.workDays, 4);
  assert.equal(taskA?.calendarDays, 4);
});

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

test("calculateWbsScheduleUpdates starts from latest predecessor when several predecessor fields are filled", () => {
  const items = [
    {
      id: "task-a",
      code: "1.3",
      type: "TASK" as const,
      startDate: new Date("2026-02-12T00:00:00.000Z"),
      dueDate: new Date("2026-02-13T00:00:00.000Z"),
      forecastStartDate: new Date("2026-02-12T00:00:00.000Z"),
      forecastDueDate: new Date("2026-02-13T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 2,
      calendarDays: 2,
      calendarCode: "RU" as const,
      sortOrder: 10,
    },
    {
      id: "task-b",
      code: "1.4",
      type: "TASK" as const,
      startDate: new Date("2026-02-16T00:00:00.000Z"),
      dueDate: new Date("2026-02-20T00:00:00.000Z"),
      forecastStartDate: new Date("2026-02-16T00:00:00.000Z"),
      forecastDueDate: new Date("2026-02-20T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 5,
      calendarDays: 5,
      calendarCode: "RU" as const,
      sortOrder: 20,
    },
    {
      id: "task-c",
      code: "1.5",
      type: "TASK" as const,
      startDate: new Date("2026-02-16T00:00:00.000Z"),
      dueDate: new Date("2026-02-16T00:00:00.000Z"),
      forecastStartDate: new Date("2026-02-16T00:00:00.000Z"),
      forecastDueDate: new Date("2026-02-16T00:00:00.000Z"),
      predecessor1: "1.3",
      predecessor2: "1.4",
      predecessor3: null,
      predecessor4: null,
      predecessor5: null,
      predecessor6: null,
      leadLagDays: 30,
      workDays: 1,
      calendarDays: 1,
      calendarCode: "RU" as const,
      sortOrder: 30,
    },
  ];

  const updates = calculateWbsScheduleUpdates(items, [], []);
  const taskC = updates.find((item) => item.id === "task-c");

  assert.equal(taskC?.startDate?.toISOString().slice(0, 10), "2026-02-23");
  assert.equal(taskC?.dueDate?.toISOString().slice(0, 10), "2026-02-23");
});

test("calculateWbsScheduleUpdates supports start-to-start dependencies", () => {
  const items = [
    {
      id: "task-a",
      code: "1.1",
      type: "TASK" as const,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-22T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-22T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 5,
      calendarDays: 5,
      calendarCode: "RU" as const,
      sortOrder: 10,
    },
    {
      id: "task-b",
      code: "1.2",
      type: "TASK" as const,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-18T00:00:00.000Z"),
      predecessor1: "1.1",
      predecessor2: null,
      predecessor3: null,
      predecessor4: null,
      predecessor5: null,
      predecessor6: null,
      leadLagDays: 0,
      workDays: 2,
      calendarDays: 1,
      calendarCode: "RU" as const,
      sortOrder: 20,
    },
  ];

  const updates = calculateWbsScheduleUpdates(
    items,
    [
      {
        predecessorId: "task-a",
        successorId: "task-b",
        type: "SS",
        lagDays: 2,
      },
    ],
    [],
  );
  const taskB = updates.find((item) => item.id === "task-b");

  assert.equal(taskB?.startDate?.toISOString().slice(0, 10), "2026-05-20");
  assert.equal(taskB?.dueDate?.toISOString().slice(0, 10), "2026-05-21");
});

test("calculateWbsScheduleUpdates supports finish-to-finish dependencies", () => {
  const items = [
    {
      id: "task-a",
      code: "1.1",
      type: "TASK" as const,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-22T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-22T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 5,
      calendarDays: 5,
      calendarCode: "RU" as const,
      sortOrder: 10,
    },
    {
      id: "task-b",
      code: "1.2",
      type: "TASK" as const,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-19T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-19T00:00:00.000Z"),
      predecessor1: "1.1",
      predecessor2: null,
      predecessor3: null,
      predecessor4: null,
      predecessor5: null,
      predecessor6: null,
      leadLagDays: 0,
      workDays: 3,
      calendarDays: 2,
      calendarCode: "RU" as const,
      sortOrder: 20,
    },
  ];

  const updates = calculateWbsScheduleUpdates(
    items,
    [
      {
        predecessorId: "task-a",
        successorId: "task-b",
        type: "FF",
        lagDays: 1,
      },
    ],
    [],
  );
  const taskB = updates.find((item) => item.id === "task-b");

  assert.equal(taskB?.startDate?.toISOString().slice(0, 10), "2026-05-21");
  assert.equal(taskB?.dueDate?.toISOString().slice(0, 10), "2026-05-25");
});

test("calculateWbsScheduleUpdates supports start-to-finish dependencies", () => {
  const items = [
    {
      id: "task-a",
      code: "1.1",
      type: "TASK" as const,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-22T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-22T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 5,
      calendarDays: 5,
      calendarCode: "RU" as const,
      sortOrder: 10,
    },
    {
      id: "task-b",
      code: "1.2",
      type: "TASK" as const,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-18T00:00:00.000Z"),
      predecessor1: "1.1",
      predecessor2: null,
      predecessor3: null,
      predecessor4: null,
      predecessor5: null,
      predecessor6: null,
      leadLagDays: 0,
      workDays: 3,
      calendarDays: 1,
      calendarCode: "RU" as const,
      sortOrder: 20,
    },
  ];

  const updates = calculateWbsScheduleUpdates(
    items,
    [
      {
        predecessorId: "task-a",
        successorId: "task-b",
        type: "SF",
        lagDays: 4,
      },
    ],
    [],
  );
  const taskB = updates.find((item) => item.id === "task-b");

  assert.equal(taskB?.startDate?.toISOString().slice(0, 10), "2026-05-20");
  assert.equal(taskB?.dueDate?.toISOString().slice(0, 10), "2026-05-22");
});

test("calculateWbsScheduleUpdates uses selected project calendar overrides", () => {
  const items = [
    {
      id: "task-a",
      code: "1.1",
      type: "TASK" as const,
      startDate: new Date("2026-05-22T00:00:00.000Z"),
      dueDate: new Date("2026-05-22T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-22T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-22T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 1,
      calendarDays: 1,
      calendarCode: "RU" as const,
      sortOrder: 10,
    },
    {
      id: "task-b",
      code: "1.2",
      type: "TASK" as const,
      startDate: new Date("2026-05-25T00:00:00.000Z"),
      dueDate: new Date("2026-05-25T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-25T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-25T00:00:00.000Z"),
      predecessor1: "1.1",
      predecessor2: null,
      predecessor3: null,
      predecessor4: null,
      predecessor5: null,
      predecessor6: null,
      leadLagDays: 0,
      workDays: 1,
      calendarDays: 1,
      calendarCode: "CN" as const,
      sortOrder: 20,
    },
  ];

  const updates = calculateWbsScheduleUpdates(items, [], [
    {
      calendarCode: "CN",
      date: new Date("2026-05-23T00:00:00.000Z"),
      isWorkingDay: true,
    },
  ]);
  const taskB = updates.find((item) => item.id === "task-b");

  assert.equal(taskB?.startDate?.toISOString().slice(0, 10), "2026-05-23");
  assert.equal(taskB?.dueDate?.toISOString().slice(0, 10), "2026-05-23");
  assert.equal(taskB?.calendarDays, 1);
});

test("calculateWbsScheduleUpdates calculates dates with different RU and CN calendars", () => {
  const items = [
    {
      id: "ru-predecessor",
      code: "1.1",
      type: "TASK" as const,
      startDate: new Date("2026-05-15T00:00:00.000Z"),
      dueDate: new Date("2026-05-15T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-15T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-15T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 1,
      calendarDays: 1,
      calendarCode: "RU" as const,
      sortOrder: 10,
    },
    {
      id: "ru-successor",
      code: "1.2",
      type: "TASK" as const,
      startDate: new Date("2026-05-19T00:00:00.000Z"),
      dueDate: new Date("2026-05-19T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-19T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-19T00:00:00.000Z"),
      predecessor1: "1.1",
      predecessor2: null,
      predecessor3: null,
      predecessor4: null,
      predecessor5: null,
      predecessor6: null,
      leadLagDays: 0,
      workDays: 1,
      calendarDays: 1,
      calendarCode: "RU" as const,
      sortOrder: 20,
    },
    {
      id: "cn-successor",
      code: "1.3",
      type: "TASK" as const,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-18T00:00:00.000Z"),
      predecessor1: "1.1",
      predecessor2: null,
      predecessor3: null,
      predecessor4: null,
      predecessor5: null,
      predecessor6: null,
      leadLagDays: 0,
      workDays: 1,
      calendarDays: 1,
      calendarCode: "CN" as const,
      sortOrder: 30,
    },
  ];

  const updates = calculateWbsScheduleUpdates(items, [], [
    {
      calendarCode: "CN",
      date: new Date("2026-05-16T00:00:00.000Z"),
      isWorkingDay: true,
    },
  ]);
  const ruSuccessor = updates.find((item) => item.id === "ru-successor");
  const cnSuccessor = updates.find((item) => item.id === "cn-successor");

  assert.equal(ruSuccessor?.startDate?.toISOString().slice(0, 10), "2026-05-18");
  assert.equal(ruSuccessor?.calendarDays, 1);
  assert.equal(cnSuccessor?.startDate?.toISOString().slice(0, 10), "2026-05-16");
  assert.equal(cnSuccessor?.calendarDays, 1);
});

test("calculateWbsScheduleUpdates aggregates phase and work package dates from children", () => {
  const items = [
    {
      id: "phase",
      parentId: null,
      code: "1",
      type: "PHASE" as const,
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      dueDate: new Date("2026-05-01T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-01T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-01T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: null,
      calendarDays: 1,
      calendarCode: "RU" as const,
      wbsLevel: 1,
      sortOrder: 10,
    },
    {
      id: "package",
      parentId: "phase",
      code: "1.1",
      type: "WORK_PACKAGE" as const,
      startDate: new Date("2026-05-02T00:00:00.000Z"),
      dueDate: new Date("2026-05-02T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-02T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-02T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: null,
      calendarDays: 1,
      calendarCode: "RU" as const,
      wbsLevel: 2,
      sortOrder: 20,
    },
    {
      id: "task-a",
      parentId: "package",
      code: "1.1.1",
      type: "TASK" as const,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-20T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-20T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: null,
      calendarDays: 3,
      calendarCode: "RU" as const,
      wbsLevel: 3,
      sortOrder: 30,
    },
    {
      id: "task-b",
      parentId: "package",
      code: "1.1.2",
      type: "TASK" as const,
      startDate: new Date("2026-05-25T00:00:00.000Z"),
      dueDate: new Date("2026-05-29T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-25T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-29T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 5,
      calendarDays: 5,
      calendarCode: "RU" as const,
      wbsLevel: 3,
      sortOrder: 40,
    },
  ];

  const updates = calculateWbsScheduleUpdates(items, [], []);
  const phase = updates.find((item) => item.id === "phase");
  const workPackage = updates.find((item) => item.id === "package");
  const taskA = updates.find((item) => item.id === "task-a");

  assert.equal(taskA?.workDays, 3);
  assert.equal(workPackage?.startDate?.toISOString().slice(0, 10), "2026-05-18");
  assert.equal(workPackage?.dueDate?.toISOString().slice(0, 10), "2026-05-29");
  assert.equal(workPackage?.workDays, 10);
  assert.equal(workPackage?.calendarDays, 12);
  assert.equal(phase?.startDate?.toISOString().slice(0, 10), "2026-05-18");
  assert.equal(phase?.dueDate?.toISOString().slice(0, 10), "2026-05-29");
  assert.equal(phase?.workDays, 10);
  assert.equal(phase?.calendarDays, 12);
});

test("calculateWbsScheduleUpdates derives hierarchy work days from aggregated dates", () => {
  const items = [
    {
      id: "phase",
      code: "1",
      type: "PHASE" as const,
      startDate: null,
      dueDate: null,
      forecastStartDate: null,
      forecastDueDate: null,
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: null,
      calendarDays: null,
      calendarCode: "RU" as const,
      wbsLevel: 1,
      sortOrder: 10,
    },
    {
      id: "package",
      parentId: "phase",
      code: "1.1",
      type: "WORK_PACKAGE" as const,
      startDate: null,
      dueDate: null,
      forecastStartDate: null,
      forecastDueDate: null,
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 99,
      calendarDays: null,
      calendarCode: "RU" as const,
      wbsLevel: 2,
      sortOrder: 20,
    },
    {
      id: "task-a",
      parentId: "package",
      code: "1.1.1",
      type: "TASK" as const,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-20T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-18T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-20T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 3,
      calendarDays: 3,
      calendarCode: "RU" as const,
      wbsLevel: 3,
      sortOrder: 30,
    },
    {
      id: "task-b",
      parentId: "package",
      code: "1.1.2",
      type: "TASK" as const,
      startDate: new Date("2026-05-22T00:00:00.000Z"),
      dueDate: new Date("2026-05-22T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-22T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-22T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 1,
      calendarDays: 1,
      calendarCode: "RU" as const,
      wbsLevel: 3,
      sortOrder: 40,
    },
    {
      id: "standalone-task",
      parentId: "phase",
      code: "1.2",
      type: "TASK" as const,
      startDate: new Date("2026-05-25T00:00:00.000Z"),
      dueDate: new Date("2026-05-26T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-25T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-26T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 2,
      calendarDays: 2,
      calendarCode: "RU" as const,
      wbsLevel: 2,
      sortOrder: 50,
    },
  ];

  const updates = calculateWbsScheduleUpdates(items, [], []);
  const phase = updates.find((item) => item.id === "phase");
  const workPackage = updates.find((item) => item.id === "package");

  assert.equal(workPackage?.startDate?.toISOString().slice(0, 10), "2026-05-18");
  assert.equal(workPackage?.dueDate?.toISOString().slice(0, 10), "2026-05-22");
  assert.equal(workPackage?.workDays, 5);
  assert.equal(phase?.startDate?.toISOString().slice(0, 10), "2026-05-18");
  assert.equal(phase?.dueDate?.toISOString().slice(0, 10), "2026-05-26");
  assert.equal(phase?.workDays, 7);
});

test("calculateWbsScheduleUpdates propagates aggregated package dates to successors", () => {
  const items = [
    {
      id: "package",
      parentId: null,
      code: "1.1",
      type: "WORK_PACKAGE" as const,
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      dueDate: new Date("2026-05-01T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-01T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-01T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 1,
      calendarDays: 1,
      calendarCode: "RU" as const,
      wbsLevel: 2,
      sortOrder: 10,
    },
    {
      id: "child",
      parentId: "package",
      code: "1.1.1",
      type: "TASK" as const,
      startDate: new Date("2026-05-25T00:00:00.000Z"),
      dueDate: new Date("2026-05-29T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-25T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-29T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 5,
      calendarDays: 5,
      calendarCode: "RU" as const,
      wbsLevel: 3,
      sortOrder: 20,
    },
    {
      id: "successor",
      parentId: null,
      code: "1.2",
      type: "TASK" as const,
      startDate: new Date("2026-05-04T00:00:00.000Z"),
      dueDate: new Date("2026-05-04T00:00:00.000Z"),
      forecastStartDate: new Date("2026-05-04T00:00:00.000Z"),
      forecastDueDate: new Date("2026-05-04T00:00:00.000Z"),
      predecessor1: "1.1",
      predecessor2: null,
      predecessor3: null,
      predecessor4: null,
      predecessor5: null,
      predecessor6: null,
      leadLagDays: 0,
      workDays: 1,
      calendarDays: 1,
      calendarCode: "RU" as const,
      wbsLevel: 2,
      sortOrder: 30,
    },
  ];

  const updates = calculateWbsScheduleUpdates(items, [], []);
  const workPackage = updates.find((item) => item.id === "package");
  const successor = updates.find((item) => item.id === "successor");

  assert.equal(workPackage?.dueDate?.toISOString().slice(0, 10), "2026-05-29");
  assert.equal(successor?.startDate?.toISOString().slice(0, 10), "2026-06-01");
  assert.equal(successor?.dueDate?.toISOString().slice(0, 10), "2026-06-01");
});

test("calculateWbsBaselineVariance reports only root schedule deviations", () => {
  const variance = calculateWbsBaselineVariance(
    [
      {
        id: "sync-codebase",
        code: "3.5.1",
        title: "Синк новой кодобазы",
        type: "TASK" as const,
        baselineDueDate: new Date("2026-05-08T00:00:00.000Z"),
        dueDate: new Date("2026-06-12T00:00:00.000Z"),
        sortOrder: 10,
      },
      {
        id: "troubleshooting",
        code: "3.5.3",
        title: "Первичный траблшутинг",
        type: "TASK" as const,
        baselineDueDate: new Date("2026-05-22T00:00:00.000Z"),
        dueDate: new Date("2026-06-26T00:00:00.000Z"),
        predecessor1: "3.5.1",
        sortOrder: 20,
      },
      {
        id: "ambient",
        code: "3.3.1.1",
        title: "Требования Ambient",
        type: "TASK" as const,
        baselineDueDate: new Date("2026-05-25T00:00:00.000Z"),
        dueDate: new Date("2026-06-19T00:00:00.000Z"),
        sortOrder: 30,
      },
      {
        id: "regression-planning",
        code: "3.8.1",
        title: "Планирование регрессионных тестов",
        type: "TASK" as const,
        baselineDueDate: new Date("2026-08-06T00:00:00.000Z"),
        dueDate: new Date("2026-08-13T00:00:00.000Z"),
        sortOrder: 40,
      },
      {
        id: "regression-fix",
        code: "3.8.7",
        title: "Исправления по регрессу",
        type: "TASK" as const,
        baselineDueDate: new Date("2026-08-28T00:00:00.000Z"),
        dueDate: new Date("2026-09-04T00:00:00.000Z"),
        predecessor1: "3.8.1",
        sortOrder: 50,
      },
    ],
    [],
  );

  assert.equal(variance.scheduleVarianceDays, 35);
  assert.deepEqual(
    variance.rootCauses.map((entry) => [entry.item.code, entry.delayDays]),
    [
      ["3.5.1", 35],
      ["3.3.1.1", 25],
      ["3.8.1", 7],
    ],
  );
  assert.equal(
    variance.rootCauses.some((entry) => entry.item.code === "3.5.3"),
    false,
  );
  assert.equal(
    variance.rootCauses.some((entry) => entry.item.code === "3.8.7"),
    false,
  );
});

test("calculateWbsBaselineVariance subtracts inherited predecessor shift from successor delay", () => {
  const variance = calculateWbsBaselineVariance(
    [
      {
        id: "predecessor",
        code: "1.1",
        type: "TASK" as const,
        baselineDueDate: new Date("2026-05-01T00:00:00.000Z"),
        dueDate: new Date("2026-05-06T00:00:00.000Z"),
        sortOrder: 10,
      },
      {
        id: "successor",
        code: "1.2",
        type: "TASK" as const,
        baselineDueDate: new Date("2026-05-10T00:00:00.000Z"),
        dueDate: new Date("2026-05-18T00:00:00.000Z"),
        predecessor1: "1.1",
        sortOrder: 20,
      },
    ],
    [],
  );

  assert.deepEqual(
    variance.rootCauses.map((entry) => ({
      code: entry.item.code,
      delayDays: entry.delayDays,
      rawDelayDays: entry.rawDelayDays,
      inheritedDelayDays: entry.inheritedDelayDays,
      inheritedFrom: entry.inheritedFrom?.code ?? null,
    })),
    [
      {
        code: "1.1",
        delayDays: 5,
        rawDelayDays: 5,
        inheritedDelayDays: 0,
        inheritedFrom: null,
      },
      {
        code: "1.2",
        delayDays: 3,
        rawDelayDays: 8,
        inheritedDelayDays: 5,
        inheritedFrom: "1.1",
      },
    ],
  );
});
