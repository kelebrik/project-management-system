import { compareWbsCodes, type WbsImportChange, type WbsImportField, type WbsImportPlanSummary, type WbsImportProblem, type WbsImportRow } from '@pms/shared';

export const PREDECESSOR_FIELDS = ['predecessor1', 'predecessor2', 'predecessor3', 'predecessor4', 'predecessor5', 'predecessor6'] as const;

export type ImportExistingRow = {
  id: string;
  code: string;
  parentId: string | null;
  title: string;
  type: string;
  status: string;
  owner: string;
  startDate: Date | null;
  dueDate: Date | null;
  workDays: number | null;
  progress: number;
  priority: string | null;
  comment: string | null;
  calendarCode: string;
} & Record<(typeof PREDECESSOR_FIELDS)[number], string | null>;

/** The values of one existing row that the table changes, in the table's terms. */
export type ImportUpdate = { id: string; code: string; values: Partial<Omit<WbsImportRow, 'id' | 'code'>> };
export type ImportCreate = { code: string; row: WbsImportRow; parentId: string | null; parentCode: string | null; calendarCode: string };
/** The whole Structure in its new order: existing rows by id, new rows by code. */
export type ImportOrderEntry = { id: string } | { code: string };

const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : '');
const parentCodeOf = (code: string) => (code.includes('.') ? code.slice(0, code.lastIndexOf('.')) : null);
export const predecessorsOf = (row: ImportExistingRow) => PREDECESSOR_FIELDS.map((field) => row[field]).filter((code): code is string => Boolean(code));
const blankToNull = (value: string | null | undefined) => (value === undefined ? undefined : value?.trim() ? value.trim() : null);

/** A field of an existing row as a table shows it, to tell what changes. */
function shown(row: ImportExistingRow, field: WbsImportField): string {
  switch (field) {
    case 'startDate':
      return day(row.startDate);
    case 'dueDate':
      return day(row.dueDate);
    case 'workDays':
      return row.workDays === null ? '' : String(row.workDays);
    case 'predecessors':
      return predecessorsOf(row).join('; ');
    case 'progress':
      return String(row.progress);
    case 'priority':
      return row.priority ?? '';
    case 'comment':
      return row.comment ?? '';
    case 'title':
    case 'type':
    case 'status':
    case 'owner':
    case 'code':
      return row[field];
    default:
      return '';
  }
}

function incoming(row: WbsImportRow, field: WbsImportField): string | undefined {
  const value = row[field as keyof WbsImportRow];
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.join('; ');
  return value === null ? '' : String(value).trim();
}

const UPDATABLE_FIELDS = ['title', 'status', 'owner', 'startDate', 'dueDate', 'workDays', 'predecessors', 'progress', 'priority', 'comment'] as const satisfies readonly WbsImportField[];
/** A work package an open issue manages takes these from the issue. */
const ISSUE_MANAGED_FIELDS = new Set<WbsImportField>(['title', 'owner', 'dueDate']);

/**
 * Works out what a table does to a project's Structure, without writing
 * anything. A row with an id from an export is that row; a row without one is
 * the row with its code, or a new row under the row its code sits in. Nothing
 * is deleted, the types and places of existing rows stay, and a work package
 * an open issue manages keeps the fields the issue sets. Any error stops the
 * whole import; warnings name values that were left as they are.
 */
export function planWbsImport(existing: ImportExistingRow[], rows: WbsImportRow[], issueManagedIds: Set<string>) {
  const errors: WbsImportProblem[] = [];
  const warnings: WbsImportProblem[] = [];
  const byId = new Map(existing.map((row) => [row.id, row]));
  const byCode = new Map(existing.map((row) => [row.code, row]));
  const claimedIds = new Set(rows.map((row) => row.id).filter((id): id is string => Boolean(id)));
  const matched = new Map<string, WbsImportRow>();
  const creates: WbsImportRow[] = [];
  const seenCodes = new Set<string>();

  for (const row of rows) {
    if (seenCodes.has(row.code) && !row.id) {
      errors.push({ code: row.code, kind: 'DUPLICATE_ROW' });
      continue;
    }
    seenCodes.add(row.code);
    let target: ImportExistingRow | undefined;
    if (row.id) {
      target = byId.get(row.id);
      if (!target) {
        errors.push({ code: row.code, kind: 'UNKNOWN_ID', detail: row.id });
        continue;
      }
      if (target.code !== row.code) warnings.push({ code: row.code, kind: 'CODE_KEPT', field: 'code', detail: target.code });
    } else {
      target = byCode.get(row.code);
      // The code is held by a row the table names by id: a new row needs a code of its own.
      if (target && claimedIds.has(target.id)) {
        errors.push({ code: row.code, kind: 'CODE_TAKEN' });
        continue;
      }
    }
    if (target) {
      if (matched.has(target.id)) {
        errors.push({ code: row.code, kind: 'DUPLICATE_ROW' });
        continue;
      }
      matched.set(target.id, row);
    } else {
      if (!row.title) errors.push({ code: row.code, kind: 'TITLE_REQUIRED' });
      creates.push(row);
    }
  }

  const newCodes = new Set(creates.map((row) => row.code));
  const knownCodes = new Set([...existing.map((row) => row.code), ...newCodes]);
  // A row named by id keeps its code, so that code is the one it cannot depend on.
  const ownCode = (row: WbsImportRow) => (row.id ? byId.get(row.id)?.code ?? row.code : row.code);
  for (const row of rows) {
    for (const predecessor of row.predecessors ?? []) {
      if (predecessor === ownCode(row)) errors.push({ code: row.code, kind: 'PREDECESSOR_SELF', field: 'predecessors' });
      else if (!knownCodes.has(predecessor)) errors.push({ code: row.code, kind: 'PREDECESSOR_MISSING', field: 'predecessors', detail: predecessor });
    }
  }
  for (const row of creates) {
    const parentCode = parentCodeOf(row.code);
    if (parentCode && !knownCodes.has(parentCode)) errors.push({ code: row.code, kind: 'PARENT_MISSING', detail: parentCode });
  }

  const updates: ImportUpdate[] = [];
  const summaryUpdates: WbsImportPlanSummary['updates'] = [];
  let unchanged = 0;
  for (const [id, row] of matched) {
    const current = byId.get(id)!;
    if (row.type !== undefined && row.type !== current.type) warnings.push({ code: current.code, kind: 'TYPE_KEPT', field: 'type', detail: row.type });
    const changes: WbsImportChange[] = [];
    const values: ImportUpdate['values'] = {};
    for (const field of UPDATABLE_FIELDS) {
      const next = incoming(row, field);
      const before = shown(current, field);
      if (next === undefined || next === before) continue;
      if (issueManagedIds.has(id) && ISSUE_MANAGED_FIELDS.has(field)) {
        warnings.push({ code: current.code, kind: 'MANAGED_BY_ISSUE', field });
        continue;
      }
      changes.push({ field, from: before, to: next });
      (values as Record<string, unknown>)[field] = field === 'priority' || field === 'comment' ? blankToNull(row[field]) : row[field];
    }
    if (changes.length === 0) unchanged += 1;
    else {
      updates.push({ id, code: current.code, values });
      summaryUpdates.push({ code: current.code, changes });
    }
  }

  // New rows go into the order under their parent, before the first sibling with a larger code.
  const order: Array<ImportOrderEntry & { code: string; parentKey: string | null }> = existing.map((row) => ({ id: row.id, code: row.code, parentKey: row.parentId }));
  const keyOfCode = new Map(existing.map((row) => [row.code, row.id]));
  const keyOf = (entry: ImportOrderEntry) => ('id' in entry ? entry.id : `new:${entry.code}`);
  const parentOf = new Map(order.map((entry) => [keyOf(entry), entry.parentKey]));
  const createPlans: ImportCreate[] = [];
  if (errors.length === 0) {
    for (const row of [...creates].sort((left, right) => compareWbsCodes(left.code, right.code))) {
      const parentCode = parentCodeOf(row.code);
      const parentKey = parentCode ? keyOfCode.get(parentCode)! : null;
      const insideParent = (entry: { parentKey: string | null }) => {
        if (!parentKey) return true;
        for (let key = entry.parentKey; key; key = parentOf.get(key) ?? null) if (key === parentKey) return true;
        return false;
      };
      let at = parentKey ? order.findIndex((entry) => keyOf(entry) === parentKey) + 1 : 0;
      while (at < order.length && insideParent(order[at]) && !(order[at].parentKey === parentKey && compareWbsCodes(order[at].code, row.code) > 0)) at += 1;
      order.splice(at, 0, { code: row.code, parentKey });
      keyOfCode.set(row.code, `new:${row.code}`);
      parentOf.set(`new:${row.code}`, parentKey);
      const parent = parentKey && !parentKey.startsWith('new:') ? byId.get(parentKey) : undefined;
      const parentCreate = parentKey?.startsWith('new:') ? createPlans.find((plan) => `new:${plan.code}` === parentKey) : undefined;
      createPlans.push({
        code: row.code,
        row,
        parentId: parent?.id ?? null,
        parentCode,
        calendarCode: parent?.calendarCode ?? parentCreate?.calendarCode ?? existing[0]?.calendarCode ?? 'RU',
      });
    }
  }

  const summary: WbsImportPlanSummary = {
    creates: [...creates]
      .sort((left, right) => compareWbsCodes(left.code, right.code))
      .map((row) => ({ code: row.code, title: row.title ?? '', type: row.type ?? 'TASK', parentCode: parentCodeOf(row.code) })),
    updates: summaryUpdates,
    unchanged,
    warnings,
    errors,
  };
  return {
    summary,
    updates,
    creates: createPlans,
    order: order.map((entry): ImportOrderEntry => ('id' in entry ? { id: entry.id } : { code: entry.code })),
  };
}
