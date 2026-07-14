import type { WbsItem } from "./domainTypes";

export type ProjectWorkProgress = {
  completedDays: number;
  inProgressDays: number;
  notStartedDays: number;
  totalDays: number;
  completedPercent: number;
  inProgressPercent: number;
  notStartedPercent: number;
};

function itemWorkDays(item: WbsItem) {
  const value = item.workDays ?? item.planWorkDays ?? 0;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function roundedPercentages(values: number[], total: number) {
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((value) => (value / total) * 100);
  const rounded = raw.map(Math.floor);
  let remainder = 100 - rounded.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction);
  for (const { index } of order) {
    if (remainder <= 0) break;
    rounded[index] += 1;
    remainder -= 1;
  }
  return rounded;
}

export function createProjectWorkProgress(items: WbsItem[]): ProjectWorkProgress {
  const parentIds = new Set(
    items.map((item) => item.parentId).filter((id): id is string => Boolean(id)),
  );
  const leafItems = items.filter(
    (item) => !parentIds.has(item.id) && item.status !== "CANCELLED",
  );

  let completedDays = 0;
  let inProgressDays = 0;
  let notStartedDays = 0;

  for (const item of leafItems) {
    const days = itemWorkDays(item);
    if (item.status === "DONE") {
      completedDays += days;
    } else if (item.status === "NOT_STARTED") {
      notStartedDays += days;
    } else {
      inProgressDays += days;
    }
  }

  const totalDays = completedDays + inProgressDays + notStartedDays;
  const [completedPercent, inProgressPercent, notStartedPercent] =
    roundedPercentages(
      [completedDays, inProgressDays, notStartedDays],
      totalDays,
    );

  return {
    completedDays,
    inProgressDays,
    notStartedDays,
    totalDays,
    completedPercent,
    inProgressPercent,
    notStartedPercent,
  };
}

