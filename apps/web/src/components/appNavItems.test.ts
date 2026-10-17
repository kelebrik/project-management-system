import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";

test("the project's sections split into the bar and «Ещё», disabled modules in neither", async () => {
  Object.assign(globalThis, { React });
  const { MORE_PROJECT_VIEWS, projectNavItems, splitProjectNavItems } = await import("./appNavItems");
  const all = splitProjectNavItems(projectNavItems, () => true);
  assert.deepEqual(all.more.map((item) => item.view), [...MORE_PROJECT_VIEWS]);
  assert.deepEqual(all.pinned.map((item) => item.view), [
    "project-overview", "project-schedule", "project-gantt", "project-current-work", "project-structure",
    "project-issues", "project-raid", "project-artifacts", "project-history",
  ]);
  // The bar keeps its order; a module switched off leaves both lists.
  const withoutJira = splitProjectNavItems(projectNavItems, (key) => key !== "jiraWork" && key !== "raid");
  assert.equal(withoutJira.more.some((item) => item.view === "project-jira-work"), false);
  assert.equal(withoutJira.pinned.some((item) => item.view === "project-raid"), false);
  assert.equal(withoutJira.pinned.length + withoutJira.more.length, projectNavItems.length - 2);
});
