export type Confidence = "ON_TRACK" | "AT_RISK" | "OFF_TRACK";
export type CheckIn = { confidence: Confidence; done: string; blocker: string; updatedAt: string };
export type MyWorkItem = {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  code: string;
  title: string;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  overdue: boolean;
  checkIn: CheckIn | null;
};
export type MyWork = { person: string | null; reason?: "NOT_LINKED"; weekStart: string; items: MyWorkItem[] };
export type TeamWeek = {
  weekStart: string;
  checkIns: Array<CheckIn & { wbsItemId: string; personName: string; wbsItem: { code: string; title: string } }>;
  notCheckedIn: string[];
};

/** My work grouped by project, in the order the server sent it. */
export function groupByProject(items: MyWorkItem[]) {
  const groups = new Map<string, { code: string; name: string; items: MyWorkItem[] }>();
  for (const item of items) {
    const group = groups.get(item.projectId) ?? { code: item.projectCode, name: item.projectName, items: [] };
    group.items.push(item);
    groups.set(item.projectId, group);
  }
  return [...groups.values()];
}

/** The Monday a given number of weeks away from another Monday, as YYYY-MM-DD. */
export function shiftWeek(weekStart: string, weeks: number) {
  return new Date(Date.parse(`${weekStart}T00:00:00Z`) + weeks * 7 * 86_400_000).toISOString().slice(0, 10);
}
