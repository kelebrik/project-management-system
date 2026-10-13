import assert from "node:assert/strict";
import test from "node:test";
import type { WbsItem } from "../domainTypes";
import { createBaseCache, createOutbox, projectStructure, type OutboxNotice, type SendResult } from "./outbox";
import { createMemoryStorage, type BaseRecord, type OutboxEntry } from "./storage";

const base = (version: string, items: WbsItem[] = [], today = "2026-10-13"): BaseRecord => ({ projectId: "p", version, items, dependencies: [], calendarOverrides: [], today, savedAt: "" });
const write = (mutationId: string, extra: Partial<OutboxEntry> = {}) => ({ mutationId, projectId: "p", method: "PATCH", path: `/wbs-items/${mutationId}`, body: { title: mutationId }, baseVersion: "1", dependsOn: [], ...extra });
const noWait = async () => undefined;

function harness(answers: Array<SendResult | Error>, readBase?: () => Promise<BaseRecord | null>) {
  const storage = createMemoryStorage();
  const sent: OutboxEntry[] = [];
  const notices: OutboxNotice[] = [];
  // The version the server holds after the writes it took.
  let serverVersion = "1";
  const outbox = createOutbox({
    storage,
    send: async (entry) => {
      sent.push(entry);
      const answer = answers.shift() ?? { status: 200, body: {}, structureVersion: String(Number(serverVersion) + 1) };
      if (answer instanceof Error) throw answer;
      if (answer.structureVersion) serverVersion = answer.structureVersion;
      return answer;
    },
    readBase: readBase ?? (async () => base(serverVersion)),
    notify: (notice) => notices.push(notice),
    wait: noWait,
  });
  return { storage, sent, notices, outbox };
}

test("a write the server took is removed together with the base that includes it", async () => {
  const { storage, sent, outbox } = harness([{ status: 200, body: {}, structureVersion: "2" }]);
  await outbox.lead();
  await outbox.enqueue(write("m1"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(sent.map((entry) => entry.mutationId), ["m1"]);
  assert.equal(storage.outbox.size, 0);
  assert.equal(storage.bases.get("p")?.version, "2");
});

test("a write the server took waits for the base when it cannot be read, and holds nothing else back", async () => {
  let readable = false;
  const { storage, sent, outbox } = harness(
    [{ status: 200, body: {}, structureVersion: "2" }, { status: 200, body: {}, structureVersion: "3" }],
    async () => (readable ? base("3") : null),
  );
  await outbox.lead();
  await outbox.enqueue(write("m1"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(storage.outbox.get("m1")?.state, "acked");
  await outbox.enqueue(write("m2"));
  assert.deepEqual(sent.map((entry) => entry.mutationId), ["m1", "m2"]);
  readable = true;
  // Tried again on its own after a pause, or sooner when something kicks the queue.
  await outbox.kick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(storage.outbox.size, 0);
  assert.equal(storage.bases.get("p")?.version, "3");
  await outbox.stop();
});

test("no answer, or one to try later, sends the same write again with the same id", async () => {
  const { storage, sent, outbox } = harness([new TypeError("Failed to fetch"), { status: 503, body: {}, structureVersion: null }, { status: 200, body: {}, structureVersion: "2" }]);
  await outbox.lead();
  await outbox.enqueue(write("m1"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(sent.map((entry) => entry.mutationId), ["m1", "m1", "m1"]);
  assert.equal(storage.outbox.size, 0);
});

test("a sign-in needed pauses sending until resumed, the write kept as it was", async () => {
  const { storage, sent, notices, outbox } = harness([{ status: 401, body: { code: "SESSION_REQUIRED" }, structureVersion: null }]);
  await outbox.lead();
  await outbox.enqueue(write("m1"));
  assert.equal(outbox.paused, true);
  assert.equal(storage.outbox.get("m1")?.state, "pending");
  assert.ok(notices.some((notice) => notice.kind === "session-required"));
  await outbox.enqueue(write("m2"));
  assert.equal(sent.length, 1);
  await outbox.resume();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(sent.map((entry) => entry.mutationId), ["m1", "m1", "m2"]);
  assert.equal(storage.outbox.size, 0);
});

test("a refused write takes the writes that need it along, with the reason; others go on", async () => {
  const { storage, sent, notices, outbox } = harness([{ status: 423, body: { error: "Проект закрыт", code: "PROJECT_CLOSED" }, structureVersion: null }]);
  await storage.putOutbox({ ...write("m1"), seq: 1, state: "pending", attempts: 0, createdAt: new Date().toISOString(), ackVersion: null, error: null });
  await storage.putOutbox({ ...write("m2", { dependsOn: ["m1"] }), seq: 2, state: "pending", attempts: 0, createdAt: new Date().toISOString(), ackVersion: null, error: null });
  await storage.putOutbox({ ...write("m3"), seq: 3, state: "pending", attempts: 0, createdAt: new Date().toISOString(), ackVersion: null, error: null });
  await outbox.lead();
  assert.deepEqual(sent.map((entry) => entry.mutationId), ["m1", "m3"]);
  assert.equal(storage.outbox.get("m1")?.state, "rejected");
  assert.deepEqual(storage.outbox.get("m1")?.error, { status: 423, code: "PROJECT_CLOSED", message: "Проект закрыт" });
  assert.equal(storage.outbox.get("m2")?.state, "rejected");
  assert.equal(storage.outbox.get("m2")?.error?.code, "DEPENDENCY_REJECTED");
  const rejected = notices.find((notice) => notice.kind === "rejected");
  assert.deepEqual(rejected && rejected.kind === "rejected" ? rejected.entries.map((entry) => entry.mutationId).sort() : [], ["m1", "m2"]);
});

test("a tab that comes to lead sends again what the last leader left mid-way; a write too old is not sent", async () => {
  const { storage, sent, outbox } = harness([]);
  await storage.putOutbox({ ...write("old"), seq: 1, state: "pending", attempts: 0, createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString(), ackVersion: null, error: null });
  await storage.putOutbox({ ...write("m1"), seq: 2, state: "sending", attempts: 1, createdAt: new Date().toISOString(), ackVersion: null, error: null });
  await outbox.enqueue(write("m2"));
  assert.deepEqual(sent, [], "a tab that does not lead sends nothing");
  await outbox.lead();
  assert.deepEqual(sent.map((entry) => entry.mutationId), ["m1", "m2"]);
  assert.equal(storage.outbox.get("old")?.state, "expired");
});

test("the Structure shown is the base with row edits not yet confirmed, and not those it includes", () => {
  const row = (id: string, title: string) => ({ id, code: id, title, sortOrder: 1, type: "TASK", status: "NOT_STARTED", startDate: null, dueDate: null, forecastStartDate: null, forecastDueDate: null, workDays: null, calendarDays: null, wbsLevel: 1, parentId: null }) as unknown as WbsItem;
  const kept = base("3", [row("a", "old")]);
  const entry = (mutationId: string, state: OutboxEntry["state"], body: unknown, ackVersion: string | null = null, path = "/wbs-items/a"): OutboxEntry =>
    ({ mutationId, seq: 1, projectId: "p", method: "PATCH", path, body, baseVersion: "3", dependsOn: [], state, attempts: 0, createdAt: "", ackVersion, error: null });
  const shown = projectStructure(kept, [entry("m1", "pending", { title: "new" })]);
  assert.equal(shown.items[0]!.title, "new");
  assert.deepEqual(shown.unshown, []);
  assert.equal(projectStructure(kept, [entry("m1", "acked", { title: "new" }, "3")]).items[0]!.title, "old");
  assert.equal(projectStructure(kept, [entry("m1", "rejected", { title: "new" })]).items[0]!.title, "old");
  assert.deepEqual(projectStructure(kept, [entry("m2", "pending", { afterItemId: "a" }, null, "/projects/p/wbs-items/insert-after")]).unshown, ["m2"]);
});

test("bases are kept a moment after the last change, never over a newer one, and not after closing", async () => {
  const storage = createMemoryStorage();
  const cache = createBaseCache(storage, 5);
  cache.remember(base("2"));
  cache.remember(base("3"));
  cache.remember(base("1"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(storage.bases.get("p")?.version, "3");
  await storage.writeBaseIfNewer(base("7"));
  cache.remember(base("4"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(storage.bases.get("p")?.version, "7");
  cache.remember(base("8"));
  cache.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(storage.bases.get("p")?.version, "7");
  // The same version on a later day replaces; a write confirmed at an older one does not take the newer base back.
  assert.equal(await storage.writeBaseIfNewer(base("7", [], "2026-10-14")), true);
  await storage.putOutbox({ ...write("m1"), seq: 1, state: "acked", attempts: 1, createdAt: "", ackVersion: "5", error: null });
  await storage.ackAndAdvance("m1", base("5"));
  assert.equal(storage.bases.get("p")?.version, "7");
  assert.equal(storage.outbox.size, 0);
});

test("writes added at once, in one tab or several, get their own numbers in the order taken", async () => {
  const storage = createMemoryStorage();
  const kept = await Promise.all(["a", "b", "c"].map((id) => storage.appendOutbox({ ...write(id), state: "pending", attempts: 0, createdAt: "", ackVersion: null, error: null })));
  assert.deepEqual(kept.map((entry) => entry.seq), [1, 2, 3]);
});

test("a write added while the one it needs is on its way goes with it when that one is refused", async () => {
  let answer!: (result: SendResult) => void;
  const storage = createMemoryStorage();
  const sent: string[] = [];
  const outbox = createOutbox({
    storage,
    send: (entry) => {
      sent.push(entry.mutationId);
      return new Promise((resolve) => { answer = resolve; });
    },
    readBase: async () => base("1"),
    notify: () => undefined,
    wait: noWait,
  });
  await outbox.lead();
  void outbox.enqueue(write("parent"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await storage.appendOutbox({ ...write("child", { dependsOn: ["parent"] }), state: "pending", attempts: 0, createdAt: new Date().toISOString(), ackVersion: null, error: null });
  answer({ status: 409, body: { error: "Связь недопустима", code: "FAMILY_LINK" }, structureVersion: null });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await outbox.kick();
  assert.deepEqual(sent, ["parent"]);
  assert.equal(storage.outbox.get("child")?.state, "rejected");
  assert.equal(storage.outbox.get("child")?.error?.code, "DEPENDENCY_REJECTED");
});

test("a write whose dependency expired is held, and nothing after it is sent", async () => {
  const { storage, sent, outbox } = harness([]);
  await storage.putOutbox({ ...write("old"), seq: 1, state: "pending", attempts: 0, createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString(), ackVersion: null, error: null });
  await storage.putOutbox({ ...write("child", { dependsOn: ["old"] }), seq: 2, state: "pending", attempts: 0, createdAt: new Date().toISOString(), ackVersion: null, error: null });
  await storage.putOutbox({ ...write("later"), seq: 3, state: "pending", attempts: 0, createdAt: new Date().toISOString(), ackVersion: null, error: null });
  await outbox.lead();
  assert.deepEqual(sent, []);
  assert.equal(storage.outbox.get("old")?.state, "expired");
  assert.equal(storage.outbox.get("child")?.state, "pending");
});

test("a queue stopped while it reads sends nothing, and its request on the way is cancelled", async () => {
  const storage = createMemoryStorage();
  await storage.putOutbox({ ...write("m1"), seq: 1, state: "pending", attempts: 0, createdAt: new Date().toISOString(), ackVersion: null, error: null });
  let release!: () => void;
  const reading = new Promise<void>((resolve) => { release = resolve; });
  const list = storage.listOutbox.bind(storage);
  storage.listOutbox = async () => {
    await reading;
    return list();
  };
  const sent: string[] = [];
  let cancelled = false;
  const outbox = createOutbox({
    storage,
    send: async (entry, signal) => {
      sent.push(entry.mutationId);
      signal.addEventListener("abort", () => (cancelled = true));
      return { status: 200, body: {}, structureVersion: "2" };
    },
    readBase: async () => base("2"),
    notify: () => undefined,
    wait: noWait,
  });
  const leading = outbox.lead();
  const stopping = outbox.stop();
  release();
  await leading;
  await stopping;
  assert.deepEqual(sent, []);
  assert.equal(cancelled, false);
  assert.equal(storage.outbox.get("m1")?.state, "pending");
});

for (const moment of ["taking the lead", "keeping a write"] as const) {
  test(`stopping waits for the queue's work begun while ${moment}`, async () => {
    const storage = createMemoryStorage();
    await storage.putOutbox({ ...write("m1"), seq: 1, state: "sending", attempts: 1, createdAt: new Date().toISOString(), ackVersion: null, error: null });
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let changed = false;
    if (moment === "taking the lead") {
      const update = storage.updateOutbox.bind(storage);
      storage.updateOutbox = async (id, patch) => {
        await held;
        const result = await update(id, patch);
        changed = true;
        return result;
      };
    } else {
      const append = storage.appendOutbox.bind(storage);
      storage.appendOutbox = async (entry) => {
        await held;
        const result = await append(entry);
        changed = true;
        return result;
      };
    }
    const outbox = createOutbox({ storage, send: async () => ({ status: 200, body: {}, structureVersion: "2" }), readBase: async () => base("2"), notify: () => undefined, wait: noWait });
    void (moment === "taking the lead" ? outbox.lead() : outbox.enqueue(write("m2")));
    await new Promise((resolve) => setTimeout(resolve, 0));
    let stopped = false;
    const stopping = outbox.stop().then(() => (stopped = true));
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(stopped, false, "not stopped while the work runs");
    release();
    await stopping;
    assert.equal(changed, true, "the work begun ends before stopping does");
  });
}
