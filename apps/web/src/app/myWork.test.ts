import assert from "node:assert/strict";
import test from "node:test";
import { groupByProject, shiftWeek, type MyWorkItem } from "./myWork";

const item = (id: string, projectId: string): MyWorkItem => ({
  id,
  projectId,
  projectCode: projectId.toUpperCase(),
  projectName: projectId,
  code: id,
  title: id,
  status: "IN_PROGRESS",
  startDate: null,
  dueDate: null,
  overdue: false,
  checkIn: null,
});

test("my work is grouped by project in the order it came", () => {
  assert.deepEqual(groupByProject([item("a", "tv"), item("b", "audio"), item("c", "tv")]).map((group) => [group.code, group.items.map((row) => row.id)]), [
    ["TV", ["a", "c"]],
    ["AUDIO", ["b"]],
  ]);
});

test("weeks move by seven days from Monday", () => {
  assert.equal(shiftWeek("2026-10-05", -1), "2026-09-28");
  assert.equal(shiftWeek("2026-10-05", 1), "2026-10-12");
});
