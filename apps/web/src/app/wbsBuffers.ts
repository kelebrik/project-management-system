/** Cells of the Structure that hold typed text not yet handed to the drafts. */
export const pendingBuffers = new Set<object>();

/** True while a WBS cell holds typed text that has not reached the drafts yet. */
export function hasPendingWbsBuffers() {
  return pendingBuffers.size > 0;
}
