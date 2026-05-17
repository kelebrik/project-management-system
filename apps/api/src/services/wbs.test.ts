import assert from "node:assert/strict";
import test from "node:test";
import { buildWbsRenumberPlan, levelFromWbsCode } from "./wbs.js";

test("levelFromWbsCode reads hierarchy depth from dotted code", () => {
  assert.equal(levelFromWbsCode("1"), 1);
  assert.equal(levelFromWbsCode("1.2.3.4.5"), 5);
});

test("buildWbsRenumberPlan recalculates codes, parents and predecessor codes", () => {
  const items = [
    { id: "phase", code: "1", wbsLevel: 1 },
    { id: "package", code: "1.1", wbsLevel: 2 },
    { id: "task-a", code: "1.1.11", wbsLevel: 4 },
    { id: "task-b", code: "1.1.12", wbsLevel: 3 },
  ];
  const dependencies = [{ predecessorId: "task-a", successorId: "task-b" }];

  const plan = buildWbsRenumberPlan(items, dependencies);

  assert.deepEqual(plan.normalizedRows, [
    { id: "phase", level: 1, parentId: null, code: "1" },
    { id: "package", level: 2, parentId: "phase", code: "1.1" },
    { id: "task-a", level: 4, parentId: "package", code: "1.1.1.1" },
    { id: "task-b", level: 3, parentId: "package", code: "1.1.2" },
  ]);
  assert.deepEqual(plan.predecessorsBySuccessor.get("task-b"), ["1.1.1.1"]);
});
