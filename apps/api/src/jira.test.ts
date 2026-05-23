import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchJiraIssues } from './jira.js';

test('fetchJiraIssues maps Jira search response into internal issue snapshot', async () => {
  const previousEnv = {
    JIRA_BASE_URL: process.env.JIRA_BASE_URL,
    JIRA_EMAIL: process.env.JIRA_EMAIL,
    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
  };
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });

    return new Response(
      JSON.stringify({
        issues: [
          {
            key: 'PMS-42',
            fields: {
              summary: 'Blocked firmware smoke test',
              status: { name: 'In Progress' },
              priority: { name: 'High' },
              assignee: { displayName: 'Ivan Petrov' },
              issuetype: { name: 'Bug' },
              updated: '2026-05-23T10:00:00.000+0300',
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }) as typeof fetch;

  try {
    const issues = await fetchJiraIssues('project = PMS');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://jira.example/rest/api/3/search/jql');
    assert.equal(calls[0].init?.method, 'POST');
    assert.equal(
      (calls[0].init?.headers as Record<string, string>).Authorization,
      `Basic ${Buffer.from('bot@example.com:secret').toString('base64')}`,
    );
    assert.deepEqual(issues, [
      {
        key: 'PMS-42',
        url: 'https://jira.example/browse/PMS-42',
        summary: 'Blocked firmware smoke test',
        status: 'In Progress',
        priority: 'High',
        assignee: 'Ivan Petrov',
        issueType: 'Bug',
        sprint: null,
        updatedAt: new Date('2026-05-23T10:00:00.000+0300'),
      },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    process.env.JIRA_BASE_URL = previousEnv.JIRA_BASE_URL;
    process.env.JIRA_EMAIL = previousEnv.JIRA_EMAIL;
    process.env.JIRA_API_TOKEN = previousEnv.JIRA_API_TOKEN;
  }
});
