import assert from "node:assert/strict";
import test from "node:test";

import type { RaidItem } from "./domainTypes";
import {
  closedRiskAndProblemItems,
  createRaidSummary,
  createRiskMatrix,
  filterRaidItems,
} from "./raidModels";

function raidItem(overrides: Partial<RaidItem>): RaidItem {
  return {
    id: "raid",
    type: "RISK",
    title: "Риск",
    description: "Описание риска",
    owner: "Ответственный",
    status: "OPEN",
    probability: 4,
    impact: 4,
    riskScore: 16,
    mitigationPlan: null,
    contingencyPlan: null,
    dueDate: "2026-06-30",
    residualRisk: 0,
    validationDate: null,
    linkedRiskId: null,
    dependencyType: null,
    predecessor: null,
    successor: null,
    supplier: null,
    jiraTicketKey: null,
    jiraTicketUrl: null,
    decisionRequired: false,
    escalationLevel: "Project",
    scheduleImpactDays: 0,
    budgetImpact: "0",
    statusUpdates: [],
    ...overrides,
  };
}

test("raid filters exclude closed and validated items from active views", () => {
  const items = [
    raidItem({ id: "open-risk", status: "OPEN" }),
    raidItem({ id: "closed-risk", status: "CLOSED" }),
    raidItem({ id: "validated-risk", status: "VALIDATED" }),
  ];

  const filtered = filterRaidItems(items, {
    raidTypeFilter: "ALL",
    raidDecisionOnly: false,
    raidOverdueOnly: false,
    raidHighOnly: false,
    today: new Date("2026-06-22T00:00:00.000Z"),
  });
  const matrix = createRiskMatrix(items);
  const summary = createRaidSummary(items);

  assert.deepEqual(
    filtered.map((item) => item.id),
    ["open-risk"],
  );
  assert.equal(matrix.get("4:4"), 1);
  assert.equal(summary.activeRaid, 1);
});

test("closed raid section contains only closed risks and problems", () => {
  const closedItems = closedRiskAndProblemItems([
    raidItem({ id: "closed-risk", type: "RISK", status: "CLOSED" }),
    raidItem({ id: "validated-problem", type: "DEPENDENCY", status: "VALIDATED" }),
    raidItem({ id: "closed-assumption", type: "ASSUMPTION", status: "CLOSED" }),
    raidItem({ id: "open-problem", type: "DEPENDENCY", status: "OPEN" }),
  ]);

  assert.deepEqual(
    closedItems.map((item) => item.id).sort(),
    ["closed-risk", "validated-problem"],
  );
});
