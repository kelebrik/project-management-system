// Copied from calculateWbsHierarchyStatusUpdates in apps/api/src/services/wbs.ts before the shared engine.
import type { WbsItemStatus, WbsItemType } from "@pms/shared";

export type WbsStatusAggregationItem = { id: string; parentId: string | null; type: WbsItemType; status: WbsItemStatus };

function aggregateParentStatus(statuses: WbsItemStatus[]): WbsItemStatus | null {
  const activeStatuses = statuses.filter((status) => status !== "CANCELLED");
  if (activeStatuses.length === 0) return null;
  if (activeStatuses.some((status) => status === "AT_RISK")) return "AT_RISK";
  if (activeStatuses.some((status) => status === "BLOCKED")) return "BLOCKED";
  if (activeStatuses.some((status) => status === "IN_PROGRESS")) {
    return "IN_PROGRESS";
  }
  if (activeStatuses.some((status) => status === "IN_REVIEW")) {
    return "IN_REVIEW";
  }
  if (activeStatuses.every((status) => status === "DONE")) return "DONE";
  if (activeStatuses.some((status) => status === "DONE")) return "IN_PROGRESS";
  return "NOT_STARTED";
}

export function calculateWbsHierarchyStatusUpdates(
  items: WbsStatusAggregationItem[],
) {
  const childrenByParent = new Map<string, WbsStatusAggregationItem[]>();
  const itemById = new Map(items.map((item) => [item.id, item]));

  for (const item of items) {
    if (!item.parentId) continue;
    childrenByParent.set(item.parentId, [
      ...(childrenByParent.get(item.parentId) ?? []),
      item,
    ]);
  }

  const effectiveStatusesById = new Map<string, WbsItemStatus>();
  const effectiveStatusOf = (
    item: WbsStatusAggregationItem,
    seen = new Set<string>(),
  ): WbsItemStatus => {
    const knownStatus = effectiveStatusesById.get(item.id);
    if (knownStatus) return knownStatus;
    if (seen.has(item.id)) return item.status;

    const children = childrenByParent.get(item.id) ?? [];
    const nextSeen = new Set(seen);
    nextSeen.add(item.id);
    const childStatuses = children.map((child) =>
      effectiveStatusOf(child, nextSeen),
    );
    const nextStatus = aggregateParentStatus(childStatuses) ?? item.status;
    effectiveStatusesById.set(item.id, nextStatus);
    return nextStatus;
  };

  items.forEach((item) => effectiveStatusOf(item));

  return items
    .filter((item) => item.type === "PHASE" || item.type === "WORK_PACKAGE")
    .map((item) => ({
      id: item.id,
      status: effectiveStatusesById.get(item.id) ?? item.status,
    }))
    .filter((update) => update.status !== itemById.get(update.id)?.status);
}
