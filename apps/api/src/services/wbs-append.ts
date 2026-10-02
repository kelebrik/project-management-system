import { buildWbsRenumberPlan, levelFromWbsItem } from './wbs-ordering.js';

export type AppendSourceRow = { id: string; code: string; parentId: string | null; wbsLevel: number | null; type: string; calendarCode: string };
export type AppendPlan = { code: string; level: number; insertIndex: number; parentId: string | null; calendarCode: string };
export type AppendProblem = 'PARENT_NOT_FOUND' | 'PARENT_NOT_A_GROUP' | 'NOT_CANONICAL';

/** Parents a new piece of work can go under from the Workload page. */
export const APPEND_PARENT_TYPES = new Set(['PHASE', 'WORK_PACKAGE']);

const lastSegment = (code: string) => Number(code.split('.').at(-1));

/**
 * Where a new row goes: right after the last row under its parent (or at the
 * end for the top level), one level below the parent, numbered after the
 * highest code among the parent's children. No other row changes its code or
 * parent; a Structure whose stored codes do not already follow its order is
 * refused rather than renumbered behind the user's back.
 */
export function planAppend(rows: AppendSourceRow[], parentId: string | null): AppendPlan | { problem: AppendProblem } {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const parent = parentId ? byId.get(parentId) : null;
  if (parentId && !parent) return { problem: 'PARENT_NOT_FOUND' };
  if (parent && !APPEND_PARENT_TYPES.has(parent.type)) return { problem: 'PARENT_NOT_A_GROUP' };

  let insertIndex = rows.length;
  let level = 1;
  let code: string;
  if (parent) {
    const isUnderParent = (row: AppendSourceRow) => {
      for (let key = row.parentId; key; key = byId.get(key)?.parentId ?? null) if (key === parent.id) return true;
      return false;
    };
    const parentIndex = rows.indexOf(parent);
    insertIndex = parentIndex + 1;
    while (insertIndex < rows.length && isUnderParent(rows[insertIndex])) insertIndex += 1;
    level = levelFromWbsItem(parent) + 1;
    const childNumbers = rows.filter((row) => row.parentId === parent.id).map((row) => lastSegment(row.code)).filter(Number.isFinite);
    code = `${parent.code}.${Math.max(0, ...childNumbers) + 1}`;
  } else {
    const topNumbers = rows.filter((row) => !row.parentId).map((row) => lastSegment(row.code)).filter(Number.isFinite);
    code = String(Math.max(0, ...topNumbers) + 1);
  }

  // The order with the new row must number every row as it is stored now.
  const proposed = [...rows.slice(0, insertIndex), { id: '__new__', code, parentId: parent?.id ?? null, wbsLevel: level, type: 'TASK', calendarCode: '' }, ...rows.slice(insertIndex)];
  const planned = buildWbsRenumberPlan(proposed).normalizedRows;
  const canonical = planned.every((row, index) => row.code === proposed[index].code && row.parentId === proposed[index].parentId);
  if (!canonical) return { problem: 'NOT_CANONICAL' };

  return {
    code,
    level,
    insertIndex,
    parentId: parent?.id ?? null,
    calendarCode: parent?.calendarCode ?? rows[0]?.calendarCode ?? 'RU',
  };
}
