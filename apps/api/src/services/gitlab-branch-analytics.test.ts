import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import { JIRA_SYSTEM_SEMANTIC_AGGREGATES } from "./jira-semantic-aggregates.js";
import {
  GITLAB_SYNC_TRANSACTION_OPTIONS,
  GitlabBranchAnalyticsError,
  evaluateGitlabBranchCommitAggregateFromDatabase,
  gitlabBranchScopeKey,
  validateGitlabJiraKeys,
} from "./gitlab-branch-analytics.js";
import { JiraSearchFailureError } from "../jira.js";

const definition = JIRA_SYSTEM_SEMANTIC_AGGREGATES.find(
  (aggregate) => aggregate.key === "gitlab-branch-commits",
)!.definition;

function row(id: string, jiraLinkState: "linked" | "unlinked" | "undetermined", committedAt: Date) {
  return {
    id,
    projectPath: "athena/staros",
    targetBranch: "factory-1.103-cvte968",
    commitSha: id.padEnd(40, "0"),
    shortSha: id.padEnd(8, "0"),
    title: `Commit ${id}`,
    authorName: "Author",
    authorEmail: "author@example.test",
    committedAt,
    webUrl: `https://git.example.test/athena/staros/-/commit/${id}`,
    sourceBranch: null,
    mergeRequestIid: null,
    mergeRequestTitle: null,
    mergeRequestUrl: null,
    jiraKeys: jiraLinkState === "unlinked" ? [] : ["STAROS-1"],
    jiraLinkState,
    observedAt: committedAt,
    retiredAt: null,
  };
}

function database(rows: ReturnType<typeof row>[], finishedAt = new Date()) {
  const windowStartedAt = new Date(finishedAt.getTime() - 14 * 24 * 60 * 60 * 1_000);
  return {
    gitlabBranchSyncRun: {
      findFirst: async () => ({
        finishedAt,
        windowStartedAt,
        windowEndedAt: finishedAt,
        undeterminedCount: rows.filter((item) => item.jiraLinkState === "undetermined").length,
      }),
    },
    gitlabBranchCommit: { findMany: async () => rows },
  } as unknown as PrismaClient;
}

test("GitLab aggregate serves only confirmed unlinked commits from the local database", async () => {
  const now = new Date();
  const result = await evaluateGitlabBranchCommitAggregateFromDatabase(
    database([
      row("a", "linked", new Date(now.getTime() - 3_000)),
      row("b", "unlinked", new Date(now.getTime() - 2_000)),
      row("c", "undetermined", new Date(now.getTime() - 1_000)),
    ]),
    "project-1",
    definition,
    {
      filters: [{ id: "only-unlinked", field: "jiraLinkState", operator: "equals", value: "unlinked" }],
      filterLogic: "and",
      sortBy: "committedAt",
      sortDirection: "desc",
    },
    { now: now.toISOString(), assignee: "", page: 1, pageSize: 50 },
  );

  assert.equal(result.totalRecords, 1);
  assert.equal(result.records[0]?.semanticValues?.jiraLinkState, "unlinked");
  assert.equal(result.quality.status, "PARTIAL");
  assert.deepEqual(result.quality.warnings, [{ code: "UNDETERMINED_JIRA_LINK", count: 1 }]);
});

test("GitLab aggregate refuses stale local data instead of querying GitLab inline", async () => {
  await assert.rejects(
    evaluateGitlabBranchCommitAggregateFromDatabase(
      database([], new Date(Date.now() - 25 * 60 * 60 * 1_000)),
      "project-1",
      definition,
      { filters: [], filterLogic: "and", sortBy: "default", sortDirection: "desc" },
      { now: new Date().toISOString(), assignee: "", page: 1, pageSize: 50 },
    ),
    (error: unknown) => error instanceof GitlabBranchAnalyticsError && /старше 24 часов/u.test(error.message),
  );
});

test("GitLab Jira validation keeps invalid pseudo-keys undetermined and propagates outages", async () => {
  const invalid = await validateGitlabJiraKeys(
    ["UTF-8", "STAROS-1"],
    new Set(["STAROS-1"]),
    async () => { throw new JiraSearchFailureError(400, "invalid key"); },
  );
  assert.deepEqual([...invalid].sort(([left], [right]) => left.localeCompare(right)), [
    ["STAROS-1", "linked"],
    ["UTF-8", "undetermined"],
  ]);

  await assert.rejects(
    validateGitlabJiraKeys(
      ["STAROS-2"],
      new Set(),
      async () => { throw new JiraSearchFailureError(504, "Jira unavailable"); },
    ),
    /Jira unavailable/u,
  );
});

test("GitLab synchronization extends the Prisma transaction budget", () => {
  assert.deepEqual(GITLAB_SYNC_TRANSACTION_OPTIONS, { maxWait: 10_000, timeout: 60_000 });
});

test("GitLab storage scope includes every row-forming branch option", () => {
  if (definition.rowConfig.kind !== "gitlabBranchCommit") throw new Error("expected GitLab aggregate");
  const base = gitlabBranchScopeKey(definition.rowConfig);
  assert.notEqual(base, gitlabBranchScopeKey({ ...definition.rowConfig, lookbackDays: 30 }));
  assert.notEqual(base, gitlabBranchScopeKey({ ...definition.rowConfig, includeMergeCommits: true }));
  assert.notEqual(base, gitlabBranchScopeKey({ ...definition.rowConfig, targetBranch: "other" }));
});
