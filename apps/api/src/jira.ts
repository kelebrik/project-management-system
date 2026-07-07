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

type JiraConfig = {
  enabled: boolean;
  baseUrl: string;
  email: string;
  token: string;
  maxResults: number;
};

export function isJiraConfigured() {
  const config = resolveJiraConfig();
  return Boolean(config.enabled && config.baseUrl && config.email && config.token);
}

function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizedBaseUrl(value: string | undefined) {
  return (nonEmpty(value) ?? '').replace(/\/+$/, '');
}

export function resolveJiraConfig(env: NodeJS.ProcessEnv = process.env): JiraConfig {
  const envBaseUrl = nonEmpty(env.JIRA_BASE_URL);
  const envEmail = nonEmpty(env.JIRA_EMAIL);
  const envToken = nonEmpty(env.JIRA_API_TOKEN);
  const maxResults = Math.min(
    500,
    Math.max(1, Number(nonEmpty(env.JIRA_MAX_RESULTS) ?? 100) || 100),
  );

  return {
    enabled: true,
    baseUrl: normalizedBaseUrl(envBaseUrl),
    email: envEmail ?? '',
    token: envToken ?? '',
    maxResults,
  };
}

export async function fetchJiraIssues(jql: string): Promise<JiraIssue[]> {
  const { enabled, baseUrl, email, token, maxResults } = resolveJiraConfig();

  if (!enabled || !baseUrl || !email || !token) {
    throw new Error('Jira is not configured');
  }

  const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
  const searchBody = JSON.stringify({
    jql,
    fields: ['summary', 'status', 'priority', 'assignee', 'issuetype', 'updated'],
    maxResults,
  });
  let response: Response | null = null;
  let lastErrorBody = '';

  for (const path of ['/rest/api/3/search/jql', '/rest/api/2/search']) {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: searchBody,
    });

    if (response.ok) {
      break;
    }

    lastErrorBody = await response.text();
    if (![404, 405, 410].includes(response.status) || path === '/rest/api/2/search') {
      throw new Error(`Jira request failed: ${response.status} ${lastErrorBody}`);
    }
  }

  if (!response?.ok) {
    throw new Error(`Jira request failed${lastErrorBody ? `: ${lastErrorBody}` : ''}`);
  }

  const parsed = jiraSearchResponseSchema.parse(await response.json());

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
