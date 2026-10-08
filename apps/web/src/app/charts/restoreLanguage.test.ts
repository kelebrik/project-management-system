import assert from "node:assert/strict";
import test from "node:test";

import { restoreLanguage } from "./restoreLanguage";

test("the chart language is put back exactly, keys added by a page removed", () => {
  const defaults = { decimalPoint: ".", thousandsSep: " ", downloadPNG: "Download PNG", exportData: { categoryHeader: "Category" } };
  const lang: Record<string, unknown> = structuredClone(defaults);
  Object.assign(lang, { locale: "ru-RU", decimalPoint: ",", downloadPNG: "Скачать PNG", exportData: { categoryHeader: "Категория", categoryDatetimeHeader: "Дата" } });
  restoreLanguage(lang, defaults);
  assert.deepEqual(lang, defaults);
  assert.equal("locale" in lang, false);
  // Restoring does not share objects with the defaults kept for next time.
  (lang.exportData as Record<string, string>).categoryHeader = "changed";
  assert.equal(defaults.exportData.categoryHeader, "Category");
});
