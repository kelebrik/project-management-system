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

type JiraConfig = {
  enabled: boolean;
  baseUrl: string;
  email: string;
  username: string;
  token: string;
  maxResults: number;
};

export function isJiraConfigured() {
  const config = resolveJiraConfig();
  return Boolean(config.enabled && config.baseUrl && config.token);
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

function jiraAuthHeaders(email: string, username: string, token: string) {
  const headers = [`Bearer ${token}`];
  const basicLogins = [username, email, jiraLoginFromEmail(email)].filter(Boolean);
  const seenLogins = new Set<string>();

  for (const login of basicLogins) {
    if (seenLogins.has(login)) continue;
    seenLogins.add(login);
    headers.push(`Basic ${Buffer.from(`${login}:${token}`).toString('base64')}`);
  }

  return headers;
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

export function resolveJiraConfig(env: NodeJS.ProcessEnv = process.env): JiraConfig {
  const envBaseUrl = nonEmpty(env.JIRA_BASE_URL);
  const envEmail = nonEmpty(env.JIRA_EMAIL);
  const envUsername = nonEmpty(env.JIRA_USERNAME);
  const envToken = nonEmpty(env.JIRA_API_TOKEN);
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
    maxResults,
  };
}

export async function fetchJiraIssues(jql: string): Promise<JiraIssue[]> {
  const { enabled, baseUrl, email, username, token, maxResults } = resolveJiraConfig();

  if (!enabled || !baseUrl || !token) {
    throw new Error('Jira is not configured');
  }

  const searchBody = JSON.stringify({
    jql,
    fields: ['summary', 'status', 'priority', 'assignee', 'issuetype', 'updated'],
    maxResults,
  });
  let lastErrorBody = '';
  let lastStatus = 0;
  const authHeaders = jiraAuthHeaders(email, username, token);
  let parsed: JiraSearchResponse | null = null;

  for (const authHeader of authHeaders) {
    for (const path of ['/rest/api/3/search/jql', '/rest/api/2/search']) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: searchBody,
      });

      if (response.ok) {
        if (!isJsonResponse(response)) {
          lastStatus = response.status;
          lastErrorBody = await response.text();
          break;
        }

        try {
          parsed = jiraSearchResponseSchema.parse(await response.json());
        } catch (error) {
          lastStatus = response.status;
          lastErrorBody =
            error instanceof Error ? error.message : 'Jira response is not valid JSON';
        }
        break;
      }

      lastStatus = response.status;
      lastErrorBody =
        response.status >= 300 && response.status < 400
          ? `Redirected to ${response.headers.get('location') ?? 'unknown location'}`
          : await response.text();
      if ([401, 403].includes(response.status) || (response.status >= 300 && response.status < 400)) {
        break;
      }
      if (![404, 405, 410].includes(response.status) || path === '/rest/api/2/search') {
        throw new Error(
          `Jira request failed: ${response.status} ${cleanJiraErrorBody(lastErrorBody)}`,
        );
      }
    }

    if (parsed) {
      break;
    }
  }

  if (!parsed) {
    throw new Error(
      `Jira authentication failed: ${lastStatus || 'unknown'} ${
        lastErrorBody ? cleanJiraErrorBody(lastErrorBody) : ''
      }`.trim(),
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
