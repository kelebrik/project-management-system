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
  assert.equal(colors.get("p1"), "#4a6a8e");
  assert.equal(colors.get("p2"), "#86b865");
});

test("people from the directory without work get a row only when asked", () => {
  const employees = [
    { id: "e1", name: "Иванов", department: "Разработка" },
    { id: "e2", name: "Петров", department: "Тестирование" },
    { id: "e3", name: "Сидоров", department: "" },
    { id: "e4", name: "сидоров", department: "" },
  ];
  const items = [item({ owner: "Иванов" })];
  assert.deepEqual(buildWorkloadRows(items, employees).map((row) => row.name), ["Иванов"]);
  const rows = buildWorkloadRows(items, employees, true);
  assert.deepEqual(rows.map((row) => [row.name, row.items.length, row.laneCount]), [
    ["Иванов", 1, 1],
    ["Петров", 0, 1],
    ["Сидоров", 0, 1],
  ]);
  // Two people with one name share a row that says so.
  assert.equal(rows[2].ambiguous, true);
  assert.equal(rows[1].department, "Тестирование");
});

test("a bar's label reads on its project's colour: dark on light fills, white on deep ones, 4.5:1 at least", async () => {
  const { readableTextOn } = await import("./workloadModel");
  const lum = (hex: string) => {
    const c = (o: number) => { const v = parseInt(hex.slice(1 + o, 3 + o), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * c(0) + 0.7152 * c(2) + 0.0722 * c(4);
  };
  const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
  for (const fill of ["#4a6a8e", "#86b865", "#d2776f", "#95888b", "#ed8654", "#5f7449", "#b5cce3", "#82634a", "#e8a9a2", "#c2e39a", "#504649", "#d5ad8b"]) {
    assert.ok(contrast(fill, readableTextOn(fill)) >= 4.5, `${fill} ${readableTextOn(fill)} ${contrast(fill, readableTextOn(fill)).toFixed(2)}`);
  }
  assert.equal(readableTextOn("#c2e39a"), "#231c18");
  assert.equal(readableTextOn("#504649"), "#ffffff");
});
