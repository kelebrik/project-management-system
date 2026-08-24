import { isJiraCriticalPriority } from '@pms/shared';
import { AsyncLocalStorage } from 'node:async_hooks';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';

import { logEvent } from './server/logger.js';
import { sanitizeJiraVersionPayload } from './services/jira-version-canonical.js';

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
  labels?: string[];
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

const jiraChangelogHistorySchema = z.object({
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
type JiraSearchResponse = z.infer<typeof jiraSearchResponseSchema>;

const jiraIssueKeySearchResponseSchema = z.object({
  startAt: z.number().int().nonnegative().optional(),
  maxResults: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
  issues: z.array(z.object({ key: z.string() })),
});
type JiraIssueKeySearchResponse = z.infer<typeof jiraIssueKeySearchResponseSchema>;
type JiraSearchPage = JiraSearchResponse | JiraIssueKeySearchResponse;

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

type JiraSearchResult<SearchPage extends JiraSearchPage = JiraSearchResponse> = {
  parsed: SearchPage | null;
  status: number;
  body: string;
  jiraUser?: string;
};

type JiraSearchRetryBudget = {
  remaining: number;
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
  /(?:^|\/)rest\/api\/[23]\/issue\/[^/]+(?:\/(?:changelog|comment|worklog|remotelink))?$/,
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

export type JiraReadOnlyRequestMetric = {
  method: string;
  path: string;
  status: number;
  durationMs: number;
};

const jiraReadOnlyRequestMetrics = new AsyncLocalStorage<JiraReadOnlyRequestMetric[]>();

export type JiraReadOnlyRequestSummary = {
  count: number;
  durationMsTotal: number;
  durationMsMax: number;
  byRoute: Record<string, number>;
  byStatusClass: Record<string, number>;
};

const jiraReadOnlyRequestSummary = new AsyncLocalStorage<JiraReadOnlyRequestSummary>();
const jiraReadOnlyRequestFailureSummaries = new WeakMap<object, JiraReadOnlyRequestSummary>();

export class JiraSyncDeadlineError extends Error {
  override name = 'JiraSyncDeadlineError';
}

export function jiraReadOnlyRouteTemplate(path: string) {
  if (['search', 'filter', 'myself', 'auth', 'issue', 'changelog', 'comment', 'worklog', 'remotelink', 'other'].includes(path)) {
    return path;
  }
  if (/\/rest\/api\/\d+\/search(?:\/jql)?\/?$/i.test(path)) return 'search';
  if (/\/rest\/api\/\d+\/filter(?:\/\d+)?\/?$/i.test(path)) return 'filter';
  if (/\/rest\/api\/\d+\/myself\/?$/i.test(path)) return 'myself';
  if (/\/rest\/auth\/\d+\/session\/?$/i.test(path)) return 'auth';
  if (/\/rest\/api\/\d+\/issue\/[^/]+\/changelog\/?$/i.test(path)) return 'changelog';
  if (/\/rest\/api\/\d+\/issue\/[^/]+\/comment\/?$/i.test(path)) return 'comment';
  if (/\/rest\/api\/\d+\/issue\/[^/]+\/worklog\/?$/i.test(path)) return 'worklog';
  if (/\/rest\/api\/\d+\/issue\/[^/]+\/remotelink\/?$/i.test(path)) return 'remotelink';
  if (/\/rest\/api\/\d+\/issue\/[^/]+\/?$/i.test(path)) return 'issue';
  return 'other';
}

function jiraStatusClass(status: number) {
  if (status === 0) return 'transport';
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 300 && status < 400) return '3xx';
  if (status >= 400 && status < 500) return '4xx';
  return '5xx';
}

function recordJiraReadOnlyRequest(metric: JiraReadOnlyRequestMetric) {
  jiraReadOnlyRequestMetrics.getStore()?.push(metric);
  const summary = jiraReadOnlyRequestSummary.getStore();
  if (!summary) return;
  const route = jiraReadOnlyRouteTemplate(metric.path);
  const statusClass = jiraStatusClass(metric.status);
  summary.count += 1;
  summary.durationMsTotal += metric.durationMs;
  summary.durationMsMax = Math.max(summary.durationMsMax, metric.durationMs);
  summary.byRoute[route] = (summary.byRoute[route] ?? 0) + 1;
  summary.byStatusClass[statusClass] = (summary.byStatusClass[statusClass] ?? 0) + 1;
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

export async function fetchJiraReadOnly(url: string | URL, init: RequestInit = {}) {
  assertJiraReadOnlyRequest(url, init);
  const startedAt = performance.now();
  const parsedUrl = url instanceof URL ? url : new URL(url);
  try {
    const response = await fetch(url, { ...init, redirect: 'manual' });
    recordJiraReadOnlyRequest({
      method: (init.method ?? 'GET').toUpperCase(),
      path: parsedUrl.pathname,
      status: response.status,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    });
    return response;
  } catch (error) {
    recordJiraReadOnlyRequest({
      method: (init.method ?? 'GET').toUpperCase(),
      path: parsedUrl.pathname,
      status: 0,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    });
    throw error;
  }
}

export async function captureJiraReadOnlyRequestMetrics<Result>(
  callback: () => Promise<Result>,
) {
  const requests: JiraReadOnlyRequestMetric[] = [];
  const result = await jiraReadOnlyRequestMetrics.run(requests, callback);
  return { result, requests };
}

export async function captureJiraReadOnlyRequestSummary<Result>(
  callback: () => Promise<Result>,
) {
  const summary: JiraReadOnlyRequestSummary = {
    count: 0,
    durationMsTotal: 0,
    durationMsMax: 0,
    byRoute: {},
    byStatusClass: {},
  };
  try {
    const result = await jiraReadOnlyRequestSummary.run(summary, callback);
    return { result, summary };
  } catch (error) {
    if ((typeof error === 'object' && error !== null) || typeof error === 'function') {
      jiraReadOnlyRequestFailureSummaries.set(error, summary);
    }
    throw error;
  }
}

export function jiraReadOnlyRequestSummaryForError(error: unknown) {
  if ((typeof error !== 'object' || error === null) && typeof error !== 'function') return null;
  return jiraReadOnlyRequestFailureSummaries.get(error) ?? null;
}

function savedFilterIdFromJql(jql: string) {
  return jql.trim().match(/^filter\s*=\s*"?(\d+)"?$/i)?.[1] ?? null;
}

type JiraSearchBodyOptions = {
  analyticsFieldIds?: readonly string[] | null;
  includeChangelog?: boolean;
  keysOnly?: boolean;
  capacitySample?: boolean;
  fullHistory?: boolean;
};

function jiraSearchBody(
  jql: string,
  maxResults: number,
  startAt = 0,
  options: JiraSearchBodyOptions = {},
) {
  const analyticsFieldIds = options.analyticsFieldIds ?? null;
  const keysOnly = options.keysOnly === true;
  return JSON.stringify({
    jql,
    fields: keysOnly
      ? []
      : [
          ...(options.capacitySample || options.fullHistory
            ? ['*all', '-attachment']
            : analyticsFieldIds ? analyticsFieldIds : ['*navigable']),
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
    ...(!keysOnly
      ? {
          expand: [
            'names',
            'schema',
            ...(options.includeChangelog === false ? [] : ['changelog']),
          ],
        }
      : {}),
    startAt,
    maxResults,
  });
}

const JIRA_LABEL_PATTERN = /^[^\s"'\\]+$/;

function splitTopLevelJiraOrderBy(jql: string) {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let depth = 0;
  let orderByIndex = -1;
  for (let index = 0; index < jql.length; index += 1) {
    const character = jql[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote && character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === character ? null : quote ?? character;
      continue;
    }
    if (quote) continue;
    if (character === '(') depth += 1;
    if (character === ')') {
      depth -= 1;
      if (depth < 0) throw new Error('Некорректные скобки в Jira JQL');
      continue;
    }
    if (
      depth === 0 &&
      /^order\s+by\b/i.test(jql.slice(index)) &&
      (index === 0 || /\s/.test(jql[index - 1] ?? ''))
    ) {
      orderByIndex = index;
    }
  }
  if (quote || depth !== 0) throw new Error('Некорректный Jira JQL: незакрытая строка или скобка');
  if (orderByIndex < 0) return { filter: jql.trim(), orderBy: '' };
  return {
    filter: jql.slice(0, orderByIndex).trim(),
    orderBy: jql.slice(orderByIndex).trim(),
  };
}

export function jiraJqlWithLabelScope(jql: string, label: string) {
  const normalizedLabel = label.trim();
  if (!JIRA_LABEL_PATTERN.test(normalizedLabel)) {
    throw new Error('Лейбл Jira не должен содержать пробелы, кавычки или обратный слеш');
  }
  return jiraJqlWithScopeFilter(jql, `labels = "${normalizedLabel}"`);
}

function jiraJqlWithScopeFilter(jql: string, scopeFilter: string) {
  const { filter, orderBy } = splitTopLevelJiraOrderBy(jql);
  const scopedFilter = filter
    ? `(${filter}) AND ${scopeFilter}`
    : scopeFilter;
  return `${scopedFilter}${orderBy ? ` ${orderBy}` : ''}`;
}

export function jiraJqlWithAnalyticsScope(jql: string, scope: JiraAnalyticsScope) {
  if (scope.type === 'LABEL') return jiraJqlWithLabelScope(jql, scope.value);
  const epicKey = normalizedJiraIssueKey(scope.value);
  if (!epicKey) throw new Error('Укажите корректный код эпика Jira');
  return jiraJqlWithScopeFilter(
    jql,
    `("Epic Link" = "${epicKey}" OR key = "${epicKey}")`,
  );
}

export function jiraJqlWithIssueKeys(jql: string, issueKeys: readonly string[]) {
  const normalizedIssueKeys = [...new Set(issueKeys.map((issueKey) => {
    const normalized = normalizedJiraIssueKey(issueKey);
    if (!normalized) throw new Error(`Некорректный ключ тикета Jira: ${issueKey}`);
    return normalized;
  }))].sort((left, right) => left.localeCompare(right));
  if (normalizedIssueKeys.length === 0) throw new Error('Пустой список тикетов Jira');
  return jiraJqlWithScopeFilter(
    jql,
    `issuekey IN (${normalizedIssueKeys.map((issueKey) => `"${issueKey}"`).join(', ')})`,
  );
}

export function jiraSprintFieldId() {
  return nonEmpty(process.env.JIRA_SPRINT_FIELD_ID) ?? 'customfield_10004';
}

function jiraSprintIdsFromFields(fields: Record<string, unknown>) {
  const ids = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.id === 'string' || typeof record.id === 'number') {
        ids.add(String(record.id));
      }
      Object.values(record).forEach(visit);
      return;
    }
    if (typeof value !== 'string') return;
    for (const match of value.matchAll(/(?:^|,|\[)id=(\d+)(?:,|\])/gi)) {
      if (match[1]) ids.add(match[1]);
    }
  };
  visit(fields[jiraSprintFieldId()]);
  return [...ids].sort((left, right) => {
    if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
      const difference = BigInt(left) - BigInt(right);
      if (difference !== 0n) return difference < 0n ? -1 : 1;
    }
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

function jiraStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string'))]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function jiraObjectString(value: unknown, key: string) {
  if (typeof value === 'string') return value.trim() || null;
  if (!value || typeof value !== 'object') return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' ? candidate.trim() || null : null;
}

function jiraEpicKey(fields: Record<string, unknown>, names: Record<string, string>) {
  const epicField = Object.entries(names).find(([, name]) =>
    ['epic link', 'epic'].includes(name.trim().toLowerCase())
  )?.[0];
  return epicField ? jiraObjectString(fields[epicField], 'key') : null;
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

function isJiraAttachmentKey(key: string) {
  const normalized = key.trim().toLowerCase();
  return normalized === 'attachment' || normalized === 'attachments';
}

function isJiraAttachmentRecord(value: Record<string, unknown>) {
  const adfType = typeof value.type === 'string' ? value.type.trim().toLowerCase() : '';
  if (
    adfType === 'media'
    || adfType === 'mediagroup'
    || adfType === 'mediasingle'
    || adfType === 'mediainline'
  ) return true;
  const changelogField = typeof (value.fieldId ?? value.field) === 'string'
    ? String(value.fieldId ?? value.field).trim().toLowerCase()
    : '';
  if (changelogField === 'attachment' || changelogField === 'attachments') return true;
  return typeof value.filename === 'string'
    && ['mimeType', 'content', 'thumbnail'].some((key) => key in value);
}

function containsJiraAttachmentMetadata(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((entry) => containsJiraAttachmentMetadata(entry));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (isJiraAttachmentRecord(record)) return true;
  return Object.entries(record).some(
    ([key, entry]) => isJiraAttachmentKey(key) || containsJiraAttachmentMetadata(entry),
  );
}

function countJiraAttachmentMetadata(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((total, entry) => total + countJiraAttachmentMetadata(entry), 0);
  }
  if (!value || typeof value !== 'object') return 0;
  const record = value as Record<string, unknown>;
  const adfType = typeof record.type === 'string' ? record.type.trim().toLowerCase() : '';
  const recordMatch = ['mediagroup', 'mediasingle', 'mediainline'].includes(adfType)
    ? 0
    : isJiraAttachmentRecord(record) ? 1 : 0;
  return Object.entries(record).reduce(
    (total, [key, entry]) => {
      const nested = countJiraAttachmentMetadata(entry);
      return total + (isJiraAttachmentKey(key) ? Math.max(1, nested) : nested);
    },
    recordMatch,
  );
}

function sortedJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const sorted = sortedJsonValue(entry);
      return sorted === undefined ? [] : [sorted];
    });
  }
  if (!value || typeof value !== 'object') return value;
  if (isJiraAttachmentRecord(value as Record<string, unknown>)) return undefined;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isJiraAttachmentKey(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, entry]) => {
        const sorted = sortedJsonValue(entry);
        return sorted === undefined ? [] : [[key, sorted] as const];
      }),
  );
}

export function sanitizeJiraCapacityPayload(value: unknown) {
  const payload = sortedJsonValue(value);
  return {
    payload,
    attachmentExcluded: !containsJiraAttachmentMetadata(payload),
    attachmentReferencesStripped: countJiraAttachmentMetadata(value),
  };
}

function jiraEmbeddedCollection(value: unknown, arrayKey: string) {
  if (!value || typeof value !== 'object') {
    return { total: 0, included: 0, complete: true, currentBytes: 0, estimatedBytes: 0 };
  }
  const record = value as Record<string, unknown>;
  const entries = Array.isArray(record[arrayKey]) ? record[arrayKey] : [];
  const included = entries.length;
  const totalValue = typeof record.total === 'number' ? record.total : included;
  const total = Math.max(included, Math.max(0, Math.floor(totalValue)));
  const currentBytes = Buffer.byteLength(JSON.stringify(sortedJsonValue(value)));
  const entriesBytes = Buffer.byteLength(JSON.stringify(sortedJsonValue(entries)));
  const fixedBytes = Math.max(0, currentBytes - entriesBytes);
  const averageEntryBytes = included > 0 ? Math.max(0, entriesBytes - 2) / included : 0;
  const estimatedBytes = total > included && included > 0
    ? Math.ceil(fixedBytes + 2 + averageEntryBytes * total)
    : currentBytes;
  return {
    total,
    included,
    complete: total <= included,
    currentBytes,
    estimatedBytes,
  };
}

function measureJiraIssueCapacity(
  issue: JiraSearchResponse['issues'][number],
  development: JiraIssue['development'] | null,
): JiraCapacityIssueMeasurement {
  const rawFields = issue.fields as Record<string, unknown>;
  const attachmentFieldExclusionHonored = !Object.keys(rawFields).some(isJiraAttachmentKey);
  const rawPayload = {
    jiraId: issue.id ?? null,
    fields: rawFields,
    changelog: issue.changelog ?? null,
  };
  const sanitized = sanitizeJiraCapacityPayload(rawPayload);
  const fields = sortedJsonValue(rawFields) as Record<string, unknown>;
  const comment = jiraEmbeddedCollection(fields.comment, 'comments');
  const worklog = jiraEmbeddedCollection(fields.worklog, 'worklogs');
  const payload = sanitized.payload;
  const serialized = JSON.stringify(payload);
  const currentJsonBytes = Buffer.byteLength(serialized);
  const estimatedFullJsonBytes = Math.max(
    currentJsonBytes,
    currentJsonBytes
      - comment.currentBytes
      - worklog.currentBytes
      + comment.estimatedBytes
      + worklog.estimatedBytes,
  );
  const compressionRatio = serialized.length > 0
    ? gzipSync(serialized).byteLength / currentJsonBytes
    : 1;

  return {
    identity: issue.id ?? issue.key,
    currentJsonBytes,
    estimatedFullJsonBytes,
    estimatedFullGzipBytes: Math.ceil(estimatedFullJsonBytes * compressionRatio),
    fieldCount: Object.keys(fields).length,
    changelogHistories: issue.changelog?.histories.length ?? 0,
    changelogItems: issue.changelog?.histories.reduce(
      (total, history) => total + history.items.length,
      0,
    ) ?? 0,
    changelogComplete: jiraChangelogPageComplete(issue.changelog),
    comments: comment.total,
    commentsIncluded: comment.included,
    commentsComplete: comment.complete,
    worklogs: worklog.total,
    worklogsIncluded: worklog.included,
    worklogsComplete: worklog.complete,
    developmentLinks: (development?.commitCount ?? 0) + (development?.mergeRequestCount ?? 0),
    attachmentExcluded: sanitized.attachmentExcluded,
    attachmentFieldExclusionHonored,
    attachmentReferencesStripped: sanitized.attachmentReferencesStripped,
  };
}

export function jiraCriticalPriorityAt(
  issue: JiraSearchResponse['issues'][number],
) {
  const historyComplete = jiraChangelogPageComplete(issue.changelog);
  const createdAt = parseJiraDate(issue.fields.created);
  const changes = jiraPriorityChanges(issue);

  if (changes.length === 0) {
    return historyComplete && isJiraCriticalPriority(issue.fields.priority?.name)
      ? createdAt
      : null;
  }
  if (historyComplete && isJiraCriticalPriority(changes[0]?.fromPriority)) {
    return createdAt;
  }

  return changes.find((change) => isJiraCriticalPriority(change.toPriority))?.changedAt ?? null;
}

function jiraPriorityChanges(
  issue: JiraSearchResponse['issues'][number],
) {
  return (issue.changelog?.histories ?? [])
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
}

export function jiraPriorityAtResolution(
  issue: JiraSearchResponse['issues'][number],
) {
  const resolutionAt = parseJiraDate(issue.fields.resolutiondate);
  if (!resolutionAt || !jiraChangelogPageComplete(issue.changelog)) return null;

  const changes = jiraPriorityChanges(issue);
  let priorityAtResolution = changes.length > 0
    ? changes[0]?.fromPriority ?? null
    : issue.fields.priority?.name?.trim() || null;
  for (const change of changes) {
    if (change.changedAt > resolutionAt) break;
    priorityAtResolution = change.toPriority;
  }
  return priorityAtResolution;
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

const JIRA_SEARCH_TIMEOUT_MS = 60_000;
const JIRA_CHANGELOG_TIMEOUT_MS = 30_000;
const JIRA_SEARCH_MAX_ATTEMPTS = 3;
const JIRA_SEARCH_RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const JIRA_SEARCH_RETRY_DELAYS_MS = [250, 750] as const;
const JIRA_SEARCH_MAX_RETRY_AFTER_MS = 5_000;

function jiraRequestTimeout(deadlineAt: number | undefined, requestTimeoutMs: number) {
  const remainingMs = deadlineAt === undefined ? requestTimeoutMs : deadlineAt - Date.now();
  if (remainingMs <= 0) {
    throw new JiraSyncDeadlineError('Превышен общий лимит времени синхронизации Jira');
  }
  return AbortSignal.timeout(Math.max(1, Math.min(requestTimeoutMs, remainingMs)));
}

function jiraTimeoutError(error: unknown, operation: string) {
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
    return new Error(`${operation}: превышен лимит времени ожидания Jira`);
  }
  return error;
}

function jiraSearchRetryDelay(response: Response, attempt: number) {
  const retryAfter = response.headers.get('retry-after')?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, JIRA_SEARCH_MAX_RETRY_AFTER_MS);
    }
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return Math.min(Math.max(0, retryAt - Date.now()), JIRA_SEARCH_MAX_RETRY_AFTER_MS);
    }
  }
  return JIRA_SEARCH_RETRY_DELAYS_MS[attempt] ?? 0;
}

async function fetchJiraSearch<SearchPage extends JiraSearchPage = JiraSearchResponse>(
  baseUrl: string,
  searchBody: string,
  authHeaders: Record<string, string>,
  schema: z.ZodType<SearchPage> = jiraSearchResponseSchema as unknown as z.ZodType<SearchPage>,
  deadlineAt?: number,
  retryBudget: JiraSearchRetryBudget = { remaining: JIRA_SEARCH_MAX_ATTEMPTS - 1 },
): Promise<JiraSearchResult<SearchPage>> {
  let lastErrorBody = '';
  let lastStatus = 0;
  const paths = jiraSearchPaths();

  for (const [index, path] of paths.entries()) {
    const isLastPath = index === paths.length - 1;
    for (let attempt = 0; attempt < JIRA_SEARCH_MAX_ATTEMPTS; attempt += 1) {
      const startedAt = Date.now();
      let response: Response;
      try {
        response = await fetchJiraReadOnly(`${baseUrl}${path}`, {
          method: 'POST',
          redirect: 'manual',
          headers: {
            ...authHeaders,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: searchBody,
          signal: jiraRequestTimeout(deadlineAt, JIRA_SEARCH_TIMEOUT_MS),
        });
      } catch (error) {
        logEvent('warn', 'jira.search.failed', {
          path,
          attempt: attempt + 1,
          durationMs: Date.now() - startedAt,
          reason: error instanceof Error ? error.name : 'unknown',
        });
        throw jiraTimeoutError(error, 'Поиск Jira');
      }
      logEvent(response.ok ? 'info' : 'warn', 'jira.search.completed', {
        path,
        attempt: attempt + 1,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });

      if (response.ok) {
        if (!isJsonResponse(response)) {
          return { parsed: null, status: response.status, body: await response.text() };
        }

        try {
          return {
            parsed: schema.parse(await response.json()),
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
      if (
        JIRA_SEARCH_RETRYABLE_STATUSES.has(response.status) &&
        attempt < JIRA_SEARCH_MAX_ATTEMPTS - 1 &&
        retryBudget.remaining > 0
      ) {
        const delayMs = jiraSearchRetryDelay(response, attempt);
        if (deadlineAt !== undefined && Date.now() + delayMs >= deadlineAt) {
          logEvent('warn', 'jira.search.retry_skipped', {
            path,
            attempt: attempt + 1,
            status: response.status,
            reason: 'deadline',
          });
          throw new JiraSyncDeadlineError(
            `Превышен общий лимит времени синхронизации Jira после ответа ${response.status}`,
          );
        }
        retryBudget.remaining -= 1;
        logEvent('warn', 'jira.search.retry_scheduled', {
          path,
          attempt: attempt + 1,
          status: response.status,
          delayMs,
          retriesRemaining: retryBudget.remaining,
        });
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        continue;
      }
      if (JIRA_SEARCH_RETRYABLE_STATUSES.has(response.status)) {
        logEvent('warn', 'jira.search.retry_exhausted', {
          path,
          attempt: attempt + 1,
          status: response.status,
          retriesRemaining: retryBudget.remaining,
        });
      }
      if ([404, 405, 410].includes(response.status) && !isLastPath) {
        break;
      }
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
  includeChangelog: boolean,
  capacitySample: boolean,
  fullHistory: boolean,
  deadlineAt?: number,
  retryBudget?: JiraSearchRetryBudget,
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
      jiraSearchBody(jql, requestedPageSize, pageEnd, {
        analyticsFieldIds,
        includeChangelog,
        capacitySample,
        fullHistory,
      }),
      authHeaders,
      jiraSearchResponseSchema,
      deadlineAt,
      retryBudget,
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

const JIRA_LABEL_SCOPE_MAX_ISSUES = 10_000;

class JiraIssueKeyPaginationConsistencyError extends Error {}

async function fetchCompleteJiraIssueKeySearchPass(
  baseUrl: string,
  jql: string,
  requestedPageSize: number,
  firstPage: JiraIssueKeySearchResponse,
  authHeaders: Record<string, string>,
  deadlineAt?: number,
  retryBudget?: JiraSearchRetryBudget,
) {
  const issueKeys = new Set(firstPage.issues.map((issue) => issue.key));
  if (issueKeys.size !== firstPage.issues.length) {
    throw new JiraIssueKeyPaginationConsistencyError(
      'Jira key discovery first page contains duplicate issue keys',
    );
  }
  let page = firstPage;
  let observedTotal = firstPage.total;

  for (let pageIndex = 0; pageIndex < JIRA_SEARCH_MAX_PAGES; pageIndex += 1) {
    if (issueKeys.size > JIRA_LABEL_SCOPE_MAX_ISSUES) {
      throw new Error(
        `Лейбл Jira охватывает больше ${JIRA_LABEL_SCOPE_MAX_ISSUES} тикетов; уточните лейбл`,
      );
    }
    const pageStartAt = page.startAt ?? (pageIndex === 0 ? 0 : undefined);
    if (pageStartAt === undefined) {
      throw new Error('Jira key discovery pagination does not contain startAt');
    }
    const pageEnd = pageStartAt + page.issues.length;
    const pageSize = Math.max(1, page.maxResults ?? requestedPageSize);
    const currentTotal = page.total ?? observedTotal;
    const reachedEnd =
      currentTotal !== undefined ? pageEnd >= currentTotal : page.issues.length < pageSize;
    if (reachedEnd || page.issues.length === 0) {
      if (currentTotal !== undefined && issueKeys.size !== currentTotal) {
        throw new JiraIssueKeyPaginationConsistencyError(
          `Jira key discovery returned ${issueKeys.size} unique issues, expected ${currentTotal}`,
        );
      }
      return [...issueKeys];
    }

    const result = await fetchJiraSearch(
      baseUrl,
      jiraSearchBody(jql, requestedPageSize, pageEnd, { keysOnly: true }),
      authHeaders,
      jiraIssueKeySearchResponseSchema,
      deadlineAt,
      retryBudget,
    );
    if (!result.parsed) {
      throw new Error(
        `Jira key discovery pagination failed at ${pageEnd}: ${result.status || 'unknown'} ${
          result.body ? cleanJiraErrorBody(result.body) : ''
        }`.trim(),
      );
    }
    const returnedStartAt = result.parsed.startAt ?? pageEnd;
    if (returnedStartAt !== pageEnd) {
      throw new JiraIssueKeyPaginationConsistencyError(
        `Jira key discovery returned startAt ${returnedStartAt}, expected ${pageEnd}`,
      );
    }
    if (
      observedTotal !== undefined &&
      result.parsed.total !== undefined &&
      result.parsed.total !== observedTotal
    ) {
      throw new JiraIssueKeyPaginationConsistencyError(
        `Jira key discovery total changed from ${observedTotal} to ${result.parsed.total}`,
      );
    }
    page = { ...result.parsed, startAt: returnedStartAt };
    const sizeBefore = issueKeys.size;
    page.issues.forEach((issue) => issueKeys.add(issue.key));
    if (issueKeys.size - sizeBefore !== page.issues.length) {
      throw new JiraIssueKeyPaginationConsistencyError(
        `Jira key discovery pages overlap at startAt ${returnedStartAt}`,
      );
    }
    observedTotal = page.total ?? observedTotal;
  }

  throw new Error(`Jira key discovery exceeded ${JIRA_SEARCH_MAX_PAGES} pages`);
}

async function fetchCompleteJiraIssueKeySearch(
  baseUrl: string,
  jql: string,
  requestedPageSize: number,
  firstPage: JiraIssueKeySearchResponse,
  authHeaders: Record<string, string>,
  deadlineAt?: number,
  retryBudget?: JiraSearchRetryBudget,
) {
  try {
    return await fetchCompleteJiraIssueKeySearchPass(
      baseUrl,
      jql,
      requestedPageSize,
      firstPage,
      authHeaders,
      deadlineAt,
      retryBudget,
    );
  } catch (error) {
    if (!(error instanceof JiraIssueKeyPaginationConsistencyError)) throw error;
    logEvent('warn', 'jira.search.discovery_restarted', {
      reason: error.message,
    });
  }

  const restarted = await fetchJiraSearch(
    baseUrl,
    jiraSearchBody(jql, requestedPageSize, 0, { keysOnly: true }),
    authHeaders,
    jiraIssueKeySearchResponseSchema,
    deadlineAt,
    retryBudget,
  );
  if (!restarted.parsed) {
    throw new Error(
      `Jira key discovery restart failed: ${restarted.status || 'unknown'} ${
        restarted.body ? cleanJiraErrorBody(restarted.body) : ''
      }`.trim(),
    );
  }
  if (
    ((firstPage.total ?? firstPage.issues.length) > 0 || firstPage.issues.length > 0) &&
    restarted.parsed.issues.length === 0
  ) {
    throw new Error(
      'Jira key discovery restart unexpectedly returned an empty scope after a non-empty first pass',
    );
  }
  return fetchCompleteJiraIssueKeySearchPass(
    baseUrl,
    jql,
    requestedPageSize,
    restarted.parsed,
    authHeaders,
    deadlineAt,
    retryBudget,
  );
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
  deadlineAt?: number,
): Promise<JiraChangelogPage | null> {
  const encodedKey = encodeURIComponent(issueKey);
  const query = `startAt=${startAt}&maxResults=${JIRA_CHANGELOG_PAGE_SIZE}`;
  const paths = [
    `/rest/api/2/issue/${encodedKey}/changelog?${query}`,
    `/rest/api/3/issue/${encodedKey}/changelog?${query}`,
  ];

  for (const path of paths) {
    let response: Response;
    try {
      response = await fetchJiraReadOnly(`${baseUrl}${path}`, {
        method: 'GET',
        redirect: 'manual',
        headers: { ...authHeaders, Accept: 'application/json' },
        signal: jiraRequestTimeout(deadlineAt, JIRA_CHANGELOG_TIMEOUT_MS),
      });
    } catch (error) {
      throw jiraTimeoutError(error, `Загрузка changelog Jira для ${issueKey}`);
    }
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
  deadlineAt?: number,
): Promise<JiraChangelogPage | null> {
  const encodedKey = encodeURIComponent(issueKey);
  const paths = [
    `/rest/api/2/issue/${encodedKey}?fields=updated&expand=changelog`,
    `/rest/api/3/issue/${encodedKey}?fields=updated&expand=changelog`,
  ];

  for (const path of paths) {
    let response: Response;
    try {
      response = await fetchJiraReadOnly(`${baseUrl}${path}`, {
        method: 'GET',
        redirect: 'manual',
        headers: { ...authHeaders, Accept: 'application/json' },
        signal: jiraRequestTimeout(deadlineAt, JIRA_CHANGELOG_TIMEOUT_MS),
      });
    } catch (error) {
      throw jiraTimeoutError(error, `Загрузка changelog Jira для ${issueKey}`);
    }
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
  deadlineAt?: number,
) {
  if (jiraChangelogPageComplete(issue.changelog)) return issue;

  const histories = [...(issue.changelog?.histories ?? [])];
  const historyKeys = new Set(histories.map(jiraChangelogHistoryKey));
  let total = issue.changelog?.total;
  let nextStartAt = (issue.changelog?.startAt ?? 0) + histories.length;
  let complete = false;
  let dedicatedEndpointAvailable = true;

  for (let pageIndex = 0; pageIndex < JIRA_CHANGELOG_MAX_PAGES; pageIndex += 1) {
    const page = await fetchJiraChangelogPage(
      baseUrl,
      issue.key,
      nextStartAt,
      authHeaders,
      deadlineAt,
    );
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

  const expanded = await fetchJiraExpandedChangelog(
    baseUrl,
    issue.key,
    authHeaders,
    deadlineAt,
  );
  if (!expanded) return issue;
  const useExpanded =
    jiraChangelogPageComplete(expanded) ||
    !dedicatedEndpointAvailable ||
    expanded.histories.length > histories.length;
  return useExpanded ? { ...issue, changelog: expanded } : issue;
}

const JIRA_EMBEDDED_COLLECTION_PAGE_SIZE = 100;
const JIRA_EMBEDDED_COLLECTION_MAX_PAGES = 100;

type JiraHydratedCollection = {
  entries: unknown[];
  complete: boolean;
};

function embeddedJiraCollection(value: unknown, key: 'comments' | 'worklogs') {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const entries = Array.isArray(record[key]) ? record[key] : [];
  const startAt = typeof record.startAt === 'number' ? record.startAt : 0;
  const maxResults = typeof record.maxResults === 'number' ? record.maxResults : entries.length;
  const total = typeof record.total === 'number' ? record.total : entries.length;
  return { entries, startAt, maxResults, total };
}

function jiraCollectionEntryKey(value: unknown, index: number) {
  if (value && typeof value === 'object') {
    const id = (value as Record<string, unknown>).id;
    if (typeof id === 'string' || typeof id === 'number') return `id:${id}`;
  }
  return `value:${index}:${JSON.stringify(value)}`;
}

async function fetchJiraCollectionPage(
  baseUrl: string,
  issueKey: string,
  collection: 'comment' | 'worklog',
  startAt: number,
  authHeaders: Record<string, string>,
  deadlineAt?: number,
) {
  const entryKey = collection === 'comment' ? 'comments' : 'worklogs';
  const encodedKey = encodeURIComponent(issueKey);
  const query = `startAt=${startAt}&maxResults=${JIRA_EMBEDDED_COLLECTION_PAGE_SIZE}`;
  const paths = [
    `/rest/api/2/issue/${encodedKey}/${collection}?${query}`,
    `/rest/api/3/issue/${encodedKey}/${collection}?${query}`,
  ];
  for (const path of paths) {
    let response: Response;
    try {
      response = await fetchJiraReadOnly(`${baseUrl}${path}`, {
        method: 'GET',
        redirect: 'manual',
        headers: { ...authHeaders, Accept: 'application/json' },
        signal: jiraRequestTimeout(deadlineAt, JIRA_CHANGELOG_TIMEOUT_MS),
      });
    } catch (error) {
      throw jiraTimeoutError(error, `Загрузка ${collection} Jira для ${issueKey}`);
    }
    if ([400, 401, 403, 404, 405, 410].includes(response.status)) {
      await response.text();
      continue;
    }
    if (!response.ok || !isJsonResponse(response)) {
      await response.text();
      continue;
    }
    const payload = await response.json() as unknown;
    const parsed = embeddedJiraCollection(payload, entryKey);
    if (parsed) return parsed;
  }
  return null;
}

async function hydrateJiraCollection(
  baseUrl: string,
  issueKey: string,
  embedded: unknown,
  collection: 'comment' | 'worklog',
  authHeaders: Record<string, string>,
  deadlineAt?: number,
): Promise<JiraHydratedCollection> {
  const entryKey = collection === 'comment' ? 'comments' : 'worklogs';
  const initial = embeddedJiraCollection(embedded, entryKey);
  if (initial && initial.startAt === 0 && initial.entries.length >= initial.total) {
    return { entries: initial.entries, complete: true };
  }

  const entries: unknown[] = [];
  const keys = new Set<string>();
  let nextStartAt = 0;
  let expectedTotal: number | undefined;
  for (let pageIndex = 0; pageIndex < JIRA_EMBEDDED_COLLECTION_MAX_PAGES; pageIndex += 1) {
    const page = await fetchJiraCollectionPage(
      baseUrl,
      issueKey,
      collection,
      nextStartAt,
      authHeaders,
      deadlineAt,
    );
    if (!page) return { entries, complete: false };
    if (page.startAt !== nextStartAt) return { entries, complete: false };
    if (expectedTotal !== undefined && page.total !== expectedTotal) {
      return { entries, complete: false };
    }
    expectedTotal = page.total;
    for (const [index, entry] of page.entries.entries()) {
      const key = jiraCollectionEntryKey(entry, nextStartAt + index);
      if (keys.has(key)) return { entries, complete: false };
      keys.add(key);
      entries.push(entry);
    }
    const pageEnd = page.startAt + page.entries.length;
    if (pageEnd >= page.total) {
      return { entries, complete: entries.length === page.total };
    }
    if (page.entries.length === 0 || pageEnd <= nextStartAt) {
      return { entries, complete: false };
    }
    nextStartAt = pageEnd;
  }
  return { entries, complete: false };
}

export async function fetchJiraRemoteLinks(
  baseUrl: string,
  issueKey: string,
  authHeaders: Record<string, string>,
  deadlineAt?: number,
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
        signal: jiraRequestTimeout(deadlineAt, 15_000),
      });
    } catch (error) {
      if (error instanceof JiraReadOnlyRequestError || error instanceof JiraSyncDeadlineError) {
        throw error;
      }
      if (deadlineAt !== undefined && deadlineAt <= Date.now()) {
        throw new JiraSyncDeadlineError('Превышен общий лимит времени синхронизации Jira');
      }
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
    const parsed = jiraRemoteIssueLinksSchema.safeParse(payload);
    if (parsed.success) return parsed.data;
  }
  return null;
}

export async function fetchJiraRemoteDevelopment(
  baseUrl: string,
  issueKey: string,
  authHeaders: Record<string, string>,
  deadlineAt?: number,
) {
  const links = await fetchJiraRemoteLinks(baseUrl, issueKey, authHeaders, deadlineAt);
  return links ? jiraDevelopmentFromRemoteLinks(links) : null;
}

async function jiraHistoryRequestOrFallback<Result>(
  request: Promise<Result>,
  fallback: Result,
) {
  try {
    return await request;
  } catch (error) {
    if (error instanceof JiraReadOnlyRequestError || error instanceof JiraSyncDeadlineError) {
      throw error;
    }
    return fallback;
  }
}

async function hydrateJiraSearchIssues(
  baseUrl: string,
  parsed: JiraSearchResponse,
  authHeaders: Record<string, string>,
  includeChangelog: boolean,
  includeRemoteDevelopment: boolean,
  includeHistoryDocument: boolean,
  remoteDevelopmentCache?: Map<string, JiraIssue['development']>,
  deadlineAt?: number,
) {
  const hydrated = await mapWithConcurrency(
    parsed.issues,
    JIRA_CHANGELOG_CONCURRENCY,
    async (issue) => {
      const cachedDevelopment = remoteDevelopmentCache?.get(issue.key);
      const fields = issue.fields as Record<string, unknown> & typeof issue.fields;
      const [hydratedIssue, remoteLinks, comments, worklogs] = await Promise.all([
        includeChangelog
          ? includeHistoryDocument
            ? jiraHistoryRequestOrFallback(
                hydrateJiraIssueChangelog(baseUrl, issue, authHeaders, deadlineAt),
                issue,
              )
            : hydrateJiraIssueChangelog(baseUrl, issue, authHeaders, deadlineAt)
          : Promise.resolve(issue),
        includeRemoteDevelopment || includeHistoryDocument
          ? includeHistoryDocument
            ? jiraHistoryRequestOrFallback(
                fetchJiraRemoteLinks(baseUrl, issue.key, authHeaders, deadlineAt),
                null,
              )
            : Promise.resolve(null)
          : Promise.resolve(null),
        includeHistoryDocument
          ? jiraHistoryRequestOrFallback(
              hydrateJiraCollection(
                baseUrl,
                issue.key,
                fields.comment,
                'comment',
                authHeaders,
                deadlineAt,
              ),
              { entries: [], complete: false },
            )
          : Promise.resolve({ entries: [], complete: false }),
        includeHistoryDocument
          ? jiraHistoryRequestOrFallback(
              hydrateJiraCollection(
                baseUrl,
                issue.key,
                fields.worklog,
                'worklog',
                authHeaders,
                deadlineAt,
              ),
              { entries: [], complete: false },
            )
          : Promise.resolve({ entries: [], complete: false }),
      ]);
      const fetchedRemoteDevelopment = remoteLinks
        ? jiraDevelopmentFromRemoteLinks(remoteLinks)
        : includeRemoteDevelopment && !includeHistoryDocument
          ? cachedDevelopment ?? await fetchJiraRemoteDevelopment(
              baseUrl,
              issue.key,
              authHeaders,
              deadlineAt,
            )
          : null;
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
      const history = includeHistoryDocument
        ? sanitizeJiraVersionPayload({
            issue: {
              ...hydratedIssue,
              fields: {
                ...(hydratedIssue.fields as Record<string, unknown>),
                comment: undefined,
                worklog: undefined,
              },
              changelog: undefined,
            },
            changelog: hydratedIssue.changelog?.histories ?? [],
            comments: comments.entries,
            worklogs: worklogs.entries,
            remoteLinks: remoteLinks ?? [],
          })
        : null;
      return {
        issue: hydratedIssue,
        remoteDevelopment,
        history: history
          ? {
              ...history,
              changelogComplete: jiraChangelogPageComplete(hydratedIssue.changelog),
              commentsComplete: comments.complete,
              worklogsComplete: worklogs.complete,
              remoteLinksComplete: remoteLinks !== null,
            }
          : null,
      };
    },
  );
  return {
    search: { ...parsed, issues: hydrated.map((entry) => entry.issue) },
    remoteDevelopmentByKey: new Map(
      hydrated.map((entry) => [entry.issue.key, entry.remoteDevelopment]),
    ),
    historyByKey: new Map(hydrated.map((entry) => [entry.issue.key, entry.history])),
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

async function fetchJiraSearchWithVerifiedEmptyResult<
  SearchPage extends JiraSearchPage = JiraSearchResponse,
>(
  baseUrl: string,
  searchBody: string,
  authHeaders: Record<string, string>,
  expectedIdentities: string[],
  schema: z.ZodType<SearchPage> = jiraSearchResponseSchema as unknown as z.ZodType<SearchPage>,
  deadlineAt?: number,
  retryBudget?: JiraSearchRetryBudget,
): Promise<JiraSearchResult<SearchPage>> {
  const result = await fetchJiraSearch(
    baseUrl,
    searchBody,
    authHeaders,
    schema,
    deadlineAt,
    retryBudget,
  );
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
  const configuredMaxResults = Math.min(
    500,
    Math.max(1, Number(nonEmpty(env.JIRA_MAX_RESULTS) ?? 100) || 100),
  );
  const maxResults = options.pageSize === undefined
    ? configuredMaxResults
    : Math.min(500, Math.max(1, Math.floor(options.pageSize)));

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
  return fetchJiraDataWithMeta(jql, options, false) as Promise<JiraIssueFetchResult>;
}

export async function fetchJiraIssueKeys(
  jql: string,
  options: JiraConfigOptions = {},
) {
  return (await fetchJiraIssueKeysWithMeta(jql, options)).issueKeys;
}

export async function fetchJiraIssueKeysWithMeta(
  jql: string,
  options: JiraConfigOptions = {},
): Promise<JiraIssueKeyFetchResult> {
  const result = await fetchJiraDataWithMeta(
    jql,
    options,
    true,
  ) as JiraIssueKeyFetchResult;
  const issueKeys = [...new Set(result.issueKeys.map((issueKey) => {
    const normalized = normalizedJiraIssueKey(issueKey);
    if (!normalized) throw new Error(`Jira вернула некорректный ключ тикета: ${issueKey}`);
    return normalized;
  }))];
  return { ...result, issueKeys };
}

async function fetchJiraDataWithMeta(
  jql: string,
  options: JiraConfigOptions,
  keysOnly: boolean,
): Promise<JiraIssueFetchResult | JiraIssueKeyFetchResult> {
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
  let parsed: JiraSearchPage | null = null;
  let successfulAuthHeaders: Record<string, string> | null = null;
  let successfulJql = jql;
  let successfulAnalyticsFieldIds: string[] | null = null;
  let jiraUser: string | null = null;
  const expectedIdentities = expectedJiraIdentities(email);
  const searchRetryBudget = { remaining: JIRA_SEARCH_MAX_ATTEMPTS - 1 };
  const searchSchema = keysOnly
    ? jiraIssueKeySearchResponseSchema
    : jiraSearchResponseSchema;
  const includeChangelog = options.includeChangelog !== false;
  const includeRemoteDevelopment =
    options.includeRemoteDevelopment ?? Boolean(options.includeAnalyticsFields);
  const buildSearchBody = (effectiveJql: string, startAt: number) =>
    jiraSearchBody(effectiveJql, maxResults, startAt, {
      analyticsFieldIds: !keysOnly && options.includeAnalyticsFields
        ? jiraAnalyticsFieldIds()
        : null,
      includeChangelog,
      keysOnly,
      capacitySample: !keysOnly && options.capacitySample === true,
      fullHistory: !keysOnly && options.includeHistoryDocument === true,
    });
  const analyticsScope = options.analyticsScope ?? (
    options.labelScope ? { type: 'LABEL' as const, value: options.labelScope } : null
  );
  const applyAnalyticsScope = (effectiveJql: string) =>
    analyticsScope
      ? jiraJqlWithAnalyticsScope(effectiveJql, analyticsScope)
      : effectiveJql;

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

    effectiveJql = applyAnalyticsScope(effectiveJql);
    const analyticsFieldIds = !keysOnly && options.includeAnalyticsFields
      ? jiraAnalyticsFieldIds()
      : null;
    const result = await fetchJiraSearchWithVerifiedEmptyResult(
      baseUrl,
      buildSearchBody(effectiveJql, 0),
      authAttempt.headers,
      expectedIdentities,
      searchSchema,
      options.deadlineAt,
      searchRetryBudget,
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
      effectiveJql = applyAnalyticsScope(effectiveJql);
      const analyticsFieldIds = !keysOnly && options.includeAnalyticsFields
        ? jiraAnalyticsFieldIds()
        : null;
      const result = await fetchJiraSearchWithVerifiedEmptyResult(
        baseUrl,
        buildSearchBody(effectiveJql, 0),
        authHeaders,
        expectedIdentities,
        searchSchema,
        options.deadlineAt,
        searchRetryBudget,
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
      effectiveJql = applyAnalyticsScope(effectiveJql);
      const analyticsFieldIds = !keysOnly && options.includeAnalyticsFields
        ? jiraAnalyticsFieldIds()
        : null;
      const result = await fetchJiraSearchWithVerifiedEmptyResult(
        baseUrl,
        buildSearchBody(effectiveJql, 0),
        authHeaders,
        expectedIdentities,
        searchSchema,
        options.deadlineAt,
        searchRetryBudget,
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

  if (keysOnly) {
    const keySearch = parsed as JiraIssueKeySearchResponse;
    const issueKeys = options.fetchAllPages && successfulAuthHeaders
      ? await fetchCompleteJiraIssueKeySearch(
          baseUrl,
          successfulJql,
          maxResults,
          keySearch,
          successfulAuthHeaders,
          options.deadlineAt,
          searchRetryBudget,
        )
      : keySearch.issues.map((issue) => issue.key);
    return { issueKeys, jiraUser };
  }

  const fullSearch = parsed as JiraSearchResponse;
  const completeSearch = options.fetchAllPages && successfulAuthHeaders
    ? await fetchCompleteJiraSearch(
        baseUrl,
        successfulJql,
        maxResults,
        fullSearch,
        successfulAuthHeaders,
        successfulAnalyticsFieldIds,
        includeChangelog,
        Boolean(options.capacitySample),
        Boolean(options.includeHistoryDocument),
        options.deadlineAt,
        searchRetryBudget,
      )
    : fullSearch;
  const hydratedData = successfulAuthHeaders
    ? await hydrateJiraSearchIssues(
        baseUrl,
        completeSearch,
        successfulAuthHeaders,
        includeChangelog,
        includeRemoteDevelopment,
        Boolean(options.includeHistoryDocument),
        options.remoteDevelopmentCache,
        options.deadlineAt,
      )
    : {
        search: completeSearch,
        remoteDevelopmentByKey: new Map(),
        historyByKey: new Map(),
      };
  const hydrated = hydratedData.search;
  const names = hydrated.names ?? {};
  const capacityMeasurements = options.capacitySample
    ? hydrated.issues.map((issue) =>
        measureJiraIssueCapacity(
          issue,
          hydratedData.remoteDevelopmentByKey.get(issue.key) ?? null,
        ))
    : undefined;
  return {
    issues: hydrated.issues.map((issue) => {
      const fields = issue.fields as Record<string, unknown> & typeof issue.fields;
      const status = issue.fields.status as (typeof issue.fields.status & {
        statusCategory?: { name?: unknown; key?: unknown };
      });
      const history = hydratedData.historyByKey.get(issue.key);
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
        criticalEndPriority: parseJiraDate(issue.fields.resolutiondate)
          ? jiraPriorityAtResolution(issue)
          : issue.fields.priority?.name?.trim() || null,
        updatedAt: new Date(issue.fields.updated),
        transitions: jiraStatusTransitions(issue),
        transitionHistoryComplete: jiraTransitionHistoryComplete(issue),
        development: selectJiraDevelopment(
          jiraDevelopmentFromFields(fields, names),
          hydratedData.remoteDevelopmentByKey.get(issue.key) ?? null,
          includeRemoteDevelopment,
        ),
        ...(history
          ? {
              statusCategory: jiraObjectString(status?.statusCategory, 'name')
                ?? jiraObjectString(status?.statusCategory, 'key'),
              parentKey: jiraObjectString(fields.parent, 'key'),
              epicKey: jiraEpicKey(fields, names),
              labels: jiraStringArray(fields.labels),
              sprintIds: jiraSprintIdsFromFields(fields),
              history: {
              document: history.payload,
              changelogComplete: history.changelogComplete,
              commentsComplete: history.commentsComplete,
              worklogsComplete: history.worklogsComplete,
              remoteLinksComplete: history.remoteLinksComplete,
              attachmentReferencesStripped: history.attachmentReferencesStripped,
              },
            }
          : {}),
      };
    }),
    jiraUser,
    total: completeSearch.total ?? completeSearch.issues.length,
    capacityMeasurements,
  };
}
