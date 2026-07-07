import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchJiraIssues, resolveJiraConfig } from './jira.js';

const jiraEnvKeys = [
  'JIRA_BASE_URL',
  'JIRA_EMAIL',
  'JIRA_USERNAME',
  'JIRA_API_TOKEN',
  'JIRA_PASSWORD',
] as const;

function snapshotJiraEnv() {
  return Object.fromEntries(jiraEnvKeys.map((key) => [key, process.env[key]])) as Record<
    (typeof jiraEnvKeys)[number],
    string | undefined
  >;
}

function restoreJiraEnv(snapshot: ReturnType<typeof snapshotJiraEnv>) {
  for (const key of jiraEnvKeys) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

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
    username: '',
    token: 'service-token',
    password: 'service-token',
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
    username: '',
    token: 'service-token',
    password: 'service-token',
    maxResults: 100,
  });
});

test('resolveJiraConfig accepts explicit Jira username for server auth', () => {
  const config = resolveJiraConfig({
    JIRA_BASE_URL: 'tasks.sberdevices.ru',
    JIRA_EMAIL: 'tuz_starosfw_tvmngmt@sberdevices.ru',
    JIRA_USERNAME: 'tuz_starosfw_tvmngmt',
    JIRA_API_TOKEN: 'service-password',
  });

  assert.deepEqual(config, {
    enabled: true,
    baseUrl: 'https://tasks.sberdevices.ru',
    email: 'tuz_starosfw_tvmngmt@sberdevices.ru',
    username: 'tuz_starosfw_tvmngmt',
    token: 'service-password',
    password: 'service-password',
    maxResults: 100,
  });
});

test('resolveJiraConfig accepts separate Jira password for server auth', () => {
  const config = resolveJiraConfig({
    JIRA_BASE_URL: 'tasks.sberdevices.ru',
    JIRA_EMAIL: 'tuz_starosfw_tvmngmt@sberdevices.ru',
    JIRA_USERNAME: 'tuz_starosfw_tvmngmt',
    JIRA_API_TOKEN: 'pat-token',
    JIRA_PASSWORD: 'service-password',
  });

  assert.deepEqual(config, {
    enabled: true,
    baseUrl: 'https://tasks.sberdevices.ru',
    email: 'tuz_starosfw_tvmngmt@sberdevices.ru',
    username: 'tuz_starosfw_tvmngmt',
    token: 'pat-token',
    password: 'service-password',
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
    username: '',
    token: 'env-token',
    password: 'env-token',
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
    username: '',
    token: '',
    password: '',
    maxResults: 100,
  });
});

test('fetchJiraIssues maps Jira search response into internal issue snapshot', async () => {
  const previousEnv = snapshotJiraEnv();
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
      'Bearer secret',
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
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues falls back to Jira Server search endpoint', async () => {
  const previousEnv = snapshotJiraEnv();
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
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues falls back to basic auth when bearer token is rejected', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });

    if ((init?.headers as Record<string, string>).Authorization === 'Bearer secret') {
      return new Response('Unauthorized', { status: 401 });
    }

    return new Response(
      JSON.stringify({
        issues: [
          {
            key: 'PMS-43',
            fields: {
              summary: 'Basic auth result',
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
    const issues = await fetchJiraIssues('project = PMS');

    assert.equal(calls.length, 2);
    assert.equal(
      (calls[0].init?.headers as Record<string, string>).Authorization,
      'Bearer secret',
    );
    assert.equal(
      (calls[1].init?.headers as Record<string, string>).Authorization,
      `Basic ${Buffer.from('bot@example.com:secret').toString('base64')}`,
    );
    assert.equal(issues[0].key, 'PMS-43');
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues falls back to Jira login derived from email local part', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const emailBasic = `Basic ${Buffer.from('tuz_starosfw_tvmngmt@sberdevices.ru:secret').toString('base64')}`;
  const usernameBasic = `Basic ${Buffer.from('tuz_starosfw_tvmngmt:secret').toString('base64')}`;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'tuz_starosfw_tvmngmt@sberdevices.ru';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });

    const authHeader = (init?.headers as Record<string, string>).Authorization;
    if (authHeader === 'Bearer secret' || authHeader === emailBasic) {
      return new Response('Unauthorized', { status: 401 });
    }

    assert.equal(authHeader, usernameBasic);
    return new Response(
      JSON.stringify({
        issues: [
          {
            key: 'TV-968',
            fields: {
              summary: 'TUZ auth result',
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
    const issues = await fetchJiraIssues('project = TV');

    assert.equal(calls.length, 3);
    assert.equal(
      (calls[0].init?.headers as Record<string, string>).Authorization,
      'Bearer secret',
    );
    assert.equal(
      (calls[1].init?.headers as Record<string, string>).Authorization,
      emailBasic,
    );
    assert.equal(
      (calls[2].init?.headers as Record<string, string>).Authorization,
      usernameBasic,
    );
    assert.equal(issues[0].key, 'TV-968');
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues falls back to Jira Server cookie session auth', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const emailBasic = `Basic ${Buffer.from('tuz_starosfw_tvmngmt@sberdevices.ru:service-password').toString('base64')}`;
  const usernameBasic = `Basic ${Buffer.from('tuz_starosfw_tvmngmt:service-password').toString('base64')}`;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'tuz_starosfw_tvmngmt@sberdevices.ru';
  process.env.JIRA_API_TOKEN = 'pat-token';
  process.env.JIRA_PASSWORD = 'service-password';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const url = String(input);

    if (url.endsWith('/rest/auth/1/session')) {
      const body = JSON.parse(String(init?.body));
      if (body.username === 'tuz_starosfw_tvmngmt') {
        return new Response(
          JSON.stringify({ session: { name: 'JSESSIONID', value: 'session-123' } }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      return new Response('Unauthorized', { status: 401 });
    }

    const headers = init?.headers as Record<string, string>;
    if (headers.Cookie === 'JSESSIONID=session-123') {
      return new Response(
        JSON.stringify({
          issues: [
            {
              key: 'TV-969',
              fields: {
                summary: 'Session auth result',
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
    }

    return new Response('Unauthorized', { status: 401 });
  }) as typeof fetch;

  try {
    const issues = await fetchJiraIssues('project = TV');

    assert.equal(issues[0].key, 'TV-969');
    assert.equal(
      (calls[0].init?.headers as Record<string, string>).Authorization,
      'Bearer pat-token',
    );
    assert.equal(
      (calls[1].init?.headers as Record<string, string>).Authorization,
      emailBasic,
    );
    assert.equal(
      (calls[2].init?.headers as Record<string, string>).Authorization,
      usernameBasic,
    );
    assert.equal(calls[3].url, 'https://jira.example/rest/auth/1/session');
    assert.equal(calls[4].url, 'https://jira.example/rest/auth/1/session');
    assert.equal(calls[5].url, 'https://jira.example/rest/api/3/search/jql');
    assert.equal(
      (calls[5].init?.headers as Record<string, string>).Cookie,
      'JSESSIONID=session-123',
    );
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues falls back to basic auth when bearer returns HTML login page', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });

    if ((init?.headers as Record<string, string>).Authorization === 'Bearer secret') {
      return new Response('<!DOCTYPE html><title>Login</title>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response(
      JSON.stringify({
        issues: [
          {
            key: 'PMS-44',
            fields: {
              summary: 'HTML fallback result',
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
    const issues = await fetchJiraIssues('project = PMS');

    assert.equal(calls.length, 2);
    assert.equal(
      (calls[0].init?.headers as Record<string, string>).Authorization,
      'Bearer secret',
    );
    assert.equal(
      (calls[1].init?.headers as Record<string, string>).Authorization,
      `Basic ${Buffer.from('bot@example.com:secret').toString('base64')}`,
    );
    assert.equal(issues[0].key, 'PMS-44');
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues reports concise Jira auth failures without HTML payload', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'bad-secret';
  globalThis.fetch = (async () =>
    new Response(
      '<html><body><h1>Unauthorized (401)</h1><p>Basic Authentication Failure - Reason : AUTHENTICATED_FAILED</p></body></html>',
      { status: 401 },
    )) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchJiraIssues('project = PMS'),
      /Jira authentication failed: 401 Basic Authentication Failure - Reason : AUTHENTICATED_FAILED/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});
