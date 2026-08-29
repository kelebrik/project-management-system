import assert from "node:assert/strict";
import test from "node:test";

import {
  GitlabReadOnlyRequestError,
  assertGitlabReadOnlyRequest,
  fetchGitlabBranch,
} from "./gitlab.js";
import { gitlabJiraKeysFrom } from "./services/gitlab-branch-analytics.js";

const origin = "https://git.example.test";

test("GitLab request guard allows only configured read-only repository endpoints", () => {
  assert.doesNotThrow(() => assertGitlabReadOnlyRequest(
    origin,
    `${origin}/api/v4/projects/athena%2Fstaros/repository/branches/factory-1.103-cvte968`,
    { method: "GET" },
  ));
  assert.doesNotThrow(() => assertGitlabReadOnlyRequest(
    origin,
    `${origin}/api/v4/projects/athena%2Fstaros/repository/commits?ref_name=abc`,
  ));
  assert.throws(
    () => assertGitlabReadOnlyRequest(origin, `${origin}/api/v4/projects/1`, { method: "DELETE" }),
    GitlabReadOnlyRequestError,
  );
  assert.throws(
    () => assertGitlabReadOnlyRequest(origin, "https://other.example.test/api/v4/projects/1/repository/commits"),
    GitlabReadOnlyRequestError,
  );
  assert.throws(
    () => assertGitlabReadOnlyRequest(origin, `${origin}/api/v4/projects/1/issues`),
    GitlabReadOnlyRequestError,
  );
});

test("GitLab client keeps the token in a header and disables redirects", async () => {
  const originalFetch = globalThis.fetch;
  let observedUrl = "";
  let observedInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    observedUrl = String(input);
    observedInit = init;
    return new Response(JSON.stringify({
      name: "factory/test",
      commit: {
        id: "a".repeat(40),
        short_id: "aaaaaaa",
        title: "test",
        message: "test",
        author_name: "Author",
        author_email: "author@example.test",
        committed_date: "2026-08-29T10:00:00+03:00",
        web_url: `${origin}/athena/staros/-/commit/${"a".repeat(40)}`,
        parent_ids: ["b".repeat(40)],
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await fetchGitlabBranch({ origin, token: "secret-token" }, "athena/staros", "factory/test");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(observedInit?.method, "GET");
  assert.equal(observedInit?.redirect, "manual");
  assert.equal(new Headers(observedInit?.headers).get("PRIVATE-TOKEN"), "secret-token");
  assert.equal(observedUrl.includes("secret-token"), false);
  assert.match(observedUrl, /athena%2Fstaros/u);
  assert.match(observedUrl, /factory%2Ftest/u);
});

test("GitLab client rejects redirects instead of forwarding credentials", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("", {
    status: 302,
    headers: { location: "https://other.example.test/login" },
  });
  try {
    await assert.rejects(
      fetchGitlabBranch({ origin, token: "secret-token" }, "athena/staros", "factory/test"),
      /redirected a read-only request/u,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitLab Jira key extraction is case-insensitive and deduplicated", () => {
  assert.deepEqual(
    gitlabJiraKeysFrom(["staros-41011: debug", "MR for STAROS-41011 and cvte_qa-42"]),
    ["CVTE_QA-42", "STAROS-41011"],
  );
});
