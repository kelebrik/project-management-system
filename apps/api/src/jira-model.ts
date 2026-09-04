import { z } from "zod";

export type JiraIssue = {
  jiraId: string | null;
  key: string;
  url: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string | null;
  reporter: string | null;
  issueType: string;
  statusCategory?: string | null;
  parentKey?: string | null;
  epicKey?: string | null;
  labels: string[];
  sprintIds?: string[];
  resolution: string | null;
  resolutionAt: Date | null;
  sprint: string | null;
  sprintAvailable: boolean;
  createdAt: Date | null;
  criticalPriorityAt: Date | null;
  criticalEndPriority: string | null;
  updatedAt: Date;
  transitions: Array<{
    key: string;
    fromStatus: string | null;
    toStatus: string;
    transitionedAt: Date;
    actor: string | null;
  }>;
  transitionHistoryComplete: boolean;
  labelChanges: Array<{
    key: string;
    changedAt: Date;
    fromLabels: string[];
    toLabels: string[];
    actor: string | null;
  }>;
  development: {
    commitCount: number;
    mergeRequestCount: number;
    updatedAt: Date | null;
    available: boolean;
  };
  history?: {
    document: unknown;
    changelogComplete: boolean;
    commentsComplete: boolean;
    worklogsComplete: boolean;
    remoteLinksComplete: boolean;
    attachmentReferencesStripped: number;
  };
};
export function normalizedJiraIssueKey(issueKey: string) {
  const normalized = issueKey.trim().toUpperCase();
  return /^[A-Z][A-Z0-9_]*-\d+$/.test(normalized) ? normalized : null;
}

export const jiraChangelogHistorySchema = z.object({
  id: z.string().optional(),
  created: z.string(),
  author: z
    .object({
      displayName: z.string().optional(),
      name: z.string().optional(),
    }).passthrough()
    .nullable()
    .optional(),
  items: z.array(
    z.object({
      field: z.string().optional(),
      fieldId: z.string().optional(),
      fromString: z.string().nullable().optional(),
      toString: z.string().nullable().optional(),
    }).passthrough(),
  ),
}).passthrough();

export const jiraChangelogPageSchema = z.object({
  startAt: z.number().int().nonnegative().optional(),
  maxResults: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
  histories: z.array(jiraChangelogHistorySchema).default([]),
});

export const jiraChangelogValuesPageSchema = z.object({
  startAt: z.number().int().nonnegative().optional(),
  maxResults: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
  values: z.array(jiraChangelogHistorySchema).default([]),
});

export const jiraIssueChangelogResponseSchema = z.object({
  changelog: jiraChangelogPageSchema,
});

export const jiraChangelogSchema = jiraChangelogPageSchema.optional();
export type JiraChangelogPage = z.infer<typeof jiraChangelogPageSchema>;

export const jiraSearchResponseSchema = z.object({
  startAt: z.number().int().nonnegative().optional(),
  maxResults: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
  names: z.record(z.string(), z.string()).optional(),
  schema: z
    .record(
      z.string(),
      z.object({ custom: z.string().optional() }).passthrough(),
    )
    .optional(),
  issues: z.array(
    z.object({
      id: z.string().optional(),
      key: z.string(),
      fields: z
        .object({
          summary: z.string().nullable(),
          status: z.object({ name: z.string() }).passthrough().nullable(),
          priority: z.object({ name: z.string() }).passthrough().nullable(),
          assignee: z.object({ displayName: z.string() }).passthrough().nullable(),
          reporter: z.object({ displayName: z.string() }).passthrough().nullable().optional(),
          issuetype: z.object({ name: z.string() }).passthrough().nullable(),
          resolution: z.object({ name: z.string() }).passthrough().nullable().optional(),
          resolutiondate: z.string().nullable().optional(),
          created: z.string().optional(),
          updated: z.string(),
        })
        .passthrough(),
      changelog: jiraChangelogSchema,
    }).passthrough(),
  ),
}).passthrough();
export type JiraSearchResponse = z.infer<typeof jiraSearchResponseSchema>;

export const jiraIssueKeySearchResponseSchema = z.object({
  startAt: z.number().int().nonnegative().optional(),
  maxResults: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
  issues: z.array(z.object({ key: z.string() })),
});
export type JiraIssueKeySearchResponse = z.infer<typeof jiraIssueKeySearchResponseSchema>;
export type JiraSearchPage = JiraSearchResponse | JiraIssueKeySearchResponse;

export const jiraRemoteIssueLinkSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  globalId: z.string().optional(),
  relationship: z.string().optional(),
  object: z
    .object({
      title: z.string().optional(),
      url: z.string().optional(),
    })
    .passthrough()
    .optional(),
}).passthrough();

export const jiraRemoteIssueLinksSchema = z.array(z.unknown());

export const jiraFilterResponseSchema = z.object({
  jql: z.string(),
});

export const jiraSessionResponseSchema = z.object({
  session: z.object({
    name: z.string(),
    value: z.string(),
  }),
});

export const jiraCurrentUserResponseSchema = z
  .object({
    accountId: z.string().optional(),
    name: z.string().optional(),
    key: z.string().optional(),
    emailAddress: z.string().optional(),
    displayName: z.string().optional(),
  })
  .passthrough();

export type JiraConfig = {
  enabled: boolean;
  baseUrl: string;
  email: string;
  token: string;
  maxResults: number;
};

export type JiraConfigOptions = {
  baseUrl?: string;
  fetchAllPages?: boolean;
  includeAnalyticsFields?: boolean;
  includeChangelog?: boolean;
  includeRemoteDevelopment?: boolean;
  analyticsScope?: JiraAnalyticsScope;
  labelScope?: string;
  pageSize?: number;
  deadlineAt?: number;
  capacitySample?: boolean;
  includeHistoryDocument?: boolean;
  remoteDevelopmentCache?: Map<string, JiraIssue['development']>;
};

export type JiraAnalyticsScope = {
  type: 'LABEL' | 'EPIC';
  value: string;
};

export type JiraCapacityIssueMeasurement = {
  identity: string;
  currentJsonBytes: number;
  estimatedFullJsonBytes: number;
  estimatedFullGzipBytes: number;
  fieldCount: number;
  changelogHistories: number;
  changelogItems: number;
  changelogComplete: boolean;
  comments: number;
  commentsIncluded: number;
  commentsComplete: boolean;
  worklogs: number;
  worklogsIncluded: number;
  worklogsComplete: boolean;
  developmentLinks: number;
  attachmentExcluded: boolean;
  attachmentFieldExclusionHonored: boolean;
  attachmentReferencesStripped: number;
};

export type JiraIssueFetchResult = {
  issues: JiraIssue[];
  jiraUser: string | null;
  total: number;
  capacityMeasurements?: JiraCapacityIssueMeasurement[];
};

export type JiraIssueKeyFetchResult = {
  issueKeys: string[];
  jiraUser: string | null;
};

export type JiraSearchResult<SearchPage extends JiraSearchPage = JiraSearchResponse> = {
  parsed: SearchPage | null;
  status: number;
  body: string;
  jiraUser?: string;
};

export type JiraSearchRetryBudget = {
  remaining: number;
};

export type JiraCurrentUserResult = {
  authenticated: boolean;
  identity?: string;
  identities?: string[];
  status: number;
  body: string;
};
