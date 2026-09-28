import type {
  WbsPredecessorRef,
  WbsScheduleDependency,
  WbsScheduleItem,
} from "./types.js";

export type WbsPredecessorSource = Pick<
  WbsScheduleItem,
  | "id"
  | "code"
  | "leadLagDays"
  | "predecessor1"
  | "predecessor2"
  | "predecessor3"
  | "predecessor4"
  | "predecessor5"
  | "predecessor6"
>;

/**
 * The predecessors that drive each item: the codes in the predecessor fields,
 * typed by a matching dependency or finish-to-start; the dependencies alone
 * when no field names a predecessor.
 */
export function buildWbsPredecessorRefs(
  items: WbsPredecessorSource[],
  dependencies: WbsScheduleDependency[],
) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const itemsByCode = new Map(items.map((item) => [item.code, item]));
  const dependenciesBySuccessor = new Map<string, WbsScheduleDependency[]>();
  const dependencyBySuccessorAndPredecessor =
    new Map<string, WbsScheduleDependency>();

  for (const dependency of dependencies) {
    dependenciesBySuccessor.set(dependency.successorId, [
      ...(dependenciesBySuccessor.get(dependency.successorId) ?? []),
      dependency,
    ]);
    dependencyBySuccessorAndPredecessor.set(
      `${dependency.successorId}:${dependency.predecessorId}`,
      dependency,
    );
  }

  const predecessorRefsByItem = new Map<string, WbsPredecessorRef[]>();
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
      if (
        predecessor &&
        predecessor.id !== item.id &&
        !fieldPredecessorIds.includes(predecessor.id)
      ) {
        fieldPredecessorIds.push(predecessor.id);
      }
    }
    const refs: WbsPredecessorRef[] = fieldPredecessorIds.map(
      (predecessorId) => {
        const dependency = dependencyBySuccessorAndPredecessor.get(
          `${item.id}:${predecessorId}`,
        );
        return {
          predecessorId,
          type: dependency?.type ?? "FS",
          lagDays:
            dependency?.lagDays ??
            (fieldPredecessorIds.length === 1 ? item.leadLagDays ?? 0 : 0),
        };
      },
    );
    const dependencyRefs = dependenciesBySuccessor.get(item.id) ?? [];
    if (refs.length === 0 && dependencyRefs.length > 0) {
      for (const dependency of dependencyRefs) {
        if (
          itemsById.has(dependency.predecessorId) &&
          !refs.some((ref) => ref.predecessorId === dependency.predecessorId)
        ) {
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
