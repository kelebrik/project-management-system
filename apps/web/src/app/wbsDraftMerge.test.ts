import assert from "node:assert/strict";
import test from "node:test";

import type { WbsDependency, WbsItem } from "./domainTypes";
import { wbsToForm } from "./formState";
import { mergeWbsDrafts } from "./wbsDraftMerge";

function wbsItem(overrides: Partial<WbsItem>): WbsItem {
  return {
    id: "a",
    parentId: null,
    code: "1",
    title: "Работа",
    type: "TASK",
    status: "NOT_STARTED",
    owner: "",
    startDate: "2026-07-01T00:00:00.000Z",
    dueDate: "2026-07-03T00:00:00.000Z",
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
    workDays: 3,
    calendarDays: 3,
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
    mattermostUrl: null,
    description: null,
    comment: null,
    closedAt: null,
    sortOrder: 10,
    ...overrides,
  } as WbsItem;
}

const noDependencies: WbsDependency[] = [];

test("text typed in another row survives a save response", () => {
  const a = wbsItem({ id: "a", title: "A" });
  const b = wbsItem({ id: "b", code: "2", title: "B" });
  const local = {
    a: { ...wbsToForm(a), title: "A saved" },
    b: { ...wbsToForm(b), title: "B being typ" },
  };
  const next = [
    wbsItem({ id: "a", title: "A saved" }),
    wbsItem({ id: "b", code: "2", title: "B", dueDate: "2026-07-10T00:00:00.000Z" }),
  ];

  const merged = mergeWbsDrafts({
    localDrafts: local,
    previous: { items: [a, b], dependencies: noDependencies },
    next: { items: next, dependencies: noDependencies },
    sentDrafts: { a: local.a },
  });

  assert.equal(merged.a.title, "A saved");
  assert.equal(merged.b.title, "B being typ");
  // The server's recalculated date still reaches the row being typed in.
  assert.equal(merged.b.dueDate, "2026-07-10");
});

test("text typed after the request was sent survives in the same cell", () => {
  const a = wbsItem({ id: "a", title: "Old" });
  const sent = { ...wbsToForm(a), title: "New tit" };
  const local = { a: { ...sent, title: "New title, still typing" } };

  const merged = mergeWbsDrafts({
    localDrafts: local,
    previous: { items: [a], dependencies: noDependencies },
    next: { items: [wbsItem({ id: "a", title: "New tit" })], dependencies: noDependencies },
    sentDrafts: { a: sent },
  });

  assert.equal(merged.a.title, "New title, still typing");
});

test("server normalisation applies to fields not edited after sending", () => {
  const a = wbsItem({ id: "a", title: "Old" });
  const sent = { ...wbsToForm(a), title: "  padded  " };

  const merged = mergeWbsDrafts({
    localDrafts: { a: sent },
    previous: { items: [a], dependencies: noDependencies },
    next: { items: [wbsItem({ id: "a", title: "padded" })], dependencies: noDependencies },
    sentDrafts: { a: sent },
  });

  assert.equal(merged.a.title, "padded");
});

test("rows removed on the server disappear and new rows arrive", () => {
  const a = wbsItem({ id: "a" });
  const gone = wbsItem({ id: "gone", code: "2" });
  const merged = mergeWbsDrafts({
    localDrafts: { a: wbsToForm(a), gone: { ...wbsToForm(gone), title: "edited" } },
    previous: { items: [a, gone], dependencies: noDependencies },
    next: { items: [a, wbsItem({ id: "new", code: "3", title: "New row" })], dependencies: noDependencies },
  });

  assert.deepEqual(Object.keys(merged).sort(), ["a", "new"]);
  assert.equal(merged.new.title, "New row");
});

test("without a previous snapshot the server state replaces the drafts", () => {
  const a = wbsItem({ id: "a", title: "Server" });
  const merged = mergeWbsDrafts({
    localDrafts: { a: { ...wbsToForm(a), title: "Other project" } },
    previous: null,
    next: { items: [a], dependencies: noDependencies },
  });

  assert.equal(merged.a.title, "Server");
});
