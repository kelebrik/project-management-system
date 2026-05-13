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

export function isJiraConfigured() {
  return Boolean(process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN);
}

export async function fetchJiraIssues(jql: string): Promise<JiraIssue[]> {
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '');
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !token) {
    throw new Error('Jira is not configured');
  }

  const response = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jql,
      fields: ['summary', 'status', 'priority', 'assignee', 'issuetype', 'updated'],
      maxResults: 100,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jira request failed: ${response.status} ${body}`);
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
