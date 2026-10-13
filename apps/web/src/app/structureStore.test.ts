import assert from "node:assert/strict";
import test from "node:test";
import type { WbsCriticalPath, WbsItem } from "./domainTypes";
import { expandStructureAnswer, forgetStructures, mergeStructureDelta, onStructureChange, rememberStructure, trackStructureWrite, type StructureChange, type StructureChanges, type StructureDelta } from "./structureStore";

const row = (id: string, code: string, sortOrder: number, title = id) => ({ id, code, sortOrder, title }) as unknown as WbsItem;
const project = (version: string, items: WbsItem[]) => ({ id: "p", structureVersion: version, wbsItems: items, wbsDependencies: [], criticalPath: null });
const delta = (baseVersion: string, version: string, change: Partial<StructureDelta>): { structureDelta: StructureDelta } => ({
  structureDelta: { projectId: "p", baseVersion, version, items: [], deletedItemIds: [], dependencies: [], deletedDependencyIds: [], criticalPath: null, ...change },
});
const noReload = async () => {
  throw new Error("the project must not be read again");
};

test("a change replaces and adds rows, drops deleted ones and keeps the server's order", () => {
  const state = { version: "4", items: [row("a", "1", 10), row("b", "2", 20), row("c", "3", 30)], dependencies: [], criticalPath: null, calendarOverrides: null, today: null };
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

test("each applied change is announced with the rows as they were and as they became, and the write's tag", async () => {
  forgetStructures();
  rememberStructure(project("1", [row("a", "1", 10, "Было")]));
  const heard: StructureChange[] = [];
  onStructureChange((change) => heard.push(change));
  await expandStructureAnswer(delta("1", "2", { items: [row("a", "1", 10, "Стало"), row("n", "2", 20)] }), noReload, "/api/wbs-items/a", "step-1");
  assert.equal(heard.length, 1);
  assert.equal(heard[0]!.tag, "step-1");
  assert.equal(heard[0]!.requestPath, "/api/wbs-items/a");
  assert.deepEqual(heard[0]!.items.map((entry) => [entry.id, entry.before?.title ?? null, entry.after?.title ?? null]), [["a", "Было", "Стало"], ["n", null, "n"]]);
  // A gap is announced as a change the page could not follow.
  await expandStructureAnswer(delta("9", "10", {}), async () => project("10", []), "/api/wbs-items/b", "step-2");
  assert.equal(heard[1]!.complete, false);
});

const task = (id: string, code: string, sortOrder: number, startDate: string, workDays: number) =>
  ({
    id, code, title: id, sortOrder, type: "TASK", status: "NOT_STARTED", startDate: `${startDate}T00:00:00.000Z`, dueDate: null, workDays, calendarCode: "RU", leadLagDays: 0,
    predecessor1: null, predecessor2: null, predecessor3: null, predecessor4: null, predecessor5: null, predecessor6: null,
  }) as unknown as WbsItem;
const calendar = [{ id: "o", projectId: "p", calendarCode: "RU" as const, date: "2026-10-14T00:00:00.000Z", isWorkingDay: false, description: null }];
const loaded = (version: string, items: WbsItem[]) => ({ ...project(version, items), calendarOverrides: calendar });
const browserDelta = (baseVersion: string, version: string, change: Partial<StructureDelta>) => {
  const { structureDelta } = delta(baseVersion, version, change);
  delete structureDelta.criticalPath;
  return { structureDelta: { ...structureDelta, today: "2026-10-13" } };
};

test("a change without its critical path gets one worked out here, with the project calendar, in the server's date format", async () => {
  forgetStructures();
  rememberStructure(loaded("1", [task("a", "1", 10, "2026-10-12", 3)]));
  const expanded = (await expandStructureAnswer(browserDelta("1", "2", { items: [task("b", "2", 20, "2026-10-12", 1)] }), noReload)) as unknown as { criticalPath: WbsCriticalPath };
  // Three working days from Monday skip the day off on Wednesday.
  assert.equal(expanded.criticalPath.projectFinishDate, "2026-10-15T00:00:00.000Z");
  assert.deepEqual(expanded.criticalPath.criticalItemIds, ["a"]);
  assert.equal(expanded.criticalPath.items.find((item) => item.itemId === "b")!.totalFloatWorkDays, 2);
});

test("a critical path the server sent is kept as it is, even an empty one", async () => {
  forgetStructures();
  rememberStructure(loaded("1", [task("a", "1", 10, "2026-10-12", 3)]));
  const expanded = (await expandStructureAnswer(delta("1", "2", { items: [task("b", "2", 20, "2026-10-12", 1)], criticalPath: null }), noReload)) as unknown as { criticalPath: WbsCriticalPath | null };
  assert.equal(expanded.criticalPath, null);
});

test("without the calendar or the server's day the project is read again rather than guessed", async () => {
  for (const [state, change] of [
    [project("1", [task("a", "1", 10, "2026-10-12", 3)]), browserDelta("1", "2", {})],
    [loaded("1", [task("a", "1", 10, "2026-10-12", 3)]), (() => { const answer = browserDelta("1", "2", {}); delete (answer.structureDelta as Partial<StructureDelta>).today; return answer; })()],
  ] as const) {
    forgetStructures();
    rememberStructure(state);
    let reloads = 0;
    const expanded = await expandStructureAnswer(change, async () => {
      reloads += 1;
      return loaded("2", [task("a", "1", 10, "2026-10-12", 3)]);
    });
    assert.equal(reloads, 1);
    assert.equal((expanded as { structureVersion: string }).structureVersion, "2");
  }
});

test("a critical path that cannot be worked out is empty with the reason, and the change still applies", async () => {
  forgetStructures();
  rememberStructure(loaded("1", [task("a", "1", 10, "2026-10-12", 3)]));
  const quiet = console.error;
  console.error = () => undefined;
  try {
    const expanded = (await expandStructureAnswer(browserDelta("1", "2", { items: [task("a", "1", 10, "2026-10-12", 30_000)] }), noReload)) as unknown as { criticalPath: WbsCriticalPath; structureVersion: string };
    assert.equal(expanded.structureVersion, "2");
    assert.deepEqual(expanded.criticalPath.items, []);
    assert.match(expanded.criticalPath.warnings[0]!, /^Расчет критического пути временно недоступен: /);
  } finally {
    console.error = quiet;
  }
});

const changes = (baseVersion: string | null, version: string, change: Partial<StructureChanges> = {}): StructureChanges => ({
  projectId: "p", baseVersion, version, full: baseVersion === null, today: "2026-10-13", calendarOverrides: calendar,
  items: [], dependencies: [], deletedItemIds: [], deletedDependencyIds: [], ...change,
});

test("a change after one this page never saw is caught up with the changes since its copy, not the whole project", async () => {
  forgetStructures();
  rememberStructure(loaded("1", [task("a", "1", 10, "2026-10-12", 3), task("b", "2", 20, "2026-10-12", 1)]));
  const asked: string[] = [];
  const expanded = (await expandStructureAnswer(browserDelta("3", "4", { items: [task("c", "3", 30, "2026-10-12", 2)] }), noReload, "", null, async (_projectId, since) => {
    asked.push(since);
    // Someone else changed a row and deleted another meanwhile; the changes run up to the newest version.
    return changes("1", "4", { items: [task("a", "1", 10, "2026-10-12", 4), task("c", "3", 30, "2026-10-12", 2)], deletedItemIds: ["b"] });
  })) as unknown as { structureVersion: string; wbsItems: WbsItem[]; criticalPath: WbsCriticalPath };
  assert.deepEqual(asked, ["1"]);
  assert.equal(expanded.structureVersion, "4");
  assert.deepEqual(expanded.wbsItems.map((item) => [item.id, item.workDays]), [["a", 4], ["c", 2]]);
  // Four working days from Monday over the day off on Wednesday end on Friday.
  assert.equal(expanded.criticalPath.projectFinishDate, "2026-10-16T00:00:00.000Z");
});

test("catching up takes the new calendar before working out the critical path, and a whole Structure replaces the copy", async () => {
  forgetStructures();
  rememberStructure(loaded("1", [task("a", "1", 10, "2026-10-12", 3), task("old", "2", 20, "2026-10-12", 1)]));
  const expanded = (await expandStructureAnswer(browserDelta("5", "6", {}), noReload, "", null, async () =>
    changes(null, "6", { items: [task("a", "1", 10, "2026-10-12", 3)], calendarOverrides: [] }),
  )) as unknown as { wbsItems: WbsItem[]; criticalPath: WbsCriticalPath };
  assert.deepEqual(expanded.wbsItems.map((item) => item.id), ["a"]);
  // Without the day off, three working days from Monday end on Wednesday.
  assert.equal(expanded.criticalPath.projectFinishDate, "2026-10-14T00:00:00.000Z");
});

test("when the changes cannot be read the project is read again, and a late answer never takes a newer copy back", async () => {
  forgetStructures();
  rememberStructure(loaded("1", [task("a", "1", 10, "2026-10-12", 3)]));
  let reloads = 0;
  await expandStructureAnswer(browserDelta("3", "4", {}), async () => {
    reloads += 1;
    return loaded("4", [task("a", "1", 10, "2026-10-12", 3)]);
  }, "", null, async () => null);
  assert.equal(reloads, 1);

  forgetStructures();
  rememberStructure(loaded("1", [task("a", "1", 10, "2026-10-12", 3)]));
  const expanded = (await expandStructureAnswer(browserDelta("3", "4", {}), noReload, "", null, async () => {
    // While the changes were on their way, the page learned of version 9.
    rememberStructure(loaded("9", [task("a", "1", 10, "2026-10-12", 7)]));
    return changes("1", "4", { items: [task("a", "1", 10, "2026-10-12", 5)] });
  })) as unknown as { structureVersion: string; wbsItems: WbsItem[] };
  assert.equal(expanded.structureVersion, "9");
  assert.equal(expanded.wbsItems[0]!.workDays, 7);
});

test("a catch-up is announced as a change the page could not follow, so no undo step takes in others' edits", async () => {
  forgetStructures();
  rememberStructure(loaded("1", [task("a", "1", 10, "2026-10-12", 3)]));
  const heard: StructureChange[] = [];
  onStructureChange((change) => heard.push(change));
  await expandStructureAnswer(browserDelta("3", "4", {}), noReload, "/api/wbs-items/a", null, async () => changes("1", "4", { items: [task("a", "1", 10, "2026-10-12", 5)] }));
  assert.equal(heard.length, 1);
  assert.equal(heard[0]!.complete, false);
});
