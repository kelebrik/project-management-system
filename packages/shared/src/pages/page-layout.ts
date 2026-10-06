/**
 * Where widgets sit on the grid of a page: inside the sheet, never on top of
 * one another. Moving or resizing a widget pushes the ones it lands on down;
 * if that would push anything off the sheet, the move is refused (null) — the
 * page never grows past one printed sheet and never shrinks text to fit.
 */

export const PAGE_GRID_COLUMNS = 12;

export type PageBox = { id: string; x: number; y: number; w: number; h: number };

export function pageBoxesOverlap(left: PageBox, right: PageBox) {
  return left.x < right.x + right.w && right.x < left.x + left.w && left.y < right.y + right.h && right.y < left.y + left.h;
}

/** What is wrong with a layout, or null. */
export function pageLayoutProblem(boxes: readonly PageBox[], rows: number) {
  for (const box of boxes) {
    if (box.x < 0 || box.y < 0 || box.w < 1 || box.h < 1 || box.x + box.w > PAGE_GRID_COLUMNS || box.y + box.h > rows) {
      return `Виджет ${box.id} выходит за границы страницы`;
    }
  }
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      if (pageBoxesOverlap(boxes[left], boxes[right])) return `Виджеты ${boxes[left].id} и ${boxes[right].id} накладываются`;
    }
  }
  return null;
}

/**
 * Puts one widget at a new place or size; widgets under it move down, and
 * those under them in turn. Returns the new boxes in the same order, or null
 * when something would leave the sheet.
 */
export function pagePlaceBox<T extends PageBox>(boxes: readonly T[], moved: PageBox, rows: number): T[] | null {
  if (moved.x < 0 || moved.y < 0 || moved.w < 1 || moved.h < 1 || moved.x + moved.w > PAGE_GRID_COLUMNS || moved.y + moved.h > rows) return null;
  const next = boxes.map((box) => (box.id === moved.id ? { ...box, x: moved.x, y: moved.y, w: moved.w, h: moved.h } : { ...box }));
  const settle = (blocker: PageBox): boolean => {
    const hit = next.filter((box) => box.id !== blocker.id && box.id !== moved.id && pageBoxesOverlap(box, blocker)).sort((left, right) => left.y - right.y);
    for (const box of hit) {
      // Another push may already have moved it clear.
      if (!pageBoxesOverlap(box, blocker)) continue;
      box.y = blocker.y + blocker.h;
      if (box.y + box.h > rows) return false;
      if (!settle(box)) return false;
    }
    return true;
  };
  const target = next.find((box) => box.id === moved.id);
  if (!target || !settle(target)) return null;
  return next;
}

/** The first free place for a widget of a size, top to bottom and left to right; null if the sheet is full. */
export function pageFreeSpot(boxes: readonly PageBox[], w: number, h: number, rows: number) {
  for (let y = 0; y + h <= rows; y += 1) {
    for (let x = 0; x + w <= PAGE_GRID_COLUMNS; x += 1) {
      const candidate = { id: "__new__", x, y, w, h };
      if (!boxes.some((box) => pageBoxesOverlap(box, candidate))) return { x, y };
    }
  }
  return null;
}

/**
 * Fits a layout into fewer rows (another format): widgets are lifted up as far
 * as they go, in reading order. Returns null if they still do not fit.
 */
export function pageCompactBoxes<T extends PageBox>(boxes: readonly T[], rows: number): T[] | null {
  const order = boxes.map((box, index) => ({ box: { ...box }, index })).sort((left, right) => left.box.y - right.box.y || left.box.x - right.box.x);
  const placed: T[] = [];
  for (const entry of order) {
    let y = 0;
    while (placed.some((box) => pageBoxesOverlap(box, { ...entry.box, y }))) y += 1;
    entry.box.y = Math.min(entry.box.y, y);
    while (placed.some((box) => pageBoxesOverlap(box, entry.box))) entry.box.y += 1;
    if (entry.box.y + entry.box.h > rows) return null;
    placed.push(entry.box);
  }
  return order.sort((left, right) => left.index - right.index).map((entry) => entry.box);
}
