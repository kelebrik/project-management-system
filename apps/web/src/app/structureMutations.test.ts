import assert from "node:assert/strict";
import test from "node:test";
import { expandIncompleteAnswer, forgetStructures, onStructureChange, rememberStructure, StructureWriteSettledError, type StructureChange } from "./structureStore";
import { isStructureMutation, requestHeaders, sendWithMutationRetry } from "./structureMutations";

test("only the Structure writes the server keeps receipts for get a mutation id", () => {
  assert.equal(isStructureMutation("PATCH", "/api/wbs-items/r1"), true);
  assert.equal(isStructureMutation("PATCH", "http://host/api/projects/p/wbs-items/bulk?x=1"), true);
  assert.equal(isStructureMutation("DELETE", "/api/wbs-dependencies/d1"), true);
  assert.equal(isStructureMutation("POST", "/api/projects/p/wbs-snapshot/revert"), true);
  assert.equal(isStructureMutation("GET", "/api/wbs-items/r1"), false);
  assert.equal(isStructureMutation("POST", "/api/projects/p/wbs-baseline"), false);
  assert.equal(isStructureMutation("POST", "/api/projects/p/wbs-snapshot/restore"), false);
  assert.equal(requestHeaders({}, undefined, "POST", "/api/projects/p/wbs-baseline").get("X-PMS-Mutation-Id"), null);
});

test("a mutation keeps the id its caller names, in any case and form, and carries the version the page holds", () => {
  forgetStructures();
  rememberStructure({ id: "p", structureVersion: "7", wbsItems: [], wbsDependencies: [] });
  const id = "11111111-1111-4111-8111-111111111111";
  for (const provided of [{ "x-pms-mutation-id": id }, new Headers({ "X-PMS-MUTATION-ID": id }), [["x-pms-mutation-id", id]] as [string, string][]]) {
    const headers = requestHeaders({ "X-PMS-Client": "tab" }, provided, "PATCH", "/api/projects/p/wbs-items/bulk");
    assert.equal(headers.get("X-PMS-Mutation-Id"), id);
    assert.equal(headers.get("X-PMS-Base-Version"), "7");
    assert.equal(headers.get("X-PMS-Client"), "tab");
  }
  const fresh = requestHeaders({}, { "Content-Type": "application/json" }, "PATCH", "/api/wbs-items/r1");
  assert.match(fresh.get("X-PMS-Mutation-Id")!, /^[0-9a-f-]{36}$/);
  assert.equal(fresh.get("X-PMS-Base-Version"), null);
  forgetStructures();
});

test("a mutation whose connection broke is sent again, a cancelled or ordinary request is not", async () => {
  const noWait = async () => undefined;
  let calls = 0;
  const flaky = async () => {
    calls += 1;
    if (calls < 3) throw new TypeError("Failed to fetch");
    return "ok";
  };
  assert.equal(await sendWithMutationRetry(true, flaky, noWait), "ok");
  assert.equal(calls, 3);

  calls = 0;
  await assert.rejects(sendWithMutationRetry(true, async () => {
    calls += 1;
    throw new TypeError("Failed to fetch");
  }, noWait));
  assert.equal(calls, 3);

  calls = 0;
  await assert.rejects(sendWithMutationRetry(true, async () => {
    calls += 1;
    throw new DOMException("cancelled", "AbortError");
  }, noWait));
  assert.equal(calls, 1);

  calls = 0;
  await assert.rejects(sendWithMutationRetry(false, async () => {
    calls += 1;
    throw new TypeError("Failed to fetch");
  }, noWait));
  assert.equal(calls, 1);
});

const caughtUpTo = (version: string) => async () => ({ projectId: "p", version, baseVersion: "3", full: false, today: "2026-10-13", calendarOverrides: [], items: [{ id: "r1", code: "1", sortOrder: 1, title: "r1" } as never], dependencies: [], deletedItemIds: [], deletedDependencyIds: [] });
const startAt3 = () => {
  forgetStructures();
  rememberStructure({ id: "p", structureVersion: "3", wbsItems: [], wbsDependencies: [], calendarOverrides: [], structureToday: "2026-10-13" });
  const changes: StructureChange[] = [];
  onStructureChange((change) => changes.push(change));
  return changes;
};
const noReload = async () => null;

test("a repeat whose changes were not kept gives the kept answer with the Structure caught up, its step incomplete", async () => {
  const changes = startAt3();
  const answer = await expandIncompleteAnswer({ item: { id: "r1" } }, { projectId: "p", version: "4" }, noReload, "/api/wbs-items/r1", "step", caughtUpTo("4"));
  assert.deepEqual((answer as { item: { id: string } }).item, { id: "r1" });
  assert.equal((answer as { structureVersion: string }).structureVersion, "4");
  assert.deepEqual((answer as { wbsItems: Array<{ id: string }> }).wbsItems.map((item) => item.id), ["r1"]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0]!.complete, false);
  assert.equal(changes[0]!.tag, "step");
  forgetStructures();
});

test("a repeat with only its version kept is reported saved, not as the caller's answer", async () => {
  startAt3();
  await assert.rejects(
    expandIncompleteAnswer({ replayed: true, incomplete: true, projectId: "p", structureVersion: "4" }, { projectId: "p", version: "4" }, noReload, "", null, caughtUpTo("4")),
    (error: unknown) => error instanceof StructureWriteSettledError && error.saved && error.caughtUp,
  );
  forgetStructures();
});

test("a repeat the page could not catch up with is not answered with the older Structure", async () => {
  startAt3();
  await assert.rejects(
    expandIncompleteAnswer({ item: { id: "r1" } }, { projectId: "p", version: "5" }, noReload, "", null, async () => null),
    (error: unknown) => error instanceof StructureWriteSettledError && !error.caughtUp,
  );
  await assert.rejects(
    expandIncompleteAnswer({ item: { id: "r1" } }, { projectId: "p", version: "5" }, noReload, "", null, caughtUpTo("4")),
    (error: unknown) => error instanceof StructureWriteSettledError && !error.caughtUp,
  );
  forgetStructures();
});

test("the API client hands its caller the answer kept for an incomplete repeat, with the Structure caught up, under one mutation id", async () => {
  startAt3();
  const { apiClient } = await import("../api/client");
  const original = globalThis.fetch;
  const sent: Array<{ url: string; headers: Headers }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    sent.push({ url, headers: new Headers(init?.headers) });
    if (url.includes("/structure?since=3")) return new Response(JSON.stringify(await caughtUpTo("4")()), { status: 200, headers: { "Content-Type": "application/json" } });
    if (sent.length === 1) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify({ item: { id: "r1" } }), {
      status: 201,
      headers: { "Content-Type": "application/json", "X-PMS-Mutation-Incomplete": "1", "X-PMS-Mutation-Replayed": "1", "X-PMS-Structure-Project": "p", "X-PMS-Structure-Version": "4" },
    });
  }) as typeof fetch;
  try {
    const result = await apiClient.patch<{ item: { id: string }; structureVersion: string }>("/api/projects/p/wbs-items/bulk", { items: [] }, "failed", { "x-pms-mutation-id": "22222222-2222-4222-8222-222222222222" });
    assert.equal(result.item.id, "r1");
    assert.equal(result.structureVersion, "4");
    const writes = sent.filter((request) => request.url.endsWith("/bulk"));
    assert.equal(writes.length, 2);
    assert.deepEqual(writes.map((request) => request.headers.get("X-PMS-Mutation-Id")), ["22222222-2222-4222-8222-222222222222", "22222222-2222-4222-8222-222222222222"]);
  } finally {
    globalThis.fetch = original;
    forgetStructures();
  }
});
