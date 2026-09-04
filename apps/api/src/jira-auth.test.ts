import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  assertJiraReadOnlyRequest,
  captureJiraReadOnlyRequestMetrics,
  captureJiraReadOnlyRequestSummary,
  fetchJiraReadOnly,
  fetchJiraIssueKeys,
  fetchJiraIssues,
  fetchJiraIssuesWithMeta,
  fetchJiraRemoteDevelopment,
  fetchJiraRemoteLinks,
  jiraCriticalPriorityAt,
  jiraJqlWithAnalyticsScope,
  jiraJqlWithIssueKeys,
  jiraJqlWithLabelScope,
  jiraDevelopmentFromFields,
  jiraDevelopmentFromRemoteLinks,
  jiraPriorityAtResolution,
  jiraReadOnlyRequestSummaryForError,
  jiraSprintFromFields,
  JiraSyncDeadlineError,
  resolveJiraConfig,
  sanitizeJiraCapacityPayload,
} from './jira.js';

function jiraPriorityIssue(
  currentPriority: string,
  histories: Array<{
    created: string;
    fromPriority: string | null;
    toPriority: string | null;
  }>,
  total = histories.length,
  resolutionAt: string | null = null,
) {
  return {
    key: 'PMS-42',
    fields: {
      summary: 'Priority SLA',
      status: { name: 'Open' },
      priority: { name: currentPriority },
      assignee: null,
      issuetype: { name: 'Bug' },
      resolutiondate: resolutionAt,
      created: '2026-05-01T09:00:00.000Z',
      updated: '2026-06-15T09:00:00.000Z',
    },
    changelog: {
      startAt: 0,
      maxResults: 100,
      total,
      histories: histories.map((history, index) => ({
        id: `priority-${index}`,
        created: history.created,
        items: [{
          fieldId: 'priority',
          fromString: history.fromPriority,
          toString: history.toPriority,
        }],
      })),
    },
  };
}

const jiraEnvKeys = [
  'JIRA_BASE_URL',
  'JIRA_EMAIL',
  'JIRA_API_TOKEN',
  'JIRA_SPRINT_FIELD_ID',
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

test('fetchJiraIssues uses Jira Server search endpoint before v3 fallback endpoint', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  process.env.JIRA_BASE_URL = 'tasks.sberdevices.ru';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });

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
            changelog: { histories: [] },
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

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://tasks.dev.sberdevices.ru/rest/api/2/search');
    assert.equal(
      JSON.parse(String(calls[0].init?.body)).jql,
      'project = TV',
    );
    assert.equal(issues[0].key, 'TV-7500');
    assert.equal(issues[0].url, 'https://tasks.dev.sberdevices.ru/browse/TV-7500');
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});
test('fetchJiraIssues resolves Jira saved filter id before search', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  process.env.JIRA_BASE_URL = 'tasks.sberdevices.ru';
  process.env.JIRA_EMAIL = 'tuz_starosfw_tvmngmt@sberdevices.ru';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });

    if (String(input).endsWith('/rest/api/2/filter/39227')) {
      return new Response(
        JSON.stringify({ jql: 'project = TV AND statusCategory != Done' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({
        issues: [
          {
            key: 'TV-7700',
            fields: {
              summary: 'Saved filter result',
              status: { name: 'Open' },
              priority: { name: 'Medium' },
              assignee: null,
              issuetype: { name: 'Task' },
              updated: '2026-07-02T10:00:00.000+0300',
            },
            changelog: { histories: [] },
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
    assert.equal(calls[0].url, 'https://tasks.dev.sberdevices.ru/rest/api/2/filter/39227');
    assert.equal(calls[1].url, 'https://tasks.dev.sberdevices.ru/rest/api/2/search');
    assert.equal(
      JSON.parse(String(calls[1].init?.body)).jql,
      'project = TV AND statusCategory != Done',
    );
    assert.equal(issues[0].key, 'TV-7700');
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues reports unavailable Jira saved filter', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;

  process.env.JIRA_BASE_URL = 'tasks.sberdevices.ru';
  process.env.JIRA_EMAIL = 'tuz_starosfw_tvmngmt@sberdevices.ru';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        errorMessages: ['The requested filter does not exist or is private'],
        errors: {},
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      },
    )) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchJiraIssues('filter = 39227'),
      /Jira saved filter 39227 is unavailable for tuz_starosfw_tvmngmt@sberdevices\.ru/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues normalizes bearer token prefix from env', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  process.env.JIRA_BASE_URL = 'tasks.sberdevices.ru';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'Bearer secret';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });

    return new Response(
      JSON.stringify({
        issues: [
          {
            key: 'TV-7600',
            fields: {
              summary: 'Bearer prefix result',
              status: { name: 'Open' },
              priority: { name: 'Medium' },
              assignee: null,
              issuetype: { name: 'Task' },
              updated: '2026-07-02T10:00:00.000+0300',
            },
            changelog: { histories: [] },
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

    assert.equal(
      (calls[0].init?.headers as Record<string, string>).Authorization,
      'Bearer secret',
    );
    assert.equal(issues[0].key, 'TV-7600');
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
            changelog: { histories: [] },
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

test('fetchJiraIssues falls back when bearer search is treated as anonymous', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  process.env.JIRA_BASE_URL = 'tasks.sberdevices.ru';
  process.env.JIRA_EMAIL = 'tuz_starosfw_tvmngmt@sberdevices.ru';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });

    if ((init?.headers as Record<string, string>).Authorization === 'Bearer secret') {
      return new Response(
        JSON.stringify({
          errorMessages: [
            "Field 'labels' does not exist or this field cannot be viewed by anonymous users.",
            "Field 'priority' does not exist or this field cannot be viewed by anonymous users.",
            "Field 'type' does not exist or this field cannot be viewed by anonymous users.",
          ],
          errors: {},
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({
        issues: [
          {
            key: 'TV-7800',
            fields: {
              summary: 'Authenticated JQL result',
              status: { name: 'Open' },
              priority: { name: 'Medium' },
              assignee: null,
              issuetype: { name: 'Task' },
              updated: '2026-07-02T10:00:00.000+0300',
            },
            changelog: { histories: [] },
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
    const issues = await fetchJiraIssues(
      'labels = tv AND priority = High AND type = Bug',
    );

    assert.equal(calls.length, 2);
    assert.equal(
      (calls[0].init?.headers as Record<string, string>).Authorization,
      'Bearer secret',
    );
    assert.equal(
      (calls[1].init?.headers as Record<string, string>).Authorization,
      `Basic ${Buffer.from('tuz_starosfw_tvmngmt@sberdevices.ru:secret').toString('base64')}`,
    );
    assert.equal(issues[0].key, 'TV-7800');
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
            changelog: { histories: [] },
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
  const emailBasic = `Basic ${Buffer.from('tuz_starosfw_tvmngmt@sberdevices.ru:service-token').toString('base64')}`;
  const usernameBasic = `Basic ${Buffer.from('tuz_starosfw_tvmngmt:service-token').toString('base64')}`;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'tuz_starosfw_tvmngmt@sberdevices.ru';
  process.env.JIRA_API_TOKEN = 'service-token';
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
      'Bearer service-token',
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
    assert.equal(calls[5].url, 'https://jira.example/rest/api/2/search');
    assert.equal(
      (calls[5].init?.headers as Record<string, string>).Cookie,
      'JSESSIONID=session-123',
    );
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues falls back to Jira web login cookie auth', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  process.env.JIRA_BASE_URL = 'tasks.sberdevices.ru';
  process.env.JIRA_EMAIL = 'tuz_starosfw_tvmngmt@sberdevices.ru';
  process.env.JIRA_API_TOKEN = 'service-token';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const url = String(input);

    if (url.endsWith('/login.jsp')) {
      const body = new URLSearchParams(String(init?.body));
      if (body.get('os_username') === 'tuz_starosfw_tvmngmt') {
        return new Response('', {
          status: 302,
          headers: {
            Location: '/',
            'Set-Cookie': 'JSESSIONID=web-session-123; Path=/; HttpOnly',
          },
        });
      }

      return new Response('<html><body>Login failed</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (url.endsWith('/rest/auth/1/session')) {
      return new Response(
        JSON.stringify({ errorMessages: ['Login failed'], errors: {} }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const headers = init?.headers as Record<string, string>;
    if (headers.Cookie === 'JSESSIONID=web-session-123') {
      return new Response(
        JSON.stringify({
          issues: [
            {
              key: 'TV-7900',
              fields: {
                summary: 'Web login auth result',
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

    assert.equal(issues[0].key, 'TV-7900');
    assert.equal(calls[0].url, 'https://tasks.dev.sberdevices.ru/rest/api/2/search');
    assert.equal(calls[3].url, 'https://tasks.dev.sberdevices.ru/rest/auth/1/session');
    assert.equal(calls[5].url, 'https://tasks.dev.sberdevices.ru/login.jsp');
    assert.equal(calls[6].url, 'https://tasks.dev.sberdevices.ru/login.jsp');
    assert.equal(calls[7].url, 'https://tasks.dev.sberdevices.ru/rest/api/2/search');
    assert.equal(
      (calls[7].init?.headers as Record<string, string>).Cookie,
      'JSESSIONID=web-session-123',
    );
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues rejects anonymous cookie from failed Jira web login', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;

  process.env.JIRA_BASE_URL = 'tasks.sberdevices.ru';
  process.env.JIRA_EMAIL = 'tuz_starosfw_tvmngmt@sberdevices.ru';
  process.env.JIRA_API_TOKEN = 'bad-secret';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith('/login.jsp')) {
      return new Response(
        '<html><form id="login-form"><input name="os_username" /></form><p>Login failed</p></html>',
        {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
            'Set-Cookie': 'JSESSIONID=anonymous-session; Path=/; HttpOnly',
          },
        },
      );
    }

    if (url.endsWith('/rest/auth/1/session')) {
      return new Response(
        JSON.stringify({ errorMessages: ['Login failed'], errors: {} }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({
        errorMessages: [
          "Field 'labels' does not exist or this field cannot be viewed by anonymous users.",
        ],
        errors: {},
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchJiraIssues('labels = tv'),
      /Jira did not authenticate tuz_starosfw_tvmngmt@sberdevices\.ru/,
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
            changelog: { histories: [] },
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
      /Jira authentication failed: 401 HTML response from Jira/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues summarizes HTML Jira errors without parsing tag content', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async () =>
    new Response(
      '<html><body><script>alert("secret")</script ><style>.hidden{display:none}</style ><p>Server failed &amp; retry</p></body></html>',
      { status: 500 },
    )) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchJiraIssues('project = PMS'),
      (error) => {
        assert(error instanceof Error);
        assert.match(error.message, /Jira request failed: 500 HTML response from Jira/);
        assert.doesNotMatch(error.message, /alert|secret|hidden|<script|<style/i);
        return true;
      },
    );
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues retries a transient Jira gateway timeout', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  let requests = 0;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async () => {
    requests += 1;
    if (requests === 1) {
      return new Response('<html><body>Gateway timeout</body></html>', {
        status: 504,
        headers: { 'Retry-After': '0' },
      });
    }
    return new Response(
      JSON.stringify({
        issues: [{
          key: 'PMS-504',
          fields: {
            summary: 'Recovered Jira search',
            status: { name: 'Open' },
            priority: { name: 'Medium' },
            assignee: null,
            issuetype: { name: 'Task' },
            updated: '2026-08-24T10:00:00.000+0300',
          },
          changelog: { histories: [] },
        }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const issues = await fetchJiraIssues('project = PMS');
    assert.equal(requests, 2);
    assert.equal(issues[0]?.key, 'PMS-504');
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('Jira search retries every supported transient gateway status', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  try {
    for (const status of [429, 502, 503]) {
      let requests = 0;
      globalThis.fetch = (async () => {
        requests += 1;
        return requests === 1
          ? new Response('temporary failure', {
              status,
              headers: { 'Retry-After': '0' },
            })
          : new Response(
              JSON.stringify({ issues: [{ key: `PMS-${status}` }] }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
      }) as typeof fetch;
      assert.deepEqual(await fetchJiraIssueKeys('project = PMS'), [`PMS-${status}`]);
      assert.equal(requests, 2);
    }
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('Jira search stops after the shared transient retry budget is exhausted', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  let requests = 0;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async () => {
    requests += 1;
    return new Response('gateway timeout', {
      status: 504,
      headers: { 'Retry-After': '0' },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchJiraIssueKeys('project = PMS'),
      /Jira request failed: 504 gateway timeout/,
    );
    assert.equal(requests, 3);
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('Jira search does not schedule a retry beyond the synchronization deadline', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  let requests = 0;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async () => {
    requests += 1;
    return new Response('rate limited', {
      status: 429,
      headers: { 'Retry-After': '3600' },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchJiraIssueKeys('project = PMS', { deadlineAt: Date.now() + 100 }),
      (error) => error instanceof JiraSyncDeadlineError && /ответа 429/.test(error.message),
    );
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});
