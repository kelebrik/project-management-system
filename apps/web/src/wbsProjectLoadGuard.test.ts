import assert from "node:assert/strict";
import test from "node:test";
import { shouldApplyProjectSnapshotAfterWbsSave } from "./wbsProjectLoadGuard";

test("WBS project load guard applies a clean project snapshot", () => {
  assert.equal(
    shouldApplyProjectSnapshotAfterWbsSave({
      loadSequenceAtStart: 4,
      currentLoadSequence: 4,
      wbsSaveSequenceAtStart: 9,
      currentWbsSaveSequence: 9,
      pendingWbsSavesAtStart: 0,
      currentPendingWbsSaves: 0,
    }),
    true,
  );
});

test("WBS project load guard rejects snapshots loaded while a WBS save is already pending", () => {
  assert.equal(
    shouldApplyProjectSnapshotAfterWbsSave({
      loadSequenceAtStart: 4,
      currentLoadSequence: 4,
      wbsSaveSequenceAtStart: 9,
      currentWbsSaveSequence: 9,
      pendingWbsSavesAtStart: 1,
      currentPendingWbsSaves: 0,
    }),
    false,
  );
});

test("WBS project load guard rejects snapshots when a WBS save starts before the response is applied", () => {
  assert.equal(
    shouldApplyProjectSnapshotAfterWbsSave({
      loadSequenceAtStart: 4,
      currentLoadSequence: 4,
      wbsSaveSequenceAtStart: 9,
      currentWbsSaveSequence: 10,
      pendingWbsSavesAtStart: 0,
      currentPendingWbsSaves: 1,
    }),
    false,
  );
});
