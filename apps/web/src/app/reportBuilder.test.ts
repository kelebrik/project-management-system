import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectDetails, WbsItem } from "./domainTypes";
import {
  createProjectReport,
  projectReportText,
  reportFieldText,
} from "./reportBuilder";

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

test("report groups completed, active and upcoming WBS items", () => {
  const project = {
    wbsItems: [
      task("done", { status: "DONE", closedAt: "2026-07-08" }),
      task("old", { status: "DONE", closedAt: "2026-06-01" }),
      task("done-without-close-date", { status: "DONE", dueDate: "2026-07-08" }),
      task("active", { status: "IN_PROGRESS", dueDate: "2026-07-20" }),
      task("old-active", {
        status: "BLOCKED",
        startDate: "2026-02-23",
        dueDate: "2026-03-27",
      }),
      task("structural", { type: "WORK_PACKAGE", status: "IN_PROGRESS" }),
      task("next", { status: "NOT_STARTED", startDate: "2026-07-15" }),
      task("later", { status: "NOT_STARTED", startDate: "2026-08-15" }),
    ],
    raidItems: [],
    issues: [],
  } as unknown as ProjectDetails;

  const report = createProjectReport(
    project,
    7,
    new Date("2026-07-11T12:00:00"),
  );

  assert.deepEqual(report.done.map((item) => item.id), ["done"]);
  assert.deepEqual(report.inProgress.map((item) => item.id), ["active"]);
  assert.deepEqual(report.upcoming.map((item) => item.id), ["next"]);
});

test("report resolves work package and report dates", () => {
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
    new Date("2026-07-11T12:00:00"),
  );

  assert.equal(report.inProgress[0].workPackage?.code, "2.1");
  assert.equal(report.inProgress[0].workPackage?.title, "Поставка оборудования");
  assert.equal(report.inProgress[0].reportStartDate, "2026-07-01");
  assert.equal(report.inProgress[0].reportEndDate, "2026-07-20");
});

test("report includes only open risks, problems and questions", () => {
  const project = {
    wbsItems: [],
    raidItems: [
      { id: "risk", type: "RISK", status: "OPEN", title: "Риск", impact: 4 },
      { id: "problem", type: "DEPENDENCY", status: "IN_PROGRESS", title: "Проблема", impact: 3 },
      { id: "closed", type: "RISK", status: "CLOSED", title: "Закрытый риск", impact: 1 },
    ],
    issues: [
      { id: "open", status: "Open", title: "Открытый вопрос" },
      { id: "closed", status: "Closed", title: "Закрытый вопрос" },
    ],
  } as unknown as ProjectDetails;

  const report = createProjectReport(project, 7, new Date("2026-07-11T12:00:00"));

  assert.deepEqual(report.raidItems.map((item) => item.id), ["risk", "problem"]);
  assert.deepEqual(report.openIssues.map((item) => item.id), ["open"]);
});

test("custom report text follows selected fields", () => {
  const project = {
    code: "TV-1",
    name: "Проект",
    wbsItems: [],
    raidItems: [],
    issues: [
      {
        id: "issue",
        status: "Open",
        title: "Нужно решение",
        owner: "РП",
      },
    ],
  } as unknown as ProjectDetails;
  const report = createProjectReport(project, 7, new Date("2026-07-11T12:00:00"));
  const text = projectReportText(project, report, "issues", ["title", "owner"]);

  assert.match(text, /Вопрос: Нужно решение/);
  assert.match(text, /Ответственный: РП/);
  assert.doesNotMatch(text, /Критичность:/);
  assert.equal(reportFieldText("issues", "decisionRequired", report.openIssues[0]), "Нет");
});
