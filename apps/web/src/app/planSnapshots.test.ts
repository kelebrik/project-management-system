import assert from "node:assert/strict";
import test from "node:test";
import { defaultSnapshotName } from "./planSnapshots";

test("a snapshot is named after the committee and today's date by default", () => {
  assert.equal(defaultSnapshotName("Комитет", new Date(2026, 9, 1)), "Комитет 01.10");
});
