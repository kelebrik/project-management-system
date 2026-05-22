import assert from "node:assert/strict";
import test from "node:test";
import { calculateWbsCriticalPath } from "./wbs-critical-path.js";

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
