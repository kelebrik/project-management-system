import assert from "node:assert/strict";
import test from "node:test";

import { calendarOverrides } from "./leaveScheduleModel";
import {
  buildWorkloadRows,
  normalizePersonName,
  overlapRanges,
  overlapWorkingDays,
  packLanes,
  projectColors,
  type WorkloadItem,
} from "./workloadModel";

function item(overrides: Partial<WorkloadItem>): WorkloadItem {
  return {
    id: "w1",
    projectId: "p1",
    code: "1.1",
    title: "Работа",
    owner: "Иванов",
    type: "TASK",
    status: "IN_PROGRESS",
    startDate: "2026-07-06",
    dueDate: "2026-07-10",
    ...overrides,
  };
}

test("names match regardless of case, spacing, ё and Unicode form", () => {
  assert.equal(normalizePersonName("  Семёнов   Пётр "), "семенов петр");
  assert.equal(normalizePersonName("ＩＶＡＮ"), "ivan");
  assert.equal(normalizePersonName("   "), "");
});

test("overlapping work goes on separate lanes, touching work shares one", () => {
  const { placed, laneCount } = packLanes([
    item({ id: "a", startDate: "2026-07-06", dueDate: "2026-07-10" }),
    item({ id: "b", startDate: "2026-07-08", dueDate: "2026-07-15" }),
    item({ id: "c", startDate: "2026-07-11", dueDate: "2026-07-12" }),
  ]);
  assert.equal(laneCount, 2);
  assert.deepEqual(
    placed.map((entry) => [entry.item.id, entry.lane]),
    [
      ["a", 0],
      ["b", 1],
      ["c", 0],
    ],
  );
});

test("overlaps are the days two or more unfinished pieces of work share", () => {
  const ranges = overlapRanges([
    item({ id: "a", startDate: "2026-07-06", dueDate: "2026-07-10" }),
    item({ id: "b", startDate: "2026-07-08", dueDate: "2026-07-15" }),
    item({ id: "c", startDate: "2026-07-14", dueDate: "2026-07-20" }),
    item({ id: "done", status: "DONE", startDate: "2026-07-01", dueDate: "2026-07-31" }),
  ]);
  assert.deepEqual(ranges, [
    { from: "2026-07-08", to: "2026-07-10" },
    { from: "2026-07-14", to: "2026-07-15" },
  ]);
  // Three at once still counts each day once.
  const triple = overlapRanges([
    item({ id: "a" }),
    item({ id: "b" }),
    item({ id: "c" }),
  ]);
  assert.deepEqual(triple, [{ from: "2026-07-06", to: "2026-07-10" }]);
});

test("overlap days are working days inside the window", () => {
  const holidays = calendarOverrides([{ date: "2026-06-12", isWorkingDay: false, description: "День России" }]);
  const ranges = [{ from: "2026-06-10", to: "2026-06-16" }];
  // 10, 11, 15, 16 June: the 12th is a holiday, 13–14 a weekend.
  assert.equal(overlapWorkingDays(ranges, { from: "2026-06-01", to: "2026-06-30" }, holidays), 4);
  assert.equal(overlapWorkingDays(ranges, { from: "2026-06-15", to: "2026-06-30" }, holidays), 2);
});

test("rows follow owners, matched to exactly one person in the directory", () => {
  const rows = buildWorkloadRows(
    [
      item({ id: "a", owner: "иванов" }),
      item({ id: "b", owner: "Иванов " }),
      item({ id: "c", owner: "Петров" }),
      item({ id: "d", owner: "Сидоров" }),
    ],
    [
      { id: "e1", name: "Иванов", department: "Разработка" },
      { id: "e2", name: "Петров", department: "Маркетинг" },
      { id: "e3", name: "петров", department: "Поддержка" },
    ],
  );
  const byName = new Map(rows.map((row) => [row.name, row]));
  assert.equal(byName.get("Иванов")?.items.length, 2);
  assert.equal(byName.get("Иванов")?.employeeId, "e1");
  assert.equal(byName.get("Иванов")?.department, "Разработка");
  const petrov = rows.find((row) => row.key === "петров")!;
  assert.equal(petrov.ambiguous, true);
  assert.equal(petrov.employeeId, null);
  assert.equal(petrov.department, "");
  assert.equal(byName.get("Сидоров")?.employeeId, null);
});

test("project colours come from the full sorted list", () => {
  const colors = projectColors([
    { id: "p2", code: "TV", name: "" },
    { id: "p1", code: "AUDIO", name: "" },
  ]);
  assert.equal(colors.get("p1"), "#2f80ed");
  assert.equal(colors.get("p2"), "#27ae60");
});
