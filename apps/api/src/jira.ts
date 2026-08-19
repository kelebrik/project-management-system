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
  sprint: string | null;
  createdAt: Date | null;
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

const jiraChangelogSchema = z
  .object({
    startAt: z.number().int().nonnegative().optional(),
    maxResults: z.number().int().nonnegative().optional(),
    total: z.number().int().nonnegative().optional(),
    histories: z
      .array(
        z.object({
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
        }),
      )
      .default([]),
  })
  .optional();

const jiraSearchResponseSchema = z.object({
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
          created: z.string().optional(),
          updated: z.string(),
        })
        .passthrough(),
      changelog: jiraChangelogSchema,
    }),
  ),
});
type JiraSearchResponse = z.infer<typeof jiraSearchResponseSchema>;

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

function savedFilterIdFromJql(jql: string) {
  return jql.trim().match(/^filter\s*=\s*"?(\d+)"?$/i)?.[1] ?? null;
}

function jiraSearchBody(jql: string, maxResults: number) {
  return JSON.stringify({
    jql,
    fields: [
      '*navigable',
      'summary',
      'status',
      'priority',
      'assignee',
      'reporter',
      'issuetype',
      'resolution',
      'created',
      'updated',
    ],
    expand: ['names', 'schema', 'changelog'],
    maxResults,
  });
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
  names: Record<string, string> = {},
  schemas: Record<string, { custom?: string }> = {},
) {
  const sprintFieldKeys = new Set(
    [...new Set([...Object.keys(names), ...Object.keys(schemas)])]
      .filter((key) => {
        const name = names[key]?.trim().toLowerCase();
        const schemaKey = schemas[key]?.custom?.trim().toLowerCase();
        return name === 'sprint' || schemaKey === 'com.pyxis.greenhopper.jira:gh-sprint';
      }),
  );
  if ('sprint' in fields) sprintFieldKeys.add('sprint');
  const candidates = [...sprintFieldKeys].flatMap((key) => sprintCandidates(fields[key]));
  const selected =
    candidates.find((candidate) => candidate.state.toUpperCase() === 'ACTIVE') ??
    candidates.find((candidate) => candidate.state.toUpperCase() === 'FUTURE') ??
    candidates.at(-1);
  return selected?.name || null;
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
  if (!issue.changelog) return false;
  const startAt = issue.changelog.startAt ?? 0;
  const total = issue.changelog.total;
  return startAt === 0 && (total === undefined || issue.changelog.histories.length >= total);
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
    const response = await fetch(`${baseUrl}${path}`, {
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
    const response = await fetch(`${baseUrl}${path}`, {
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
    const response = await fetch(`${baseUrl}${path}`, {
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
  const response = await fetch(`${baseUrl}/rest/auth/1/session`, {
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
  const response = await fetch(`${baseUrl}/login.jsp`, {
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

    const result = await fetchJiraSearchWithVerifiedEmptyResult(
      baseUrl,
      jiraSearchBody(effectiveJql, maxResults),
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
    if (parsed) break;
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

      const result = await fetchJiraSearchWithVerifiedEmptyResult(
        baseUrl,
        jiraSearchBody(effectiveJql, maxResults),
        { Cookie: session.cookie },
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
      if (parsed) break;
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

      const result = await fetchJiraSearchWithVerifiedEmptyResult(
        baseUrl,
        jiraSearchBody(effectiveJql, maxResults),
        { Cookie: login.cookie },
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
      if (parsed) break;
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

  const names = parsed.names ?? {};
  const schemas = parsed.schema ?? {};
  return {
    issues: parsed.issues.map((issue) => {
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
        sprint: jiraSprintFromFields(fields, names, schemas),
        createdAt: parseJiraDate(issue.fields.created),
        updatedAt: new Date(issue.fields.updated),
        transitions: jiraStatusTransitions(issue),
        transitionHistoryComplete: jiraTransitionHistoryComplete(issue),
        development: jiraDevelopmentFromFields(fields, names),
      };
    }),
    jiraUser,
  };
}
