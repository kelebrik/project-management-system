import assert from "node:assert/strict";
import test from "node:test";
import type { WbsItem } from "../domainTypes";
import { guessColumnFields, readDate, tableToWbsRows, wbsToTable } from "./wbsTable";

const item = (extra: Partial<WbsItem>) => ({ id: "a", code: "1", title: "Фаза", type: "PHASE", status: "IN_PROGRESS", owner: "", startDate: "2026-10-01T00:00:00.000Z", dueDate: null, workDays: null, progress: 40, priority: null, comment: null, sortOrder: 10, predecessor1: null, predecessor2: null, predecessor3: null, predecessor4: null, predecessor5: null, predecessor6: null, ...extra }) as WbsItem;

test("the Structure exported to a table reads back into the same rows", () => {
  const items = [item({ id: "b", code: "1.1", title: "Задача", type: "TASK", owner: "Петров", workDays: 3, predecessor1: "1.2", predecessor2: "2", sortOrder: 20, comment: "Важно" }), item({})];
  const table = wbsToTable(items, "ru");
  assert.deepEqual(table.headers.slice(0, 4), ["ID", "Код", "Название", "Тип"]);
  assert.deepEqual(table.rows[1].slice(0, 9), ["b", "1.1", "Задача", "Задача", "В работе", "Петров", "2026-10-01", "", "3"]);
  const fields = guessColumnFields(table.headers);
  assert.equal(fields.includes(null), false);
  const { rows, problems } = tableToWbsRows(table, fields);
  assert.deepEqual(problems, []);
  assert.deepEqual(rows[1], { id: "b", code: "1.1", title: "Задача", type: "TASK", status: "IN_PROGRESS", owner: "Петров", startDate: "2026-10-01", dueDate: null, workDays: 3, predecessors: ["1.2", "2"], progress: 40, priority: null, comment: "Важно" });
  assert.equal(tableToWbsRows(wbsToTable(items, "en"), guessColumnFields(wbsToTable(items, "en").headers)).rows[1].status, "IN_PROGRESS");
});

test("a foreign table is matched by its headers and read cell by cell", () => {
  assert.deepEqual(guessColumnFields(["WBS", "Task Name", "Start", "Finish", "Something", "Duration", "Resource Names"]), ["code", "title", "startDate", "dueDate", null, "workDays", "owner"]);
  const { rows, problems, skipped } = tableToWbsRows(
    { headers: [], rows: [["1.", "Старт", "01.10.2026", "2026-10-31", "x", "5", "Ана"], ["", "", "", "", "", "", ""], ["", "без кода", "", "", "", "", ""], ["2", "Плохие", "10/1/2026", "31.02.2026", "", "1,5", ""]] },
    ["code", "title", "startDate", "dueDate", null, "workDays", "owner"],
  );
  assert.deepEqual(rows, [{ code: "1", title: "Старт", startDate: "2026-10-01", dueDate: "2026-10-31", workDays: 5, owner: "Ана" }]);
  assert.equal(skipped, 1);
  assert.deepEqual(problems.map((problem) => [problem.row, problem.field, problem.kind]), [[5, "startDate", "date"], [5, "dueDate", "date"], [5, "workDays", "number"]]);
  assert.equal(readDate("2026-10-01 00:00:00"), "2026-10-01");
  assert.equal(readDate("32.13.2026"), undefined);
  assert.equal(readDate("2026-99-99"), undefined);
});
