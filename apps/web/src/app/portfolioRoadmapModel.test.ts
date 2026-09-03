import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectListItem, WbsItem } from "./domainTypes";
import {
  createPortfolioRoadmap as createPreparedPortfolioRoadmap,
  preparePortfolioRoadmapProjects,
  type PortfolioRoadmapRange,
} from "./portfolioRoadmapModel";

function createPortfolioRoadmap(
  projects: ProjectListItem[],
  range: PortfolioRoadmapRange,
  today: Date,
) {
  return createPreparedPortfolioRoadmap(
    preparePortfolioRoadmapProjects(projects),
    range,
    today,
  );
}

function wbsItem(overrides: Partial<WbsItem>): WbsItem {
  return {
    id: "item",
    parentId: null,
    code: "1",
    title: "Этап",
    type: "WORK_PACKAGE",
    status: "IN_PROGRESS",
    owner: "",
    startDate: "2026-07-01",
    dueDate: "2026-07-31",
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
    progress: 25,
    jiraTicketKey: null,
    jiraTicketUrl: null,
    mattermostUrl: null,
    description: null,
    comment: null,
    closedAt: null,
    sortOrder: 0,
    ...overrides,
  };
}

function project(overrides: Partial<ProjectListItem>): ProjectListItem {
  return {
    id: "project",
    businessUnitId: "unit",
    businessUnit: { id: "unit", code: "UNIT", name: "Устройства" },
    parentId: null,
    code: "DEVICE",
    name: "Новое устройство",
    portfolio: "Аудио",
    sponsor: "",
    projectManager: "Руководитель",
    status: "ACTIVE",
    rag: "GREEN",
    startDate: "2026-07-01",
    initialTargetDate: "2027-07-01",
    targetDate: "2027-07-01",
    progress: 0,
    scheduleVariance: 0,
    budgetPlanned: "0",
    budgetForecast: "0",
    summary: "",
    sortOrder: 0,
    uiState: null,
    jiraIntegration: null,
    targetDateChanges: [],
    wbsItems: [],
    raidItems: [],
    currentUserAccessLevel: "VIEW",
    _count: { tasks: 0, issues: 0, jiraSnapshots: 0 },
    ...overrides,
  };
}

test("builds a quarter-aligned monthly horizon", () => {
  const roadmap = createPortfolioRoadmap([], 12, new Date(2026, 8, 3));

  assert.equal(roadmap.months[0].label, "Июл'26");
  assert.equal(roadmap.months[11].label, "Июн'27");
  assert.deepEqual(
    roadmap.quarters.map((quarter) => quarter.label),
    ["Q3 2026", "Q4 2026", "Q1 2027", "Q2 2027"],
  );
  assert.equal(roadmap.months.filter((month) => month.isCurrent).length, 1);
});

test("classifies nested Russian WBS branches into HW, SW and G2M phases", () => {
  const hardware = wbsItem({ id: "hw", title: "Аппаратная часть" });
  const software = wbsItem({ id: "sw", title: "Программная часть" });
  const marketing = wbsItem({ id: "g2m", title: "Маркетинг и вывод на рынок" });
  const roadmap = createPortfolioRoadmap(
    [
      project({
        wbsItems: [
          hardware,
          software,
          marketing,
          wbsItem({
            id: "evt",
            parentId: hardware.id,
            code: "1.1",
            title: "Тесты EVT",
            startDate: "2026-08-01",
            dueDate: "2026-09-30",
          }),
          wbsItem({
            id: "rc",
            parentId: software.id,
            code: "2.1",
            title: "Подготовка SW Release Candidate",
            startDate: "2026-10-01",
            dueDate: "2026-11-30",
          }),
          wbsItem({
            id: "launch",
            parentId: marketing.id,
            code: "3.1",
            title: "Market Launch & Start of Sales",
            startDate: "2027-01-01",
            dueDate: "2027-01-31",
          }),
        ],
      }),
    ],
    12,
    new Date(2026, 8, 3),
  );
  const tracks = roadmap.groups[0].projects[0].tracks;

  assert.deepEqual(
    tracks.map((track) => track.segments.map((segment) => segment.phaseId)),
    [["hw-evt"], ["sw-rc"], ["g2m-launch"]],
  );
  assert.equal(roadmap.mappedProjectCount, 1);
  assert.equal(roadmap.launchProjectCount, 1);
});

test("uses forecast dates and reports projects without recognizable tracks", () => {
  const roadmap = createPortfolioRoadmap(
    [
      project({
        id: "forecast",
        wbsItems: [
          wbsItem({
            title: "HW DVT",
            startDate: "2026-07-01",
            dueDate: "2026-07-31",
            forecastStartDate: "2026-09-01",
            forecastDueDate: "2026-10-31",
          }),
        ],
      }),
      project({ id: "empty", name: "Без календаря", portfolio: "" }),
    ],
    12,
    new Date(2026, 8, 3),
  );
  const segment = roadmap.groups
    .flatMap((group) => group.projects)
    .find((entry) => entry.projectId === "forecast")!
    .tracks[0].segments[0];

  assert.equal(segment.startDate, "2026-09-01");
  assert.equal(segment.endDate, "2026-10-31");
  assert.equal(roadmap.mappedProjectCount, 1);
  assert.equal(roadmap.unmappedProjectCount, 1);
  assert.deepEqual(roadmap.groups.map((group) => group.name), ["Аудио", "Устройства"]);
});

test("counts a launch ending today regardless of the current time", () => {
  const roadmap = createPortfolioRoadmap(
    [
      project({
        wbsItems: [
          wbsItem({
            title: "Market Launch & Start of Sales",
            startDate: "2026-09-01",
            dueDate: "2026-09-03",
          }),
        ],
      }),
    ],
    12,
    new Date(2026, 8, 3, 18, 30),
  );

  assert.equal(roadmap.launchProjectCount, 1);
});

test("keeps the next-year launch metric independent of the visible horizon", () => {
  const source = [
    project({
      wbsItems: [
        wbsItem({
          title: "Market Launch & Start of Sales",
          startDate: "2027-08-01",
          dueDate: "2027-08-31",
        }),
        wbsItem({
          id: "pre-launch",
          title: "Pre-Launch Alignment & Announcement Planning",
          startDate: "2026-10-01",
          dueDate: "2026-10-31",
        }),
        wbsItem({
          id: "post-launch",
          title: "Post-Launch Analysis, Retrospective & Handover",
          startDate: "2026-11-01",
          dueDate: "2026-11-30",
        }),
      ],
    }),
  ];
  const today = new Date(2026, 8, 3);

  for (const range of [12, 24, 36] as const) {
    const roadmap = createPortfolioRoadmap(source, range, today);
    assert.equal(roadmap.monthCount, range);
    assert.equal(roadmap.launchProjectCount, 1);
  }
  assert.equal(
    createPortfolioRoadmap(source, 12, today).groups[0].projects[0].tracks[2]
      .segments.length,
    2,
  );
});

test("aligns bars to equal-width calendar months", () => {
  const roadmap = createPortfolioRoadmap(
    [
      project({
        wbsItems: [
          wbsItem({
            title: "HW EVT",
            startDate: "2027-02-01",
            dueDate: "2027-02-28",
          }),
        ],
      }),
    ],
    12,
    new Date(2026, 8, 3),
  );
  const segment = roadmap.groups[0].projects[0].tracks[0].segments[0];

  assert.equal(segment.offset, (7 / 12) * 100);
  assert.equal(segment.width, (1 / 12) * 100);
});

test("preserves gaps and assigns overlapping phases to separate rows", () => {
  const roadmap = createPortfolioRoadmap(
    [
      project({
        wbsItems: [
          wbsItem({
            id: "evt-1",
            title: "HW EVT",
            startDate: "2026-08-01",
            dueDate: "2026-08-15",
          }),
          wbsItem({
            id: "evt-2",
            title: "HW EVT",
            startDate: "2026-10-01",
            dueDate: "2026-10-15",
          }),
          wbsItem({
            id: "dvt",
            title: "HW DVT",
            startDate: "2026-08-10",
            dueDate: "2026-09-15",
          }),
        ],
      }),
    ],
    12,
    new Date(2026, 8, 3),
  );
  const track = roadmap.groups[0].projects[0].tracks[0];

  assert.equal(track.segments.length, 3);
  assert.equal(track.laneCount, 2);
  assert.deepEqual(
    track.segments.map((segment) => segment.row),
    [0, 1, 0],
  );
});

test("ignores cancelled work, repairs reversed dates and stops on hierarchy cycles", () => {
  const first = wbsItem({
    id: "first",
    parentId: "second",
    title: "Аппаратная часть",
    startDate: null,
    dueDate: null,
  });
  const second = wbsItem({
    id: "second",
    parentId: "first",
    title: "HW EVT",
    startDate: "2026-10-31",
    dueDate: "2026-10-01",
  });
  const roadmap = createPortfolioRoadmap(
    [
      project({
        wbsItems: [
          first,
          second,
          wbsItem({ id: "cancelled", title: "HW DVT", status: "CANCELLED" }),
        ],
      }),
    ],
    12,
    new Date(2026, 8, 3),
  );
  const segments = roadmap.groups[0].projects[0].tracks[0].segments;

  assert.equal(segments.length, 1);
  assert.equal(segments[0].startDate, "2026-10-01");
  assert.equal(segments[0].endDate, "2026-10-31");
});

test("uses leaf progress instead of double-counting its phase parent", () => {
  const parent = wbsItem({
    id: "phase",
    title: "HW EVT",
    type: "PHASE",
    startDate: "2026-08-01",
    dueDate: "2026-10-31",
    progress: 30,
  });
  const roadmap = createPortfolioRoadmap(
    [
      project({
        wbsItems: [
          parent,
          wbsItem({
            id: "leaf",
            parentId: parent.id,
            title: "Проверка платы",
            type: "TASK",
            startDate: "2026-09-01",
            dueDate: "2026-09-30",
            progress: 80,
          }),
        ],
      }),
    ],
    12,
    new Date(2026, 8, 3),
  );
  const segment = roadmap.groups[0].projects[0].tracks[0].segments[0];

  assert.equal(segment.itemCount, 1);
  assert.equal(segment.progress, 80);
  assert.equal(segment.startDate, "2026-09-01");
  assert.equal(segment.endDate, "2026-09-30");
});

test("uses forecast dates only as a complete pair", () => {
  const roadmap = createPortfolioRoadmap(
    [
      project({
        wbsItems: [
          wbsItem({
            title: "HW DVT",
            startDate: "2026-08-01",
            dueDate: "2026-08-31",
            forecastStartDate: "2026-10-01",
            forecastDueDate: null,
          }),
        ],
      }),
    ],
    12,
    new Date(2026, 8, 3),
  );
  const segment = roadmap.groups[0].projects[0].tracks[0].segments[0];

  assert.equal(segment.startDate, "2026-08-01");
  assert.equal(segment.endDate, "2026-08-31");
});

test("keeps the minimum touch target inside the horizon", () => {
  const roadmap = createPortfolioRoadmap(
    [
      project({
        wbsItems: [
          wbsItem({
            title: "HW PVT",
            startDate: "2027-06-30",
            dueDate: "2027-06-30",
          }),
        ],
      }),
    ],
    12,
    new Date(2026, 8, 3),
  );
  const segment = roadmap.groups[0].projects[0].tracks[0].segments[0];

  assert.ok(segment.width >= (24 / (12 * 78)) * 100);
  assert.ok(segment.offset + segment.width <= 100);
});
