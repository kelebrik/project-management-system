import assert from "node:assert/strict";
import test from "node:test";
import type { WbsItem } from "../domainTypes";
import { expandStructureAnswer, forgetStructureCopies, forgetStructures, onStructureStored, rememberStructure, type StructureChanges } from "../structureStore";
import { createMemoryStorage } from "./storage";
import { readCurrentBase } from "./useStructureLocal";

const row = (id: string, title = id) => ({ id, code: id, sortOrder: id === "a" ? 1 : 2, title }) as unknown as WbsItem;
const changes = (extra: Partial<StructureChanges>): StructureChanges => ({ projectId: "p", version: "6", baseVersion: "5", full: false, today: "2026-10-13", calendarOverrides: [], items: [], dependencies: [], deletedItemIds: [], deletedDependencyIds: [], ...extra });

async function withFetch<T>(answer: (url: string) => unknown, run: (asked: string[]) => Promise<T>) {
  const original = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    asked.push(String(input));
    return new Response(JSON.stringify(answer(String(input))), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    return await run(asked);
  } finally {
    globalThis.fetch = original;
  }
}

test("the base is read on from the page's copy it started from, never a part of it taken for the whole", async () => {
  forgetStructures();
  rememberStructure({ id: "p", structureVersion: "5", wbsItems: [row("a"), row("b")], wbsDependencies: [], calendarOverrides: [], structureToday: "2026-10-13" });
  const storage = createMemoryStorage();
  const read = await withFetch(() => changes({ items: [row("a", "new")] }), async (asked) => {
    const result = await readCurrentBase(storage, "p", new AbortController().signal);
    assert.match(asked[0]!, /structure\?since=5$/);
    return result;
  });
  assert.equal(read?.version, "6");
  assert.deepEqual(read?.items.map((item) => [item.id, item.title]), [["a", "new"], ["b", "b"]]);
  forgetStructures();
});

test("with no copy to start from, the whole Structure is asked for, and changes that answer it are not used", async () => {
  forgetStructures();
  const storage = createMemoryStorage();
  await withFetch(() => changes({ full: true, baseVersion: null, items: [row("a"), row("b")] }), async (asked) => {
    const read = await readCurrentBase(storage, "p", new AbortController().signal);
    assert.match(asked[0]!, /structure$/);
    assert.equal(read?.items.length, 2);
  });
  await withFetch(() => changes({ items: [row("a")] }), async () => {
    assert.equal(await readCurrentBase(storage, "p", new AbortController().signal), null);
  });
});

test("an answer to a request of a session since signed out keeps nothing, for the next person's listeners neither", async () => {
  forgetStructures();
  rememberStructure({ id: "p", structureVersion: "3", wbsItems: [row("a")], wbsDependencies: [], calendarOverrides: [], structureToday: "2026-10-13" });
  let reload!: (value: unknown) => void;
  const answer = expandStructureAnswer(
    { structureDelta: { projectId: "p", baseVersion: "4", version: "5", items: [], deletedItemIds: [], dependencies: [], deletedDependencyIds: [], today: "2026-10-13" } },
    () => new Promise((resolve) => { reload = resolve; }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  forgetStructureCopies();
  const heard: string[] = [];
  const stop = onStructureStored((_projectId, state) => heard.push(state.version));
  reload({ id: "p", structureVersion: "5", wbsItems: [row("a", "old session")], wbsDependencies: [], calendarOverrides: [], structureToday: "2026-10-13" });
  await answer;
  assert.deepEqual(heard, []);
  stop();
  forgetStructures();
});

for (const kind of ["changes", "incomplete"] as const) {
  test(`a request of a session signed out while it caught up reads nothing more and keeps nothing (${kind})`, async () => {
    forgetStructures();
    rememberStructure({ id: "p", structureVersion: "3", wbsItems: [row("a")], wbsDependencies: [], calendarOverrides: [], structureToday: "2026-10-13" });
    const { apiClient } = await import("../../api/client");
    const original = globalThis.fetch;
    const asked: string[] = [];
    let answerSince!: () => void;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      asked.push(url);
      if (url.includes("/structure?since=")) {
        await new Promise<void>((resolve) => { answerSince = resolve; });
        return new Response(JSON.stringify({ error: "later" }), { status: 503, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/overview")) return new Response(JSON.stringify({ id: "p", structureVersion: "5", wbsItems: [row("a", "old session")], wbsDependencies: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      return kind === "changes"
        ? new Response(JSON.stringify({ structureDelta: { projectId: "p", baseVersion: "4", version: "5", items: [], deletedItemIds: [], dependencies: [], deletedDependencyIds: [], today: "2026-10-13" } }), { status: 200, headers: { "Content-Type": "application/json", "X-PMS-Structure": "delta" } })
        : new Response(JSON.stringify({ item: { id: "a" } }), { status: 200, headers: { "Content-Type": "application/json", "X-PMS-Mutation-Incomplete": "1", "X-PMS-Structure-Project": "p", "X-PMS-Structure-Version": "5" } });
    }) as typeof fetch;
    try {
      const writing = apiClient.patch("/api/wbs-items/a", { title: "x" }, "failed").catch(() => null);
      while (!asked.some((url) => url.includes("/structure?since="))) await new Promise((resolve) => setTimeout(resolve, 0));
      forgetStructureCopies();
      const heard: string[] = [];
      const stop = onStructureStored((_projectId, state) => heard.push(state.version));
      answerSince();
      await writing;
      assert.deepEqual(heard, []);
      assert.equal(asked.some((url) => url.endsWith("/overview")), false);
      stop();
    } finally {
      globalThis.fetch = original;
      forgetStructures();
    }
  });
}
