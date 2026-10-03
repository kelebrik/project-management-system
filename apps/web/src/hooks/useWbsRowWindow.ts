import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { rowAt, rowOffsets, rowWindowItems, visibleRows, type RowWindowItem } from "../app/rowWindow";

/** Below this many rows the whole table is rendered as before. */
export const ROW_WINDOW_THRESHOLD = 200;
const ESTIMATED_ROW_HEIGHT = 44;
const OVERSCAN_ROWS = 15;
const EMPTY_HEIGHTS: ReadonlyMap<string, number> = new Map();

type Options = {
  ids: readonly string[];
  /** Changes when row heights may change for all rows: column widths, hidden columns, language. */
  layoutKey: string;
  /** Changes when another project is open; a full render asked for by Ctrl+F ends there. */
  resetKey: string;
  /** Rows that must stay in the page wherever they are scrolled: the dragged row and its drop target. */
  pinnedIds: ReadonlyArray<string | null | undefined>;
};

/**
 * Keeps only the rows of a long Structure that are scrolled into view (and a
 * margin) in the page, so editing and scrolling do not redraw thousands of
 * rows. The scroll container is the table shell; rows carry data-wbs-row-id
 * and the first row slot follows the element marked data-wbs-rows-start.
 * Printing and the browser's find (Ctrl+F / Cmd+F) need every row in the page,
 * so both switch the window off.
 */
export function useWbsRowWindow({ ids, layoutKey, resetKey, pinnedIds }: Options) {
  // The node is state so listeners re-attach when it changes, and a ref for reading and scrolling it.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const attachContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setContainer(node);
  }, []);
  // Measured heights hold for one layout; another column width or language starts afresh.
  const [measured, setMeasured] = useState(() => ({ layoutKey, heights: new Map<string, number>() }));
  const heights = measured.layoutKey === layoutKey ? measured.heights : EMPTY_HEIGHTS;
  const [viewport, setViewport] = useState({ top: 0, height: 1200 });
  const [fullRender, setFullRender] = useState<"print" | "find" | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const anchorRef = useRef<{ id: string; delta: number } | null>(null);
  const previousIdsRef = useRef(ids);
  const windowed = ids.length > ROW_WINDOW_THRESHOLD && fullRender === null;

  const [findResetKey, setFindResetKey] = useState(resetKey);
  if (findResetKey !== resetKey) {
    setFindResetKey(resetKey);
    if (fullRender === "find") setFullRender(null);
  }

  const offsets = useMemo(() => rowOffsets(ids, heights, ESTIMATED_ROW_HEIGHT), [ids, heights]);
  const indexById = useMemo(() => new Map(ids.map((id, index) => [id, index])), [ids]);

  const rowsTop = useCallback(() => {
    const node = containerRef.current;
    const start = node?.querySelector<HTMLElement>("[data-wbs-rows-start]");
    if (!node || !start) return 0;
    return start.getBoundingClientRect().bottom - node.getBoundingClientRect().top + node.scrollTop;
  }, []);

  const readViewport = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    const top = node.scrollTop - rowsTop();
    setViewport((current) => (current.top === top && current.height === node.clientHeight ? current : { top, height: node.clientHeight }));
  }, [rowsTop]);

  useEffect(() => {
    if (!windowed || !container) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        readViewport();
      });
    };
    onScroll();
    container.addEventListener("scroll", onScroll, { passive: true });
    const resize = new ResizeObserver(onScroll);
    resize.observe(container);
    return () => {
      container.removeEventListener("scroll", onScroll);
      resize.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [container, windowed, readViewport]);

  // The row being edited stays in the page, or its typed value and blur-save would be lost.
  useEffect(() => {
    if (!container) return;
    const onFocus = (event: FocusEvent) => {
      const row = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-wbs-row-id]");
      setFocusedId(row?.dataset.wbsRowId ?? null);
    };
    container.addEventListener("focusin", onFocus);
    return () => container.removeEventListener("focusin", onFocus);
  }, [container]);

  useEffect(() => {
    const renderAll = (reason: "print" | "find") => flushSync(() => setFullRender((current) => current ?? reason));
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "f") renderAll("find");
    };
    const beforePrint = () => renderAll("print");
    const afterPrint = () => setFullRender((current) => (current === "print" ? null : current));
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);

  // When rows are sorted, collapsed or filtered, the row at the top of the view stays there.
  useLayoutEffect(() => {
    const previous = previousIdsRef.current;
    previousIdsRef.current = ids;
    const anchor = anchorRef.current;
    const node = containerRef.current;
    // The same rows again (a reload after a save) keep the scroll as it is.
    if (!windowed || !node || !anchor || sameIds(previous, ids)) return;
    const index = indexById.get(anchor.id);
    if (index === undefined) return;
    const target = rowsTop() + offsets[index] + anchor.delta;
    if (Math.abs(node.scrollTop - target) > 1) node.scrollTop = target;
  }, [ids, indexById, offsets, rowsTop, windowed]);

  const pinned = useMemo(
    () => [...pinnedIds, focusedId].flatMap((id) => (id && indexById.has(id) ? [indexById.get(id)!] : [])),
    [pinnedIds, focusedId, indexById],
  );

  const items: RowWindowItem[] = useMemo(() => {
    if (!windowed) return ids.map((_, index) => ({ kind: "row", index }));
    return rowWindowItems(offsets, visibleRows(offsets, viewport.top, viewport.height, OVERSCAN_ROWS), pinned);
  }, [ids, offsets, pinned, viewport, windowed]);

  // Measure the rows that are in the page as they appear or change size; the gaps then use real heights.
  useEffect(() => {
    if (!windowed || !container) return;
    const observer = new ResizeObserver((entries) => {
      const changes: Array<[string, number]> = [];
      for (const entry of entries) {
        const row = entry.target as HTMLElement;
        if (row.isConnected && row.offsetHeight > 0) changes.push([row.dataset.wbsRowId!, row.offsetHeight]);
      }
      if (changes.length === 0) return;
      setMeasured((current) => {
        const base = current.layoutKey === layoutKey ? current.heights : new Map<string, number>();
        if (changes.every(([id, height]) => Math.abs((base.get(id) ?? ESTIMATED_ROW_HEIGHT) - height) < 1)) {
          return current.layoutKey === layoutKey ? current : { layoutKey, heights: base };
        }
        return { layoutKey, heights: new Map([...base, ...changes]) };
      });
    });
    container.querySelectorAll<HTMLElement>("[data-wbs-row-id]").forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [container, items, layoutKey, windowed]);

  useEffect(() => {
    if (!windowed || ids.length === 0) return;
    const index = rowAt(offsets, Math.max(0, viewport.top));
    anchorRef.current = { id: ids[index], delta: viewport.top - offsets[index] };
  }, [ids, offsets, viewport, windowed]);

  /** Scrolls the table so the row is in the middle of the view; true when the row exists. */
  const scrollToRow = useCallback(
    (id: string) => {
      const index = indexById.get(id);
      const node = containerRef.current;
      if (!node || index === undefined) return false;
      const rowHeight = offsets[index + 1] - offsets[index];
      const top = Math.max(0, rowsTop() + offsets[index] - node.clientHeight / 2 + rowHeight / 2);
      node.scrollTop = top;
      // The new place is what a later change of rows must keep, not the old one.
      const topRow = rowAt(offsets, Math.max(0, top - rowsTop()));
      anchorRef.current = { id: ids[topRow], delta: top - rowsTop() - offsets[topRow] };
      readViewport();
      return true;
    },
    [ids, indexById, offsets, readViewport, rowsTop],
  );

  /** Puts every row in the page right now, for a print started from a button. */
  const renderAllForPrint = useCallback(() => flushSync(() => setFullRender((current) => current ?? "print")), []);

  return { containerRef: attachContainer, items, windowed, scrollToRow, renderAllForPrint };
}

function sameIds(left: readonly string[], right: readonly string[]) {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}
