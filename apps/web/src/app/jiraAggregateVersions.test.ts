import assert from "node:assert/strict";
import test from "node:test";
import { createTranslator } from "../i18n/translate";
import { jiraAggregateVersionLabel } from "./jiraAggregateVersions";

const t = createTranslator("ru");

test("system aggregates show the standard version shared by all projects, not the local revision", () => {
  assert.equal(jiraAggregateVersionLabel({ version: 5, publishedVersion: 5, standard: { version: 1, status: "current" } }, t), "стандарт v1");
  assert.equal(jiraAggregateVersionLabel({ version: 1, publishedVersion: 1, standard: { version: 1, status: "current" } }, t), "стандарт v1");
  assert.equal(
    jiraAggregateVersionLabel({ version: 4, publishedVersion: 3, standard: { version: 2, status: "customized" } }, t),
    "стандарт v2 · изменён в проекте · есть черновик",
  );
  assert.equal(jiraAggregateVersionLabel({ version: 1, publishedVersion: 1, standard: { version: 3, status: "behind" } }, t), "стандарт v3 · обновляется до стандарта");
});

test("an aggregate of the project's own keeps its local revisions", () => {
  assert.equal(jiraAggregateVersionLabel({ version: 3, publishedVersion: 2, standard: null }, t), "v3 / опубликована v2");
  assert.equal(jiraAggregateVersionLabel({ version: 1, publishedVersion: null, standard: null }, t), "v1 · черновик");
});
