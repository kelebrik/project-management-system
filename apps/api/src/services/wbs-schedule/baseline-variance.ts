import { signedCalendarDays } from "./calendar.js";
import type {
  WbsBaselineVarianceDependency,
  WbsBaselineVarianceItem,
  WbsBaselineVarianceResult,
} from "./types.js";

function isWbsCheckpointType(item: Pick<WbsBaselineVarianceItem, "type">) {
  return item.type === "MILESTONE" || item.type === "GOAL";
}

export function calculateWbsBaselineVariance(
  items: WbsBaselineVarianceItem[],
  dependencies: WbsBaselineVarianceDependency[],
): WbsBaselineVarianceResult {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const itemsByCode = new Map(items.map((item) => [item.code, item]));
  const childrenByParentId = new Map<string, WbsBaselineVarianceItem[]>();

  for (const item of items) {
    if (!item.parentId || !itemsById.has(item.parentId)) continue;
    childrenByParentId.set(item.parentId, [
      ...(childrenByParentId.get(item.parentId) ?? []),
      item,
    ]);
  }

  const predecessorIdsByItemId = new Map<string, Set<string>>();
  const addPredecessor = (itemId: string, predecessorId: string) => {
    if (itemId === predecessorId) return;
    const predecessorIds =
      predecessorIdsByItemId.get(itemId) ?? new Set<string>();
    predecessorIds.add(predecessorId);
    predecessorIdsByItemId.set(itemId, predecessorIds);
  };

  for (const dependency of dependencies) {
    if (
      itemsById.has(dependency.predecessorId) &&
      itemsById.has(dependency.successorId)
    ) {
      addPredecessor(dependency.successorId, dependency.predecessorId);
    }
  }

  for (const item of items) {
    for (const predecessorCode of [
      item.predecessor1,
      item.predecessor2,
      item.predecessor3,
      item.predecessor4,
      item.predecessor5,
      item.predecessor6,
    ]) {
      const predecessor = predecessorCode
        ? itemsByCode.get(predecessorCode)
        : null;
      if (predecessor) addPredecessor(item.id, predecessor.id);
    }
  }

  const delayedItems = items
    .filter(
      (
        item,
      ): item is WbsBaselineVarianceItem & {
        baselineDueDate: Date;
        dueDate: Date;
      } =>
        !isWbsCheckpointType(item) &&
        item.baselineDueDate !== null &&
        item.baselineDueDate !== undefined &&
        item.dueDate !== null,
    )
    .map((item) => ({
      item,
      delayDays: signedCalendarDays(item.baselineDueDate, item.dueDate),
    }))
    .filter(({ delayDays }) => delayDays > 0);

  const delayByItemId = new Map(
    delayedItems.map(({ item, delayDays }) => [item.id, delayDays]),
  );
  const delayedLeafItemIds = new Set(
    delayedItems
      .filter(({ item }) => !childrenByParentId.has(item.id))
      .map(({ item }) => item.id),
  );
  const upstreamCauseCache = new Map<string, Set<string>>();

  const upstreamDelayedLeafCauseIds = (
    itemId: string,
    visiting = new Set<string>(),
  ): Set<string> => {
    const cached = upstreamCauseCache.get(itemId);
    if (cached) return cached;
    if (visiting.has(itemId)) return new Set<string>();
    visiting.add(itemId);

    const causeIds = new Set<string>();
    for (const predecessorId of predecessorIdsByItemId.get(itemId) ?? []) {
      if (delayedLeafItemIds.has(predecessorId)) {
        causeIds.add(predecessorId);
      }
      for (const upstreamId of upstreamDelayedLeafCauseIds(
        predecessorId,
        visiting,
      )) {
        causeIds.add(upstreamId);
      }
    }

    visiting.delete(itemId);
    upstreamCauseCache.set(itemId, causeIds);
    return causeIds;
  };

  const rootCauses = delayedItems
    .filter(({ item }) => !childrenByParentId.has(item.id))
    .map(({ item, delayDays: rawDelayDays }) => {
      const inheritedFrom =
        [...upstreamDelayedLeafCauseIds(item.id)]
          .map((predecessorId) => itemsById.get(predecessorId))
          .filter((entry): entry is WbsBaselineVarianceItem => Boolean(entry))
          .sort(
            (left, right) =>
              (delayByItemId.get(right.id) ?? 0) -
                (delayByItemId.get(left.id) ?? 0) ||
              left.code.localeCompare(right.code, "ru", { numeric: true }),
          )[0] ?? null;
      const inheritedDelayDays = inheritedFrom
        ? delayByItemId.get(inheritedFrom.id) ?? 0
        : 0;
      return {
        item,
        delayDays: Math.max(0, rawDelayDays - inheritedDelayDays),
        rawDelayDays,
        inheritedDelayDays,
        inheritedFrom,
      };
    })
    .filter(({ delayDays }) => delayDays > 0)
    .sort(
      (left, right) =>
        right.delayDays - left.delayDays ||
        right.rawDelayDays - left.rawDelayDays ||
        left.item.code.localeCompare(right.item.code, "ru", { numeric: true }),
    );

  return {
    scheduleVarianceDays: Math.max(
      0,
      ...delayedItems.map(({ delayDays }) => delayDays),
    ),
    rootCauses,
  };
}
