import assert from "node:assert/strict";
import test from "node:test";
import { calculateWbsScheduleUpdates } from "./wbs-schedule/calculate.js";
import { emptyPredecessors } from "./wbs-test-helpers.js";

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
