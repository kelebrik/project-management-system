import assert from "node:assert/strict";
import test from "node:test";
import type { WbsSnapshot } from "./domainTypes";
import { capUndoHistory, UNDO_STEPS } from "./undoHistory";

const snapshot = (rows: number, tag: string) => ({
  wbsItems: Array.from({ length: rows }, (_, index) => ({ id: `${tag}-${index}`, title: "Работа" })),
  wbsDependencies: [],
}) as unknown as WbsSnapshot;

test("the history keeps 20 steps, the newest ones", () => {
  const history = Array.from({ length: 25 }, (_, index) => snapshot(10, String(index)));
  const kept = capUndoHistory(history);
  assert.equal(kept.length, UNDO_STEPS);
  assert.equal(kept.at(-1)!.wbsItems[0]!.id, "24-0");
  assert.equal(kept[0]!.wbsItems[0]!.id, "5-0");
});

test("a large plan keeps fewer steps, and always the newest one", () => {
  const history = Array.from({ length: 20 }, (_, index) => snapshot(5000, String(index)));
  assert.equal(capUndoHistory(history).length, 12);
  assert.equal(capUndoHistory([snapshot(80_000, "huge")]).length, 1);
});

test("one long text counts in full, not as the size of the first row", () => {
  const plain = Array.from({ length: 3 }, (_, index) => snapshot(10, `p${index}`));
  const heavy = snapshot(10, "heavy");
  (heavy.wbsItems[9] as unknown as { description: string }).description = "x".repeat(40 * 1024 * 1024 - 600);
  // The heavy copy alone fits the byte limit, but not with the older ones, which are dropped; its first row is small.
  assert.deepEqual(capUndoHistory([...plain, heavy]).map((kept) => kept.wbsItems[0]!.id), ["heavy-0"]);
});
