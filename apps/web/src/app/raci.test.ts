import assert from "node:assert/strict";
import test from "node:test";
import { buildRaciGrid, raciCsv, safeCsvCell, type RaciData } from "./raci";

const data: RaciData = {
  rows: [
    { id: "p", code: "1", title: "Фаза", type: "PHASE", parentId: null },
    { id: "w", code: "1.1", title: "=HYPERLINK(\"x\")", type: "WORK_PACKAGE", parentId: "p" },
  ],
  people: ["Алёна Зуева", "Петров"],
  assignments: [
    { wbsItemId: "p", personName: "Алена Зуева", personKey: "алена зуева", role: "A" },
    { wbsItemId: "p", personName: "Петров", personKey: "петров", role: "R" },
    { wbsItemId: "w", personName: "Петров", personKey: "петров", role: "C" },
  ],
};

test("the grid reads roles by person whatever the spelling, indents rows and flags missing A and R", () => {
  const grid = buildRaciGrid(data);
  assert.deepEqual(grid.map((line) => [line.row.code, line.depth, line.roles, line.missingA, line.missingR]), [
    ["1", 0, ["A", "R"], false, false],
    ["1.1", 1, [null, "C"], true, true],
  ]);
});

test("CSV cells cannot run as formulas and are quoted when needed", () => {
  assert.equal(safeCsvCell("=1+1"), "'=1+1");
  assert.equal(safeCsvCell("-5"), "'-5");
  assert.equal(safeCsvCell('a;"b"'), '"a;""b"""');
  const csv = raciCsv(data, { code: "Код", title: "Строка" });
  assert.ok(csv.startsWith("\uFEFFКод;Строка;Алёна Зуева;Петров"));
  assert.match(csv, /1\.1;"'=HYPERLINK\(""x""\)";;C/);
});
