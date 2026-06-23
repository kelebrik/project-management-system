import { startOfDay } from "./dateUtils";
import type { RaidItem, RaidItemType } from "./domainTypes";

export type RaidTypeFilter = "ALL" | RaidItemType;

export type RaidFilterOptions = {
  raidTypeFilter: RaidTypeFilter;
  raidDecisionOnly: boolean;
  raidOverdueOnly: boolean;
  raidHighOnly: boolean;
  today: Date;
};

const inactiveRaidStatuses = new Set(["CLOSED", "VALIDATED"]);

export function isInactiveRaidItem(item: RaidItem) {
  return inactiveRaidStatuses.has(item.status);
}

export function createRaidSummary(raidItems: RaidItem[]) {
  const activeRaid = raidItems.filter((item) => !isInactiveRaidItem(item));
  const highRisks = activeRaid.filter(
    (item) => item.type === "RISK" && item.riskScore >= 15,
  );
  const problems = activeRaid.filter((item) => item.type === "DEPENDENCY");
  const assumptions = activeRaid.filter((item) => item.type === "ASSUMPTION");
  const decisions = raidItems.filter((item) => item.decisionRequired).length;
  const scheduleImpactDays = activeRaid.reduce(
    (sum, item) => sum + item.scheduleImpactDays,
    0,
  );

  return {
    activeRaid: activeRaid.length,
    highRisks: highRisks.length,
    problems: problems.length,
    assumptions: assumptions.length,
    decisions,
    scheduleImpactDays,
  };
}

export function filterRaidItems(
  raidItems: RaidItem[],
  {
    raidTypeFilter,
    raidDecisionOnly,
    raidOverdueOnly,
    raidHighOnly,
    today,
  }: RaidFilterOptions,
) {
  const todayStart = startOfDay(today);
  return raidItems.filter((item) => {
    if (isInactiveRaidItem(item)) return false;
    if (raidTypeFilter !== "ALL" && item.type !== raidTypeFilter) return false;
    if (raidDecisionOnly && !item.decisionRequired) return false;
    if (
      raidOverdueOnly &&
      (!item.dueDate ||
        startOfDay(new Date(item.dueDate)) >= todayStart)
    ) {
      return false;
    }
    if (raidHighOnly && item.riskScore < 15) return false;
    return true;
  });
}

export function createRiskMatrix(raidItems: RaidItem[]) {
  const cells = new Map<string, number>();
  for (const item of raidItems) {
    if (item.type !== "RISK" || isInactiveRaidItem(item)) continue;
    const probability = Math.max(1, Math.min(5, item.probability));
    const impact = Math.max(1, Math.min(5, item.impact));
    const key = `${probability}:${impact}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }
  return cells;
}

export function groupRaidItems(filteredRaidItems: RaidItem[]) {
  return {
    risks: filteredRaidItems.filter((item) => item.type === "RISK"),
    problems: filteredRaidItems.filter((item) => item.type === "DEPENDENCY"),
    assumptions: filteredRaidItems.filter((item) => item.type === "ASSUMPTION"),
  };
}

export function closedRiskAndProblemItems(raidItems: RaidItem[]) {
  return raidItems
    .filter(
      (item) =>
        isInactiveRaidItem(item) &&
        (item.type === "RISK" || item.type === "DEPENDENCY"),
    )
    .sort((left, right) => {
      const leftDate = left.validationDate ?? left.dueDate ?? "";
      const rightDate = right.validationDate ?? right.dueDate ?? "";
      return rightDate.localeCompare(leftDate) || left.title.localeCompare(right.title);
    });
}
