import assert from "node:assert/strict";
import test from "node:test";
import type { WbsCriticalPath } from "./domainTypes";
import { sortWbsTreeForDisplay, wbsFloatTone, wbsFloatValue } from "./wbsTable";
import { createFloatById } from "./wbsViewModels";

const path = (items: Array<[string, number]>, criticalItemIds: string[] = []): WbsCriticalPath => ({
  projectStartDate: "2026-10-01",
  projectFinishDate: "2026-12-01",
  criticalItemIds,
  criticalDependencyIds: [],
  criticalItemCount: criticalItemIds.length,
  nearCriticalItemCount: 0,
  warnings: [],
  items: items.map(([itemId, totalFloatWorkDays]) => ({
    itemId,
    code: itemId,
    title: itemId,
    earlyStartDate: "2026-10-01",
    earlyFinishDate: "2026-10-02",
    lateStartDate: "2026-10-01",
    lateFinishDate: "2026-10-02",
    totalFloatWorkDays,
    isCritical: totalFloatWorkDays <= 0,
    isNearCritical: false,
  })),
});

test("float tones: at or below zero holds the finish, up to five days is close", () => {
  assert.equal(wbsFloatTone(-3), "critical");
  assert.equal(wbsFloatTone(0), "critical");
  assert.equal(wbsFloatTone(5), "near");
  assert.equal(wbsFloatTone(6), "free");
  assert.equal(wbsFloatTone(null), "none");
});

test("float is read from the calculation, not from the critical set, and done work has none", () => {
  // A predecessor of a critical row is in criticalItemIds, yet it still has 4 days to spare.
  const floats = createFloatById(path([["a", 4], ["b", 0], ["c", -2]], ["a", "b"]));
  assert.equal(wbsFloatValue({ id: "a", status: "IN_PROGRESS" }, floats), 4);
  assert.equal(wbsFloatValue({ id: "c", status: "NOT_STARTED" }, floats), -2);
  assert.equal(wbsFloatValue({ id: "b", status: "DONE" }, floats), null);
  assert.equal(wbsFloatValue({ id: "x", status: "IN_PROGRESS" }, floats), null);
  assert.equal(wbsFloatValue({ id: "a", status: "IN_PROGRESS" }, createFloatById(null)), null);
});

test("sorting by float puts the least float first and rows without it last", () => {
  const row = (id: string, sortOrder: number) => ({ id, parentId: null, code: id, title: id, type: "TASK", status: "IN_PROGRESS", sortOrder, level: 0, children: [] });
  const sorted = sortWbsTreeForDisplay([row("a", 1), row("b", 2), row("c", 3), row("d", 4)] as never[], {}, { columnKey: "float", direction: "asc" }, {
    floatById: createFloatById(path([["a", 7], ["b", -1], ["c", 3]])),
  });
  assert.deepEqual(sorted.map((item: { id: string }) => item.id), ["b", "c", "a", "d"]);
});

test("rows without float stay at the bottom when sorting descending too", () => {
  const row = (id: string, sortOrder: number) => ({ id, parentId: null, code: id, title: id, type: "TASK", status: "IN_PROGRESS", sortOrder, level: 0, children: [] });
  const sorted = sortWbsTreeForDisplay([row("a", 1), row("b", 2), row("c", 3), row("d", 4)] as never[], {}, { columnKey: "float", direction: "desc" }, {
    floatById: createFloatById(path([["a", 7], ["b", -1], ["c", 3]])),
  });
  assert.deepEqual(sorted.map((item: { id: string }) => item.id), ["a", "c", "b", "d"]);
});
