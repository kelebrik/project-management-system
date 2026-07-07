import { z } from 'zod';

export type JiraIssue = {
  key: string;
  url: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string | null;
  issueType: string;
  sprint: string | null;
  updatedAt: Date;
};

const jiraSearchResponseSchema = z.object({
  issues: z.array(
    z.object({
      key: z.string(),
      fields: z.object({
        summary: z.string().nullable(),
        status: z.object({ name: z.string() }).nullable(),
        priority: z.object({ name: z.string() }).nullable(),
        assignee: z.object({ displayName: z.string() }).nullable(),
        issuetype: z.object({ name: z.string() }).nullable(),
        updated: z.string(),
      }),
    }),
  ),
});
type JiraSearchResponse = z.infer<typeof jiraSearchResponseSchema>;

const jiraSessionResponseSchema = z.object({
  session: z.object({
    name: z.string(),
    value: z.string(),
  }),
});

type JiraConfig = {
  enabled: boolean;
  baseUrl: string;
  email: string;
  username: string;
  token: string;
  password: string;
  maxResults: number;
};

export function isJiraConfigured() {
  const config = resolveJiraConfig();
  return Boolean(config.enabled && config.baseUrl && (config.token || config.password));
}

function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizedBaseUrl(value: string | undefined) {
  const trimmed = nonEmpty(value);
  if (!trimmed) return '';

  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
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

function jiraLoginCandidates(email: string, username: string) {
  const candidates = [
    username ? { label: 'username', login: username } : null,
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

function jiraAuthAttempts(email: string, username: string, token: string, password: string) {
  const attempts: Array<{ label: string; headers: Record<string, string> }> = [];
  if (token) {
    attempts.push({ label: 'bearer-token', headers: { Authorization: `Bearer ${token}` } });
  }

  if (password) {
    for (const candidate of jiraLoginCandidates(email, username)) {
      attempts.push({
        label: `basic:${candidate.label}`,
        headers: {
          Authorization: `Basic ${Buffer.from(`${candidate.login}:${password}`).toString('base64')}`,
        },
      });
    }
  }

  return attempts;
}

function cleanJiraErrorBody(body: string) {
  const authFailure = body.match(/Basic Authentication Failure[^<]*/i)?.[0];
  if (authFailure) {
    return authFailure.replace(/\s+/g, ' ').trim();
  }

  return body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function isJsonResponse(response: Response) {
  return response.headers.get('content-type')?.toLowerCase().includes('application/json') ?? false;
}

async function fetchJiraSearch(
  baseUrl: string,
  searchBody: string,
  authHeaders: Record<string, string>,
) {
  let lastErrorBody = '';
  let lastStatus = 0;

  for (const path of ['/rest/api/3/search/jql', '/rest/api/2/search']) {
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
    if (
      [401, 403].includes(response.status) ||
      (response.status >= 300 && response.status < 400)
    ) {
      return { parsed: null, status: lastStatus, body: lastErrorBody };
    }
    if (![404, 405, 410].includes(response.status) || path === '/rest/api/2/search') {
      throw new Error(
        `Jira request failed: ${response.status} ${cleanJiraErrorBody(lastErrorBody)}`,
      );
    }
  }

  return { parsed: null, status: lastStatus, body: lastErrorBody };
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

export function resolveJiraConfig(env: NodeJS.ProcessEnv = process.env): JiraConfig {
  const envBaseUrl = nonEmpty(env.JIRA_BASE_URL);
  const envEmail = nonEmpty(env.JIRA_EMAIL);
  const envUsername = nonEmpty(env.JIRA_USERNAME);
  const envToken = nonEmpty(env.JIRA_API_TOKEN);
  const envPassword = nonEmpty(env.JIRA_PASSWORD);
  const maxResults = Math.min(
    500,
    Math.max(1, Number(nonEmpty(env.JIRA_MAX_RESULTS) ?? 100) || 100),
  );

  return {
    enabled: true,
    baseUrl: normalizedBaseUrl(envBaseUrl),
    email: envEmail ?? '',
    username: envUsername ?? '',
    token: envToken ?? '',
    password: envPassword ?? envToken ?? '',
    maxResults,
  };
}

export async function fetchJiraIssues(jql: string): Promise<JiraIssue[]> {
  const { enabled, baseUrl, email, username, token, password, maxResults } = resolveJiraConfig();

  if (!enabled || !baseUrl || (!token && !password)) {
    throw new Error('Jira is not configured');
  }

  const searchBody = JSON.stringify({
    jql,
    fields: ['summary', 'status', 'priority', 'assignee', 'issuetype', 'updated'],
    maxResults,
  });
  let lastErrorBody = '';
  let lastStatus = 0;
  const authAttempts = jiraAuthAttempts(email, username, token, password);
  const attemptedMethods: string[] = [];
  let parsed: JiraSearchResponse | null = null;

  for (const authAttempt of authAttempts) {
    attemptedMethods.push(authAttempt.label);
    const result = await fetchJiraSearch(baseUrl, searchBody, authAttempt.headers);
    parsed = result.parsed;
    lastStatus = result.status;
    lastErrorBody = result.body;
    if (parsed) break;
  }

  if (!parsed && password) {
    for (const candidate of jiraLoginCandidates(email, username)) {
      attemptedMethods.push(`session:${candidate.label}`);
      const session = await fetchJiraSessionCookie(baseUrl, candidate.login, password);
      lastStatus = session.status;
      lastErrorBody = session.body;
      if (!session.cookie) continue;

      const result = await fetchJiraSearch(baseUrl, searchBody, { Cookie: session.cookie });
      parsed = result.parsed;
      lastStatus = result.status;
      lastErrorBody = result.body;
      if (parsed) break;
    }
  }

  if (!parsed) {
    throw new Error(
      `Jira authentication failed: ${lastStatus || 'unknown'} ${
        lastErrorBody ? cleanJiraErrorBody(lastErrorBody) : ''
      }; auth methods tried: ${attemptedMethods.join(', ')}`.trim(),
    );
  }

  return parsed.issues.map((issue) => ({
    key: issue.key,
    url: `${baseUrl}/browse/${issue.key}`,
    summary: issue.fields.summary ?? issue.key,
    status: issue.fields.status?.name ?? 'Unknown',
    priority: issue.fields.priority?.name ?? 'None',
    assignee: issue.fields.assignee?.displayName ?? null,
    issueType: issue.fields.issuetype?.name ?? 'Issue',
    sprint: null,
    updatedAt: new Date(issue.fields.updated),
  }));
}
