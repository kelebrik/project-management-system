import assert from "node:assert/strict";
import test from "node:test";
import { calculateWbsScheduleUpdates } from "./wbs-schedule/calculate.js";
import { applyTestScheduleUpdates, emptyPredecessors } from "./wbs-test-helpers.js";

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

test("calculateWbsScheduleUpdates recalculates goal dates like milestone dates", () => {
  const items = [
    {
      id: "task-a",
      code: "1.1",
      type: "TASK" as const,
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      dueDate: new Date("2026-06-05T00:00:00.000Z"),
      forecastStartDate: new Date("2026-06-01T00:00:00.000Z"),
      forecastDueDate: new Date("2026-06-05T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 5,
      calendarDays: 5,
      calendarCode: "RU" as const,
      sortOrder: 10,
    },
    {
      id: "goal",
      code: "1.2",
      type: "GOAL" as const,
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      dueDate: new Date("2026-06-01T00:00:00.000Z"),
      forecastStartDate: new Date("2026-06-01T00:00:00.000Z"),
      forecastDueDate: new Date("2026-06-01T00:00:00.000Z"),
      predecessor1: "1.1",
      predecessor2: null,
      predecessor3: null,
      predecessor4: null,
      predecessor5: null,
      predecessor6: null,
      leadLagDays: 0,
      workDays: 0,
      calendarDays: 1,
      calendarCode: "RU" as const,
      sortOrder: 20,
    },
  ];

  const updates = calculateWbsScheduleUpdates(items, [], []);
  const goal = updates.find((item) => item.id === "goal");

  assert.equal(goal?.startDate?.toISOString().slice(0, 10), "2026-06-08");
  assert.equal(goal?.dueDate?.toISOString().slice(0, 10), "2026-06-08");
  assert.equal(goal?.forecastStartDate?.toISOString().slice(0, 10), "2026-06-08");
  assert.equal(goal?.forecastDueDate?.toISOString().slice(0, 10), "2026-06-08");
  assert.equal(goal?.workDays, 0);
  assert.equal(goal?.calendarDays, 1);
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

test("calculateWbsScheduleUpdates sets cancelled task work days to zero", () => {
  const items = [
    {
      id: "task-a",
      code: "1.1",
      type: "TASK" as const,
      status: "CANCELLED" as const,
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
  ];

  const updates = calculateWbsScheduleUpdates(items, [], []);
  const taskA = updates.find((item) => item.id === "task-a");

  assert.equal(taskA?.startDate?.toISOString().slice(0, 10), "2026-05-18");
  assert.equal(taskA?.dueDate?.toISOString().slice(0, 10), "2026-05-18");
  assert.equal(taskA?.workDays, 0);
  assert.equal(taskA?.calendarDays, 1);
});

test("calculateWbsScheduleUpdates skips cancelled predecessors in finish-start chains", () => {
  const items = [
    {
      id: "task-a",
      code: "1.1",
      type: "TASK" as const,
      status: "DONE" as const,
      startDate: new Date("2026-06-08T00:00:00.000Z"),
      dueDate: new Date("2026-06-10T00:00:00.000Z"),
      forecastStartDate: new Date("2026-06-08T00:00:00.000Z"),
      forecastDueDate: new Date("2026-06-10T00:00:00.000Z"),
      ...emptyPredecessors,
      leadLagDays: 0,
      workDays: 3,
      calendarDays: 3,
      calendarCode: "RU" as const,
      sortOrder: 10,
    },
    {
      id: "task-b",
      code: "1.2",
      type: "TASK" as const,
      status: "CANCELLED" as const,
      startDate: new Date("2026-06-11T00:00:00.000Z"),
      dueDate: new Date("2026-06-12T00:00:00.000Z"),
      forecastStartDate: new Date("2026-06-11T00:00:00.000Z"),
      forecastDueDate: new Date("2026-06-12T00:00:00.000Z"),
      predecessor1: "1.1",
      predecessor2: null,
      predecessor3: null,
      predecessor4: null,
      predecessor5: null,
      predecessor6: null,
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
      status: "NOT_STARTED" as const,
      startDate: new Date("2026-06-11T00:00:00.000Z"),
      dueDate: new Date("2026-06-15T00:00:00.000Z"),
      forecastStartDate: new Date("2026-06-11T00:00:00.000Z"),
      forecastDueDate: new Date("2026-06-15T00:00:00.000Z"),
      predecessor1: "1.2",
      predecessor2: null,
      predecessor3: null,
      predecessor4: null,
      predecessor5: null,
      predecessor6: null,
      leadLagDays: 0,
      workDays: 3,
      calendarDays: 5,
      calendarCode: "RU" as const,
      sortOrder: 30,
    },
  ];

  const updates = calculateWbsScheduleUpdates(items, [], []);
  const taskB = updates.find((item) => item.id === "task-b");
  const finalItems = applyTestScheduleUpdates(items, updates);
  const taskC = finalItems.find((item) => item.id === "task-c");

  assert.equal(taskB?.startDate?.toISOString().slice(0, 10), "2026-06-10");
  assert.equal(taskB?.dueDate?.toISOString().slice(0, 10), "2026-06-10");
  assert.equal(taskB?.workDays, 0);
  assert.equal(taskC?.startDate?.toISOString().slice(0, 10), "2026-06-11");
  assert.equal(taskC?.dueDate?.toISOString().slice(0, 10), "2026-06-15");
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
