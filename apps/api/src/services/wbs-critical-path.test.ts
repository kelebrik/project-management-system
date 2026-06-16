import assert from "node:assert/strict";
import test from "node:test";
import { calculateWbsCriticalPath } from "./wbs-critical-path/calculate.js";

const baseItem = {
  type: "TASK" as const,
  calendarCode: "RU" as const,
};

test("calculateWbsCriticalPath marks the longest dependency chain as critical", () => {
  const items = [
    {
      id: "a",
      code: "1.1",
      title: "A",
      ...baseItem,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-18T00:00:00.000Z"),
      workDays: 1,
      sortOrder: 10,
    },
    {
      id: "b",
      code: "1.2",
      title: "B",
      ...baseItem,
      startDate: new Date("2026-05-19T00:00:00.000Z"),
      dueDate: new Date("2026-05-22T00:00:00.000Z"),
      workDays: 4,
      sortOrder: 20,
    },
    {
      id: "c",
      code: "1.3",
      title: "C",
      ...baseItem,
      startDate: new Date("2026-05-25T00:00:00.000Z"),
      dueDate: new Date("2026-05-25T00:00:00.000Z"),
      workDays: 1,
      sortOrder: 30,
    },
    {
      id: "d",
      code: "1.4",
      title: "D",
      ...baseItem,
      startDate: new Date("2026-05-19T00:00:00.000Z"),
      dueDate: new Date("2026-05-19T00:00:00.000Z"),
      workDays: 1,
      sortOrder: 40,
    },
  ];

  const result = calculateWbsCriticalPath(
    items,
    [
      {
        id: "a-b",
        predecessorId: "a",
        successorId: "b",
        type: "FS",
        lagDays: 0,
      },
      {
        id: "b-c",
        predecessorId: "b",
        successorId: "c",
        type: "FS",
        lagDays: 0,
      },
      {
        id: "a-d",
        predecessorId: "a",
        successorId: "d",
        type: "FS",
        lagDays: 0,
      },
    ],
    [],
  );

  assert.deepEqual(result.criticalItemIds, ["a", "b", "c"]);
  assert.deepEqual(result.criticalDependencyIds, ["a-b", "b-c"]);
  assert.equal(result.items.find((item) => item.itemId === "d")?.totalFloatWorkDays, 4);
});

test("calculateWbsCriticalPath supports start-to-start dependencies with lag", () => {
  const items = [
    {
      id: "a",
      code: "1.1",
      title: "A",
      ...baseItem,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-22T00:00:00.000Z"),
      workDays: 5,
      sortOrder: 10,
    },
    {
      id: "b",
      code: "1.2",
      title: "B",
      ...baseItem,
      startDate: new Date("2026-05-20T00:00:00.000Z"),
      dueDate: new Date("2026-05-22T00:00:00.000Z"),
      workDays: 3,
      sortOrder: 20,
    },
  ];

  const result = calculateWbsCriticalPath(
    items,
    [
      {
        id: "a-b",
        predecessorId: "a",
        successorId: "b",
        type: "SS",
        lagDays: 2,
      },
    ],
    [],
  );

  const successor = result.items.find((item) => item.itemId === "b");
  assert.equal(successor?.earlyStartDate.toISOString().slice(0, 10), "2026-05-20");
  assert.deepEqual(result.criticalDependencyIds, ["a-b"]);
});

test("calculateWbsCriticalPath includes predecessor fields in upstream critical chain", () => {
  const items = [
    {
      id: "a",
      code: "1.1",
      title: "A",
      ...baseItem,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-18T00:00:00.000Z"),
      workDays: 1,
      sortOrder: 10,
    },
    {
      id: "b",
      code: "1.2",
      title: "B",
      ...baseItem,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-29T00:00:00.000Z"),
      workDays: 10,
      sortOrder: 20,
    },
    {
      id: "c",
      code: "1.3",
      title: "C",
      ...baseItem,
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      dueDate: new Date("2026-06-05T00:00:00.000Z"),
      workDays: 5,
      sortOrder: 30,
      predecessor1: "1.1",
      predecessor2: "1.2",
    },
  ];

  const result = calculateWbsCriticalPath(items, [], []);

  assert.deepEqual(result.criticalItemIds, ["a", "b", "c"]);
  assert.deepEqual(result.criticalDependencyIds.sort(), ["field:a:c", "field:b:c"]);
});

test("calculateWbsCriticalPath keeps every upstream predecessor of a critical merge task", () => {
  const items = [
    {
      id: "a1",
      code: "1.1",
      title: "A1",
      ...baseItem,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-18T00:00:00.000Z"),
      workDays: 1,
      sortOrder: 10,
    },
    {
      id: "a2",
      code: "1.2",
      title: "A2",
      ...baseItem,
      startDate: new Date("2026-05-19T00:00:00.000Z"),
      dueDate: new Date("2026-05-19T00:00:00.000Z"),
      workDays: 1,
      predecessor1: "1.1",
      sortOrder: 20,
    },
    {
      id: "b1",
      code: "2.1",
      title: "B1",
      ...baseItem,
      startDate: new Date("2026-05-18T00:00:00.000Z"),
      dueDate: new Date("2026-05-29T00:00:00.000Z"),
      workDays: 10,
      sortOrder: 30,
    },
    {
      id: "b2",
      code: "2.2",
      title: "B2",
      ...baseItem,
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      dueDate: new Date("2026-06-01T00:00:00.000Z"),
      workDays: 1,
      predecessor1: "2.1",
      sortOrder: 40,
    },
    {
      id: "merge",
      code: "3.8.1",
      title: "Merge",
      ...baseItem,
      startDate: new Date("2026-06-02T00:00:00.000Z"),
      dueDate: new Date("2026-06-05T00:00:00.000Z"),
      workDays: 4,
      predecessor1: "1.2",
      predecessor2: "2.2",
      sortOrder: 50,
    },
    {
      id: "finish",
      code: "3.8.2",
      title: "Finish",
      ...baseItem,
      startDate: new Date("2026-06-08T00:00:00.000Z"),
      dueDate: new Date("2026-06-08T00:00:00.000Z"),
      workDays: 1,
      predecessor1: "3.8.1",
      sortOrder: 60,
    },
  ];

  const result = calculateWbsCriticalPath(items, [], []);

  assert.deepEqual(result.criticalItemIds, [
    "a1",
    "a2",
    "b1",
    "b2",
    "merge",
    "finish",
  ]);
  assert.deepEqual(result.criticalDependencyIds.sort(), [
    "field:a1:a2",
    "field:a2:merge",
    "field:b1:b2",
    "field:b2:merge",
    "field:merge:finish",
  ]);
});
