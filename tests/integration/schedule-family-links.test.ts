import assert from "node:assert/strict";
import test from "node:test";
import { calculateCriticalPath, calculateScheduleUpdates, findFamilyLinks, type ScheduleItem } from "@pms/shared";

// A link between a row and its own ancestor or descendant counts as if it were not written.

const row = (id: string, code: string, values: Partial<ScheduleItem> = {}): ScheduleItem & { title: string } => ({
  id, code, title: id, parentId: null, type: code.includes(".") ? "TASK" : "PHASE", status: "NOT_STARTED",
  startDate: "2026-10-12", dueDate: null, forecastStartDate: null, forecastDueDate: null,
  predecessor1: null, predecessor2: null, predecessor3: null, predecessor4: null, predecessor5: null, predecessor6: null,
  leadLagDays: 0, workDays: 3, calendarDays: null, calendarCode: "RU", wbsLevel: code.split(".").length, sortOrder: Number(code.replace(/\./g, "")) * 10,
  ...values,
});

test("family links are found by code, by recorded parent and through deeper levels, from both places a link is written", () => {
  const items = [row("p", "1"), row("a", "1.1"), row("x", "1.1.1"), row("q", "2"), row("b", "9", { parentId: "q" })];
  assert.deepEqual(findFamilyLinks(items, [{ predecessorId: "p", successorId: "x" }, { predecessorId: "a", successorId: "q" }]), [{ predecessorId: "p", successorId: "x" }]);
  assert.deepEqual(findFamilyLinks(items, [{ predecessorId: "b", successorId: "q" }]), [{ predecessorId: "b", successorId: "q" }], "the recorded parent counts when the code names none");
  assert.deepEqual(findFamilyLinks([...items.slice(0, 2), row("x", "1.1.1", { predecessor1: "1" })], []), [{ predecessorId: "p", successorId: "x" }]);
  assert.deepEqual(findFamilyLinks(items, [{ predecessorId: "x", successorId: "a" }, { predecessorId: "q", successorId: "x" }]), [{ predecessorId: "x", successorId: "a" }]);
});

test("the schedule ignores a family link as if it were not written, in the columns and in the link table", () => {
  const plain = [row("p", "1"), row("a", "1.1"), row("b", "1.2"), row("c", "2")];
  const without = calculateScheduleUpdates(plain, [{ predecessorId: "a", successorId: "c", type: "FS", lagDays: 0 }], []);
  // In the link table.
  assert.deepEqual(calculateScheduleUpdates(plain, [{ predecessorId: "a", successorId: "c", type: "FS", lagDays: 0 }, { predecessorId: "p", successorId: "b", type: "FS", lagDays: 0 }], []), without);
  // In the columns, next to an ordinary predecessor: the lag goes to the one that counts, as when it stands alone.
  const lagged = (field: string | null) => [row("p", "1"), row("a", "1.1"), row("b", "1.2"), row("c", "1.3", { predecessor1: field, predecessor2: "1.1", leadLagDays: 5 })];
  assert.deepEqual(calculateScheduleUpdates(lagged("1"), [], []).find((update) => update.id === "c"), calculateScheduleUpdates(lagged(null), [], []).find((update) => update.id === "c"));
  // A family predecessor alone in the columns leaves the link table to drive the row.
  const columns = [row("p", "1"), row("a", "1.1", { predecessor1: "1" }), row("b", "1.2"), row("c", "2")];
  const table = [{ predecessorId: "c", successorId: "a", type: "FS" as const, lagDays: 0 }];
  assert.deepEqual(calculateScheduleUpdates(columns, table, []), calculateScheduleUpdates([...columns.slice(0, 1), row("a", "1.1"), ...columns.slice(2)], table, []));
});

test("a plan the old engine could not schedule because of a family link is scheduled", () => {
  const items = [row("p", "1"), row("a", "1.1", { predecessor1: "1" }), row("b", "1.2")];
  assert.doesNotThrow(() => calculateScheduleUpdates(items, [{ predecessorId: "a", successorId: "p", type: "FS", lagDays: 0 }], []));
});

test("the critical path leaves a family link out and says so once", () => {
  const items = [row("p", "1"), row("a", "1.1", { predecessor1: "1" }), row("b", "1.2")];
  const path = calculateCriticalPath(items, [{ id: "l", predecessorId: "p", successorId: "a", type: "FS", lagDays: 0 }], [], "2026-10-13");
  assert.deepEqual(path.warnings, ["Связь 1 → 1.1 не учитывается: строка связана со своей родительской или дочерней строкой"]);
  const clean = calculateCriticalPath([row("p", "1"), row("a", "1.1"), row("b", "1.2")], [], [], "2026-10-13");
  assert.deepEqual({ ...path, warnings: [] }, clean);
});
