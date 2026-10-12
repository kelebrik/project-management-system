import type { ScheduleItemStatus, ScheduleItemType } from "./types.js";

export type StatusRollupItem = { id: string; parentId: string | null; type: ScheduleItemType; status: ScheduleItemStatus };

function aggregateParentStatus(statuses: ScheduleItemStatus[]): ScheduleItemStatus | null {
  const activeStatuses = statuses.filter((status) => status !== "CANCELLED");
  if (activeStatuses.length === 0) return null;
  if (activeStatuses.some((status) => status === "AT_RISK")) return "AT_RISK";
  if (activeStatuses.some((status) => status === "BLOCKED")) return "BLOCKED";
  if (activeStatuses.some((status) => status === "IN_PROGRESS")) return "IN_PROGRESS";
  if (activeStatuses.some((status) => status === "IN_REVIEW")) return "IN_REVIEW";
  if (activeStatuses.every((status) => status === "DONE")) return "DONE";
  if (activeStatuses.some((status) => status === "DONE")) return "IN_PROGRESS";
  return "NOT_STARTED";
}

/** Phases and work packages take their status from their children; answers only the ones that change. */
export function calculateHierarchyStatusUpdates(items: StatusRollupItem[]) {
  const childrenByParent = new Map<string, StatusRollupItem[]>();
  const itemById = new Map(items.map((item) => [item.id, item]));
  for (const item of items) {
    if (!item.parentId) continue;
    childrenByParent.set(item.parentId, [...(childrenByParent.get(item.parentId) ?? []), item]);
  }

  const effectiveStatusesById = new Map<string, ScheduleItemStatus>();
  const effectiveStatusOf = (item: StatusRollupItem, seen = new Set<string>()): ScheduleItemStatus => {
    const knownStatus = effectiveStatusesById.get(item.id);
    if (knownStatus) return knownStatus;
    if (seen.has(item.id)) return item.status;
    const nextSeen = new Set(seen);
    nextSeen.add(item.id);
    const childStatuses = (childrenByParent.get(item.id) ?? []).map((child) => effectiveStatusOf(child, nextSeen));
    const nextStatus = aggregateParentStatus(childStatuses) ?? item.status;
    effectiveStatusesById.set(item.id, nextStatus);
    return nextStatus;
  };
  items.forEach((item) => effectiveStatusOf(item));

  return items
    .filter((item) => item.type === "PHASE" || item.type === "WORK_PACKAGE")
    .map((item) => ({ id: item.id, status: effectiveStatusesById.get(item.id) ?? item.status }))
    .filter((update) => update.status !== itemById.get(update.id)?.status);
}
