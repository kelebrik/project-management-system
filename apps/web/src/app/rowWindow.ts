/**
 * The arithmetic of a windowed list: which rows of a long table to put in the
 * page for the part that is scrolled into view, and how tall the empty space
 * standing in for the others is. Heights are the measured ones where a row has
 * been on screen, the estimate otherwise.
 */

export type RowWindowItem =
  | { kind: "row"; index: number }
  | { kind: "gap"; key: string; height: number };

/** Top offset of every row and the total height at the end (length + 1 values). */
export function rowOffsets(ids: readonly string[], heights: ReadonlyMap<string, number>, estimate: number) {
  const offsets = new Array<number>(ids.length + 1);
  offsets[0] = 0;
  for (let index = 0; index < ids.length; index += 1) {
    offsets[index + 1] = offsets[index] + (heights.get(ids[index]) ?? estimate);
  }
  return offsets;
}

/** The first row whose bottom edge is below the given offset. */
export function rowAt(offsets: readonly number[], offset: number) {
  let low = 0;
  let high = offsets.length - 2;
  if (high < 0) return 0;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (offsets[middle + 1] <= offset) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Rows from..to (exclusive) covering the viewport, with overscan rows on both sides. */
export function visibleRows(offsets: readonly number[], top: number, height: number, overscan: number) {
  const count = offsets.length - 1;
  if (count <= 0) return { from: 0, to: 0 };
  const first = rowAt(offsets, Math.max(0, top));
  const last = rowAt(offsets, Math.max(0, top + height));
  return { from: Math.max(0, first - overscan), to: Math.min(count, last + 1 + overscan) };
}

/**
 * What to render: the visible rows, plus pinned rows wherever they are (the one
 * being edited, the one being dragged), with gaps of the right height between.
 */
export function rowWindowItems(offsets: readonly number[], range: { from: number; to: number }, pinned: readonly number[]): RowWindowItem[] {
  const count = offsets.length - 1;
  const indexes = new Set<number>();
  for (let index = range.from; index < range.to; index += 1) indexes.add(index);
  for (const index of pinned) if (index >= 0 && index < count) indexes.add(index);
  const sorted = [...indexes].sort((left, right) => left - right);
  const items: RowWindowItem[] = [];
  let cursor = 0;
  for (const index of sorted) {
    if (index > cursor) items.push({ kind: "gap", key: `gap-${cursor}`, height: offsets[index] - offsets[cursor] });
    items.push({ kind: "row", index });
    cursor = index + 1;
  }
  if (cursor < count) items.push({ kind: "gap", key: `gap-${cursor}`, height: offsets[count] - offsets[cursor] });
  return items;
}
