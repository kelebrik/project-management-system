/** A Structure row as the hierarchy reads it: the parent its code names wins over the parent it records. */
export type FamilyItem = { id: string; code: string; parentId?: string | null };

function parentCode(code: string) {
  const parts = code.split(".").filter(Boolean);
  return parts.length <= 1 ? null : parts.slice(0, -1).join(".");
}

/**
 * Whether two rows are one inside the other: one is an ancestor of the other,
 * by the same parents the schedule rolls dates up through. A link between
 * such rows makes a row wait for itself, so the schedule ignores it and new
 * ones are refused.
 */
export function familyRelation(items: readonly FamilyItem[]) {
  const ids = new Set(items.map((item) => item.id));
  const byCode = new Map(items.map((item) => [item.code ?? "", item]));
  const parentOf = new Map<string, string>();
  for (const item of items) {
    const code = parentCode(item.code ?? "");
    const inferred = code ? byCode.get(code)?.id : undefined;
    const parent = inferred ?? (item.parentId && ids.has(item.parentId) ? item.parentId : undefined);
    if (parent && parent !== item.id) parentOf.set(item.id, parent);
  }
  const isAncestor = (ancestorId: string, itemId: string) => {
    const seen = new Set<string>();
    for (let current = parentOf.get(itemId); current && !seen.has(current); current = parentOf.get(current)) {
      if (current === ancestorId) return true;
      seen.add(current);
    }
    return false;
  };
  return (left: string, right: string) => left !== right && (isAncestor(left, right) || isAncestor(right, left));
}

export type FamilyLinkItem = FamilyItem & {
  title?: string;
  predecessor1?: string | null;
  predecessor2?: string | null;
  predecessor3?: string | null;
  predecessor4?: string | null;
  predecessor5?: string | null;
  predecessor6?: string | null;
};

export type FamilyLink = { predecessorId: string; successorId: string };

/**
 * The links that join a row with its own ancestor or descendant, from both
 * places a link can be written: the link table and the predecessor columns
 * (by code), each pair once.
 */
export function findFamilyLinks(items: readonly FamilyLinkItem[], dependencies: readonly FamilyLink[]): FamilyLink[] {
  const related = familyRelation(items);
  const byCode = new Map(items.map((item) => [(item.code ?? "").trim(), item]));
  const ids = new Set(items.map((item) => item.id));
  const pairs = new Map<string, FamilyLink>();
  const consider = (predecessorId: string, successorId: string) => {
    if (ids.has(predecessorId) && ids.has(successorId) && related(predecessorId, successorId)) pairs.set(`${predecessorId}:${successorId}`, { predecessorId, successorId });
  };
  for (const dependency of dependencies) consider(dependency.predecessorId, dependency.successorId);
  for (const item of items) {
    for (const code of [item.predecessor1, item.predecessor2, item.predecessor3, item.predecessor4, item.predecessor5, item.predecessor6]) {
      const predecessor = code ? byCode.get(code.trim()) : undefined;
      if (predecessor) consider(predecessor.id, item.id);
    }
  }
  return [...pairs.values()];
}
