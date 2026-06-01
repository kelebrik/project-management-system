export type WbsProjectLoadGuardState = {
  loadSequenceAtStart: number;
  currentLoadSequence: number;
  wbsSaveSequenceAtStart: number;
  currentWbsSaveSequence: number;
  pendingWbsSavesAtStart: number;
  currentPendingWbsSaves: number;
};

export function shouldApplyProjectSnapshotAfterWbsSave({
  loadSequenceAtStart,
  currentLoadSequence,
  wbsSaveSequenceAtStart,
  currentWbsSaveSequence,
  pendingWbsSavesAtStart,
  currentPendingWbsSaves,
}: WbsProjectLoadGuardState) {
  return (
    loadSequenceAtStart === currentLoadSequence &&
    wbsSaveSequenceAtStart === currentWbsSaveSequence &&
    pendingWbsSavesAtStart === 0 &&
    currentPendingWbsSaves === 0
  );
}
