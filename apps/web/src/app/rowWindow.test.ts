import assert from "node:assert/strict";
import test from "node:test";
import { rowAt, rowOffsets, rowWindowItems, visibleRows } from "./rowWindow";

const ids = Array.from({ length: 1000 }, (_, index) => `r${index}`);

test("offsets use measured heights and the estimate for the rest", () => {
  const offsets = rowOffsets(["a", "b", "c"], new Map([["b", 60]]), 44);
  assert.deepEqual(offsets, [0, 44, 104, 148]);
});

test("rowAt finds the row under an offset, at both ends too", () => {
  const offsets = rowOffsets(ids, new Map(), 40);
  assert.equal(rowAt(offsets, 0), 0);
  assert.equal(rowAt(offsets, 39), 0);
  assert.equal(rowAt(offsets, 40), 1);
  assert.equal(rowAt(offsets, 40 * 1000 + 500), 999);
  assert.equal(rowAt([0], 10), 0);
});

test("the visible range covers the viewport plus overscan, clamped to the list", () => {
  const offsets = rowOffsets(ids, new Map(), 40);
  assert.deepEqual(visibleRows(offsets, 4000, 800, 15), { from: 85, to: 136 });
  assert.deepEqual(visibleRows(offsets, 0, 800, 15), { from: 0, to: 36 });
  assert.deepEqual(visibleRows(offsets, 39_500, 800, 15), { from: 972, to: 1000 });
  assert.deepEqual(visibleRows([0], 0, 800, 15), { from: 0, to: 0 });
});

test("gaps stand in for the rows left out, so the total height is kept", () => {
  const offsets = rowOffsets(ids, new Map([["r5", 100]]), 40);
  const items = rowWindowItems(offsets, { from: 10, to: 20 }, []);
  assert.deepEqual(items[0], { kind: "gap", key: "gap-0", height: 10 * 40 + 60 });
  assert.equal(items.filter((item) => item.kind === "row").length, 10);
  const total = items.reduce((sum, item) => sum + (item.kind === "gap" ? item.height : offsets[item.index + 1] - offsets[item.index]), 0);
  assert.equal(total, offsets[1000]);
});

test("a pinned row far from the view is rendered in its place between gaps", () => {
  const offsets = rowOffsets(ids, new Map(), 40);
  const items = rowWindowItems(offsets, { from: 0, to: 5 }, [500, 2, -1, 5000]);
  const rows = items.flatMap((item) => (item.kind === "row" ? [item.index] : []));
  assert.deepEqual(rows, [0, 1, 2, 3, 4, 500]);
  assert.deepEqual(items.slice(5).map((item) => item.kind), ["gap", "row", "gap"]);
  assert.equal(items[5].kind === "gap" && items[5].height, 495 * 40);
});
