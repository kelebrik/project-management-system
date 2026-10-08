import assert from "node:assert/strict";
import test from "node:test";
import type { Issue } from "./domainTypes";
import { issueSectionGroups } from "./issueSections";

const issue = (id: string, category: string) => ({ id, category }) as Issue;

test("issues without a section lead the list without a heading; named sections follow", () => {
  const groups = issueSectionGroups([
    issue("a", "Пульт"),
    issue("b", ""),
    issue("c", "Без раздела"),
    issue("d", " Пульт "),
    issue("e", "Плата"),
  ]);
  assert.deepEqual(
    groups.map(([section, items]) => [section, items.map((item) => item.id)]),
    [[null, ["b", "c"]], ["Пульт", ["a", "d"]], ["Плата", ["e"]]],
  );
  assert.deepEqual(issueSectionGroups([issue("a", "Пульт")]).map(([section]) => section), ["Пульт"]);
});
