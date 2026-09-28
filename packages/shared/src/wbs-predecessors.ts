/** How a predecessor drives its successor: finish-to-start, start-to-start, finish-to-finish, start-to-finish. */
export type WbsLinkType = "FS" | "SS" | "FF" | "SF";

export type WbsPredecessorSource = {
  id: string;
  code: string;
  leadLagDays: number;
  predecessor1: string | null;
  predecessor2: string | null;
  predecessor3: string | null;
  predecessor4: string | null;
  predecessor5: string | null;
  predecessor6: string | null;
};

export type WbsLinkSource = {
  predecessorId: string;
  successorId: string;
  type?: WbsLinkType;
  lagDays?: number;
};

export type WbsPredecessorLink = {
  predecessorId: string;
  type: WbsLinkType;
  lagDays: number;
};

/**
 * The predecessors that drive each item: the codes in the predecessor fields,
 * typed by a matching dependency or finish-to-start; the dependencies alone
 * when no field names a predecessor. The schedule calculation and every screen
 * that explains it read links through this one rule.
 */
export function buildWbsPredecessorRefs(items: WbsPredecessorSource[], dependencies: WbsLinkSource[]) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const itemsByCode = new Map(items.map((item) => [item.code, item]));
  const dependenciesBySuccessor = new Map<string, WbsLinkSource[]>();
  const dependencyBySuccessorAndPredecessor = new Map<string, WbsLinkSource>();

  for (const dependency of dependencies) {
    dependenciesBySuccessor.set(dependency.successorId, [
      ...(dependenciesBySuccessor.get(dependency.successorId) ?? []),
      dependency,
    ]);
    dependencyBySuccessorAndPredecessor.set(`${dependency.successorId}:${dependency.predecessorId}`, dependency);
  }

  const predecessorRefsByItem = new Map<string, WbsPredecessorLink[]>();
  for (const item of items) {
    const fieldPredecessorIds: string[] = [];
    for (const predecessorCode of [
      item.predecessor1,
      item.predecessor2,
      item.predecessor3,
      item.predecessor4,
      item.predecessor5,
      item.predecessor6,
    ]) {
      if (!predecessorCode) continue;
      const predecessor = itemsByCode.get(predecessorCode);
      if (predecessor && predecessor.id !== item.id && !fieldPredecessorIds.includes(predecessor.id)) {
        fieldPredecessorIds.push(predecessor.id);
      }
    }
    const refs: WbsPredecessorLink[] = fieldPredecessorIds.map((predecessorId) => {
      const dependency = dependencyBySuccessorAndPredecessor.get(`${item.id}:${predecessorId}`);
      return {
        predecessorId,
        type: dependency?.type ?? "FS",
        lagDays: dependency?.lagDays ?? (fieldPredecessorIds.length === 1 ? item.leadLagDays ?? 0 : 0),
      };
    });
    const dependencyRefs = dependenciesBySuccessor.get(item.id) ?? [];
    if (refs.length === 0 && dependencyRefs.length > 0) {
      for (const dependency of dependencyRefs) {
        if (itemsById.has(dependency.predecessorId) && !refs.some((ref) => ref.predecessorId === dependency.predecessorId)) {
          refs.push({
            predecessorId: dependency.predecessorId,
            type: dependency.type ?? "FS",
            lagDays: dependency.lagDays ?? 0,
          });
        }
      }
    }
    predecessorRefsByItem.set(item.id, refs);
  }
  return predecessorRefsByItem;
}

/** Links that set the start (finish-to-start, start-to-start) and those that set the finish. */
export function wbsDateLinks(refs: WbsPredecessorLink[]) {
  return {
    start: refs.filter((ref) => ref.type === "FS" || ref.type === "SS"),
    finish: refs.filter((ref) => ref.type === "FF" || ref.type === "SF"),
  };
}
