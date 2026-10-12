import assert from "node:assert/strict";
import test from "node:test";
import type { WbsItem } from "./domainTypes";
import { expandStructureAnswer, forgetStructures, mergeStructureDelta, rememberStructure, trackStructureWrite, type StructureDelta } from "./structureStore";

const row = (id: string, code: string, sortOrder: number, title = id) => ({ id, code, sortOrder, title }) as unknown as WbsItem;
const project = (version: string, items: WbsItem[]) => ({ id: "p", structureVersion: version, wbsItems: items, wbsDependencies: [], criticalPath: null });
const delta = (baseVersion: string, version: string, change: Partial<StructureDelta>): { structureDelta: StructureDelta } => ({
  structureDelta: { projectId: "p", baseVersion, version, items: [], deletedItemIds: [], dependencies: [], deletedDependencyIds: [], criticalPath: null, ...change },
});
const noReload = async () => {
  throw new Error("the project must not be read again");
};

test("a change replaces and adds rows, drops deleted ones and keeps the server's order", () => {
  const state = { version: "4", items: [row("a", "1", 10), row("b", "2", 20), row("c", "3", 30)], dependencies: [], criticalPath: null };
  const next = mergeStructureDelta(state, delta("4", "5", { items: [row("b", "3", 30, "B"), row("n", "2", 15), row("c", "4", 40)], deletedItemIds: ["a"] }).structureDelta);
  assert.equal(next.version, "5");
  assert.deepEqual(next.items.map((item) => [item.id, item.code]), [["n", "2"], ["b", "3"], ["c", "4"]]);
});

test("answers become the whole Structure at their version, in the order the writes happened", async () => {
  forgetStructures();
  rememberStructure(project("1", [row("a", "1", 10)]));
  const first = await expandStructureAnswer({ item: "x", ...delta("1", "2", { items: [row("b", "2", 20)] }) }, noReload);
  assert.equal((first as { structureVersion: string }).structureVersion, "2");
  assert.deepEqual((first as { wbsItems: WbsItem[] }).wbsItems.map((item) => item.id), ["a", "b"]);
  assert.equal((first as { item: string }).item, "x");
  // A late answer of a change the copy already includes leaves it as it is.
  const late = await expandStructureAnswer(delta("1", "2", { items: [row("b", "2", 20, "старое")] }), noReload);
  assert.equal((late as { wbsItems: WbsItem[] }).wbsItems.find((item) => item.id === "b")!.title, "b");
});

test("a change that arrives before the one it follows waits for it while that write is on its way", async () => {
  forgetStructures();
  rememberStructure(project("1", [row("a", "1", 10)]));
  let answerFirst: () => void = () => undefined;
  const firstWrite = trackStructureWrite("PATCH", () => new Promise<void>((resolve) => { answerFirst = resolve; }));
  const second = expandStructureAnswer(delta("2", "3", { items: [row("c", "3", 30)] }), noReload);
  answerFirst();
  await firstWrite;
  const first = expandStructureAnswer(delta("1", "2", { items: [row("b", "2", 20)] }), noReload);
  const [afterSecond] = await Promise.all([second, first]);
  assert.deepEqual((afterSecond as { wbsItems: WbsItem[] }).wbsItems.map((item) => item.id), ["a", "b", "c"]);
});

test("a change this page never saw makes it read the project again, at once when nothing else is on its way", async () => {
  forgetStructures();
  rememberStructure(project("1", [row("a", "1", 10)]));
  let reloads = 0;
  const expanded = await expandStructureAnswer(delta("7", "8", { items: [row("z", "9", 90)] }), async () => {
    reloads += 1;
    return project("8", [row("a", "1", 10), row("z", "9", 90)]);
  });
  assert.equal(reloads, 1);
  assert.equal((expanded as { structureVersion: string }).structureVersion, "8");
  assert.deepEqual((expanded as { wbsItems: WbsItem[] }).wbsItems.map((item) => item.id), ["a", "z"]);
});

test("an older whole Structure never replaces a newer copy", () => {
  forgetStructures();
  rememberStructure(project("5", [row("a", "1", 10)]));
  rememberStructure(project("4", []));
  return expandStructureAnswer(delta("5", "6", {}), noReload).then((expanded) => {
    assert.deepEqual((expanded as { wbsItems: WbsItem[] }).wbsItems.map((item) => item.id), ["a"]);
  });
});
