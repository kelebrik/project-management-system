import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

const GITLAB_RESPONSE_BYTES_LIMIT = 5 * 1024 * 1024;
const GITLAB_PAGE_SIZE = 100;
const GITLAB_MAX_COMMITS = 2_000;
const GITLAB_MAX_MERGE_REQUESTS_PER_COMMIT = 100;

export type GitlabReadOnlyConfig = {
  origin: string;
  token: string;
};

export class GitlabReadOnlyRequestError extends Error {
  override name = "GitlabReadOnlyRequestError";
}

const gitlabCommitSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{40}$/i),
  short_id: z.string().min(7).max(40),
  title: z.string(),
  message: z.string(),
  author_name: z.string(),
  author_email: z.string().nullable().optional(),
  committed_date: z.string().datetime({ offset: true }),
  web_url: z.string().url(),
  parent_ids: z.array(z.string().regex(/^[0-9a-f]{40}$/i)),
}).passthrough();

const gitlabMergeRequestSchema = z.object({
  iid: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullable().optional(),
  source_branch: z.string(),
  target_branch: z.string(),
  state: z.string(),
  merged_at: z.string().datetime({ offset: true }).nullable().optional(),
  web_url: z.string().url(),
}).passthrough();

const gitlabBranchSchema = z.object({
  name: z.string(),
  commit: gitlabCommitSchema,
}).passthrough();

export type GitlabCommit = z.infer<typeof gitlabCommitSchema>;
export type GitlabMergeRequest = z.infer<typeof gitlabMergeRequestSchema>;

function validatedOrigin(baseUrl: string) {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new GitlabReadOnlyRequestError("GitLab base URL is invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new GitlabReadOnlyRequestError("GitLab base URL must use HTTPS without embedded credentials");
  }
  return url.origin;
}

export async function resolveGitlabReadOnlyConfig(client: PrismaClient): Promise<GitlabReadOnlyConfig> {
  const rows = await client.systemSetting.findMany({
    where: { key: { in: ["gitlab.enabled", "gitlab.baseUrl", "gitlab.token"] } },
    select: { key: true, value: true },
  });
  const settings = new Map(rows.map((row) => [row.key, row.value.trim()]));
  if (settings.get("gitlab.enabled") !== "true") {
    throw new GitlabReadOnlyRequestError("GitLab integration is disabled");
  }
  const token = settings.get("gitlab.token") ?? "";
  if (!token) throw new GitlabReadOnlyRequestError("GitLab token is not configured");
  return { origin: validatedOrigin(settings.get("gitlab.baseUrl") ?? ""), token };
}

function encodedSegment(value: string) {
  return encodeURIComponent(value);
}

const allowedGitlabPaths = [
  /^\/api\/v4\/projects\/[^/]+\/repository\/branches\/[^/]+$/u,
  /^\/api\/v4\/projects\/[^/]+\/repository\/commits$/u,
  /^\/api\/v4\/projects\/[^/]+\/repository\/commits\/[0-9a-f]{40}\/merge_requests$/iu,
];

export function assertGitlabReadOnlyRequest(
  configuredOrigin: string,
  urlValue: string | URL,
  init: RequestInit = {},
) {
  let url: URL;
  try {
    url = urlValue instanceof URL ? urlValue : new URL(urlValue);
  } catch {
    throw new GitlabReadOnlyRequestError("Blocked invalid GitLab request URL");
  }
  if (url.origin !== configuredOrigin) {
    throw new GitlabReadOnlyRequestError("Blocked GitLab request to an unconfigured origin");
  }
  if ((init.method ?? "GET").toUpperCase() !== "GET" || !allowedGitlabPaths.some((pattern) => pattern.test(url.pathname))) {
    throw new GitlabReadOnlyRequestError(`Blocked non-read-only GitLab request: ${(init.method ?? "GET").toUpperCase()} ${url.pathname}`);
  }
}

async function fetchGitlabJson(
  config: GitlabReadOnlyConfig,
  path: string,
  query: Record<string, string | number | undefined> = {},
): Promise<{ data: unknown; nextPage: string }> {
  const url = new URL(path, config.origin);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value));
  });
  const init: RequestInit = {
    method: "GET",
    redirect: "manual",
    headers: { Accept: "application/json", "PRIVATE-TOKEN": config.token },
    signal: AbortSignal.timeout(20_000),
  };
  assertGitlabReadOnlyRequest(config.origin, url, init);
  const response = await fetch(url, init);
  if (response.status >= 300 && response.status < 400) {
    throw new GitlabReadOnlyRequestError(`GitLab redirected a read-only request (${response.status})`);
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > GITLAB_RESPONSE_BYTES_LIMIT) {
    throw new GitlabReadOnlyRequestError("GitLab response exceeds the safe size limit");
  }
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > GITLAB_RESPONSE_BYTES_LIMIT) {
    throw new GitlabReadOnlyRequestError("GitLab response exceeds the safe size limit");
  }
  if (!response.ok) {
    throw new GitlabReadOnlyRequestError(`GitLab read failed with HTTP ${response.status}`);
  }
  try {
    return { data: JSON.parse(body), nextPage: response.headers.get("x-next-page")?.trim() ?? "" };
  } catch {
    throw new GitlabReadOnlyRequestError("GitLab returned a non-JSON response");
  }
}

export async function fetchGitlabBranch(
  config: GitlabReadOnlyConfig,
  projectPath: string,
  branch: string,
) {
  const response = await fetchGitlabJson(
    config,
    `/api/v4/projects/${encodedSegment(projectPath)}/repository/branches/${encodedSegment(branch)}`,
  );
  return gitlabBranchSchema.parse(response.data);
}

export async function fetchGitlabBranchCommits(
  config: GitlabReadOnlyConfig,
  projectPath: string,
  pinnedHeadSha: string,
  since: Date,
  until: Date,
) {
  const commits: GitlabCommit[] = [];
  let page = "1";
  do {
    const response = await fetchGitlabJson(
      config,
      `/api/v4/projects/${encodedSegment(projectPath)}/repository/commits`,
      {
        ref_name: pinnedHeadSha,
        since: since.toISOString(),
        until: until.toISOString(),
        with_stats: "false",
        per_page: GITLAB_PAGE_SIZE,
        page,
      },
    );
    const parsed = z.array(gitlabCommitSchema).parse(response.data);
    commits.push(...parsed);
    if (commits.length > GITLAB_MAX_COMMITS || (response.nextPage && Number(response.nextPage) * GITLAB_PAGE_SIZE > GITLAB_MAX_COMMITS)) {
      throw new GitlabReadOnlyRequestError(`GitLab commit list exceeds the safe limit of ${GITLAB_MAX_COMMITS}`);
    }
    page = response.nextPage;
  } while (page);
  return commits;
}

export async function fetchGitlabCommitMergeRequests(
  config: GitlabReadOnlyConfig,
  projectPath: string,
  commitSha: string,
) {
  const response = await fetchGitlabJson(
    config,
    `/api/v4/projects/${encodedSegment(projectPath)}/repository/commits/${encodedSegment(commitSha)}/merge_requests`,
    { per_page: GITLAB_MAX_MERGE_REQUESTS_PER_COMMIT },
  );
  if (response.nextPage) {
    throw new GitlabReadOnlyRequestError("GitLab merge request list was truncated");
  }
  return z.array(gitlabMergeRequestSchema).max(GITLAB_MAX_MERGE_REQUESTS_PER_COMMIT).parse(response.data);
}
