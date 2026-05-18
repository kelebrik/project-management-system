import assert from "node:assert/strict";
import test from "node:test";
import { calculateWbsScheduleUpdates } from "./wbs-schedule.js";
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

test("calculateWbsScheduleUpdates starts successor from latest predecessor plus one working day and lag", () => {
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
      leadLagDays: 1,
      workDays: 3,
      calendarDays: 1,
      calendarCode: "RU" as const,
      sortOrder: 30,
    },
  ];

  const updates = calculateWbsScheduleUpdates(items, [], []);
  const taskC = updates.find((item) => item.id === "task-c");

  assert.equal(taskC?.startDate?.toISOString().slice(0, 10), "2026-05-22");
  assert.equal(taskC?.dueDate?.toISOString().slice(0, 10), "2026-05-26");
  assert.equal(taskC?.calendarDays, 5);
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
