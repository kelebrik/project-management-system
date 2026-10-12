import type { WbsSnapshot } from "./domainTypes";

/** How many steps back and forward the Structure keeps. */
export const UNDO_STEPS = 20;
/** Rows and links over all kept copies: about 20 steps of a 3000-row plan, 12 of a 5000-row one. */
export const UNDO_MAX_ENTRIES = 60_000;
/** Bytes over all kept copies, as JSON. */
export const UNDO_MAX_BYTES = 40 * 1024 * 1024;

function entries(snapshot: WbsSnapshot) {
  return snapshot.wbsItems.length + snapshot.wbsDependencies.length;
}

const sizes = new WeakMap<WbsSnapshot, number>();

/** The size of a copy, measured once when it joins the history and remembered with it. */
function snapshotBytes(snapshot: WbsSnapshot) {
  let size = sizes.get(snapshot);
  if (size === undefined) {
    size = JSON.stringify(snapshot).length;
    sizes.set(snapshot, size);
  }
  return size;
}

/**
 * A history of whole Structure copies, newest last: at most UNDO_STEPS of
 * them, and fewer for a large plan, whose oldest copies are dropped first.
 * The newest copy is always kept, even when it alone is over the limits:
 * the last step back stays possible on any plan.
 */
export function capUndoHistory(history: WbsSnapshot[]) {
  const kept: WbsSnapshot[] = [];
  let totalEntries = 0;
  let totalBytes = 0;
  for (const snapshot of [...history].reverse()) {
    const nextEntries = totalEntries + entries(snapshot);
    const nextBytes = totalBytes + snapshotBytes(snapshot);
    if (kept.length > 0 && (kept.length >= UNDO_STEPS || nextEntries > UNDO_MAX_ENTRIES || nextBytes > UNDO_MAX_BYTES)) break;
    kept.push(snapshot);
    totalEntries = nextEntries;
    totalBytes = nextBytes;
  }
  return kept.reverse();
}
