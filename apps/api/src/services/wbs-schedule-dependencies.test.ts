import assert from "node:assert/strict";
import test from "node:test";
import { calculateWbsScheduleUpdates } from "./wbs-schedule/calculate.js";
import { emptyPredecessors } from "./wbs-test-helpers.js";

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
