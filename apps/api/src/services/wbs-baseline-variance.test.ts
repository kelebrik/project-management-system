import assert from "node:assert/strict";
import test from "node:test";
import { calculateWbsBaselineVariance } from "./wbs-schedule/baseline-variance.js";

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
