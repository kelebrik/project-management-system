/**
 * Undo and redo of a page: every change is a step; a run of small changes
 * (typing a title, nudging with arrows) may replace the last step instead of
 * adding one, so one Ctrl+Z takes back the whole run.
 */

export type PageHistory<T> = { past: T[]; present: T; future: T[]; mergeKey: string | null };

export const PAGE_HISTORY_LIMIT = 100;

export function startHistory<T>(present: T): PageHistory<T> {
  return { past: [], present, future: [], mergeKey: null };
}

export function pushHistory<T>(history: PageHistory<T>, next: T, mergeKey: string | null = null): PageHistory<T> {
  if (Object.is(next, history.present)) return history;
  if (mergeKey !== null && mergeKey === history.mergeKey) return { ...history, present: next, future: [] };
  return { past: [...history.past, history.present].slice(-PAGE_HISTORY_LIMIT), present: next, future: [], mergeKey };
}

export function undoHistory<T>(history: PageHistory<T>): PageHistory<T> {
  if (history.past.length === 0) return history;
  return { past: history.past.slice(0, -1), present: history.past[history.past.length - 1], future: [history.present, ...history.future], mergeKey: null };
}

export function redoHistory<T>(history: PageHistory<T>): PageHistory<T> {
  if (history.future.length === 0) return history;
  return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1), mergeKey: null };
}
