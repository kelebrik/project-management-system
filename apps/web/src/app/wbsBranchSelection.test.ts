import assert from "node:assert/strict";
import test from "node:test";
import { childrenByParent, isBranchMixed, toggleBranchSelection } from "./wbsBranchSelection";

// 1 > 1.1 > (1.1.1, 1.1.2); 1 > 1.2; 2 > 2.1
const rows = [
  { id: "1", parentId: null },
  { id: "1.1", parentId: "1" },
  { id: "1.1.1", parentId: "1.1" },
  { id: "1.1.2", parentId: "1.1" },
  { id: "1.2", parentId: "1" },
  { id: "2", parentId: null },
  { id: "2.1", parentId: "2" },
];
const sorted = (set: ReadonlySet<string>) => [...set].sort();

test("ticking a row ticks every row under it, at any depth", () => {
  const before = new Set(["2.1"]);
  const after = toggleBranchSelection(before, "1", true, rows);
  assert.deepEqual(sorted(after), ["1", "1.1", "1.1.1", "1.1.2", "1.2", "2.1"]);
  assert.deepEqual(sorted(before), ["2.1"], "the selection given is not changed");
  // Again: nothing doubles.
  assert.deepEqual(sorted(toggleBranchSelection(after, "1", true, rows)), sorted(after));
  // A row without rows under it is ticked alone.
  assert.deepEqual(sorted(toggleBranchSelection(new Set(), "1.2", true, rows)), ["1.2"]);
});

test("unticking a row unticks its branch and the rows above it, and leaves other branches", () => {
  const all = toggleBranchSelection(toggleBranchSelection(new Set(), "1", true, rows), "2", true, rows);
  assert.deepEqual(sorted(toggleBranchSelection(all, "1.1.2", false, rows)), ["1.1.1", "1.2", "2", "2.1"]);
  assert.deepEqual(sorted(toggleBranchSelection(all, "1.1", false, rows)), ["1.2", "2", "2.1"]);
  assert.deepEqual(sorted(toggleBranchSelection(all, "1", false, rows)), ["2", "2.1"]);
});

test("a row not ticked with ticked rows under it shows mixed; ticking it then takes the whole branch", () => {
  const children = childrenByParent(rows);
  const some = new Set(["1.1.1"]);
  assert.equal(isBranchMixed(some, "1", children), true);
  assert.equal(isBranchMixed(some, "1.1", children), true);
  assert.equal(isBranchMixed(some, "1.2", children), false);
  assert.equal(isBranchMixed(some, "1.1.1", children), false);
  assert.equal(isBranchMixed(new Set(), "1", children), false);
  // All rows under it ticked one by one, the row itself not: still mixed, as it is a row too.
  assert.equal(isBranchMixed(new Set(["1.1.1", "1.1.2"]), "1.1", children), true);
  assert.deepEqual(sorted(toggleBranchSelection(some, "1", true, rows)), ["1", "1.1", "1.1.1", "1.1.2", "1.2"]);
});
