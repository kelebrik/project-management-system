import { isJiraCriticalPriority } from '@pms/shared';
import { z } from 'zod';

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
  resolution: string | null;
  resolutionAt: Date | null;
  sprint: string | null;
  sprintAvailable: boolean;
  createdAt: Date | null;
  criticalPriorityAt: Date | null;
  updatedAt: Date;
  transitions: Array<{
    key: string;
    fromStatus: string | null;
    toStatus: string;
    transitionedAt: Date;
    actor: string | null;
  }>;
  transitionHistoryComplete: boolean;
  development: {
    commitCount: number;
    mergeRequestCount: number;
    updatedAt: Date | null;
    available: boolean;
  };
};

const jiraChangelogHistorySchema = z.object({
  id: z.string().optional(),
  created: z.string(),
  author: z
    .object({
      displayName: z.string().optional(),
      name: z.string().optional(),
    })
    .nullable()
    .optional(),
  items: z.array(
    z.object({
      field: z.string().optional(),
      fieldId: z.string().optional(),
      fromString: z.string().nullable().optional(),
      toString: z.string().nullable().optional(),
    }),
  ),
});

const jiraChangelogPageSchema = z.object({
  startAt: z.number().int().nonnegative().optional(),
  maxResults: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
  histories: z.array(jiraChangelogHistorySchema).default([]),
});

const jiraChangelogValuesPageSchema = z.object({
  startAt: z.number().int().nonnegative().optional(),
  maxResults: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
  values: z.array(jiraChangelogHistorySchema).default([]),
});

const jiraIssueChangelogResponseSchema = z.object({
  changelog: jiraChangelogPageSchema,
});

const jiraChangelogSchema = jiraChangelogPageSchema.optional();
type JiraChangelogPage = z.infer<typeof jiraChangelogPageSchema>;

const jiraSearchResponseSchema = z.object({
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
          status: z.object({ name: z.string() }).nullable(),
          priority: z.object({ name: z.string() }).nullable(),
          assignee: z.object({ displayName: z.string() }).nullable(),
          reporter: z.object({ displayName: z.string() }).nullable().optional(),
          issuetype: z.object({ name: z.string() }).nullable(),
          resolution: z.object({ name: z.string() }).nullable().optional(),
          resolutiondate: z.string().nullable().optional(),
          created: z.string().optional(),
          updated: z.string(),
        })
        .passthrough(),
      changelog: jiraChangelogSchema,
    }),
  ),
});
type JiraSearchResponse = z.infer<typeof jiraSearchResponseSchema>;

const jiraRemoteIssueLinkSchema = z.object({
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

const jiraRemoteIssueLinksSchema = z.array(z.unknown());

const jiraFilterResponseSchema = z.object({
  jql: z.string(),
});

const jiraSessionResponseSchema = z.object({
  session: z.object({
    name: z.string(),
    value: z.string(),
  }),
});

const jiraCurrentUserResponseSchema = z
  .object({
    accountId: z.string().optional(),
    name: z.string().optional(),
    key: z.string().optional(),
    emailAddress: z.string().optional(),
    displayName: z.string().optional(),
  })
  .passthrough();

type JiraConfig = {
  enabled: boolean;
  baseUrl: string;
  email: string;
  token: string;
  maxResults: number;
};

type JiraConfigOptions = {
  baseUrl?: string;
  fetchAllPages?: boolean;
  includeAnalyticsFields?: boolean;
  remoteDevelopmentCache?: Map<string, JiraIssue['development']>;
};

type JiraIssueFetchResult = {
  issues: JiraIssue[];
  jiraUser: string | null;
};

type JiraSearchResult = {
  parsed: JiraSearchResponse | null;
  status: number;
  body: string;
  jiraUser?: string;
};

type JiraCurrentUserResult = {
  authenticated: boolean;
  identity?: string;
  identities?: string[];
  status: number;
  body: string;
};

export function isJiraConfigured() {
  const config = resolveJiraConfig();
  return Boolean(config.enabled && config.baseUrl && config.token);
}

function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizedBaseUrl(
  value: string | undefined,
  { remapProdToDev = true }: { remapProdToDev?: boolean } = {},
) {
  const trimmed = nonEmpty(value);
  if (!trimmed) return '';

  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (remapProdToDev && url.hostname.toLowerCase() === 'tasks.sberdevices.ru') {
      url.hostname = 'tasks.dev.sberdevices.ru';
    }
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/+$/, '');
  } catch {
    return withProtocol.replace(/\/+$/, '');
  }
}

function jiraLoginFromEmail(email: string) {
  const atIndex = email.indexOf('@');
  return atIndex > 0 ? email.slice(0, atIndex) : '';
}

function normalizeJiraIdentity(value: string) {
  return value.trim().toLowerCase();
}

function expectedJiraIdentities(email: string) {
  return [email, jiraLoginFromEmail(email)]
    .map((identity) => normalizeJiraIdentity(identity))
    .filter(Boolean);
}

function jiraLoginCandidates(email: string) {
  const candidates = [
    email ? { label: 'email', login: email } : null,
    jiraLoginFromEmail(email)
      ? { label: 'email-local-part', login: jiraLoginFromEmail(email) }
      : null,
  ].filter((candidate): candidate is { label: string; login: string } => Boolean(candidate));
  const seenLogins = new Set<string>();
  const uniqueCandidates: Array<{ label: string; login: string }> = [];

  for (const candidate of candidates) {
    if (seenLogins.has(candidate.login)) continue;
    seenLogins.add(candidate.login);
    uniqueCandidates.push(candidate);
  }

  return uniqueCandidates;
}

function jiraBearerToken(token: string) {
  return token.replace(/^bearer\s+/i, '').trim();
}

function jiraAuthAttempts(email: string, token: string) {
  const attempts: Array<{ label: string; headers: Record<string, string> }> = [];
  if (token) {
    attempts.push({
      label: 'bearer-token',
      headers: { Authorization: `Bearer ${jiraBearerToken(token)}` },
    });
  }

  for (const candidate of jiraLoginCandidates(email)) {
    attempts.push({
      label: `basic:${candidate.label}`,
      headers: {
        Authorization: `Basic ${Buffer.from(`${candidate.login}:${token}`).toString('base64')}`,
      },
    });
  }

  return attempts;
}

function compactJiraErrorText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function decodeJiraErrorEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function looksLikeHtmlResponse(value: string) {
  const prefix = value.trimStart().slice(0, 200).toLowerCase();
  return (
    prefix.startsWith('<!doctype html') ||
    prefix.startsWith('<html') ||
    prefix.startsWith('<body') ||
    prefix.includes('<script') ||
    prefix.includes('<style') ||
    prefix.includes('<title') ||
    prefix.includes('<form')
  );
}

function cleanJiraErrorBody(body: string) {
  if (looksLikeHtmlResponse(body)) {
    return 'HTML response from Jira';
  }

  const compactBody = compactJiraErrorText(decodeJiraErrorEntities(body));
  const authFailureIndex = compactBody.toLowerCase().indexOf('basic authentication failure');
  if (authFailureIndex >= 0) {
    return compactBody.slice(authFailureIndex, authFailureIndex + 500);
  }

  return compactBody.slice(0, 500);
}

function isAnonymousFieldVisibilityError(body: string) {
  return /cannot be viewed by anonymous users/i.test(body);
}

function isJiraAuthVerificationFailure(body: string) {
  return /Jira authentication verification failed/i.test(body);
}

function isJiraLoginPage(body: string) {
  return /name=["']os_username["']|id=["']login-form["']|login failed/i.test(body);
}

function isJsonResponse(response: Response) {
  return response.headers.get('content-type')?.toLowerCase().includes('application/json') ?? false;
}

function cookieHeaderFromResponse(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = headers.getSetCookie?.() ?? [];
  const legacySetCookie = response.headers.get('set-cookie');
  if (legacySetCookie && setCookies.length === 0) {
    setCookies.push(legacySetCookie);
  }

  return setCookies
    .map((cookie) => cookie.split(';')[0]?.trim() ?? '')
    .filter(Boolean)
    .join('; ');
}

function jiraSearchPaths() {
  return ['/rest/api/2/search', '/rest/api/3/search/jql'];
}

function jiraFilterPaths(filterId: string) {
  return [`/rest/api/2/filter/${filterId}`, `/rest/api/3/filter/${filterId}`];
}

function jiraMyselfPaths() {
  return ['/rest/api/2/myself', '/rest/api/3/myself'];
}

const jiraReadOnlyGetPaths = [
  /(?:^|\/)rest\/api\/[23]\/filter\/\d+$/,
  /(?:^|\/)rest\/api\/[23]\/myself$/,
  /(?:^|\/)rest\/api\/[23]\/issue\/[^/]+(?:\/(?:changelog|remotelink))?$/,
];

const jiraReadOnlyPostPaths = new Set([
  'rest/api/2/search',
  'rest/api/3/search/jql',
  'rest/auth/1/session',
  'login.jsp',
]);

export class JiraReadOnlyRequestError extends Error {
  override name = 'JiraReadOnlyRequestError';
}

export function assertJiraReadOnlyRequest(urlValue: string | URL, init: RequestInit = {}) {
  let url: URL;
  try {
    url = urlValue instanceof URL ? urlValue : new URL(urlValue);
  } catch {
    throw new JiraReadOnlyRequestError('Blocked invalid Jira request URL');
  }
  const method = (init.method ?? 'GET').toUpperCase();
  const normalizedPath = url.pathname.replace(/^\/+/, '');
  const allowed =
    (method === 'GET' && jiraReadOnlyGetPaths.some((pattern) => pattern.test(url.pathname))) ||
    (method === 'POST' && [...jiraReadOnlyPostPaths].some((path) =>
      normalizedPath === path || normalizedPath.endsWith(`/${path}`)
    ));

  if (!allowed) {
    throw new JiraReadOnlyRequestError(
      `Blocked non-read-only Jira request: ${method} ${url.pathname}`,
    );
  }
}

export function fetchJiraReadOnly(url: string | URL, init: RequestInit = {}) {
  assertJiraReadOnlyRequest(url, init);
  return fetch(url, { ...init, redirect: 'manual' });
}

function savedFilterIdFromJql(jql: string) {
  return jql.trim().match(/^filter\s*=\s*"?(\d+)"?$/i)?.[1] ?? null;
}

function jiraSearchBody(
  jql: string,
  maxResults: number,
  startAt = 0,
  analyticsFieldIds: readonly string[] | null = null,
) {
  return JSON.stringify({
    jql,
    fields: [
      ...(analyticsFieldIds ? analyticsFieldIds : ['*navigable']),
      'summary',
      'status',
      'priority',
      'assignee',
      'reporter',
      'issuetype',
      'resolution',
      'resolutiondate',
      'created',
      'updated',
    ],
    expand: ['names', 'schema', 'changelog'],
    startAt,
    maxResults,
  });
}

function jiraSprintFieldId() {
  return nonEmpty(process.env.JIRA_SPRINT_FIELD_ID) ?? 'customfield_10004';
}

function jiraAnalyticsFieldIds() {
  return [jiraSprintFieldId()];
}

function parseJiraDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type SprintCandidate = {
  name: string;
  state: string;
};

function sprintCandidates(value: unknown): SprintCandidate[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => sprintCandidates(entry));
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const directName = typeof record.name === 'string' ? record.name.trim() : '';
    const direct = directName
      ? [{ name: directName, state: typeof record.state === 'string' ? record.state : '' }]
      : [];
    return [
      ...direct,
      ...Object.entries(record)
        .filter(([key]) => key !== 'name' && key !== 'state')
        .flatMap(([, entry]) => sprintCandidates(entry)),
    ];
  }
  if (typeof value !== 'string' || !value.trim()) return [];

  const names = [...value.matchAll(/name=([^,\]]+)/gi)];
  if (names.length > 0) {
    const state = value.match(/state=([^,\]]+)/i)?.[1]?.trim() ?? '';
    return names.map((match) => ({
      name: match[1]?.trim() ?? '',
      state,
    }));
  }
  return [{ name: value.trim(), state: '' }];
}

export function jiraSprintFromFields(
  fields: Record<string, unknown>,
) {
  const candidates = sprintCandidates(fields[jiraSprintFieldId()]);
  const selected =
    candidates.find((candidate) => candidate.state.toUpperCase() === 'ACTIVE') ??
    candidates.find((candidate) => candidate.state.toUpperCase() === 'FUTURE') ??
    candidates.at(-1);
  return selected?.name || null;
}

function jiraSprintAvailable(fields: Record<string, unknown>) {
  return Object.hasOwn(fields, jiraSprintFieldId());
}

function embeddedJson(value: string) {
  const normalized = value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('\\"', '"');
  const candidates = [normalized];
  const jsonMarker = normalized.indexOf("json='");
  if (jsonMarker >= 0) {
    const start = jsonMarker + 6;
    const end = normalized.lastIndexOf("'");
    if (end > start) candidates.unshift(normalized.slice(start, end));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Jira Server may wrap the JSON payload in a Java object string.
    }
  }
  return null;
}

function developmentCount(value: unknown) {
  if (!value || typeof value !== 'object') return 0;
  const record = value as Record<string, unknown>;
  const overall = record.overall;
  if (overall && typeof overall === 'object') {
    const count = (overall as Record<string, unknown>).count;
    if (typeof count === 'number' && Number.isFinite(count)) return Math.max(0, count);
  }
  if (typeof record.count === 'number' && Number.isFinite(record.count)) {
    return Math.max(0, record.count);
  }
  return 0;
}

function scanDevelopment(value: unknown, key = ''): {
  commitCount: number;
  mergeRequestCount: number;
  updatedAt: Date | null;
  recognized: boolean;
} {
  if (typeof value === 'string') {
    const parsed = embeddedJson(value);
    return parsed
      ? scanDevelopment(parsed, key)
      : {
          commitCount: 0,
          mergeRequestCount: 0,
          updatedAt: parseJiraDate(value),
          recognized: false,
        };
  }
  if (Array.isArray(value)) {
    return value.reduce(
      (result, entry) => {
        const next = scanDevelopment(entry, key);
        return {
          commitCount: Math.max(result.commitCount, next.commitCount),
          mergeRequestCount: Math.max(result.mergeRequestCount, next.mergeRequestCount),
          recognized: result.recognized || next.recognized,
          updatedAt:
            !result.updatedAt || (next.updatedAt && next.updatedAt > result.updatedAt)
              ? next.updatedAt
              : result.updatedAt,
        };
      },
      { commitCount: 0, mergeRequestCount: 0, updatedAt: null, recognized: false } as {
        commitCount: number;
        mergeRequestCount: number;
        updatedAt: Date | null;
        recognized: boolean;
      },
    );
  }
  if (!value || typeof value !== 'object') {
    return { commitCount: 0, mergeRequestCount: 0, updatedAt: null, recognized: false };
  }

  const record = value as Record<string, unknown>;
  const normalizedKey = key.toLowerCase().replaceAll('_', '');
  const isCommitGroup = /^(repository|commit|commits)$/.test(normalizedKey);
  const isMergeRequestGroup = /(pullrequest|mergerequest)/.test(normalizedKey);
  let commitCount = isCommitGroup
    ? developmentCount(record)
    : 0;
  let mergeRequestCount = isMergeRequestGroup
    ? developmentCount(record)
    : 0;
  let recognized = isCommitGroup || isMergeRequestGroup;
  let updatedAt = parseJiraDate(record.lastUpdated ?? record.updatedAt);
  for (const [childKey, childValue] of Object.entries(record)) {
    const next = scanDevelopment(childValue, childKey);
    commitCount = Math.max(commitCount, next.commitCount);
    mergeRequestCount = Math.max(mergeRequestCount, next.mergeRequestCount);
    recognized ||= next.recognized;
    if (!updatedAt || (next.updatedAt && next.updatedAt > updatedAt)) {
      updatedAt = next.updatedAt;
    }
  }
  return { commitCount, mergeRequestCount, updatedAt, recognized };
}

export function jiraDevelopmentFromFields(
  fields: Record<string, unknown>,
  names: Record<string, string> = {},
) {
  const developmentFieldKeys = new Set(
    Object.entries(names)
      .filter(([, name]) => {
        const normalized = name.trim().toLowerCase();
        return normalized.includes('development') || normalized.includes('разработ');
      })
      .map(([key]) => key),
  );
  if ('development' in fields) developmentFieldKeys.add('development');
  const values = [...developmentFieldKeys]
    .filter((key) => fields[key] !== null && fields[key] !== undefined)
    .map((key) => fields[key]);
  const scanned = scanDevelopment(values);
  return {
    commitCount: scanned.commitCount,
    mergeRequestCount: scanned.mergeRequestCount,
    updatedAt: scanned.updatedAt,
    available: values.length > 0 && scanned.recognized,
  };
}

export function jiraDevelopmentFromRemoteLinks(value: unknown): JiraIssue['development'] | null {
  const parsed = jiraRemoteIssueLinksSchema.safeParse(value);
  if (!parsed.success) return null;

  const commits = new Set<string>();
  const mergeRequests = new Set<string>();
  for (const rawLink of parsed.data) {
    const parsedLink = jiraRemoteIssueLinkSchema.safeParse(rawLink);
    if (!parsedLink.success) continue;
    const link = parsedLink.data;
    const relationship = link.relationship?.trim().toLowerCase().replaceAll(/\s+/g, ' ') ?? '';
    if (!/\bmentioned on\b/.test(relationship)) continue;
    const title = link.object?.title?.trim() ?? '';
    const url = link.object?.url?.trim() ?? '';
    const normalizedTitle = title.toLowerCase();
    const developmentLink = jiraDevelopmentLink(url);
    const fallbackIdentity =
      developmentLink?.identity ||
      normalizedRemoteUrl(url) ||
      link.globalId?.trim() ||
      String(link.id ?? '');
    if (!fallbackIdentity) continue;
    if (developmentLink?.kind === 'merge-request') {
      mergeRequests.add(developmentLink.identity);
    } else if (developmentLink?.kind === 'commit') {
      commits.add(developmentLink.identity);
    } else if (/^merge[\s_-]?request\b/.test(normalizedTitle)) {
      mergeRequests.add(fallbackIdentity);
    } else if (/^commit\b/.test(normalizedTitle)) {
      commits.add(fallbackIdentity);
    }
  }

  return {
    commitCount: commits.size,
    mergeRequestCount: mergeRequests.size,
    updatedAt: null,
    available: true,
  };
}

function normalizedRemoteUrl(value: string) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return `${url.origin.toLowerCase()}${url.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch {
    return value.split(/[?#]/, 1)[0]?.replace(/\/+$/, '').toLowerCase() ?? '';
  }
}

function jiraDevelopmentLink(value: string) {
  const normalized = normalizedRemoteUrl(value);
  if (!normalized) return null;
  const mergeRequest = normalized.match(/^(.*\/merge_requests\/[^/]+)(?:\/.*)?$/);
  if (mergeRequest?.[1]) {
    return { kind: 'merge-request' as const, identity: mergeRequest[1] };
  }
  const commit = normalized.match(/^(.*\/commits?\/[^/]+)(?:\/.*)?$/);
  if (commit?.[1]) return { kind: 'commit' as const, identity: commit[1] };
  return null;
}

function selectJiraDevelopment(
  fieldDevelopment: JiraIssue['development'],
  remoteDevelopment: JiraIssue['development'] | null,
  remoteDevelopmentRequested: boolean,
) {
  if (!remoteDevelopmentRequested) return fieldDevelopment;
  return remoteDevelopment ?? {
    commitCount: 0,
    mergeRequestCount: 0,
    updatedAt: null,
    available: false,
  };
}

function jiraStatusTransitions(issue: JiraSearchResponse['issues'][number]) {
  return (issue.changelog?.histories ?? []).flatMap((history, historyIndex) => {
    const transitionedAt = parseJiraDate(history.created);
    if (!transitionedAt) return [];
    return history.items.flatMap((item, itemIndex) => {
      if ((item.fieldId ?? item.field)?.toLowerCase() !== 'status' || !item.toString) return [];
      return [
        {
          key: `${history.id ?? `${history.created}:${historyIndex}`}:${itemIndex}`,
          fromStatus: item.fromString?.trim() || null,
          toStatus: item.toString.trim(),
          transitionedAt,
          actor: history.author?.displayName?.trim() || history.author?.name?.trim() || null,
        },
      ];
    });
  });
}

function jiraTransitionHistoryComplete(issue: JiraSearchResponse['issues'][number]) {
  return jiraChangelogPageComplete(issue.changelog);
}

export function jiraCriticalPriorityAt(
  issue: JiraSearchResponse['issues'][number],
) {
  if (!jiraChangelogPageComplete(issue.changelog)) {
    return null;
  }

  const createdAt = parseJiraDate(issue.fields.created);
  const changes = (issue.changelog?.histories ?? [])
    .flatMap((history) => {
      const changedAt = parseJiraDate(history.created);
      if (!changedAt) return [];
      return history.items.flatMap((item) => {
        const field = (item.fieldId ?? item.field)?.trim().toLowerCase();
        if (field !== 'priority' && field !== 'приоритет') return [];
        return [{
          changedAt,
          fromPriority: item.fromString?.trim() || null,
          toPriority: item.toString?.trim() || null,
        }];
      });
    })
    .sort((left, right) => left.changedAt.getTime() - right.changedAt.getTime());

  if (changes.length === 0) {
    return isJiraCriticalPriority(issue.fields.priority?.name) ? createdAt : null;
  }
  if (isJiraCriticalPriority(changes[0]?.fromPriority)) {
    return createdAt;
  }

  return changes.find((change) => isJiraCriticalPriority(change.toPriority))?.changedAt ?? null;
}

async function fetchJiraFilterJql(
  baseUrl: string,
  filterId: string,
  authHeaders: Record<string, string>,
) {
  let lastErrorBody = '';
  let lastStatus = 0;
  const paths = jiraFilterPaths(filterId);

  for (const [index, path] of paths.entries()) {
    const isLastPath = index === paths.length - 1;
    const response = await fetchJiraReadOnly(`${baseUrl}${path}`, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        ...authHeaders,
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      if (!isJsonResponse(response)) {
        return { jql: null, status: response.status, body: await response.text() };
      }

      try {
        return {
          jql: jiraFilterResponseSchema.parse(await response.json()).jql,
          status: response.status,
          body: '',
        };
      } catch (error) {
        return {
          jql: null,
          status: response.status,
          body: error instanceof Error ? error.message : 'Jira filter response is not valid JSON',
        };
      }
    }

    lastStatus = response.status;
    lastErrorBody =
      response.status >= 300 && response.status < 400
        ? `Redirected to ${response.headers.get('location') ?? 'unknown location'}`
        : await response.text();
    if (
      [400, 401, 403, 404].includes(response.status) ||
      (response.status >= 300 && response.status < 400)
    ) {
      return { jql: null, status: lastStatus, body: lastErrorBody };
    }
    if (![405, 410].includes(response.status) || isLastPath) {
      return { jql: null, status: lastStatus, body: lastErrorBody };
    }
  }

  return { jql: null, status: lastStatus, body: lastErrorBody };
}

async function fetchJiraSearch(
  baseUrl: string,
  searchBody: string,
  authHeaders: Record<string, string>,
): Promise<JiraSearchResult> {
  let lastErrorBody = '';
  let lastStatus = 0;
  const paths = jiraSearchPaths();

  for (const [index, path] of paths.entries()) {
    const isLastPath = index === paths.length - 1;
    const response = await fetchJiraReadOnly(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        ...authHeaders,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: searchBody,
    });

    if (response.ok) {
      if (!isJsonResponse(response)) {
        return { parsed: null, status: response.status, body: await response.text() };
      }

      try {
        return {
          parsed: jiraSearchResponseSchema.parse(await response.json()),
          status: response.status,
          body: '',
        };
      } catch (error) {
        return {
          parsed: null,
          status: response.status,
          body: error instanceof Error ? error.message : 'Jira response is not valid JSON',
        };
      }
    }

    lastStatus = response.status;
    lastErrorBody =
      response.status >= 300 && response.status < 400
        ? `Redirected to ${response.headers.get('location') ?? 'unknown location'}`
        : await response.text();
    if (response.status === 400 && isAnonymousFieldVisibilityError(lastErrorBody)) {
      return { parsed: null, status: lastStatus, body: lastErrorBody };
    }
    if (
      [401, 403].includes(response.status) ||
      (response.status >= 300 && response.status < 400)
    ) {
      return { parsed: null, status: lastStatus, body: lastErrorBody };
    }
    if (![404, 405, 410].includes(response.status) || isLastPath) {
      throw new Error(
        `Jira request failed: ${response.status} ${cleanJiraErrorBody(lastErrorBody)}`,
      );
    }
  }

  return { parsed: null, status: lastStatus, body: lastErrorBody };
}

const JIRA_SEARCH_MAX_PAGES = 1_000;
const JIRA_CHANGELOG_CONCURRENCY = 5;

async function mapWithConcurrency<T, Result>(
  values: readonly T[],
  concurrency: number,
  callback: (value: T) => Promise<Result>,
) {
  const results = new Array<Result>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(values[index]);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => worker(),
    ),
  );
  return results;
}

async function fetchCompleteJiraSearch(
  baseUrl: string,
  jql: string,
  requestedPageSize: number,
  firstPage: JiraSearchResponse,
  authHeaders: Record<string, string>,
  analyticsFieldIds: readonly string[] | null,
) {
  const issuesByKey = new Map(firstPage.issues.map((issue) => [issue.key, issue]));
  if (issuesByKey.size !== firstPage.issues.length) {
    throw new Error('Jira search first page contains duplicate issue keys');
  }
  let names = firstPage.names;
  let schema = firstPage.schema;
  let page = firstPage;
  let total = firstPage.total;

  for (let pageIndex = 0; pageIndex < JIRA_SEARCH_MAX_PAGES; pageIndex += 1) {
    const pageStartAt = page.startAt ?? (pageIndex === 0 ? 0 : undefined);
    if (pageStartAt === undefined) {
      throw new Error('Jira search pagination failed: response does not contain startAt');
    }
    const pageEnd = pageStartAt + page.issues.length;
    const pageSize = Math.max(1, page.maxResults ?? requestedPageSize);
    const reachedEnd =
      total !== undefined ? pageEnd >= total : page.issues.length < pageSize;
    if (reachedEnd) {
      if (total !== undefined && issuesByKey.size !== total) {
        throw new Error(
          `Jira search pagination returned ${issuesByKey.size} unique issues, expected ${total}`,
        );
      }
      return {
        ...firstPage,
        startAt: 0,
        maxResults: issuesByKey.size,
        total: total ?? issuesByKey.size,
        names,
        schema,
        issues: Array.from(issuesByKey.values()),
      } satisfies JiraSearchResponse;
    }
    if (page.issues.length === 0) {
      throw new Error(
        `Jira search pagination stopped at ${pageStartAt} before total ${total ?? 'unknown'}`,
      );
    }

    const result = await fetchJiraSearch(
      baseUrl,
      jiraSearchBody(jql, requestedPageSize, pageEnd, analyticsFieldIds),
      authHeaders,
    );
    if (!result.parsed) {
      throw new Error(
        `Jira search pagination failed at ${pageEnd}: ${result.status || 'unknown'} ${
          result.body ? cleanJiraErrorBody(result.body) : ''
        }`.trim(),
      );
    }

    const returnedStartAt = result.parsed.startAt ?? pageEnd;
    if (returnedStartAt !== pageEnd) {
      throw new Error(
        `Jira search pagination returned startAt ${returnedStartAt}, expected ${pageEnd}`,
      );
    }
    if (
      total !== undefined &&
      result.parsed.total !== undefined &&
      result.parsed.total !== total
    ) {
      throw new Error(
        `Jira search total changed from ${total} to ${result.parsed.total} during pagination`,
      );
    }
    page = { ...result.parsed, startAt: returnedStartAt };
    const uniqueIssueCount = issuesByKey.size;
    for (const issue of page.issues) issuesByKey.set(issue.key, issue);
    if (issuesByKey.size - uniqueIssueCount !== page.issues.length) {
      throw new Error(`Jira search pages overlap at startAt ${returnedStartAt}`);
    }
    names = { ...names, ...page.names };
    schema = { ...schema, ...page.schema };
    total = page.total ?? total;
  }

  throw new Error(`Jira search pagination exceeded ${JIRA_SEARCH_MAX_PAGES} pages`);
}

const JIRA_CHANGELOG_PAGE_SIZE = 100;
const JIRA_CHANGELOG_MAX_PAGES = 100;

function jiraChangelogPageComplete(changelog: JiraChangelogPage | undefined) {
  if (!changelog || (changelog.startAt ?? 0) !== 0) return false;
  if (changelog.total !== undefined) return changelog.histories.length >= changelog.total;
  if (changelog.maxResults !== undefined) {
    return changelog.histories.length < changelog.maxResults;
  }
  return true;
}

function jiraChangelogHistoryKey(
  history: z.infer<typeof jiraChangelogHistorySchema>,
) {
  return history.id ?? `${history.created}:${JSON.stringify(history.items)}`;
}

async function fetchJiraChangelogPage(
  baseUrl: string,
  issueKey: string,
  startAt: number,
  authHeaders: Record<string, string>,
): Promise<JiraChangelogPage | null> {
  const encodedKey = encodeURIComponent(issueKey);
  const query = `startAt=${startAt}&maxResults=${JIRA_CHANGELOG_PAGE_SIZE}`;
  const paths = [
    `/rest/api/2/issue/${encodedKey}/changelog?${query}`,
    `/rest/api/3/issue/${encodedKey}/changelog?${query}`,
  ];

  for (const path of paths) {
    const response = await fetchJiraReadOnly(`${baseUrl}${path}`, {
      method: 'GET',
      redirect: 'manual',
      headers: { ...authHeaders, Accept: 'application/json' },
    });
    if ([400, 401, 403, 404, 405, 410].includes(response.status)) continue;
    if (!response.ok) {
      throw new Error(
        `Jira changelog request failed for ${issueKey}: ${response.status} ${cleanJiraErrorBody(
          await response.text(),
        )}`,
      );
    }
    if (!isJsonResponse(response)) continue;

    const payload = await response.json();
    const valuesPage = jiraChangelogValuesPageSchema.safeParse(payload);
    if (valuesPage.success) {
      return {
        startAt: valuesPage.data.startAt,
        maxResults: valuesPage.data.maxResults,
        total: valuesPage.data.total,
        histories: valuesPage.data.values,
      };
    }
    const historiesPage = jiraChangelogPageSchema.safeParse(payload);
    if (historiesPage.success) return historiesPage.data;
  }

  return null;
}

async function fetchJiraExpandedChangelog(
  baseUrl: string,
  issueKey: string,
  authHeaders: Record<string, string>,
): Promise<JiraChangelogPage | null> {
  const encodedKey = encodeURIComponent(issueKey);
  const paths = [
    `/rest/api/2/issue/${encodedKey}?fields=updated&expand=changelog`,
    `/rest/api/3/issue/${encodedKey}?fields=updated&expand=changelog`,
  ];

  for (const path of paths) {
    const response = await fetchJiraReadOnly(`${baseUrl}${path}`, {
      method: 'GET',
      redirect: 'manual',
      headers: { ...authHeaders, Accept: 'application/json' },
    });
    if ([400, 401, 403, 404, 405, 410].includes(response.status)) continue;
    if (!response.ok) {
      throw new Error(
        `Jira issue changelog request failed for ${issueKey}: ${response.status} ${cleanJiraErrorBody(
          await response.text(),
        )}`,
      );
    }
    if (!isJsonResponse(response)) continue;
    const parsed = jiraIssueChangelogResponseSchema.safeParse(await response.json());
    if (parsed.success) return parsed.data.changelog;
  }

  return null;
}

async function hydrateJiraIssueChangelog(
  baseUrl: string,
  issue: JiraSearchResponse['issues'][number],
  authHeaders: Record<string, string>,
) {
  if (jiraChangelogPageComplete(issue.changelog)) return issue;

  const histories = [...(issue.changelog?.histories ?? [])];
  const historyKeys = new Set(histories.map(jiraChangelogHistoryKey));
  let total = issue.changelog?.total;
  let nextStartAt = (issue.changelog?.startAt ?? 0) + histories.length;
  let complete = false;
  let dedicatedEndpointAvailable = true;

  for (let pageIndex = 0; pageIndex < JIRA_CHANGELOG_MAX_PAGES; pageIndex += 1) {
    const page = await fetchJiraChangelogPage(baseUrl, issue.key, nextStartAt, authHeaders);
    if (!page) {
      dedicatedEndpointAvailable = false;
      break;
    }

    let added = 0;
    for (const history of page.histories) {
      const key = jiraChangelogHistoryKey(history);
      if (historyKeys.has(key)) continue;
      historyKeys.add(key);
      histories.push(history);
      added += 1;
    }
    total = page.total ?? total;
    const pageStartAt = page.startAt ?? nextStartAt;
    const pageEnd = pageStartAt + page.histories.length;
    if (
      page.histories.length === 0 ||
      (total !== undefined && pageEnd >= total) ||
      (total === undefined && page.histories.length < (page.maxResults ?? JIRA_CHANGELOG_PAGE_SIZE))
    ) {
      complete = total === undefined || histories.length >= total;
      break;
    }
    if (pageEnd <= nextStartAt || added === 0) break;
    nextStartAt = pageEnd;
  }

  if (complete) {
    return {
      ...issue,
      changelog: {
        startAt: 0,
        maxResults: histories.length,
        total: total ?? histories.length,
        histories,
      },
    };
  }

  const expanded = await fetchJiraExpandedChangelog(baseUrl, issue.key, authHeaders);
  if (!expanded) return issue;
  const useExpanded =
    jiraChangelogPageComplete(expanded) ||
    !dedicatedEndpointAvailable ||
    expanded.histories.length > histories.length;
  return useExpanded ? { ...issue, changelog: expanded } : issue;
}

export async function fetchJiraRemoteDevelopment(
  baseUrl: string,
  issueKey: string,
  authHeaders: Record<string, string>,
) {
  const encodedKey = encodeURIComponent(issueKey);
  const paths = [
    `/rest/api/2/issue/${encodedKey}/remotelink`,
    `/rest/api/3/issue/${encodedKey}/remotelink`,
  ];
  for (const path of paths) {
    let response: Response;
    try {
      response = await fetchJiraReadOnly(`${baseUrl}${path}`, {
        method: 'GET',
        redirect: 'manual',
        headers: { ...authHeaders, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (error instanceof JiraReadOnlyRequestError) throw error;
      return null;
    }
    if ([400, 401, 403, 404, 405, 410].includes(response.status)) {
      await response.text();
      continue;
    }
    if (!response.ok) {
      await response.text();
      return null;
    }
    if (!isJsonResponse(response)) {
      await response.text();
      continue;
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      continue;
    }
    const development = jiraDevelopmentFromRemoteLinks(payload);
    if (development) return development;
  }
  return null;
}

async function hydrateJiraSearchIssues(
  baseUrl: string,
  parsed: JiraSearchResponse,
  authHeaders: Record<string, string>,
  includeRemoteDevelopment: boolean,
  remoteDevelopmentCache?: Map<string, JiraIssue['development']>,
) {
  const hydrated = await mapWithConcurrency(
    parsed.issues,
    JIRA_CHANGELOG_CONCURRENCY,
    async (issue) => {
      const cachedDevelopment = remoteDevelopmentCache?.get(issue.key);
      const [hydratedIssue, fetchedRemoteDevelopment] = await Promise.all([
        hydrateJiraIssueChangelog(baseUrl, issue, authHeaders),
        includeRemoteDevelopment
          ? cachedDevelopment ?? fetchJiraRemoteDevelopment(baseUrl, issue.key, authHeaders)
          : Promise.resolve(null),
      ]);
      const remoteDevelopment = includeRemoteDevelopment
        ? fetchedRemoteDevelopment ?? {
            commitCount: 0,
            mergeRequestCount: 0,
            updatedAt: null,
            available: false,
          }
        : null;
      if (includeRemoteDevelopment && !cachedDevelopment && remoteDevelopment) {
        remoteDevelopmentCache?.set(issue.key, remoteDevelopment);
      }
      return { issue: hydratedIssue, remoteDevelopment };
    },
  );
  return {
    search: { ...parsed, issues: hydrated.map((entry) => entry.issue) },
    remoteDevelopmentByKey: new Map(
      hydrated.map((entry) => [entry.issue.key, entry.remoteDevelopment]),
    ),
  };
}

function jiraUserIdentities(user: z.infer<typeof jiraCurrentUserResponseSchema>) {
  return [user.emailAddress, user.name, user.key, user.accountId, user.displayName]
    .map((identity) => identity?.trim() ?? '')
    .filter(Boolean);
}

async function fetchJiraCurrentUser(
  baseUrl: string,
  authHeaders: Record<string, string>,
  expectedIdentities: string[],
): Promise<JiraCurrentUserResult> {
  let lastErrorBody = '';
  let lastStatus = 0;
  const paths = jiraMyselfPaths();
  const expectedIdentitySet = new Set(expectedIdentities);

  for (const [index, path] of paths.entries()) {
    const isLastPath = index === paths.length - 1;
    const response = await fetchJiraReadOnly(`${baseUrl}${path}`, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        ...authHeaders,
        Accept: 'application/json',
      },
    });

    lastStatus = response.status;

    if (response.ok) {
      if (!isJsonResponse(response)) {
        return {
          authenticated: false,
          status: response.status,
          body: await response.text(),
        };
      }

      try {
        const user = jiraCurrentUserResponseSchema.parse(await response.json());
        const identities = jiraUserIdentities(user);
        const matchedIdentity = identities.find((identity) =>
          expectedIdentitySet.has(normalizeJiraIdentity(identity)),
        );
        return {
          authenticated: Boolean(matchedIdentity),
          identity: matchedIdentity ?? identities[0],
          identities,
          status: response.status,
          body: matchedIdentity
            ? ''
            : `Jira current user ${
                identities.length > 0 ? identities.join(', ') : 'unknown'
              } does not match expected ${expectedIdentities.join(', ')}`,
        };
      } catch (error) {
        return {
          authenticated: false,
          status: response.status,
          body: error instanceof Error ? error.message : 'Jira current user response is not valid JSON',
        };
      }
    }

    lastErrorBody =
      response.status >= 300 && response.status < 400
        ? `Redirected to ${response.headers.get('location') ?? 'unknown location'}`
        : await response.text();
    if (![404, 405, 410].includes(response.status) || isLastPath) {
      return {
        authenticated: false,
        status: lastStatus,
        body: lastErrorBody,
      };
    }
  }

  return {
    authenticated: false,
    status: lastStatus,
    body: lastErrorBody,
  };
}

async function fetchJiraSearchWithVerifiedEmptyResult(
  baseUrl: string,
  searchBody: string,
  authHeaders: Record<string, string>,
  expectedIdentities: string[],
): Promise<JiraSearchResult> {
  const result = await fetchJiraSearch(baseUrl, searchBody, authHeaders);
  if (!result.parsed || result.parsed.issues.length > 0) return result;

  const currentUser = await fetchJiraCurrentUser(baseUrl, authHeaders, expectedIdentities);
  if (currentUser.authenticated) {
    return {
      ...result,
      jiraUser: currentUser.identity,
    };
  }

  return {
    parsed: null,
    status: currentUser.status || result.status,
    body: `Jira authentication verification failed: ${
      currentUser.status || 'unknown'
    } ${currentUser.body ? cleanJiraErrorBody(currentUser.body) : ''}`.trim(),
  };
}

async function fetchJiraSessionCookie(baseUrl: string, username: string, password: string) {
  const response = await fetchJiraReadOnly(`${baseUrl}/rest/auth/1/session`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    return {
      cookie: '',
      status: response.status,
      body:
        response.status >= 300 && response.status < 400
          ? `Redirected to ${response.headers.get('location') ?? 'unknown location'}`
          : await response.text(),
    };
  }

  if (isJsonResponse(response)) {
    try {
      const parsed = jiraSessionResponseSchema.parse(await response.json());
      return {
        cookie: `${parsed.session.name}=${parsed.session.value}`,
        status: response.status,
        body: '',
      };
    } catch (error) {
      return {
        cookie: '',
        status: response.status,
        body: error instanceof Error ? error.message : 'Jira session response is not valid JSON',
      };
    }
  }

  return { cookie: '', status: response.status, body: await response.text() };
}

async function fetchJiraWebLoginCookie(baseUrl: string, username: string, password: string) {
  const response = await fetchJiraReadOnly(`${baseUrl}/login.jsp`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Accept: 'text/html,application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      os_username: username,
      os_password: password,
      os_destination: '/',
      os_cookie: 'true',
      login: 'Log In',
    }).toString(),
  });
  const cookie = cookieHeaderFromResponse(response);
  if (cookie && response.status >= 300 && response.status < 400) {
    return { cookie, status: response.status, body: '' };
  }

  const body =
    response.status >= 300 && response.status < 400
      ? `Redirected to ${response.headers.get('location') ?? 'unknown location'}`
      : await response.text();
  if (cookie && response.status < 400 && !isJiraLoginPage(body)) {
    return { cookie, status: response.status, body: '' };
  }

  return {
    cookie: '',
    status: response.status,
    body,
  };
}

export function resolveJiraConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: JiraConfigOptions = {},
): JiraConfig {
  const overrideBaseUrl = nonEmpty(options.baseUrl);
  const envBaseUrl = nonEmpty(env.JIRA_BASE_URL);
  const envEmail = nonEmpty(env.JIRA_EMAIL);
  const envToken = nonEmpty(env.JIRA_API_TOKEN);
  const maxResults = Math.min(
    500,
    Math.max(1, Number(nonEmpty(env.JIRA_MAX_RESULTS) ?? 100) || 100),
  );

  return {
    enabled: true,
    baseUrl: normalizedBaseUrl(overrideBaseUrl ?? envBaseUrl, {
      remapProdToDev: !overrideBaseUrl,
    }),
    email: envEmail ?? '',
    token: envToken ?? '',
    maxResults,
  };
}

export async function fetchJiraIssues(
  jql: string,
  options: JiraConfigOptions = {},
): Promise<JiraIssue[]> {
  return (await fetchJiraIssuesWithMeta(jql, options)).issues;
}

export async function fetchJiraIssuesWithMeta(
  jql: string,
  options: JiraConfigOptions = {},
): Promise<JiraIssueFetchResult> {
  const { enabled, baseUrl, email, token, maxResults } = resolveJiraConfig(process.env, options);

  if (!enabled || !baseUrl || !token) {
    throw new Error('Jira is not configured');
  }

  const savedFilterId = savedFilterIdFromJql(jql);
  let lastErrorBody = '';
  let lastStatus = 0;
  const authAttempts = jiraAuthAttempts(email, token);
  const attemptedMethods: string[] = [];
  let lastFailure: 'auth' | 'filter' = 'auth';
  let sawAnonymousSearch = false;
  let authVerificationBody = '';
  let parsed: JiraSearchResponse | null = null;
  let successfulAuthHeaders: Record<string, string> | null = null;
  let successfulJql = jql;
  let successfulAnalyticsFieldIds: string[] | null = null;
  let jiraUser: string | null = null;
  const expectedIdentities = expectedJiraIdentities(email);

  for (const authAttempt of authAttempts) {
    attemptedMethods.push(authAttempt.label);
    let effectiveJql = jql;
    if (savedFilterId) {
      const filter = await fetchJiraFilterJql(baseUrl, savedFilterId, authAttempt.headers);
      lastStatus = filter.status;
      lastErrorBody = filter.body;
      if (!filter.jql) {
        lastFailure = 'filter';
        continue;
      }
      effectiveJql = filter.jql;
    }

    const analyticsFieldIds = options.includeAnalyticsFields
      ? jiraAnalyticsFieldIds()
      : null;
    const result = await fetchJiraSearchWithVerifiedEmptyResult(
      baseUrl,
      jiraSearchBody(effectiveJql, maxResults, 0, analyticsFieldIds),
      authAttempt.headers,
      expectedIdentities,
    );
    parsed = result.parsed;
    jiraUser = result.jiraUser ?? jiraUser;
    lastStatus = result.status;
    lastErrorBody = result.body;
    if (isJiraAuthVerificationFailure(result.body)) {
      authVerificationBody = result.body;
    }
    sawAnonymousSearch ||=
      isAnonymousFieldVisibilityError(result.body) || isJiraAuthVerificationFailure(result.body);
    if (parsed) {
      successfulAuthHeaders = authAttempt.headers;
      successfulJql = effectiveJql;
      successfulAnalyticsFieldIds = analyticsFieldIds;
      break;
    }
  }

  if (!parsed) {
    for (const candidate of jiraLoginCandidates(email)) {
      attemptedMethods.push(`session:${candidate.label}`);
      const session = await fetchJiraSessionCookie(baseUrl, candidate.login, token);
      lastStatus = session.status;
      lastErrorBody = session.body;
      if (!session.cookie) continue;

      let effectiveJql = jql;
      if (savedFilterId) {
        const filter = await fetchJiraFilterJql(baseUrl, savedFilterId, {
          Cookie: session.cookie,
        });
        lastStatus = filter.status;
        lastErrorBody = filter.body;
        if (!filter.jql) {
          lastFailure = 'filter';
          continue;
        }
        effectiveJql = filter.jql;
      }

      const authHeaders = { Cookie: session.cookie };
      const analyticsFieldIds = options.includeAnalyticsFields
        ? jiraAnalyticsFieldIds()
        : null;
      const result = await fetchJiraSearchWithVerifiedEmptyResult(
        baseUrl,
        jiraSearchBody(effectiveJql, maxResults, 0, analyticsFieldIds),
        authHeaders,
        expectedIdentities,
      );
      parsed = result.parsed;
      jiraUser = result.jiraUser ?? jiraUser;
      lastStatus = result.status;
      lastErrorBody = result.body;
      if (isJiraAuthVerificationFailure(result.body)) {
        authVerificationBody = result.body;
      }
      sawAnonymousSearch ||=
        isAnonymousFieldVisibilityError(result.body) || isJiraAuthVerificationFailure(result.body);
      if (parsed) {
        successfulAuthHeaders = authHeaders;
        successfulJql = effectiveJql;
        successfulAnalyticsFieldIds = analyticsFieldIds;
        break;
      }
    }
  }

  if (!parsed) {
    for (const candidate of jiraLoginCandidates(email)) {
      attemptedMethods.push(`web-login:${candidate.label}`);
      const login = await fetchJiraWebLoginCookie(baseUrl, candidate.login, token);
      lastStatus = login.status;
      lastErrorBody = login.body;
      if (!login.cookie) continue;

      let effectiveJql = jql;
      if (savedFilterId) {
        const filter = await fetchJiraFilterJql(baseUrl, savedFilterId, {
          Cookie: login.cookie,
        });
        lastStatus = filter.status;
        lastErrorBody = filter.body;
        if (!filter.jql) {
          lastFailure = 'filter';
          continue;
        }
        effectiveJql = filter.jql;
      }

      const authHeaders = { Cookie: login.cookie };
      const analyticsFieldIds = options.includeAnalyticsFields
        ? jiraAnalyticsFieldIds()
        : null;
      const result = await fetchJiraSearchWithVerifiedEmptyResult(
        baseUrl,
        jiraSearchBody(effectiveJql, maxResults, 0, analyticsFieldIds),
        authHeaders,
        expectedIdentities,
      );
      parsed = result.parsed;
      jiraUser = result.jiraUser ?? jiraUser;
      lastStatus = result.status;
      lastErrorBody = result.body;
      if (isJiraAuthVerificationFailure(result.body)) {
        authVerificationBody = result.body;
      }
      sawAnonymousSearch ||=
        isAnonymousFieldVisibilityError(result.body) || isJiraAuthVerificationFailure(result.body);
      if (parsed) {
        successfulAuthHeaders = authHeaders;
        successfulJql = effectiveJql;
        successfulAnalyticsFieldIds = analyticsFieldIds;
        break;
      }
    }
  }

  if (!parsed) {
    if (
      sawAnonymousSearch ||
      isAnonymousFieldVisibilityError(lastErrorBody) ||
      isJiraAuthVerificationFailure(lastErrorBody)
    ) {
      const detailBody = authVerificationBody || lastErrorBody;
      const detail = detailBody ? `: ${cleanJiraErrorBody(detailBody)}` : '';
      throw new Error(
        `Jira did not authenticate ${email}${detail}; requests are anonymous or use an unexpected Jira user after auth methods: ${attemptedMethods.join(
          ', ',
        )}. Check JIRA_API_TOKEN for this service account.`,
      );
    }

    if (lastFailure === 'filter' && savedFilterId) {
      throw new Error(
        `Jira saved filter ${savedFilterId} is unavailable for ${email}: ${
          lastStatus || 'unknown'
        } ${lastErrorBody ? cleanJiraErrorBody(lastErrorBody) : ''}; auth methods tried: ${attemptedMethods.join(
          ', ',
        )}`.trim(),
      );
    }

    throw new Error(
      `Jira authentication failed: ${lastStatus || 'unknown'} ${
        lastErrorBody ? cleanJiraErrorBody(lastErrorBody) : ''
      }; auth methods tried: ${attemptedMethods.join(', ')}`.trim(),
    );
  }

  const completeSearch = options.fetchAllPages && successfulAuthHeaders
    ? await fetchCompleteJiraSearch(
        baseUrl,
        successfulJql,
        maxResults,
        parsed,
        successfulAuthHeaders,
        successfulAnalyticsFieldIds,
      )
    : parsed;
  const hydratedData = successfulAuthHeaders
    ? await hydrateJiraSearchIssues(
        baseUrl,
        completeSearch,
        successfulAuthHeaders,
        Boolean(options.includeAnalyticsFields),
        options.remoteDevelopmentCache,
      )
    : { search: completeSearch, remoteDevelopmentByKey: new Map() };
  const hydrated = hydratedData.search;
  const names = hydrated.names ?? {};
  return {
    issues: hydrated.issues.map((issue) => {
      const fields = issue.fields as Record<string, unknown> & typeof issue.fields;
      return {
        jiraId: issue.id ?? null,
        key: issue.key,
        url: `${baseUrl}/browse/${issue.key}`,
        summary: issue.fields.summary ?? issue.key,
        status: issue.fields.status?.name ?? 'Unknown',
        priority: issue.fields.priority?.name ?? 'None',
        assignee: issue.fields.assignee?.displayName ?? null,
        reporter: issue.fields.reporter?.displayName ?? null,
        issueType: issue.fields.issuetype?.name ?? 'Issue',
        resolution: issue.fields.resolution?.name ?? 'Unresolved',
        resolutionAt: parseJiraDate(issue.fields.resolutiondate),
        sprint: jiraSprintFromFields(fields),
        sprintAvailable: jiraSprintAvailable(fields),
        createdAt: parseJiraDate(issue.fields.created),
        criticalPriorityAt: jiraCriticalPriorityAt(issue),
        updatedAt: new Date(issue.fields.updated),
        transitions: jiraStatusTransitions(issue),
        transitionHistoryComplete: jiraTransitionHistoryComplete(issue),
        development: selectJiraDevelopment(
          jiraDevelopmentFromFields(fields, names),
          hydratedData.remoteDevelopmentByKey.get(issue.key) ?? null,
          Boolean(options.includeAnalyticsFields),
        ),
      };
    }),
    jiraUser,
  };
}
