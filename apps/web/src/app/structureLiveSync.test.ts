import assert from "node:assert/strict";
import test from "node:test";
import type { WbsItem } from "./domainTypes";
import { catchUpWithServer, confirmedStructure, forgetStructures, guardStructureCatchUp, rememberStructure, trackStructureWrite, withStructureActivity, type StructureChanges } from "./structureStore";
import { createStructureLiveSync, type ProjectLiveEvent } from "./useProjectLiveUpdates";

const row = (id: string, sortOrder = 10) => ({ id, code: id, sortOrder, title: id, startDate: null, dueDate: null }) as unknown as WbsItem;
const startAt = (version: string, items: WbsItem[] = [row("a"), row("b", 20)]) => {
  forgetStructures();
  rememberStructure({ id: "p", structureVersion: version, wbsItems: items, wbsDependencies: [], calendarOverrides: [], structureToday: "2026-10-13" });
};
const changes = (base: string, version: string, change: Partial<StructureChanges> = {}): StructureChanges => ({
  projectId: "p", version, baseVersion: base, full: false, today: "2026-10-13", calendarOverrides: [], items: [], dependencies: [], deletedItemIds: [], deletedDependencyIds: [], ...change,
});
const settledEvents: string[] = [];
(globalThis as { window?: unknown }).window = { dispatchEvent: (event: { type: string }) => settledEvents.push(event.type) };
(globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; detail: unknown; constructor(type: string, init?: { detail?: unknown }) { this.type = type; this.detail = init?.detail; } };

test("a change someone else made is caught up with and shown, the page told at once", async () => {
  startAt("3");
  settledEvents.length = 0;
  const outcome = await catchUpWithServer("p", "4", async () => changes("3", "4", { items: [{ ...row("a"), title: "new" }] }));
  assert.equal(outcome, "applied");
  assert.equal(confirmedStructure("p")?.version, "4");
  assert.equal(confirmedStructure("p")?.items.find((item) => item.id === "a")?.title, "new");
  assert.deepEqual(settledEvents, ["pms-structure-settled"]);
  assert.equal(await catchUpWithServer("p", "4", async () => assert.fail("nothing newer to read")), "current");
  forgetStructures();
});

test("nothing is taken in while the page's own write is on its way or its answer applied, nor read past one that started meanwhile", async () => {
  startAt("3");
  let release!: () => void;
  const write = withStructureActivity("PATCH", "/api/wbs-items/a", () => new Promise<void>((resolve) => { release = resolve; }));
  assert.equal(await catchUpWithServer("p", "4", async () => assert.fail("not read while writing")), "deferred");
  release();
  await write;
  // A write that starts while the changes are read makes them stale.
  const outcome = await catchUpWithServer("p", "4", async () => {
    await trackStructureWrite("PATCH", async () => undefined, "/api/wbs-items/a");
    return changes("3", "4");
  });
  assert.equal(outcome, "deferred");
  assert.equal(confirmedStructure("p")?.version, "3");
  // The page's own saves waiting in its queue hold it back too.
  const unguard = guardStructureCatchUp({ busy: () => true, conflicts: () => false });
  assert.equal(await catchUpWithServer("p", "4", async () => assert.fail("not read while saving")), "deferred");
  unguard();
  forgetStructures();
});

test("a copy that removes a row edited here is not applied, whether read as changes or whole", async () => {
  for (const removal of [{ deletedItemIds: ["b"] }, { full: true, baseVersion: null, items: [row("a")] }] as Array<Partial<StructureChanges>>) {
    startAt("3");
    guardStructureCatchUp({ busy: () => false, conflicts: (_projectId, candidate) => !candidate.items.some((item) => item.id === "b") });
    assert.equal(await catchUpWithServer("p", "4", async () => changes("3", "4", removal)), "conflict");
    assert.equal(confirmedStructure("p")?.version, "3");
  }
  forgetStructures();
});

test("two catch-ups ending in reverse order leave the newer copy", async () => {
  startAt("3");
  let answerOlder!: (value: StructureChanges) => void;
  const older = catchUpWithServer("p", "4", () => new Promise((resolve) => { answerOlder = resolve; }));
  const newer = await catchUpWithServer("p", "5", async () => changes("3", "5", { items: [{ ...row("a"), title: "five" }] }));
  assert.equal(newer, "applied");
  answerOlder(changes("3", "4", { items: [{ ...row("a"), title: "four" }] }));
  assert.equal(await older, "current");
  assert.equal(confirmedStructure("p")?.version, "5");
  assert.equal(confirmedStructure("p")?.items.find((item) => item.id === "a")?.title, "five");
  forgetStructures();
});

test("a new day at the same version recalculates; a version the server does not reach is a failure", async () => {
  startAt("3");
  assert.equal(await catchUpWithServer("p", null, async () => changes("3", "3", { today: "2026-10-14" })), "applied");
  assert.equal(confirmedStructure("p")?.today, "2026-10-14");
  assert.equal(await catchUpWithServer("p", "9", async () => changes("3", "4")), "failed");
  forgetStructures();
});

const event = (version: string | null, structureOnly: boolean, id = version ?? "x"): ProjectLiveEvent => ({ id, projectId: "p", section: "structure", actorId: "u", actorName: "Иван", clientId: "other", at: "", structureVersion: version, structureOnly });

test("an event the catch-up shows whole needs no word; others, and any the page could not take in, are offered", async () => {
  startAt("3");
  const offered: ProjectLiveEvent[] = [];
  const outcomes: Array<"applied" | "conflict"> = ["applied", "conflict"];
  const sync = createStructureLiveSync("p", (offeredEvent) => offered.push(offeredEvent), {
    catchUp: async () => {
      const outcome = outcomes.shift()!;
      if (outcome === "applied") rememberStructure({ id: "p", structureVersion: "4", wbsItems: [], wbsDependencies: [] });
      return outcome;
    },
  });
  sync.receive(event("4", true));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(offered, []);
  sync.receive(event("5", true));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(offered.map((item) => item.id), ["5"]);
  // A deletion's event is offered at once, and still caught up with.
  sync.receive(event(null, false, "old-server"));
  assert.deepEqual(offered.map((item) => item.id), ["5", "old-server"]);
  sync.stop();
  forgetStructures();
});

test("an event held back by the page's own saves is taken in once they end", async () => {
  startAt("3");
  const offered: ProjectLiveEvent[] = [];
  let busy = true;
  let calls = 0;
  const sync = createStructureLiveSync("p", (offeredEvent) => offered.push(offeredEvent), {
    retryMs: 5,
    catchUp: async () => {
      calls += 1;
      if (busy) return "deferred";
      rememberStructure({ id: "p", structureVersion: "4", wbsItems: [], wbsDependencies: [] });
      return "applied";
    },
  });
  sync.receive(event("4", true));
  await new Promise((resolve) => setTimeout(resolve, 12));
  busy = false;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(calls >= 2);
  assert.deepEqual(offered, []);
  assert.equal(confirmedStructure("p")?.version, "4");
  sync.stop();
  forgetStructures();
});

test("a catch-up whose page stopped listening, or signed out, publishes nothing", async () => {
  startAt("3");
  settledEvents.length = 0;
  let stopped = false;
  let answer!: (value: StructureChanges) => void;
  const left = catchUpWithServer("p", "4", () => new Promise((resolve) => { answer = resolve; }), () => !stopped);
  stopped = true;
  answer(changes("3", "4", { items: [{ ...row("a"), title: "late" }] }));
  assert.equal(await left, "current");
  assert.equal(confirmedStructure("p")?.version, "3");
  const signedOut = catchUpWithServer("p", "4", () => new Promise((resolve) => { answer = resolve; }));
  forgetStructures();
  rememberStructure({ id: "p", structureVersion: "3", wbsItems: [], wbsDependencies: [], calendarOverrides: [], structureToday: "2026-10-13" });
  answer(changes("3", "4"));
  assert.equal(await signedOut, "current");
  assert.equal(confirmedStructure("p")?.version, "3");
  assert.deepEqual(settledEvents, []);
  forgetStructures();
});

test("a reading due on its own (the stream opened, the page shown) is made once the page's saves end, and a conflict found then is said", async () => {
  startAt("3");
  const offered: ProjectLiveEvent[] = [];
  const outcomes: Array<"deferred" | "conflict"> = ["deferred", "conflict"];
  const hints: Array<string | null> = [];
  const sync = createStructureLiveSync("p", (offeredEvent) => offered.push(offeredEvent), {
    retryMs: 5,
    catchUp: async (_projectId, hint) => {
      hints.push(hint);
      return outcomes.shift() ?? "current";
    },
  });
  sync.refresh();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(hints, [null, null]);
  assert.equal(offered.length, 1);
  assert.equal(offered[0]!.section, "structure");
  assert.equal(offered[0]!.actorName, null);
  sync.stop();
  forgetStructures();
});

test("a page holding no copy has nothing to catch up with unless told of a change", async () => {
  forgetStructures();
  assert.equal(await catchUpWithServer("p", null, async () => assert.fail("nothing to read")), "current");
  assert.equal(await catchUpWithServer("p", "4", async () => assert.fail("nothing to read")), "failed");
});

test("a reading asked for while one is under way is made after it, not answered by it", async () => {
  startAt("3");
  const offered: ProjectLiveEvent[] = [];
  let server = "4";
  let firstAnswer!: () => void;
  let reads = 0;
  const sync = createStructureLiveSync("p", (offeredEvent) => offered.push(offeredEvent), {
    catchUp: async () => {
      reads += 1;
      const version = server;
      if (reads === 1) await new Promise<void>((resolve) => { firstAnswer = resolve; });
      rememberStructure({ id: "p", structureVersion: version, wbsItems: [], wbsDependencies: [] });
      return "applied";
    },
  });
  sync.refresh();
  await new Promise((resolve) => setTimeout(resolve, 0));
  server = "5";
  sync.refresh();
  firstAnswer();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(reads, 2);
  assert.equal(confirmedStructure("p")?.version, "5");
  assert.deepEqual(offered, []);
  sync.stop();
  forgetStructures();
});

for (const second of ["failed", "applied"] as const) {
  test(`a due reading that failed is tried once more after a pause, and no more (then ${second})`, async () => {
    startAt("3");
    const outcomes: Array<"failed" | "applied"> = ["failed", second];
    let reads = 0;
    const sync = createStructureLiveSync("p", () => undefined, {
      retryMs: 4,
      catchUp: async () => {
        reads += 1;
        return outcomes.shift() ?? "applied";
      },
    });
    sync.refresh();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(reads, 1, "nothing read again before the pause");
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(reads, 2);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(reads, 2, "no reading after");
    sync.stop();
    forgetStructures();
  });
}
