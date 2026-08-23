import assert from "node:assert/strict";
import test from "node:test";

import { pollJiraSyncRun } from "./jiraSyncPolling";

test("Jira polling returns a completed durable run", async () => {
  let clock = 0;
  const states = [{ status: "RUNNING" }, { status: "SUCCEEDED" }];
  const result = await pollJiraSyncRun({
    poll: async () => states.shift() ?? { status: "SUCCEEDED" },
    wait: async (delayMs) => { clock += delayMs; },
    isCurrent: () => true,
    initialDelayMs: 3_000,
    maxDurationMs: 60_000,
    now: () => clock,
  });
  assert.equal(result.outcome, "COMPLETED");
  assert.equal(result.state?.status, "SUCCEEDED");
});

test("Jira polling stops locally at its deadline while the server run remains active", async () => {
  let clock = 0;
  let polls = 0;
  const result = await pollJiraSyncRun({
    poll: async () => {
      polls += 1;
      return { status: "RUNNING", pollAfterMs: 3_000 };
    },
    wait: async (delayMs) => { clock += delayMs; },
    isCurrent: () => true,
    initialDelayMs: 3_000,
    maxDurationMs: 10_000,
    now: () => clock,
  });
  assert.equal(result.outcome, "BACKGROUND");
  assert.equal(polls, 2);
});

test("Jira polling does not request status after unmount or project change", async () => {
  let polls = 0;
  const result = await pollJiraSyncRun({
    poll: async () => {
      polls += 1;
      return { status: "RUNNING" };
    },
    wait: async () => undefined,
    isCurrent: () => false,
    initialDelayMs: 3_000,
    maxDurationMs: 60_000,
  });
  assert.equal(result.outcome, "STALE");
  assert.equal(polls, 0);
});

test("Jira polling discards a response when the project changes in flight", async () => {
  let current = true;
  const result = await pollJiraSyncRun({
    poll: async () => {
      current = false;
      return { status: "SUCCEEDED" };
    },
    wait: async () => undefined,
    isCurrent: () => current,
    initialDelayMs: 3_000,
    maxDurationMs: 60_000,
  });
  assert.equal(result.outcome, "STALE");
  assert.equal(result.state, null);
});

test("Jira polling tolerates a transient status request failure", async () => {
  let attempts = 0;
  const result = await pollJiraSyncRun({
    poll: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary network failure");
      return { status: "SUCCEEDED" };
    },
    wait: async () => undefined,
    isCurrent: () => true,
    initialDelayMs: 3_000,
    maxDurationMs: 60_000,
  });
  assert.equal(result.outcome, "COMPLETED");
  assert.equal(attempts, 2);
});

test("Jira polling falls back to background after repeated status failures", async () => {
  let attempts = 0;
  const result = await pollJiraSyncRun({
    poll: async () => {
      attempts += 1;
      throw new Error("network unavailable");
    },
    wait: async () => undefined,
    isCurrent: () => true,
    initialDelayMs: 3_000,
    maxDurationMs: 60_000,
  });
  assert.equal(result.outcome, "BACKGROUND");
  assert.equal(attempts, 3);
});
