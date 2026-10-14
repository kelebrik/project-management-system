import assert from "node:assert/strict";
import test from "node:test";
import { closeSessions, enterProject, mergePending, withoutShown, type Pending, type PendingAnswer, type SessionServer } from "./shiftReasonQueue";

const step = (checkpointId: string) => ({ checkpointId, code: checkpointId, title: checkpointId, deltaDays: 3, previousDate: null, newDate: null, baselineDate: null, notes: [] });
const pending = (projectId: string, ...sessionIds: string[]): Pending => ({
  projectId,
  risks: [],
  sessions: sessionIds.map((id) => ({ id, startedAt: "", endedAt: "", steps: [step("m")] })),
});

test("questions wait their turn: answering the shown one brings up the next project's", () => {
  let queue = mergePending([], pending("P", "s1"));
  queue = mergePending(queue, pending("Q", "q1"));
  assert.deepEqual(queue.map((entry) => entry.projectId), ["P", "Q"]);
  queue = withoutShown(queue, queue[0]!);
  assert.deepEqual(queue.map((entry) => entry.projectId), ["Q"]);
});

test("an answer read before a question was finished does not bring it back", () => {
  let queue = mergePending([], pending("P", "s1"));
  const shown = queue[0]!;
  // The question is finished; an answer read before that comes after.
  const reviewed = new Set(["s1"]);
  queue = withoutShown(queue, shown);
  queue = mergePending(queue, pending("P", "s1", "s2"), reviewed);
  assert.deepEqual(queue.map((entry) => entry.sessions.map((session) => session.id)), [["s2"]]);
});

test("a later session of the project shown is not lost: it waits behind the question shown", () => {
  let queue = mergePending([], pending("P", "s1"));
  const shown = queue[0]!;
  queue = mergePending(queue, pending("P", "s1", "s2"));
  assert.equal(queue[0], shown, "the question being answered is left as it is");
  assert.deepEqual(queue.map((entry) => [entry.projectId, entry.sessions.map((session) => session.id)]), [["P", ["s1"]], ["P", ["s2"]]]);
  // Read again: what is new joins the waiting question, nothing is doubled.
  queue = mergePending(queue, pending("P", "s1", "s2", "s3"));
  assert.deepEqual(queue.map((entry) => entry.sessions.map((session) => session.id)), [["s1"], ["s2", "s3"]]);
  // An answer read earlier and come late takes nothing away.
  queue = mergePending(queue, pending("P", "s1", "s2"));
  assert.deepEqual(queue.map((entry) => entry.sessions.map((session) => session.id)), [["s1"], ["s2", "s3"]]);
  queue = withoutShown(queue, shown);
  assert.deepEqual(queue.map((entry) => entry.sessions.map((session) => session.id)), [["s2", "s3"]]);
  // Nothing new: the queue stays.
  assert.equal(mergePending(queue, pending("P")), queue);
});

function server(answers: Array<PendingAnswer | Error>, closes: Array<{ closed: boolean } | Error> = []) {
  const calls: string[] = [];
  const api: SessionServer = {
    pending: async (projectId) => {
      calls.push(`pending ${projectId}`);
      const next = answers.shift()!;
      if (next instanceof Error) throw next;
      return next;
    },
    close: async (projectId, sessionId, body) => {
      calls.push(`close ${sessionId} ${body.mode} ${body.lastActivityAt ?? ""}`.trim());
      const next = closes.shift() ?? { closed: true };
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { api, calls };
}
const answer = (sessions: string[], ownOpen: PendingAnswer["ownOpen"] = null): PendingAnswer => ({ ...pending("P", ...sessions), ownOpen });

test("coming back ends a session left open in a gone tab, as the server saw it, then reads again", async () => {
  const { api, calls } = server([answer([], { id: "s1", lastActivityAt: "t1" }), answer(["s1"])]);
  const result = await enterProject("P", api, { settled: async () => undefined, owns: () => false });
  assert.deepEqual(calls, ["pending P", "close s1 stale t1", "pending P"]);
  assert.deepEqual(result.sessions.map((session) => session.id), ["s1"]);
});

test("a save of this tab answered meanwhile joined the open session: it is not ended", async () => {
  // The save started while the reading was on its way; its answer comes before the check.
  let owned = false;
  let settledCalls = 0;
  const { api, calls } = server([answer([], { id: "s1", lastActivityAt: "t2" })]);
  await enterProject("P", api, {
    settled: async () => {
      settledCalls += 1;
      if (settledCalls === 2) owned = true;
    },
    owns: (_projectId, sessionId) => owned && sessionId === "s1",
  });
  assert.deepEqual(calls, ["pending P"]);
});

test("a failed step of coming back fails the whole, so all of it is tried again", async () => {
  const failing = server([new Error("network")]);
  await assert.rejects(enterProject("P", failing.api, { settled: async () => undefined, owns: () => false }));
  const staleFails = server([answer([], { id: "s1", lastActivityAt: "t1" })], [new Error("network")]);
  await assert.rejects(enterProject("P", staleFails.api, { settled: async () => undefined, owns: () => false }));
  // Tried again: the open session is ended and asked about.
  const again = server([answer([], { id: "s1", lastActivityAt: "t1" }), answer(["s1"])]);
  const result = await enterProject("P", again.api, { settled: async () => undefined, owns: () => false });
  assert.deepEqual(again.calls, ["pending P", "close s1 stale t1", "pending P"]);
  assert.deepEqual(result.sessions.map((session) => session.id), ["s1"]);
});

test("ending sessions drops another person's, keeps one another tab kept going, and keeps the rest on a failure", async () => {
  const notFound = Object.assign(new Error("not found"), { status: 404 });
  const isNotFound = (failure: unknown) => (failure as { status?: number }).status === 404;
  const first = server([], [notFound, { closed: false }, { closed: true }]);
  assert.deepEqual(await closeSessions("P", ["a", "b", "c"], "leave", first.api, isNotFound), { keep: ["b"], done: true });
  const second = server([], [{ closed: true }, new Error("network")]);
  assert.deepEqual(await closeSessions("P", ["a", "b", "c"], "idle", second.api, isNotFound), { keep: ["b", "c"], done: false });
});
