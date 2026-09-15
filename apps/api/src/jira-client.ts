import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";

import {
  jiraCurrentUserResponseSchema,
  jiraFilterResponseSchema,
  jiraSearchResponseSchema,
  jiraSessionResponseSchema,
  type JiraConfig,
  type JiraCurrentUserResult,
  type JiraSearchResponse,
  type JiraSearchPage,
  type JiraSearchResult,
  type JiraSearchRetryBudget,
} from "./jira-model.js";
import { fetchJiraSearch } from "./jira-search.js";
import { logEvent } from "./server/logger.js";

export function isJiraConfigured() {
  const config = resolveJiraConfig();
  return Boolean(config.enabled && config.baseUrl && config.token);
}

export function resolveJiraConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: import("./jira-model.js").JiraConfigOptions = {},
): JiraConfig {
  // The public cloud demo must remain fully synthetic and must never contact Jira.
  if (env.PUBLIC_DEMO_MODE === "true") {
    return { enabled: false, baseUrl: "", email: "", token: "", maxResults: 100 };
  }
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
    email: envEmail ?? "",
    token: envToken ?? "",
    maxResults,
  };
}

export function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function normalizedBaseUrl(
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

export function jiraLoginFromEmail(email: string) {
  const atIndex = email.indexOf('@');
  return atIndex > 0 ? email.slice(0, atIndex) : '';
}

export function normalizeJiraIdentity(value: string) {
  return value.trim().toLowerCase();
}

export function expectedJiraIdentities(email: string) {
  return [email, jiraLoginFromEmail(email)]
    .map((identity) => normalizeJiraIdentity(identity))
    .filter(Boolean);
}

export function jiraLoginCandidates(email: string) {
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

export function jiraBearerToken(token: string) {
  return token.replace(/^bearer\s+/i, '').trim();
}

export function jiraAuthAttempts(email: string, token: string) {
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

export function compactJiraErrorText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function decodeJiraErrorEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

export function looksLikeHtmlResponse(value: string) {
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

export function cleanJiraErrorBody(body: string) {
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

export function isAnonymousFieldVisibilityError(body: string) {
  return /cannot be viewed by anonymous users/i.test(body);
}

export function isJiraAuthVerificationFailure(body: string) {
  return /Jira authentication verification failed/i.test(body);
}

export function isJiraLoginPage(body: string) {
  return /name=["']os_username["']|id=["']login-form["']|login failed/i.test(body);
}

export function isJsonResponse(response: Response) {
  return response.headers.get('content-type')?.toLowerCase().includes('application/json') ?? false;
}

export function cookieHeaderFromResponse(response: Response) {
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

export function jiraSearchPaths() {
  return ['/rest/api/2/search', '/rest/api/3/search/jql'];
}

export function jiraFilterPaths(filterId: string) {
  return [`/rest/api/2/filter/${filterId}`, `/rest/api/3/filter/${filterId}`];
}

export function jiraMyselfPaths() {
  return ['/rest/api/2/myself', '/rest/api/3/myself'];
}

export const jiraReadOnlyGetPaths = [
  /(?:^|\/)rest\/api\/[23]\/filter\/\d+$/,
  /(?:^|\/)rest\/api\/[23]\/myself$/,
  /(?:^|\/)rest\/api\/[23]\/issue\/[^/]+(?:\/(?:changelog|comment|worklog|remotelink))?$/,
];

export const jiraReadOnlyPostPaths = new Set([
  'rest/api/2/search',
  'rest/api/3/search/jql',
  'rest/auth/1/session',
  'login.jsp',
]);

export class JiraReadOnlyRequestError extends Error {
  override name = 'JiraReadOnlyRequestError';
}

export class JiraSearchFailureError extends Error {
  override name = 'JiraSearchFailureError';

  constructor(
    readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}

export type JiraReadOnlyRequestMetric = {
  method: string;
  path: string;
  status: number;
  durationMs: number;
};

export const jiraReadOnlyRequestMetrics = new AsyncLocalStorage<JiraReadOnlyRequestMetric[]>();

export type JiraReadOnlyRequestSummary = {
  count: number;
  durationMsTotal: number;
  durationMsMax: number;
  byRoute: Record<string, number>;
  byStatusClass: Record<string, number>;
};

export const jiraReadOnlyRequestSummary = new AsyncLocalStorage<JiraReadOnlyRequestSummary>();
export const jiraReadOnlyRequestFailureSummaries = new WeakMap<object, JiraReadOnlyRequestSummary>();

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

export function jiraStatusClass(status: number) {
  if (status === 0) return 'transport';
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 300 && status < 400) return '3xx';
  if (status >= 400 && status < 500) return '4xx';
  return '5xx';
}

export function recordJiraReadOnlyRequest(metric: JiraReadOnlyRequestMetric) {
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

export async function fetchJiraFilterJql(
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

export function jiraUserIdentities(user: z.infer<typeof jiraCurrentUserResponseSchema>) {
  return [user.emailAddress, user.name, user.key, user.accountId, user.displayName]
    .map((identity) => identity?.trim() ?? '')
    .filter(Boolean);
}

export async function fetchJiraCurrentUser(
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

export async function fetchJiraSessionCookie(baseUrl: string, username: string, password: string) {
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

export async function fetchJiraWebLoginCookie(baseUrl: string, username: string, password: string) {
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
