import type { WbsItem } from "./domainTypes";

export type ResourceSummaryRow = {
  owner: string;
  total: number;
  done: number;
  inProgress: number;
  overdue: number;
};

export function createResourceSummaryRows(wbsItems: WbsItem[], now: Date) {
  const byOwner = new Map<string, ResourceSummaryRow>();
  for (const item of wbsItems) {
    if (item.type !== "TASK" && item.type !== "DELIVERABLE") continue;
    const owner = item.owner?.trim() || "Не назначен";
    const row =
      byOwner.get(owner) ??
      { owner, total: 0, done: 0, inProgress: 0, overdue: 0 };
    row.total += 1;
    if (item.status === "DONE") row.done += 1;
    if (item.status === "IN_PROGRESS" || item.status === "IN_REVIEW") {
      row.inProgress += 1;
    }
    if (item.dueDate && new Date(item.dueDate) < now && item.status !== "DONE") {
      row.overdue += 1;
    }
    byOwner.set(owner, row);
  }
  return [...byOwner.values()].sort((left, right) => right.total - left.total);
}
