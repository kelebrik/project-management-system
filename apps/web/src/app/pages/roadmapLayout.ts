/**
 * The geometry of a roadmap, pure so it can be tested: the window of months
 * around today, the month lines, and where each label goes so that no two
 * labels and no label and marker overlap. A label is tried next to its marker
 * on the lane (right, then left), then on a row above the lane, then below
 * (with a short connector); when it fits nowhere whole, it is shortened with
 * an ellipsis if a reasonable part fits, and otherwise counted as "+N" for the
 * lane. Widths of texts come from a measuring function (the browser's canvas;
 * a fixed width per letter in tests).
 */

export type RoadmapWindow = { from: string; to: string };

const time = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
const asDay = (value: number) => new Date(value).toISOString().slice(0, 10);

/** A day some months away, the day of the month kept or clamped to the month's end (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(day: string, months: number) {
  const date = new Date(time(day));
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return asDay(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date.getUTCDate(), last)));
}

/** From `before` months before today to `after` months after it, in calendar months. */
export function roadmapWindow(today: string, before: number, after: number): RoadmapWindow {
  return { from: addMonths(today, -before), to: addMonths(today, after) };
}

/** The first days of the months that begin inside the window. */
export function roadmapMonths(window: RoadmapWindow) {
  const months: string[] = [];
  const start = new Date(time(window.from));
  for (let cursor = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1); asDay(cursor) <= window.to; ) {
    const day = asDay(cursor);
    if (day >= window.from) months.push(day);
    const date = new Date(cursor);
    cursor = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  }
  return months;
}

/** Where a day falls between the window's ends, from 0 to 1. */
export function roadmapPosition(day: string, window: RoadmapWindow) {
  const span = time(window.to) - time(window.from);
  return span <= 0 ? 0.5 : (time(day) - time(window.from)) / span;
}

export const ROADMAP_MARKER_HALF = 7;
/** Free space kept between two labels, and between a label and a marker. */
const GAP = 6;
/** A shortened label shows at least this much, or it is not worth showing. */
const MIN_SHORT = 44;
const ELLIPSIS = "…";

export type RoadmapTier = 0 | 1 | -1;
export type RoadmapMark = { id: string; x: number; label: string; obstacles?: Array<[number, number]> };
export type RoadmapLabel = { id: string; tier: RoadmapTier; side: "right" | "left"; x: number; width: number; text: string; short: boolean };
export type RoadmapLaneLayout = { labels: RoadmapLabel[]; hidden: string[]; above: boolean; below: boolean };

type Interval = [number, number];
/** Something in a row: a label, or on the lane a marker (with the marks drawn on that very spot) or another shape of a mark. */
type Taken = { span: Interval; owners: Set<string> | null };
const overlaps = (a: Interval, b: Interval) => a[0] < b[1] + GAP && b[0] < a[1] + GAP;

/**
 * What is taken in one row, filed by 32-pixel cells, so a check looks only at
 * the neighbours of a place, not at everything in the row; marks on the same
 * pixel are one obstacle. A lane of thousands of goals is laid out in a moment.
 */
const CELL = 32;
class RowIndex {
  private cells = new Map<number, Taken[]>();
  private markers = new Map<number, Taken>();
  private shapes = new Set<string>();
  add(entry: Taken) {
    for (let cell = Math.floor((entry.span[0] - GAP) / CELL); cell <= Math.floor((entry.span[1] + GAP) / CELL); cell += 1) {
      const list = this.cells.get(cell);
      if (list) list.push(entry);
      else this.cells.set(cell, [entry]);
    }
  }
  /** Another shape of a mark (a plan ring); the same shape on the same spot is one obstacle. */
  addShape(span: Interval) {
    const key = `${Math.round(span[0])}:${Math.round(span[1])}`;
    if (this.shapes.has(key)) return;
    this.shapes.add(key);
    this.add({ span: [Math.round(span[0]) - 0.5, Math.round(span[1]) + 0.5], owners: null });
  }
  addMarker(x: number, owner: string) {
    const key = Math.round(x);
    const known = this.markers.get(key);
    if (known) {
      known.owners!.add(owner);
      return;
    }
    const entry: Taken = { span: [key - ROADMAP_MARKER_HALF, key + ROADMAP_MARKER_HALF], owners: new Set([owner]) };
    this.markers.set(key, entry);
    this.add(entry);
  }
  private *around(from: number, to: number, owner: string) {
    const seen = new Set<Taken>();
    for (let cell = Math.floor((from - GAP) / CELL); cell <= Math.floor((to + GAP) / CELL); cell += 1) {
      for (const entry of this.cells.get(cell) ?? []) {
        if (seen.has(entry) || entry.owners?.has(owner)) continue;
        seen.add(entry);
        yield entry.span;
      }
    }
  }
  /** Whether anything but the owner's own marker is too close to a span. */
  blocks(span: Interval, owner: string) {
    for (const other of this.around(span[0], span[1], owner)) if (overlaps(other, span)) return true;
    return false;
  }
  near(from: number, to: number, owner: string) {
    return [...this.around(from, to, owner)];
  }
}

/** The longest start of a text, with an ellipsis, that is at most `width` wide; null if even a short part is not. */
export function shortenText(text: string, width: number, measure: (text: string) => number) {
  if (measure(text) <= width) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(text.slice(0, middle).trimEnd() + ELLIPSIS) <= width) low = middle;
    else high = middle - 1;
  }
  return low === 0 ? null : text.slice(0, low).trimEnd() + ELLIPSIS;
}

/**
 * The labels of one lane between `left` and `right`. Marks are taken by their
 * position; each label keeps clear of the other labels of its row and, on the
 * lane itself, of every marker (and of the extra shapes a mark names, such as
 * its plan ring).
 */
export function layoutRoadmapLane(marks: RoadmapMark[], bounds: { left: number; right: number }, measure: (text: string) => number): RoadmapLaneLayout {
  const sorted = [...marks].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  const taken: Record<RoadmapTier, RowIndex> = { 0: new RowIndex(), 1: new RowIndex(), [-1]: new RowIndex() } as Record<RoadmapTier, RowIndex>;
  // On the lane, every marker and its extra shapes are in the way of labels — but not of its own label.
  for (const mark of sorted) {
    taken[0].addMarker(mark.x, mark.id);
    for (const span of mark.obstacles ?? []) taken[0].addShape(span);
  }
  const labels: RoadmapLabel[] = [];
  const hidden: string[] = [];
  const order: Array<[RoadmapTier, "right" | "left"]> = [[0, "right"], [0, "left"], [1, "right"], [1, "left"], [-1, "right"], [-1, "left"]];
  // Next to the marker on the lane the label starts past the marker; above and below it starts at the marker.
  const start = (mark: RoadmapMark, tier: RoadmapTier, side: "right" | "left", width: number): Interval => {
    const offset = tier === 0 ? ROADMAP_MARKER_HALF + 3 : 2;
    return side === "right" ? [mark.x + offset, mark.x + offset + width] : [mark.x - offset - width, mark.x - offset];
  };
  const inside = (span: Interval) => span[0] >= bounds.left && span[1] <= bounds.right;
  const free = (tier: RoadmapTier, mark: RoadmapMark, span: Interval) => inside(span) && !taken[tier].blocks(span, mark.id);
  // The room there is from the label's start to the first thing in the way, or to the bound.
  const room = (mark: RoadmapMark, tier: RoadmapTier, side: "right" | "left", wanted: number) => {
    const edge = start(mark, tier, side, 0)[0];
    const near = side === "right" ? taken[tier].near(edge, Math.min(bounds.right, edge + wanted), mark.id) : taken[tier].near(Math.max(bounds.left, edge - wanted), edge, mark.id);
    if (near.some((other) => other[0] - GAP < edge && other[1] + GAP > edge)) return 0;
    if (side === "right") return Math.min(bounds.right, edge + wanted, ...near.filter((other) => other[0] >= edge).map((other) => other[0] - GAP)) - edge;
    return edge - Math.max(bounds.left, edge - wanted, ...near.filter((other) => other[1] <= edge).map((other) => other[1] + GAP));
  };
  for (const mark of sorted) {
    const width = measure(mark.label);
    let placed: RoadmapLabel | null = null;
    for (const [tier, side] of order) {
      const span = start(mark, tier, side, width);
      if (free(tier, mark, span)) {
        placed = { id: mark.id, tier, side, x: span[0], width, text: mark.label, short: false };
        break;
      }
    }
    if (!placed) {
      for (const [tier, side] of order) {
        const space = room(mark, tier, side, width);
        if (space < MIN_SHORT) continue;
        const text = shortenText(mark.label, space, measure);
        if (!text) continue;
        const span = start(mark, tier, side, measure(text));
        if (!free(tier, mark, span)) continue;
        placed = { id: mark.id, tier, side, x: span[0], width: span[1] - span[0], text, short: true };
        break;
      }
    }
    if (!placed) {
      hidden.push(mark.id);
      continue;
    }
    taken[placed.tier].add({ span: [placed.x, placed.x + placed.width], owners: null });
    labels.push(placed);
  }
  return { labels, hidden, above: labels.some((label) => label.tier === 1), below: labels.some((label) => label.tier === -1) };
}
