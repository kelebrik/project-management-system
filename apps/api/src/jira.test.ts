import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchJiraIssues,
  jiraDevelopmentFromFields,
  jiraSprintFromFields,
  resolveJiraConfig,
} from './jira.js';

const jiraEnvKeys = ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'] as const;

test('jiraSprintFromFields reads active Jira Server sprint strings', () => {
  assert.equal(
    jiraSprintFromFields(
      {
        customfield_10100: [
          'com.atlassian.greenhopper.service.sprint.Sprint@1[id=1,state=CLOSED,name=Sprint 23]',
          'com.atlassian.greenhopper.service.sprint.Sprint@2[id=2,state=ACTIVE,name=Sprint 24]',
        ],
      },
      { customfield_10100: 'Sprint' },
    ),
    'Sprint 24',
  );
});

test('jiraSprintFromFields identifies renamed Sprint fields by schema', () => {
  assert.equal(
    jiraSprintFromFields(
      { customfield_10100: [{ name: 'Sprint 25', state: 'ACTIVE' }] },
      { customfield_10100: 'Iteration' },
      { customfield_10100: { custom: 'com.pyxis.greenhopper.jira:gh-sprint' } },
    ),
    'Sprint 25',
  );
});

test('jiraDevelopmentFromFields rejects opaque development payloads', () => {
  assert.deepEqual(
    jiraDevelopmentFromFields(
      { customfield_10200: 'not a supported development summary' },
      { customfield_10200: 'Development' },
    ),
    {
      commitCount: 0,
      mergeRequestCount: 0,
      updatedAt: null,
      available: false,
    },
  );
});

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
    JIRA_BASE_URL: 'https://tasks.dev.sberdevices.ru/',
    JIRA_EMAIL: 'service-account@example.com',
    JIRA_API_TOKEN: 'service-token',
  });

  assert.deepEqual(config, {
    enabled: true,
    baseUrl: 'https://tasks.dev.sberdevices.ru',
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
    baseUrl: 'https://tasks.dev.sberdevices.ru',
    email: 'tuz_starosfw_tvmngmt@sberdevices.ru',
    token: 'service-token',
    maxResults: 100,
  });
});

test('resolveJiraConfig keeps explicit prod Jira base URL override', () => {
  const config = resolveJiraConfig(
    {
      JIRA_BASE_URL: 'tasks.sberdevices.ru',
      JIRA_EMAIL: 'tuz_starosfw_tvmngmt@sberdevices.ru',
      JIRA_API_TOKEN: 'service-token',
    },
    { baseUrl: 'https://tasks.sberdevices.ru' },
  );

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
    JIRA_BASE_URL: 'https://tasks.dev.sberdevices.ru',
    JIRA_EMAIL: 'env-bot@example.com',
    JIRA_API_TOKEN: 'env-token',
    JIRA_MAX_RESULTS: '750',
  });

  assert.deepEqual(config, {
    enabled: true,
    baseUrl: 'https://tasks.dev.sberdevices.ru',
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
        names: {
          customfield_10100: 'Sprint',
          customfield_10200: 'Development',
        },
        issues: [
          {
            id: '10042',
            key: 'PMS-42',
            fields: {
              summary: 'Blocked firmware smoke test',
              status: { name: 'In Progress' },
              priority: { name: 'High' },
              assignee: { displayName: 'Ivan Petrov' },
              issuetype: { name: 'Bug' },
              created: '2026-05-20T09:00:00.000+0300',
              updated: '2026-05-23T10:00:00.000+0300',
              customfield_10100: [
                {
                  name: 'Sprint 24',
                  state: 'ACTIVE',
                },
              ],
              customfield_10200: {
                cachedValue: {
                  summary: {
                    repository: { overall: { count: 3, lastUpdated: '2026-05-23T09:30:00Z' } },
                    pullrequest: { overall: { count: 1, lastUpdated: '2026-05-23T09:45:00Z' } },
                  },
                },
              },
            },
            changelog: {
              histories: [
                {
                  id: '2001',
                  created: '2026-05-21T11:00:00.000+0300',
                  author: { displayName: 'Petr Ivanov' },
                  items: [
                    {
                      field: 'status',
                      fieldId: 'status',
                      fromString: 'Open',
                      toString: 'In Progress',
                    },
                  ],
                },
              ],
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
    assert.equal(calls[0].url, 'https://jira.example/rest/api/2/search');
    assert.equal(calls[0].init?.method, 'POST');
    assert.equal(
      (calls[0].init?.headers as Record<string, string>).Authorization,
      'Bearer secret',
    );
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)).expand, [
      'names',
      'schema',
      'changelog',
    ]);
    assert.deepEqual(issues, [
      {
        jiraId: '10042',
        key: 'PMS-42',
        url: 'https://jira.example/browse/PMS-42',
        summary: 'Blocked firmware smoke test',
        status: 'In Progress',
        priority: 'High',
        assignee: 'Ivan Petrov',
        reporter: null,
        issueType: 'Bug',
        resolution: 'Unresolved',
        sprint: 'Sprint 24',
        createdAt: new Date('2026-05-20T09:00:00.000+0300'),
        updatedAt: new Date('2026-05-23T10:00:00.000+0300'),
        transitions: [
          {
            key: '2001:0',
            fromStatus: 'Open',
            toStatus: 'In Progress',
            transitionedAt: new Date('2026-05-21T11:00:00.000+0300'),
            actor: 'Petr Ivanov',
          },
        ],
        transitionHistoryComplete: true,
        development: {
          commitCount: 3,
          mergeRequestCount: 1,
          updatedAt: new Date('2026-05-23T09:45:00Z'),
          available: true,
        },
      },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues paginates incomplete issue changelog', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  const history = (id: string, fromStatus: string, toStatus: string) => ({
    id,
    created: `2026-05-2${id}T10:00:00.000+0300`,
    items: [{ fieldId: 'status', fromString: fromStatus, toString: toStatus }],
  });

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/rest/api/2/search')) {
      return new Response(
        JSON.stringify({
          issues: [
            {
              id: '10099',
              key: 'PMS-99',
              fields: {
                summary: 'Long-running issue',
                status: { name: 'Done' },
                priority: { name: 'Medium' },
                assignee: null,
                issuetype: { name: 'Task' },
                created: '2026-05-20T09:00:00.000+0300',
                updated: '2026-05-23T10:00:00.000+0300',
              },
              changelog: {
                startAt: 0,
                maxResults: 1,
                total: 3,
                histories: [history('1', 'Open', 'In Progress')],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const startAt = Number(new URL(url).searchParams.get('startAt'));
    const pageHistory =
      startAt === 1
        ? history('2', 'In Progress', 'Review')
        : history('3', 'Review', 'Done');
    return new Response(
      JSON.stringify({ startAt, maxResults: 1, total: 3, values: [pageHistory] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const issues = await fetchJiraIssues('project = PMS');

    assert.equal(calls.length, 3);
    assert.match(calls[1], /\/rest\/api\/2\/issue\/PMS-99\/changelog\?startAt=1/);
    assert.match(calls[2], /\/rest\/api\/2\/issue\/PMS-99\/changelog\?startAt=2/);
    assert.equal(issues[0]?.transitionHistoryComplete, true);
    assert.deepEqual(
      issues[0]?.transitions.map((transition) => transition.toStatus),
      ['In Progress', 'Review', 'Done'],
    );
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues accepts an empty result only after Jira confirms current user', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const url = String(input);

    if (url.endsWith('/rest/api/2/myself')) {
      return new Response(JSON.stringify({ name: 'bot', displayName: 'Jira Bot' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ issues: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const issues = await fetchJiraIssues('project = PMS');

    assert.deepEqual(issues, []);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://jira.example/rest/api/2/search');
    assert.equal(calls[1].url, 'https://jira.example/rest/api/2/myself');
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues rejects empty anonymous search results', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'bad-secret';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const url = String(input);

    if (url.endsWith('/rest/api/2/search')) {
      return new Response(JSON.stringify({ issues: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.endsWith('/rest/auth/1/session')) {
      return new Response(JSON.stringify({ errorMessages: ['Login failed'], errors: {} }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.endsWith('/login.jsp')) {
      return new Response('<html><body><form id="login-form"></form></body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response(JSON.stringify({ errorMessages: ['Login failed'], errors: {} }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchJiraIssues('project = PMS'),
      /Jira did not authenticate bot@example\.com/,
    );
    assert.equal(calls[0].url, 'https://jira.example/rest/api/2/search');
    assert.equal(calls[1].url, 'https://jira.example/rest/api/2/myself');
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues rejects empty results from unexpected Jira user', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith('/rest/api/2/search')) {
      return new Response(JSON.stringify({ issues: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.endsWith('/rest/auth/1/session')) {
      return new Response(JSON.stringify({ errorMessages: ['Login failed'], errors: {} }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.endsWith('/login.jsp')) {
      return new Response('<html><body><form id="login-form"></form></body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response(
      JSON.stringify({ name: 'another-user', displayName: 'Another User' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchJiraIssues('project = PMS'),
      /Jira current user another-user, Another User does not match expected bot@example\.com, bot/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

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
