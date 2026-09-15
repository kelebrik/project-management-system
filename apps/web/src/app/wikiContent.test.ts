import assert from "node:assert/strict";
import test from "node:test";

import type { WikiGroup } from "./wikiContent";
import { englishWikiGroups } from "../i18n/wiki.en";
import { wikiGroups } from "./wikiContent";

const articlesOf = (groups: WikiGroup[]) =>
  groups.flatMap((group) => group.articles);

const articleTextById = (groups: WikiGroup[], id: string) => {
  const article = articlesOf(groups).find((candidate) => candidate.id === id);
  assert.ok(article, `article ${id} is missing`);
  return (article?.sections ?? [])
    .flatMap((section) => section.points)
    .join(" ");
};

test("FAQ groups and articles have unique anchors and non-empty content", () => {
  const groupIds = wikiGroups.map((group) => group.id);
  const articles = articlesOf(wikiGroups);
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

test("English FAQ keeps the same anchors and section shape as the Russian FAQ", () => {
  assert.deepEqual(
    englishWikiGroups.map((group) => group.id),
    wikiGroups.map((group) => group.id),
  );
  assert.deepEqual(
    articlesOf(englishWikiGroups).map((article) => article.id),
    articlesOf(wikiGroups).map((article) => article.id),
  );
  assert.deepEqual(
    articlesOf(englishWikiGroups).map((article) => article.sections.length),
    articlesOf(wikiGroups).map((article) => article.sections.length),
  );
  assert.deepEqual(
    articlesOf(englishWikiGroups).flatMap((article) =>
      article.sections.map((section) => section.points.length),
    ),
    articlesOf(wikiGroups).flatMap((article) =>
      article.sections.map((section) => section.points.length),
    ),
  );
});

test("FAQ documents Structure immediately before Jira Work", () => {
  assert.match(
    articleTextById(wikiGroups, "wiki-navigation-access"),
    /Текучка, Структура, Работы Jira, Паспорт/,
  );
  assert.match(
    articleTextById(englishWikiGroups, "wiki-navigation-access"),
    /Current Work, WBS, Jira Work, Charter/,
  );
});

test("FAQ documents the current work selection rules", () => {
  const text = articleTextById(wikiGroups, "wiki-current-work");

  assert.match(text, /Задача и Результат/);
  assert.match(text, /Провалено, Сделано или Отменено/);
  assert.match(text, /страницы Структура/);
});

test("FAQ separates the project title from the section title", () => {
  const russian = articleTextById(wikiGroups, "wiki-navigation-access");
  const english = articleTextById(englishWikiGroups, "wiki-navigation-access");

  assert.match(russian, /название выбранного проекта, а не название раздела/);
  assert.match(russian, /заголовком H2 внутри рабочей области/);
  assert.match(
    english,
    /H1 is the name of the selected project, not the name of the section/,
  );
  assert.match(english, /shown as an H2 inside the workspace/);
});

test("FAQ documents the locale-specific WBS toolbar buttons", () => {
  const russian = articleTextById(wikiGroups, "wiki-wbs-model");
  const english = articleTextById(englishWikiGroups, "wiki-wbs-model");

  assert.match(russian, /Кнопка полноэкранного режима доступна в обеих локалях/);
  assert.match(russian, /Кнопка PDF доступна в обеих локалях/);
  assert.match(russian, /Кнопки PDF EN и EN показываются только в русской локали/);
  assert.match(english, /full-screen button is available in both locales/);
  assert.match(english, /PDF button is available in both locales/);
  assert.match(
    english,
    /PDF EN and EN buttons are shown only in the Russian locale/,
  );
});

test("FAQ documents both the full and the selective baseline capture", () => {
  const russian = articleTextById(wikiGroups, "wiki-wbs-algorithms");
  const english = articleTextById(englishWikiGroups, "wiki-wbs-algorithms");

  assert.match(russian, /Полная фиксация базового плана/);
  assert.match(russian, /доступна только администратору системы/);
  assert.match(russian, /не создает новую версию WbsBaseline/);
  assert.match(english, /full baseline capture/);
  assert.match(english, /available only to the system administrator/);
  assert.match(english, /does not create a new WbsBaseline version/);
});

test("FAQ documents the actual Gantt settings", () => {
  const russian = articleTextById(wikiGroups, "wiki-gantt-critical-path");
  const english = articleTextById(englishWikiGroups, "wiki-gantt-critical-path");

  assert.match(russian, /Недели, Месяцы и Кварталы/);
  assert.match(russian, /30, 90, 180 дней или Все/);
  assert.match(russian, /Настройки вида/);
  assert.match(english, /Weeks, Months and Quarters/);
  assert.match(english, /30, 90, 180 days or All/);
  assert.match(english, /View settings/);
});

test("FAQ separates the synthetic cloud demo from the read-only corporate Jira", () => {
  const russian = articleTextById(wikiGroups, "wiki-jira-issues");
  const english = articleTextById(englishWikiGroups, "wiki-jira-issues");

  assert.match(russian, /доступа к Jira нет вообще/);
  assert.match(russian, /синтетические/);
  assert.match(russian, /PUT, PATCH и DELETE блокируются/);
  assert.match(english, /no Jira access at all/);
  assert.match(english, /synthetic/);
  assert.match(english, /PUT, PATCH or DELETE, is blocked/);
});

test("FAQ does not claim that the placeholder budget screen is implemented", () => {
  const russian = articleTextById(wikiGroups, "wiki-changes-budget-artifacts");
  const english = articleTextById(
    englishWikiGroups,
    "wiki-changes-budget-artifacts",
  );

  assert.match(russian, /заглушка/);
  assert.doesNotMatch(russian, /для будущего план-факт-прогноза/);
  assert.match(english, /placeholder/);
  assert.doesNotMatch(english, /for a future plan-fact-forecast/);
});
