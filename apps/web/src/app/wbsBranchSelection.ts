/**
 * Selecting rows of the Structure by branch: a row ticked brings all the rows
 * under it, at any depth, collapsed or not; a row unticked takes them away and
 * also unticks every row above it, as its branch is no longer whole. Other
 * branches stay as they were. A row not ticked whose branch holds ticked rows
 * shows as mixed.
 */
export type BranchRow = { id: string; parentId: string | null };

/** The rows under each row, by parent, for the whole Structure. */
export function childrenByParent(rows: BranchRow[]) {
  const children = new Map<string, string[]>();
  for (const row of rows) if (row.parentId) children.set(row.parentId, [...(children.get(row.parentId) ?? []), row.id]);
  return children;
}

function descendants(itemId: string, children: Map<string, string[]>) {
  const found: string[] = [];
  for (const queue = [...(children.get(itemId) ?? [])]; queue.length > 0; ) {
    const id = queue.pop()!;
    found.push(id);
    queue.push(...(children.get(id) ?? []));
  }
  return found;
}

/** The selection after a row was ticked or unticked; the selection given is left as it was. */
export function toggleBranchSelection(selected: ReadonlySet<string>, itemId: string, checked: boolean, rows: BranchRow[], children = childrenByParent(rows)) {
  const next = new Set(selected);
  const branch = [itemId, ...descendants(itemId, children)];
  if (checked) {
    for (const id of branch) next.add(id);
    return next;
  }
  for (const id of branch) next.delete(id);
  const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
  for (let parent = parentOf.get(itemId) ?? null; parent; parent = parentOf.get(parent) ?? null) next.delete(parent);
  return next;
}

/** Whether a row shows mixed: not ticked itself, with ticked rows in its branch. */
export function isBranchMixed(selected: ReadonlySet<string>, itemId: string, children: Map<string, string[]>) {
  if (selected.has(itemId) || selected.size === 0) return false;
  return descendants(itemId, children).some((id) => selected.has(id));
}
