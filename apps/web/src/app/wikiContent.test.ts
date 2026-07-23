import assert from "node:assert/strict";
import test from "node:test";

import { wikiGroups } from "./wikiContent";

test("FAQ groups and articles have unique anchors and non-empty content", () => {
  const groupIds = wikiGroups.map((group) => group.id);
  const articles = wikiGroups.flatMap((group) => group.articles);
  const articleIds = articles.map((article) => article.id);

  assert.equal(new Set(groupIds).size, groupIds.length);
  assert.equal(new Set(articleIds).size, articleIds.length);
  assert.ok(wikiGroups.every((group) => group.articles.length > 0));
  assert.ok(articles.every((article) => article.sections.length > 0));
  assert.ok(
    articles.every((article) =>
      article.sections.every(
        (section) => section.heading.trim() && section.points.length > 0,
      ),
    ),
  );
});

test("FAQ documents the current work selection rules", () => {
  const article = wikiGroups
    .flatMap((group) => group.articles)
    .find((candidate) => candidate.id === "wiki-current-work");
  const text = article?.sections.flatMap((section) => section.points).join(" ") ?? "";

  assert.ok(article);
  assert.match(text, /последние пять рабочих дней/);
  assert.match(text, /Провалено или Отменено/);
  assert.match(text, /страницы Структура/);
});
