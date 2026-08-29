import {
  type JiraAnalyticsEvaluationOptions,
  type JiraAnalyticsEvaluationResult,
  type JiraAnalyticsFilter,
  type JiraAnalyticsFilterField,
  type JiraAnalyticsResultRecord,
  type JiraSemanticAggregateDefinition,
} from "@pms/shared";
import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

import { JiraSearchFailureError, fetchJiraIssueKeysWithMeta } from "../jira.js";
import {
  fetchGitlabBranch,
  fetchGitlabBranchCommits,
  fetchGitlabCommitMergeRequests,
  resolveGitlabReadOnlyConfig,
  type GitlabCommit,
  type GitlabMergeRequest,
} from "../gitlab.js";

const GITLAB_SYNC_CONCURRENCY = 5;
const GITLAB_SYNC_STALE_MS = 24 * 60 * 60 * 1_000;
export const GITLAB_SYNC_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;
const jiraKeyPattern = /\b[A-Z][A-Z0-9_]+-\d+\b/gi;

export class GitlabBranchAnalyticsError extends Error {
  override name = "GitlabBranchAnalyticsError";
}

type BranchRowConfig = Extract<JiraSemanticAggregateDefinition["rowConfig"], { kind: "gitlabBranchCommit" }>;
type LinkState = "linked" | "unlinked" | "undetermined";

function branchConfig(definition: JiraSemanticAggregateDefinition): BranchRowConfig {
  if (definition.rowConfig.kind !== "gitlabBranchCommit") {
    throw new GitlabBranchAnalyticsError("Aggregate is not a GitLab branch commit aggregate");
  }
  return definition.rowConfig;
}

export function gitlabBranchScopeKey(config: BranchRowConfig) {
  return createHash("sha256").update(JSON.stringify({
    projectPath: config.projectPath,
    targetBranch: config.targetBranch,
    lookbackDays: config.lookbackDays,
    includeMergeCommits: config.includeMergeCommits,
  })).digest("hex");
}

async function mapConcurrent<Input, Output>(
  input: readonly Input[],
  limit: number,
  worker: (item: Input, index: number) => Promise<Output>,
) {
  const output = new Array<Output>(input.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, input.length) }, async () => {
    while (cursor < input.length) {
      const index = cursor++;
      output[index] = await worker(input[index]!, index);
    }
  }));
  return output;
}

export function gitlabJiraKeysFrom(values: Array<string | null | undefined>) {
  return [...new Set(
    values.flatMap((value) => value?.match(jiraKeyPattern) ?? []).map((key) => key.toLocaleUpperCase("en-US")),
  )].sort();
}

type JiraKeyLookup = (key: string) => Promise<boolean>;

export async function validateGitlabJiraKeys(
  keys: readonly string[],
  locallyKnownKeys: ReadonlySet<string>,
  lookup: JiraKeyLookup = async (key) => {
    const result = await fetchJiraIssueKeysWithMeta(`key = "${key}"`, {
      pageSize: 1,
      fetchAllPages: false,
      includeChangelog: false,
      deadlineAt: Date.now() + 20_000,
    });
    return result.issueKeys.includes(key);
  },
) {
  const states = new Map<string, "linked" | "undetermined">();
  await mapConcurrent(keys, GITLAB_SYNC_CONCURRENCY, async (key) => {
    if (locallyKnownKeys.has(key)) {
      states.set(key, "linked");
      return;
    }
    try {
      states.set(key, await lookup(key) ? "linked" : "undetermined");
    } catch (error) {
      if (error instanceof JiraSearchFailureError && [400, 404].includes(error.status ?? 0)) {
        states.set(key, "undetermined");
        return;
      }
      throw error;
    }
  });
  return states;
}

function relevantMergeRequests(mergeRequests: readonly GitlabMergeRequest[], targetBranch: string) {
  return mergeRequests
    .filter((mergeRequest) => mergeRequest.target_branch === targetBranch)
    .sort((left, right) => (right.merged_at ?? "").localeCompare(left.merged_at ?? ""));
}

function primaryMergeRequest(mergeRequests: readonly GitlabMergeRequest[]) {
  return mergeRequests.find((mergeRequest) => mergeRequest.state === "merged") ?? mergeRequests[0] ?? null;
}

function cleanError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown GitLab synchronization error";
  return message.replaceAll(/(private-token|bearer|token)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]").slice(0, 1_000);
}

export async function syncGitlabBranchCommitAggregate(
  client: PrismaClient,
  input: {
    projectId: string;
    aggregateId: string;
    aggregateVersion: number;
    definition: JiraSemanticAggregateDefinition;
    createdById: string | null;
    now?: Date;
  },
) {
  const config = branchConfig(input.definition);
  const scopeKey = gitlabBranchScopeKey(config);
  const now = input.now ?? new Date();
  const windowStartedAt = new Date(now.getTime() - config.lookbackDays * 24 * 60 * 60 * 1_000);
  const run = await client.gitlabBranchSyncRun.create({
    data: {
      projectId: input.projectId,
      aggregateId: input.aggregateId,
      aggregateVersion: input.aggregateVersion,
      scopeKey,
      projectPath: config.projectPath,
      targetBranch: config.targetBranch,
      lookbackDays: config.lookbackDays,
      includeMergeCommits: config.includeMergeCommits,
      windowStartedAt,
      windowEndedAt: now,
      status: "RUNNING",
      createdById: input.createdById,
    },
  });

  try {
    const gitlab = await resolveGitlabReadOnlyConfig(client);
    const before = await fetchGitlabBranch(gitlab, config.projectPath, config.targetBranch);
    const commits = (await fetchGitlabBranchCommits(
      gitlab,
      config.projectPath,
      before.commit.id,
      windowStartedAt,
      now,
    )).filter((commit) => config.includeMergeCommits || commit.parent_ids.length < 2);

    const commitMergeRequests = await mapConcurrent(commits, GITLAB_SYNC_CONCURRENCY, async (commit) =>
      relevantMergeRequests(
        await fetchGitlabCommitMergeRequests(gitlab, config.projectPath, commit.id),
        config.targetBranch,
      )
    );
    const keysByCommit = commits.map((commit, index) => {
      const mergeRequests = commitMergeRequests[index] ?? [];
      return gitlabJiraKeysFrom([
        commit.title,
        commit.message,
        ...mergeRequests.flatMap((mergeRequest) => [
          mergeRequest.title,
          mergeRequest.description,
          mergeRequest.source_branch,
        ]),
      ]);
    });
    const uniqueKeys = [...new Set(keysByCommit.flat())].sort();
    const locallyKnownKeys = new Set((await client.jiraIssueSnapshot.findMany({
      where: { projectId: input.projectId, issueKey: { in: uniqueKeys } },
      select: { issueKey: true },
    })).map((issue) => issue.issueKey));
    const keyStates = await validateGitlabJiraKeys(uniqueKeys, locallyKnownKeys);
    const after = await fetchGitlabBranch(gitlab, config.projectPath, config.targetBranch);
    if (after.commit.id !== before.commit.id) {
      throw new GitlabBranchAnalyticsError("GitLab branch moved during synchronization; run synchronization again");
    }

    const observedAt = new Date();
    const rows = commits.map((commit, index) => {
      const jiraKeys = keysByCommit[index] ?? [];
      const jiraLinkState: LinkState = jiraKeys.length === 0
        ? "unlinked"
        : jiraKeys.some((key) => keyStates.get(key) === "linked")
          ? "linked"
          : "undetermined";
      const mergeRequest = primaryMergeRequest(commitMergeRequests[index] ?? []);
      return { commit, jiraKeys, jiraLinkState, mergeRequest };
    });
    const linkedCount = rows.filter((row) => row.jiraLinkState === "linked").length;
    const unlinkedCount = rows.filter((row) => row.jiraLinkState === "unlinked").length;
    const undeterminedCount = rows.length - linkedCount - unlinkedCount;

    await client.$transaction(async (transaction) => {
      const commitShas = rows.map((row) => row.commit.id);
      await transaction.gitlabBranchCommit.updateMany({
        where: {
          projectId: input.projectId,
          scopeKey,
          committedAt: { gte: windowStartedAt, lte: now },
          retiredAt: null,
          ...(commitShas.length > 0 ? { commitSha: { notIn: commitShas } } : {}),
        },
        data: { retiredAt: observedAt },
      });
      for (const row of rows) {
        const mergeRequest = row.mergeRequest;
        const data = {
          syncRunId: run.id,
          shortSha: row.commit.short_id,
          title: row.commit.title,
          message: row.commit.message,
          authorName: row.commit.author_name,
          authorEmail: row.commit.author_email ?? null,
          committedAt: new Date(row.commit.committed_date),
          webUrl: row.commit.web_url,
          sourceBranch: mergeRequest?.source_branch ?? null,
          mergeRequestIid: mergeRequest?.iid ?? null,
          mergeRequestTitle: mergeRequest?.title ?? null,
          mergeRequestUrl: mergeRequest?.web_url ?? null,
          jiraKeys: row.jiraKeys,
          jiraLinkState: row.jiraLinkState,
          observedAt,
          retiredAt: null,
        };
        await transaction.gitlabBranchCommit.upsert({
          where: {
            projectId_scopeKey_commitSha: {
              projectId: input.projectId,
              scopeKey,
              commitSha: row.commit.id,
            },
          },
          create: {
            projectId: input.projectId,
            scopeKey,
            projectPath: config.projectPath,
            targetBranch: config.targetBranch,
            commitSha: row.commit.id,
            ...data,
          },
          update: data,
        });
      }
      await transaction.gitlabBranchSyncRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          headSha: before.commit.id,
          commitCount: rows.length,
          linkedCount,
          unlinkedCount,
          undeterminedCount,
          finishedAt: observedAt,
        },
      });
    }, GITLAB_SYNC_TRANSACTION_OPTIONS);
    return { runId: run.id, headSha: before.commit.id, commitCount: rows.length, linkedCount, unlinkedCount, undeterminedCount };
  } catch (error) {
    await client.gitlabBranchSyncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", errorMessage: cleanError(error), finishedAt: new Date() },
    });
    throw error;
  }
}

function normalized(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("ru-RU");
}

function matchesFilter(value: string | number | boolean | null | undefined, filter: JiraAnalyticsFilter) {
  if (filter.operator === "empty") return value === null || value === undefined || value === "";
  if (filter.operator === "notEmpty") return value !== null && value !== undefined && value !== "";
  const actual = normalized(value);
  const expected = normalized(filter.value);
  if (filter.operator === "equals") return actual === expected;
  if (filter.operator === "notEquals") return actual !== expected;
  if (filter.operator === "contains") return actual.includes(expected);
  if (filter.operator === "oneOf" || filter.operator === "noneOf") {
    const values = filter.value.split(",").map(normalized).filter(Boolean);
    const included = values.includes(actual);
    return filter.operator === "oneOf" ? included : !included;
  }
  if (["greaterThan", "atLeast", "lessThan", "atMost"].includes(filter.operator)) {
    const left = Number(value);
    const right = Number(filter.value);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (filter.operator === "greaterThan") return left > right;
    if (filter.operator === "atLeast") return left >= right;
    if (filter.operator === "lessThan") return left < right;
    return left <= right;
  }
  const left = Date.parse(String(value ?? ""));
  const right = Date.parse(filter.value);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return filter.operator === "before" ? left < right : left > right;
}

function filtersMatch(
  values: Partial<Record<JiraAnalyticsFilterField, string | number | boolean | null>>,
  filters: readonly JiraAnalyticsFilter[],
  logic: "and" | "or",
) {
  if (filters.length === 0) return true;
  const outcomes = filters.map((filter) => matchesFilter(values[filter.field], filter));
  return logic === "and" ? outcomes.every(Boolean) : outcomes.some(Boolean);
}

function resultRecord(row: {
  id: string;
  projectPath: string;
  targetBranch: string;
  commitSha: string;
  shortSha: string;
  title: string;
  authorName: string;
  authorEmail: string | null;
  committedAt: Date;
  webUrl: string;
  sourceBranch: string | null;
  mergeRequestIid: number | null;
  mergeRequestTitle: string | null;
  mergeRequestUrl: string | null;
  jiraKeys: string[];
  jiraLinkState: string;
  observedAt: Date;
}): JiraAnalyticsResultRecord {
  const values = {
    gitlabProjectPath: row.projectPath,
    gitlabTargetBranch: row.targetBranch,
    commitSha: row.commitSha,
    commitShortSha: row.shortSha,
    commitTitle: row.title,
    commitAuthor: row.authorName,
    commitAuthorEmail: row.authorEmail,
    committedAt: row.committedAt.toISOString(),
    commitUrl: row.webUrl,
    sourceBranch: row.sourceBranch,
    mergeRequestIid: row.mergeRequestIid,
    mergeRequestTitle: row.mergeRequestTitle,
    mergeRequestUrl: row.mergeRequestUrl,
    jiraKeys: row.jiraKeys.join(", ") || null,
    jiraLinkState: row.jiraLinkState,
  } satisfies Partial<Record<JiraAnalyticsFilterField, string | number | boolean | null>>;
  return {
    id: row.id,
    source: "gitlabCommits",
    issue: {
      id: row.id,
      issueKey: row.shortSha,
      issueUrl: row.webUrl,
      summary: row.title,
      status: row.jiraLinkState,
      priority: "",
      assignee: row.authorName,
      reporter: row.authorEmail,
      issueType: "GitLab commit",
      resolution: null,
      sprint: row.targetBranch,
      sprintCount: 0,
      labels: [],
      issueCreatedAt: row.committedAt.toISOString(),
      criticalPriorityAt: null,
      resolutionAt: null,
      criticalSlaTracked: false,
      commitCount: 1,
      mergeRequestCount: row.mergeRequestIid === null ? 0 : 1,
      developmentDataAvailable: true,
      transitionHistoryComplete: true,
      updatedAt: row.observedAt.toISOString(),
    },
    eventAt: row.committedAt.toISOString(),
    intervalStartAt: null,
    intervalEndAt: null,
    intervalStartFromStatus: null,
    intervalStartToStatus: null,
    intervalEndFromStatus: null,
    intervalEndToStatus: null,
    durationHours: null,
    commitCount: 1,
    mergeRequestCount: row.mergeRequestIid === null ? 0 : 1,
    fromStatus: null,
    toStatus: null,
    sprint: row.targetBranch,
    semanticValues: values,
  };
}

export async function evaluateGitlabBranchCommitAggregateFromDatabase(
  client: PrismaClient,
  projectId: string,
  definition: JiraSemanticAggregateDefinition,
  query: {
    filters: JiraAnalyticsFilter[];
    filterLogic: "and" | "or";
    sortBy: string;
    sortDirection: "asc" | "desc";
  },
  options: JiraAnalyticsEvaluationOptions,
): Promise<JiraAnalyticsEvaluationResult> {
  const config = branchConfig(definition);
  const scopeKey = gitlabBranchScopeKey(config);
  const latestRun = await client.gitlabBranchSyncRun.findFirst({
    where: {
      projectId,
      scopeKey,
      status: "COMPLETED",
    },
    orderBy: { finishedAt: "desc" },
  });
  if (!latestRun?.finishedAt) throw new GitlabBranchAnalyticsError("Сначала синхронизируйте этот GitLab-агрегат");
  if (Date.now() - latestRun.finishedAt.getTime() > GITLAB_SYNC_STALE_MS) {
    throw new GitlabBranchAnalyticsError("Данные GitLab старше 24 часов; запустите синхронизацию агрегата");
  }
  const allRows = await client.gitlabBranchCommit.findMany({
    where: {
      projectId,
      scopeKey,
      committedAt: { gte: latestRun.windowStartedAt, lte: latestRun.windowEndedAt },
      retiredAt: null,
    },
  });
  const records = allRows.map(resultRecord);
  const baseFiltered = records.filter((record) => filtersMatch(record.semanticValues ?? {}, definition.basePopulation.filters, definition.basePopulation.logic));
  const filtered = baseFiltered.filter((record) => filtersMatch(record.semanticValues ?? {}, query.filters, query.filterLogic));
  const direction = query.sortDirection === "asc" ? 1 : -1;
  filtered.sort((left, right) => {
    const field = query.sortBy === "default" ? "committedAt" : query.sortBy as JiraAnalyticsFilterField;
    return normalized(left.semanticValues?.[field]).localeCompare(normalized(right.semanticValues?.[field])) * direction;
  });
  const start = (options.page - 1) * options.pageSize;
  const pageRecords = filtered.slice(start, start + options.pageSize);
  const undeterminedCount = allRows.filter((row) => row.jiraLinkState === "undetermined").length;
  return {
    evaluatedAt: latestRun.finishedAt.toISOString(),
    effective: { periodDays: null, periodSource: "NONE", timeZone: definition.timeZone, assignee: "" },
    value: filtered.length,
    groups: [],
    records: pageRecords,
    totalRecords: filtered.length,
    page: options.page,
    pageSize: options.pageSize,
    quality: {
      status: allRows.length === 0 ? "NO_DATA" : undeterminedCount > 0 ? "PARTIAL" : "COMPLETE",
      basis: "CURRENT_PROJECTION",
      source: "gitlabCommits",
      population: allRows.length,
      complete: allRows.filter((row) => row.jiraLinkState !== "undetermined").length,
      incomplete: undeterminedCount,
      coveragePercent: allRows.length === 0 ? null : (allRows.length - undeterminedCount) / allRows.length * 100,
      oldestObservedAt: latestRun.windowStartedAt.toISOString(),
      latestObservedAt: latestRun.finishedAt.toISOString(),
      warnings: undeterminedCount > 0
        ? [{ code: "UNDETERMINED_JIRA_LINK", count: undeterminedCount }]
        : [],
    },
  };
}
