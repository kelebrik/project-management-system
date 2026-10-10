import assert from "node:assert/strict";
import test from "node:test";
import { liveRetryDelay, summarizeLiveEvents, withLiveEvent, type ProjectLiveEvent } from "./useProjectLiveUpdates";

const event = (id: string, patch: Partial<ProjectLiveEvent> = {}): ProjectLiveEvent => ({ id, projectId: "p1", section: "structure", actorId: "u2", actorName: "Анна", clientId: "tab-other", at: "2026-10-10T10:00:00.000Z", ...patch });

test("a tab leaves out its own changes and counts each event once", () => {
  let pending: ProjectLiveEvent[] = [];
  pending = withLiveEvent(pending, event("e1"), "tab-mine");
  pending = withLiveEvent(pending, event("e1"), "tab-mine");
  pending = withLiveEvent(pending, event("e2", { clientId: "tab-mine" }), "tab-mine");
  // The same person in another tab is still news here.
  pending = withLiveEvent(pending, event("e3", { actorId: "me", clientId: "tab-elsewhere" }), "tab-mine");
  assert.deepEqual(pending.map((item) => item.id), ["e1", "e3"]);
});

test("the banner names each person and section once and counts the changes", () => {
  assert.deepEqual(
    summarizeLiveEvents([event("e1"), event("e2", { section: "raid" }), event("e3", { actorName: "Иван" }), event("e4", { actorName: null, section: "jira" })]),
    { people: ["Анна", "Иван"], sections: ["structure", "raid", "jira"], count: 4 },
  );
});

test("a refused stream is retried after a growing pause, a minute at most", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 10].map(liveRetryDelay), [5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
});
