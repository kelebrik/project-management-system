import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectListItem } from "./domainTypes";
import {
  createPortfolioProjectFilterOptions,
  filterPortfolioRowsByProject,
  selectedPortfolioProjectIds,
} from "./portfolioProjectFilter";

function project(
  id: string,
  name: string,
  status: ProjectListItem["status"] = "ACTIVE",
  portfolio = "Основной",
) {
  return {
    id,
    code: id.toUpperCase(),
    name,
    portfolio,
    status,
  } as ProjectListItem;
}

test("portfolio filter options include every non-closed project in portfolio order", () => {
  const options = createPortfolioProjectFilterOptions([
    project("b", "Бета", "ACTIVE", "Второй"),
    project("closed", "Закрытый", "CLOSED", "Первый"),
    project("c", "Гамма", "ON_HOLD", "Первый"),
    project("a", "Альфа", "DRAFT", "Первый"),
  ]);

  assert.deepEqual(
    options.map(({ id }) => id),
    ["b", "a", "c"],
  );
});

test("exclusion state auto-selects new projects and ignores stale exclusions", () => {
  const excluded = new Set(["b", "removed"]);
  const options = createPortfolioProjectFilterOptions([
    project("a", "Альфа"),
    project("b", "Бета"),
    project("new", "Новый"),
  ]);

  const selected = selectedPortfolioProjectIds(options, excluded);

  assert.deepEqual([...selected], ["a", "new"]);
  assert.equal(options.filter(({ id }) => excluded.has(id)).length, 1);
});

test("portfolio rows are filtered by the shared selected project scope", () => {
  const rows = [
    { projectId: "a", title: "Цель A" },
    { projectId: "b", title: "Цель B" },
  ];

  assert.deepEqual(filterPortfolioRowsByProject(rows, new Set(["b"])), [rows[1]]);
  assert.deepEqual(filterPortfolioRowsByProject(rows, new Set()), []);
});
