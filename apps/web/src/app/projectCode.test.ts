import assert from "node:assert/strict";
import test from "node:test";
import { suggestProjectCode } from "./projectCode";

test("a code is made from the first letters of the name, in Latin", () => {
  assert.equal(suggestProjectCode("Новый мобильный банк", []), "NMB");
  assert.equal(suggestProjectCode("Цифровой хаб: Юг", []), "TKY");
  assert.equal(suggestProjectCode("CRM migration 2027", []), "CM2");
  assert.equal(suggestProjectCode("Платформа", []), "PLAT");
});

test("a taken code, in any case, gets a number", () => {
  assert.equal(suggestProjectCode("Новый мобильный банк", ["nmb"]), "NMB-2");
  assert.equal(suggestProjectCode("Новый мобильный банк", ["NMB", "NMB-2"]), "NMB-3");
});

test("a name without letters or with one letter falls back to PRJ", () => {
  assert.equal(suggestProjectCode("", []), "PRJ");
  assert.equal(suggestProjectCode("— !", []), "PRJ");
  assert.equal(suggestProjectCode("Я", []), "YA");
  assert.equal(suggestProjectCode("Ь", ["PRJ"]), "PRJ-2");
});
