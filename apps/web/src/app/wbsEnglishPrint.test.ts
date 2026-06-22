import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeWbsEnglishSourceTitle,
  resolveWbsEnglishTitle,
} from "./wbsEnglishPrint";

test("WBS English title resolver uses the shared glossary for any project", () => {
  const translation = resolveWbsEnglishTitle({
    code: "8.1",
    title: "Подготовка первой OTA",
    projectName: "Новый проект",
    manualTranslations: {},
    cachedTranslations: {},
  });

  assert.equal(translation.text, "Prepare first OTA");
  assert.equal(translation.source, "glossary");
});

test("WBS English title resolver gives manual edits priority", () => {
  const key = normalizeWbsEnglishSourceTitle("Подготовка первой OTA");
  const translation = resolveWbsEnglishTitle({
    code: "4.1",
    title: "Подготовка первой OTA",
    projectName: "Серия 9000",
    manualTranslations: { [key]: "Prepare OTA package" },
    cachedTranslations: {},
  });

  assert.equal(translation.text, "Prepare OTA package");
  assert.equal(translation.source, "manual");
});

test("WBS English title resolver uses cached translations before original text", () => {
  const key = normalizeWbsEnglishSourceTitle("Новая неизвестная работа");
  const translation = resolveWbsEnglishTitle({
    code: "9.1",
    title: "Новая неизвестная работа",
    projectName: "Новый проект",
    manualTranslations: {},
    cachedTranslations: { [key]: "New unknown work" },
  });

  assert.equal(translation.text, "New unknown work");
  assert.equal(translation.source, "cache");
});
