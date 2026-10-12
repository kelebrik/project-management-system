import type { WbsDependency, WbsItem } from "./domainTypes";
import type { StructureChange } from "./structureStore";

/** How many steps back and forward the Structure keeps. */
export const UNDO_STEPS = 20;
/** Rows and links over all kept steps. */
export const UNDO_MAX_ENTRIES = 60_000;
/** Bytes over all kept steps, as JSON. */
export const UNDO_MAX_BYTES = 40 * 1024 * 1024;

type Entry<T> = { before: T | null; after: T | null };

/**
 * One step back: the rows and links an edit changed, as they were before it
 * and as it left them, and the Structure version it left. A step whose change
 * the page could not follow (it read the project again) is incomplete and is
 * never sent back.
 */
export type WbsUndoStep = {
  projectId: string;
  /** The version the step's first change started from. */
  beforeVersion: string | null;
  afterVersion: string | null;
  items: Map<string, Entry<WbsItem>>;
  links: Map<string, Entry<WbsDependency>>;
  incomplete: boolean;
};

export function openUndoStep(projectId: string): WbsUndoStep {
  return { projectId, beforeVersion: null, afterVersion: null, items: new Map(), links: new Map(), incomplete: false };
}

/** A row or link as a person sees it: the write times do not count as a change. */
function comparable(value: unknown) {
  if (!value || typeof value !== "object") return JSON.stringify(value ?? null);
  const { updatedAt, createdAt, ...rest } = value as Record<string, unknown>;
  void updatedAt;
  void createdAt;
  return JSON.stringify(Object.keys(rest).sort().map((key) => [key, rest[key]]));
}

function merge<T>(entries: Map<string, Entry<T>>, changed: Array<{ id: string; before: T | null; after: T | null }>) {
  for (const entry of changed) {
    const known = entries.get(entry.id);
    // The first state seen is what the step goes back to; the last is what it left.
    const before = known ? known.before : entry.before;
    if (comparable(before) === comparable(entry.after)) entries.delete(entry.id);
    else entries.set(entry.id, { before, after: entry.after });
  }
}

/** Adds a change to a step: several requests of one edit make one step. */
export function recordChange(step: WbsUndoStep, change: StructureChange) {
  if (change.projectId !== step.projectId) return;
  if (!change.complete) {
    step.incomplete = true;
    return;
  }
  merge(step.items, change.items);
  merge(step.links, change.links);
  step.beforeVersion ??= change.baseVersion;
  step.afterVersion = change.version;
}

/**
 * After a step was taken back without recalculation, the project stands
 * exactly where that step began. If nothing was written between the previous
 * step and this one, that is where the previous step left it: its version
 * moves to the current one, so it too goes back without recalculation.
 */
export function rebaseAfterExactRevert(previous: WbsUndoStep | undefined, reverted: WbsUndoStep, revertVersion: string | null) {
  if (!previous || !revertVersion || previous.afterVersion === null) return;
  if (reverted.beforeVersion === previous.afterVersion) previous.afterVersion = revertVersion;
}

export function stepIsEmpty(step: WbsUndoStep) {
  return step.items.size === 0 && step.links.size === 0;
}

function link(value: WbsDependency) {
  const createdAt = (value as { createdAt?: string }).createdAt;
  return { id: value.id, predecessorId: value.predecessorId, successorId: value.successorId, type: value.type, lagDays: value.lagDays, ...(createdAt ? { createdAt } : {}) };
}

/**
 * The request that takes a step back: its rows and links as they were, the
 * ones it created to remove, and what it left, which the server checks is
 * still there. The version is the one the step left.
 */
export function revertRequest(step: WbsUndoStep) {
  const items = [...step.items.entries()];
  const links = [...step.links.entries()];
  return {
    baseVersion: step.afterVersion ?? "0",
    put: {
      items: items.filter(([, entry]) => entry.before).map(([, entry]) => entry.before!),
      links: links.filter(([, entry]) => entry.before).map(([, entry]) => link(entry.before!)),
    },
    remove: {
      itemIds: items.filter(([, entry]) => !entry.before).map(([id]) => id),
      linkIds: links.filter(([, entry]) => !entry.before).map(([id]) => id),
    },
    expect: {
      items: items.filter(([, entry]) => entry.after).map(([, entry]) => entry.after!),
      absentItemIds: items.filter(([, entry]) => !entry.after).map(([id]) => id),
      links: links.filter(([, entry]) => entry.after).map(([, entry]) => link(entry.after!)),
      absentLinkIds: links.filter(([, entry]) => !entry.after).map(([id]) => id),
    },
  };
}

function entries(step: WbsUndoStep) {
  return step.items.size + step.links.size;
}

const sizes = new WeakMap<WbsUndoStep, { entries: number; bytes: number }>();

/** The size of a step as JSON, measured again only when the step has grown. */
function stepBytes(step: WbsUndoStep) {
  const known = sizes.get(step);
  if (known && known.entries === entries(step)) return known.bytes;
  const bytes = JSON.stringify([...step.items.values(), ...step.links.values()]).length;
  sizes.set(step, { entries: entries(step), bytes });
  return bytes;
}

/**
 * A history of steps, newest last: at most UNDO_STEPS of them, fewer when
 * they are large, the oldest dropped first. The newest step is always kept,
 * even when it alone is over the limits: the last step back stays possible.
 */
export function capUndoHistory(history: WbsUndoStep[]) {
  const kept: WbsUndoStep[] = [];
  let totalEntries = 0;
  let totalBytes = 0;
  for (const step of [...history].reverse()) {
    const nextEntries = totalEntries + entries(step);
    const nextBytes = totalBytes + stepBytes(step);
    if (kept.length > 0 && (kept.length >= UNDO_STEPS || nextEntries > UNDO_MAX_ENTRIES || nextBytes > UNDO_MAX_BYTES)) break;
    kept.push(step);
    totalEntries = nextEntries;
    totalBytes = nextBytes;
  }
  return kept.reverse();
}
