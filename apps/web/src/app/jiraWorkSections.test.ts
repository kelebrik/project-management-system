import assert from "node:assert/strict";
import test from "node:test";

import type { JiraWorkSection } from "./domainTypes";
import { normalizeJiraWorkSectionDrafts } from "./jiraWorkSections";

function section(overrides: Partial<JiraWorkSection>): JiraWorkSection {
  return {
    id: "section-1",
    projectId: "project-1",
    sortOrder: 0,
    title: "Раздел 1",
    jql: "",
    filterUrl: "",
    createdAt: "2026-06-09T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
    issues: [],
    ...overrides,
  };
}

test("normalizeJiraWorkSectionDrafts creates three default sections", () => {
  const drafts = normalizeJiraWorkSectionDrafts([]);

  assert.equal(drafts.length, 3);
  assert.deepEqual(
    drafts.map((draft) => draft.title),
    ["Раздел 1", "Раздел 2", "Раздел 3"],
  );
});

test("normalizeJiraWorkSectionDrafts keeps saved names and additional sections", () => {
  const drafts = normalizeJiraWorkSectionDrafts([
    section({
      id: "section-1",
      sortOrder: 0,
      title: "Тикеты под риском",
      jql: "project = PMS",
      filterUrl: "https://jira.example/issues/?filter=123",
    }),
    section({
      id: "section-4",
      sortOrder: 3,
      title: "Дополнительный раздел",
      jql: "",
    }),
  ]);

  assert.equal(drafts.length, 4);
  assert.equal(drafts[0]?.title, "Тикеты под риском");
  assert.equal(drafts[0]?.jql, "project = PMS");
  assert.equal(drafts[0]?.filterUrl, "https://jira.example/issues/?filter=123");
  assert.equal(drafts[3]?.title, "Дополнительный раздел");
});
