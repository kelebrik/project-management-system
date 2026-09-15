import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "./I18nProvider";
import { AuthPage } from "../components/AuthPage";
import { readLocale, writeLocale, LANGUAGE_STORAGE_KEY } from "./locale";
import { createTranslator } from "./translate";
import { createPluralTranslator, pluralMessages } from "./plurals";
import { createFormatters } from "./formatters";
import { createJiraMetadata } from "./jiraMetadata";
import { reportMessages } from "./reportMessages";
import { work } from "./work";
import { catalogue } from "./messages";
import { admin } from "./admin";
import { common } from "./common";
import { controls } from "./controls";
import { navigation } from "./navigation";
import { projects } from "./projects";
import { translations, type TranslationKey } from "./types";

Object.assign(globalThis, { React });

test("English is the default; explicit Russian survives storage reload; blocked storage is optional", () => {
  assert.equal(readLocale(), "en");
  assert.equal(readLocale({ getItem: () => "invalid" }), "en");
  assert.equal(readLocale({ getItem: () => { throw new Error("blocked"); } }), "en");
  let stored = "";
  const storage = { getItem: () => stored, setItem: (key: string, value: string) => { assert.equal(key, LANGUAGE_STORAGE_KEY); stored = value; } };
  writeLocale(storage, "ru");
  assert.equal(readLocale(storage), "ru");
  writeLocale(storage, "en");
  assert.equal(readLocale(storage), "en");
  assert.doesNotThrow(() => writeLocale({ setItem: () => { throw new Error("blocked"); } }, "ru"));
});

test("dictionary domains have unique keys and matching interpolation parameters", () => {
  const keys = [common, controls, navigation, projects, admin, catalogue, work, reportMessages].flatMap(Object.keys);
  assert.equal(new Set(keys).size, keys.length, "Duplicate translation keys");
  const slots = (text: string) => [...text.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
  for (const [key, message] of Object.entries(translations)) {
    assert.ok(message.en.trim(), `Empty English entry: ${key}`);
    assert.ok(message.ru.trim(), `Empty Russian entry: ${key}`);
    assert.deepEqual(slots(message.en), slots(message.ru), `Parameters differ: ${key}`);
  }
  for (const message of Object.values(pluralMessages)) {
    for (const locale of ["en", "ru"] as const) assert.deepEqual(Object.keys(message[locale]).sort(), ["few", "many", "one", "other"]);
  }
});

test("interpolation preserves user text including replacement syntax and nested braces", () => {
  assert.equal(createTranslator("en")("picker.open", { code: "$& {time} <script>" }), "Project $& {time} <script>. Open project list");
  assert.equal(createTranslator("en")("missing.key" as TranslationKey), "missing.key");
});

test("Russian and English counts use their own plural rules", () => {
  const ru = createPluralTranslator("ru"), en = createPluralTranslator("en");
  assert.equal(ru("table.rows", 1), "1 строка");
  assert.equal(ru("table.rows", 2), "2 строки");
  assert.equal(ru("table.rows", 5), "5 строк");
  assert.equal(ru("table.rows", 21), "21 строка");
  assert.equal(ru("table.rows", 1.5), "1.5 строки");
  assert.equal(en("table.rows", 1), "1 row");
  assert.equal(en("table.rows", 2), "2 rows");
});

test("formatting is explicit, does not leak between locales and keeps Monday first", () => {
  const en = createFormatters("en"), ru = createFormatters("ru");
  assert.equal(en.MONTH_LABELS[0], "January");
  assert.equal(ru.MONTH_LABELS[0], "Январь");
  assert.equal(en.WEEKDAY_LABELS[0], "Mon");
  assert.equal(ru.WEEKDAY_LABELS[0], "пн");
  assert.equal(en.signedDaysLabel(1), "+1 day");
  assert.equal(ru.signedDaysLabel(1), "+1 дн.");
  assert.equal(en.date(null), "Not set");
  assert.equal(ru.date(null), "не задано");
  assert.equal(en.date("invalid"), "—");
});

test("Jira duration metrics use hours below one day and days above it in both locales", () => {
  const en = createJiraMetadata("en"), ru = createJiraMetadata("ru");
  assert.equal(en.formatJiraAnalyticsMetric("p85Duration", 12), "12 h");
  assert.equal(en.formatJiraAnalyticsMetric("p85Duration", 48), "2 d");
  assert.equal(ru.formatJiraAnalyticsMetric("p85Duration", 12), "12 ч");
  assert.equal(ru.formatJiraAnalyticsMetric("p85Duration", 48), "2 дн.");
  assert.equal(en.jiraAnalyticsFilterLogicLabel("and"), "AND");
  assert.equal(ru.jiraAnalyticsFilterLogicLabel("or"), "ИЛИ");
});

test("login renders both locales without translating error or user data", () => {
  for (const locale of ["en", "ru"] as const) {
    const html = renderToStaticMarkup(React.createElement(I18nProvider, { initialLocale: locale, children: React.createElement(AuthPage, { error: "Backend message <tag>", keycloakEnabled: true, onKeycloakLogin() {}, onPasswordLogin: async () => {} }) }));
    assert.match(html, locale === "en" ? /Sign in with SSO/ : /Войти через SSO/);
    assert.match(html, locale === "en" ? /Switch to Russian/ : /Переключить на английский/);
    assert.match(html, /Backend message &lt;tag&gt;/);
    assert.match(html, /type="password"/);
  }
});
