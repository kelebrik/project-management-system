import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchJiraIssues, resolveJiraConfig } from './jira.js';

test('resolveJiraConfig uses env service account', () => {
  const config = resolveJiraConfig({
    JIRA_BASE_URL: 'https://tasks.sberdevices.ru/',
    JIRA_EMAIL: 'service-account@example.com',
    JIRA_API_TOKEN: 'service-token',
  });

  assert.deepEqual(config, {
    enabled: true,
    baseUrl: 'https://tasks.sberdevices.ru',
    email: 'service-account@example.com',
    token: 'service-token',
    maxResults: 100,
  });
});

test('resolveJiraConfig accepts host-only Jira base URL from container env', () => {
  const config = resolveJiraConfig({
    JIRA_BASE_URL: 'tasks.sberdevices.ru',
    JIRA_EMAIL: 'tuz_starosfw_tvmngmt@sberdevices.ru',
    JIRA_API_TOKEN: 'service-token',
  });

  assert.deepEqual(config, {
    enabled: true,
    baseUrl: 'https://tasks.sberdevices.ru',
    email: 'tuz_starosfw_tvmngmt@sberdevices.ru',
    token: 'service-token',
    maxResults: 100,
  });
});

test('resolveJiraConfig reads Jira max results from env', () => {
  const config = resolveJiraConfig({
    JIRA_BASE_URL: 'https://tasks.sberdevices.ru',
    JIRA_EMAIL: 'env-bot@example.com',
    JIRA_API_TOKEN: 'env-token',
    JIRA_MAX_RESULTS: '750',
  });

  assert.deepEqual(config, {
    enabled: true,
    baseUrl: 'https://tasks.sberdevices.ru',
    email: 'env-bot@example.com',
    token: 'env-token',
    maxResults: 500,
  });
});

test('resolveJiraConfig reports incomplete config when Jira env credentials are missing', () => {
  const config = resolveJiraConfig({
    JIRA_BASE_URL: '',
    JIRA_EMAIL: '',
    JIRA_API_TOKEN: '',
  });

  assert.deepEqual(config, {
    enabled: true,
    baseUrl: '',
    email: '',
    token: '',
    maxResults: 100,
  });
});

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

test('fetchJiraIssues falls back to Jira Server search endpoint', async () => {
  const previousEnv = {
    JIRA_BASE_URL: process.env.JIRA_BASE_URL,
    JIRA_EMAIL: process.env.JIRA_EMAIL,
    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
  };
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  process.env.JIRA_BASE_URL = 'tasks.sberdevices.ru';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });

    if (String(input).endsWith('/rest/api/3/search/jql')) {
      return new Response('Not Found', { status: 404 });
    }

    return new Response(
      JSON.stringify({
        issues: [
          {
            key: 'TV-7500',
            fields: {
              summary: 'Filter result',
              status: { name: 'Open' },
              priority: { name: 'Medium' },
              assignee: null,
              issuetype: { name: 'Task' },
              updated: '2026-07-02T10:00:00.000+0300',
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
    const issues = await fetchJiraIssues('filter = 39227');

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://tasks.sberdevices.ru/rest/api/3/search/jql');
    assert.equal(calls[1].url, 'https://tasks.sberdevices.ru/rest/api/2/search');
    assert.equal(
      JSON.parse(String(calls[1].init?.body)).jql,
      'filter = 39227',
    );
    assert.equal(issues[0].key, 'TV-7500');
    assert.equal(issues[0].url, 'https://tasks.sberdevices.ru/browse/TV-7500');
  } finally {
    globalThis.fetch = previousFetch;
    process.env.JIRA_BASE_URL = previousEnv.JIRA_BASE_URL;
    process.env.JIRA_EMAIL = previousEnv.JIRA_EMAIL;
    process.env.JIRA_API_TOKEN = previousEnv.JIRA_API_TOKEN;
  }
});
