import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectDetails, RaidItem, WbsItem } from "./domainTypes";
import { createProjectReport } from "./reportBuilder";

function task(id: string, patch: Partial<WbsItem>): WbsItem {
  return {
    id,
    parentId: null,
    code: id,
    title: id,
    type: "TASK",
    status: "NOT_STARTED",
    owner: "РП",
    startDate: null,
    dueDate: null,
    baselineStartDate: null,
    baselineDueDate: null,
    forecastStartDate: null,
    forecastDueDate: null,
    wbsLevel: 1,
    predecessor1: null,
    predecessor2: null,
    predecessor3: null,
    predecessor4: null,
    predecessor5: null,
    predecessor6: null,
    leadLagDays: 0,
    workDays: null,
    calendarDays: null,
    excelStartDate: null,
    excelEndDate: null,
    planWorkDays: null,
    planCalendarDays: null,
    calendarCode: "RU",
    templateColor: null,
    priority: null,
    effortPercent: 0,
    plannedCost: "0",
    forecastCost: "0",
    progress: 0,
    jiraTicketKey: null,
    jiraTicketUrl: null,
    description: null,
    closedAt: null,
    sortOrder: 0,
    ...patch,
  };
}

function raid(id: string, type: RaidItem["type"]): RaidItem {
  return {
    id,
    type,
    title: id,
    description: "",
    owner: "",
    status: "OPEN",
    probability: 1,
    impact: 1,
    riskScore: 1,
    mitigationPlan: null,
    contingencyPlan: null,
    dueDate: null,
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
    escalationLevel: "",
    scheduleImpactDays: 0,
    budgetImpact: "0",
    statusUpdates: [],
  };
}

test("report groups completed, active and upcoming WBS items", () => {
  const project = {
    wbsItems: [
      task("done", { status: "DONE", closedAt: "2026-07-08" }),
      task("old", { status: "DONE", closedAt: "2026-06-01" }),
      task("active", { status: "IN_PROGRESS", dueDate: "2026-07-20" }),
      task("next", { status: "NOT_STARTED", startDate: "2026-07-15" }),
      task("later", { status: "NOT_STARTED", startDate: "2026-08-15" }),
    ],
    raidItems: [raid("risk", "RISK"), raid("problem", "DEPENDENCY")],
    issues: [{ id: "issue", status: "Open" }],
  } as unknown as ProjectDetails;

  const report = createProjectReport(
    project,
    7,
    { risks: true, problems: true, issues: true },
    new Date("2026-07-11T12:00:00"),
  );

  assert.deepEqual(report.done.map((item) => item.id), ["done"]);
  assert.deepEqual(report.inProgress.map((item) => item.id), ["active"]);
  assert.deepEqual(report.upcoming.map((item) => item.id), ["next"]);
  assert.equal(report.risks.length, 1);
  assert.equal(report.problems.length, 1);
  assert.equal(report.issues.length, 1);
});

test("report options exclude optional sections", () => {
  const project = {
    wbsItems: [],
    raidItems: [raid("risk", "RISK"), raid("problem", "DEPENDENCY")],
    issues: [{ id: "issue", status: "Open" }],
  } as unknown as ProjectDetails;

  const report = createProjectReport(
    project,
    14,
    { risks: false, problems: false, issues: false },
    new Date("2026-07-11T12:00:00"),
  );

  assert.deepEqual(report.risks, []);
  assert.deepEqual(report.problems, []);
  assert.deepEqual(report.issues, []);
});

test("report resolves work package and schedule deviation", () => {
  const project = {
    wbsItems: [
      task("package", {
        code: "2.1",
        title: "Поставка оборудования",
        type: "WORK_PACKAGE",
      }),
      task("delivery", {
        parentId: "package",
        status: "IN_PROGRESS",
        startDate: "2026-07-01",
        baselineDueDate: "2026-07-15",
        forecastDueDate: "2026-07-20",
      }),
    ],
    raidItems: [],
    issues: [],
  } as unknown as ProjectDetails;

  const report = createProjectReport(
    project,
    7,
    { risks: false, problems: false, issues: false },
    new Date("2026-07-11T12:00:00"),
  );

  assert.equal(report.inProgress[0].workPackage?.code, "2.1");
  assert.equal(report.inProgress[0].workPackage?.title, "Поставка оборудования");
  assert.equal(report.inProgress[0].reportStartDate, "2026-07-01");
  assert.equal(report.inProgress[0].reportEndDate, "2026-07-20");
  assert.equal(report.inProgress[0].scheduleDeltaDays, 5);
});
