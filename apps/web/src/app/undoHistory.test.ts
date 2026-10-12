import assert from "node:assert/strict";
import test from "node:test";
import type { WbsDependency, WbsItem } from "./domainTypes";
import type { StructureChange } from "./structureStore";
import { capUndoHistory, openUndoStep, rebaseAfterExactRevert, recordChange, revertRequest, stepIsEmpty, UNDO_STEPS } from "./undoHistory";

const row = (id: string, title: string, updatedAt = "2026-10-12T10:00:00.000Z") => ({ id, code: id, title, updatedAt }) as unknown as WbsItem;
const link = (id: string, lagDays: number) => ({ id, predecessorId: "a", successorId: "b", type: "FS", lagDays }) as unknown as WbsDependency;
const change = (version: string, items: StructureChange["items"], links: StructureChange["links"] = []): StructureChange => ({ projectId: "p", baseVersion: String(Number(version) - 1), version, requestPath: "/api/wbs-items/a", tag: null, complete: true, items, links });

test("the requests of one edit make one step: first state before, last state after", () => {
  const step = openUndoStep("p");
  recordChange(step, change("5", [{ id: "a", before: row("a", "Было"), after: row("a", "Промежуточно") }]));
  recordChange(step, change("6", [{ id: "a", before: row("a", "Промежуточно"), after: row("a", "Стало") }, { id: "n", before: null, after: row("n", "Новая") }]));
  assert.equal(step.afterVersion, "6");
  assert.equal(step.items.get("a")!.before!.title, "Было");
  assert.equal(step.items.get("a")!.after!.title, "Стало");
  assert.deepEqual(revertRequest(step), {
    baseVersion: "6",
    put: { items: [row("a", "Было")], links: [] },
    remove: { itemIds: ["n"], linkIds: [] },
    expect: { items: [row("a", "Стало"), row("n", "Новая")], absentItemIds: [], links: [], absentLinkIds: [] },
  });
});

test("a row that ends as it began, or only got a new write time, leaves the step", () => {
  const step = openUndoStep("p");
  recordChange(step, change("2", [{ id: "a", before: row("a", "Было"), after: row("a", "Было", "2026-10-12T11:00:00.000Z") }]));
  recordChange(step, change("3", [{ id: "b", before: row("b", "Было"), after: row("b", "Стало") }], [{ id: "l", before: null, after: link("l", 1) }]));
  recordChange(step, change("4", [{ id: "b", before: row("b", "Стало"), after: row("b", "Было") }], [{ id: "l", before: link("l", 1), after: null }]));
  assert.ok(stepIsEmpty(step));
});

test("a change the page could not follow makes the step incomplete; another project's change is ignored", () => {
  const step = openUndoStep("p");
  recordChange(step, { ...change("2", [{ id: "a", before: row("a", "x"), after: row("a", "y") }]), projectId: "other" });
  assert.ok(stepIsEmpty(step));
  recordChange(step, { ...change("3", []), complete: false });
  assert.ok(step.incomplete);
});

test("the history keeps 20 steps, fewer when they are large, and always the newest one", () => {
  const steps = Array.from({ length: 25 }, (_, index) => {
    const step = openUndoStep("p");
    recordChange(step, change(String(index + 1), [{ id: `r${index}`, before: row(`r${index}`, "a"), after: row(`r${index}`, "b") }]));
    return step;
  });
  const kept = capUndoHistory(steps);
  assert.equal(kept.length, UNDO_STEPS);
  assert.equal(kept.at(-1), steps.at(-1));
  const huge = openUndoStep("p");
  recordChange(huge, change("99", Array.from({ length: 70_000 }, (_, index) => ({ id: `h${index}`, before: null, after: row(`h${index}`, "x") }))));
  assert.deepEqual(capUndoHistory([...steps, huge]), [huge]);
});

test("a step taken back without recalculation moves the previous step to the version it left, if nothing came between", () => {
  const first = openUndoStep("p");
  recordChange(first, change("5", [{ id: "a", before: row("a", "1"), after: row("a", "2") }]));
  const second = openUndoStep("p");
  recordChange(second, change("6", [{ id: "a", before: row("a", "2"), after: row("a", "3") }]));
  rebaseAfterExactRevert(first, second, "7");
  assert.equal(first.afterVersion, "7");
  // Someone wrote between the two steps: the previous step keeps its version, and the server recalculates.
  const third = openUndoStep("p");
  recordChange(third, change("9", [{ id: "a", before: row("a", "3"), after: row("a", "4") }]));
  rebaseAfterExactRevert(first, third, "10");
  assert.equal(first.afterVersion, "7");
});
