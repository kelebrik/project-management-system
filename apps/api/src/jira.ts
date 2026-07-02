import { z } from 'zod';
import { prisma } from './db.js';

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

const jiraSettingKeys = [
  'jira.enabled',
  'jira.baseUrl',
  'jira.email',
  'jira.apiToken',
  'jira.maxResults',
] as const;

export function isJiraConfigured() {
  return Boolean(
    process.env.JIRA_BASE_URL &&
      process.env.JIRA_EMAIL &&
      process.env.JIRA_API_TOKEN,
  );
}

async function getJiraConfig(): Promise<JiraConfig> {
  const settings = await prisma.systemSetting
    .findMany({
      where: { key: { in: [...jiraSettingKeys] } },
    })
    .catch(() => []);
  const byKey = new Map(settings.map((setting) => [setting.key, setting.value]));
  const configuredInDb =
    byKey.has('jira.baseUrl') || byKey.has('jira.email') || byKey.has('jira.apiToken');
  const enabled = configuredInDb
    ? byKey.get('jira.enabled') === 'true'
    : true;
  const baseUrl = (byKey.get('jira.baseUrl') || process.env.JIRA_BASE_URL || '').replace(
    /\/$/,
    '',
  );
  const email = byKey.get('jira.email') || process.env.JIRA_EMAIL || '';
  const token = byKey.get('jira.apiToken') || process.env.JIRA_API_TOKEN || '';
  const maxResults = Math.min(
    500,
    Math.max(1, Number(byKey.get('jira.maxResults') || 100) || 100),
  );

  return { enabled, baseUrl, email, token, maxResults };
}

export async function fetchJiraIssues(jql: string): Promise<JiraIssue[]> {
  const { enabled, baseUrl, email, token, maxResults } = await getJiraConfig();

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
