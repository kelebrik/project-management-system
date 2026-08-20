import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  assertJiraReadOnlyRequest,
  fetchJiraReadOnly,
  fetchJiraIssues,
  fetchJiraRemoteDevelopment,
  jiraCriticalPriorityAt,
  jiraDevelopmentFromFields,
  jiraDevelopmentFromRemoteLinks,
  jiraPriorityAtResolution,
  jiraSprintFromFields,
  resolveJiraConfig,
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

test('Jira request guard allows only known read and authentication operations', () => {
  const allowedRequests: Array<[string, RequestInit?]> = [
    ['https://jira.example/rest/api/2/filter/123'],
    ['https://jira.example/rest/api/3/myself'],
    ['https://jira.example/rest/api/2/issue/PMS-42?fields=updated'],
    ['https://jira.example/rest/api/3/issue/PMS-42/changelog?startAt=0'],
    ['https://jira.example/rest/api/2/issue/PMS-42/remotelink'],
    ['https://jira.example/rest/api/2/search', { method: 'POST' }],
    ['https://jira.example/rest/api/3/search/jql', { method: 'post' }],
    ['https://jira.example/rest/auth/1/session', { method: 'POST' }],
    ['https://jira.example/login.jsp', { method: 'POST' }],
    ['https://jira.example/jira/rest/api/2/search', { method: 'POST' }],
    ['https://jira.example/jira/rest/api/2/issue/PMS-42/changelog'],
  ];

  for (const [url, init] of allowedRequests) {
    assert.doesNotThrow(() => assertJiraReadOnlyRequest(url, init));
  }
});

test('Jira request guard blocks business-data writes and unknown endpoints', () => {
  const blockedRequests: Array<[string, RequestInit]> = [
    ['https://jira.example/rest/api/2/issue', { method: 'POST' }],
    ['https://jira.example/rest/api/2/issue/PMS-42', { method: 'PUT' }],
    ['https://jira.example/rest/api/2/issue/PMS-42', { method: 'PATCH' }],
    ['https://jira.example/rest/api/2/issue/PMS-42', { method: 'DELETE' }],
    ['https://jira.example/rest/api/2/issue/PMS-42/comment', { method: 'POST' }],
    ['https://jira.example/rest/api/2/issue/PMS-42/transitions', { method: 'POST' }],
    ['https://jira.example/rest/api/2/issue/PMS-42/worklog', { method: 'POST' }],
    ['https://jira.example/rest/api/2/issue/PMS-42/attachments', { method: 'POST' }],
    ['https://jira.example/rest/api/2/issue/PMS-42/assignee', { method: 'PUT' }],
    ['https://jira.example/rest/api/2/issueLink', { method: 'POST' }],
    ['https://jira.example/rest/api/2/issueLink/123', { method: 'DELETE' }],
    ['https://jira.example/rest/api/2/filter', { method: 'POST' }],
  ];

  for (const [url, init] of blockedRequests) {
    assert.throws(
      () => assertJiraReadOnlyRequest(url, init),
      /Blocked non-read-only Jira request/,
    );
  }

  assert.throws(
    () => assertJiraReadOnlyRequest('not a URL'),
    /Blocked invalid Jira request URL/,
  );
});

test('Jira request wrapper disables automatic redirects', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.redirect, 'manual');
    return new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await fetchJiraReadOnly('https://jira.example/rest/api/2/search', {
      method: 'POST',
      redirect: 'follow',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Jira client has no direct fetch calls outside the read-only wrapper', async () => {
  const source = await readFile(new URL('./jira.ts', import.meta.url), 'utf8');
  const directFetchCalls = source.match(/\bfetch\s*\(/g) ?? [];

  assert.equal(directFetchCalls.length, 1);
  assert.match(
    source,
    /export function fetchJiraReadOnly[\s\S]*?return fetch\(url, \{ \.\.\.init, redirect: 'manual' \}\);/,
  );
});

test('jiraSprintFromFields reads active Jira Server sprint strings', () => {
  assert.equal(
    jiraSprintFromFields(
      {
        customfield_10004: [
          'com.atlassian.greenhopper.service.sprint.Sprint@1[id=1,state=CLOSED,name=Sprint 23]',
          'com.atlassian.greenhopper.service.sprint.Sprint@2[id=2,state=ACTIVE,name=Sprint 24]',
        ],
      },
    ),
    'Sprint 24',
  );
});

test('jiraSprintFromFields supports an explicit field id override', () => {
  const previous = process.env.JIRA_SPRINT_FIELD_ID;
  process.env.JIRA_SPRINT_FIELD_ID = 'customfield_10100';
  try {
    assert.equal(
      jiraSprintFromFields({
        customfield_10100: [{ name: 'Sprint 25', state: 'ACTIVE' }],
      }),
      'Sprint 25',
    );
  } finally {
    if (previous === undefined) delete process.env.JIRA_SPRINT_FIELD_ID;
    else process.env.JIRA_SPRINT_FIELD_ID = previous;
  }
});

test('jiraSprintFromFields prioritizes customfield_10004', () => {
  assert.equal(
    jiraSprintFromFields(
      {
        customfield_10004: [{ name: 'Target Sprint', state: 'ACTIVE' }],
        customfield_10100: [{ name: 'Wrong Sprint', state: 'ACTIVE' }],
      },
    ),
    'Target Sprint',
  );
  assert.equal(
    jiraSprintFromFields(
      {
        customfield_10004: null,
        customfield_10100: [{ name: 'Stale Sprint', state: 'ACTIVE' }],
      },
    ),
    null,
  );
});

test('jiraCriticalPriorityAt starts at creation for an initially critical bug', () => {
  const issue = jiraPriorityIssue('Critical', []);

  assert.deepEqual(
    jiraCriticalPriorityAt(issue),
    new Date('2026-05-01T09:00:00.000Z'),
  );
});

test('jiraCriticalPriorityAt starts when a lower priority is raised', () => {
  const issue = jiraPriorityIssue('Blocker', [
    {
      created: '2026-05-20T12:30:00.000Z',
      fromPriority: 'Major',
      toPriority: 'Critical',
    },
    {
      created: '2026-05-25T12:30:00.000Z',
      fromPriority: 'Critical',
      toPriority: 'Blocker',
    },
  ]);

  assert.deepEqual(
    jiraCriticalPriorityAt(issue),
    new Date('2026-05-20T12:30:00.000Z'),
  );
});

test('jiraCriticalPriorityAt keeps the first critical date after a later downgrade', () => {
  const issue = jiraPriorityIssue('Major', [
    {
      created: '2026-05-20T12:30:00.000Z',
      fromPriority: 'Minor',
      toPriority: 'Critical',
    },
    {
      created: '2026-06-01T12:30:00.000Z',
      fromPriority: 'Critical',
      toPriority: 'Major',
    },
  ]);

  assert.deepEqual(
    jiraCriticalPriorityAt(issue),
    new Date('2026-05-20T12:30:00.000Z'),
  );
  assert.deepEqual(
    jiraCriticalPriorityAt(jiraPriorityIssue('Major', [
      {
        created: '2026-06-01T12:30:00.000Z',
        fromPriority: 'Critical',
        toPriority: 'Major',
      },
    ])),
    new Date('2026-05-01T09:00:00.000Z'),
  );
});

test('jiraCriticalPriorityAt uses an explicit raise from incomplete history conservatively', () => {
  const issue = jiraPriorityIssue(
    'Critical',
    [{
      created: '2026-05-20T12:30:00.000Z',
      fromPriority: 'Major',
      toPriority: 'Critical',
    }],
    2,
  );

  assert.deepEqual(
    jiraCriticalPriorityAt(issue),
    new Date('2026-05-20T12:30:00.000Z'),
  );
  assert.equal(jiraCriticalPriorityAt(jiraPriorityIssue('Critical', [], 1)), null);
  assert.equal(
    jiraCriticalPriorityAt(jiraPriorityIssue('Major', [{
      created: '2026-05-20T12:30:00.000Z',
      fromPriority: 'Critical',
      toPriority: 'Major',
    }], 2)),
    null,
  );
});

test('jiraPriorityAtResolution returns the priority active at Resolution', () => {
  const resolvedAt = '2026-06-01T12:30:00.000Z';

  assert.equal(
    jiraPriorityAtResolution(jiraPriorityIssue('Major', [
      {
        created: '2026-05-20T12:30:00.000Z',
        fromPriority: 'Major',
        toPriority: 'Critical',
      },
      {
        created: '2026-06-10T12:30:00.000Z',
        fromPriority: 'Critical',
        toPriority: 'Major',
      },
    ], 2, resolvedAt)),
    'Critical',
  );
  assert.equal(
    jiraPriorityAtResolution(jiraPriorityIssue('Critical', [
      {
        created: '2026-06-10T12:30:00.000Z',
        fromPriority: 'Major',
        toPriority: 'Critical',
      },
    ], 1, resolvedAt)),
    'Major',
  );
});

test('jiraPriorityAtResolution includes a priority change at the Resolution timestamp', () => {
  const resolvedAt = '2026-06-01T12:30:00.000Z';

  assert.equal(
    jiraPriorityAtResolution(jiraPriorityIssue('Critical', [
      {
        created: resolvedAt,
        fromPriority: 'Major',
        toPriority: 'Critical',
      },
    ], 1, resolvedAt)),
    'Critical',
  );
});

test('jiraPriorityAtResolution uses current priority when it never changed', () => {
  assert.equal(
    jiraPriorityAtResolution(jiraPriorityIssue(
      'Critical',
      [],
      0,
      '2026-06-01T12:30:00.000Z',
    )),
    'Critical',
  );
});

test('jiraPriorityAtResolution requires a Resolution date and complete history', () => {
  assert.equal(jiraPriorityAtResolution(jiraPriorityIssue('Critical', [])), null);
  assert.equal(
    jiraPriorityAtResolution(jiraPriorityIssue(
      'Critical',
      [{
        created: '2026-05-20T12:30:00.000Z',
        fromPriority: 'Major',
        toPriority: 'Critical',
      }],
      2,
      '2026-06-01T12:30:00.000Z',
    )),
    null,
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

test('jiraDevelopmentFromRemoteLinks counts unique GitLab mentions', () => {
  assert.deepEqual(
    jiraDevelopmentFromRemoteLinks([
      {
        globalId: 'gitlab-commit-1',
        relationship: 'mentioned on',
        object: { title: 'Commit - TV-101: debug', url: 'https://gitlab/repo/-/commit/aaa' },
      },
      {
        globalId: 'gitlab-commit-1',
        relationship: 'mentioned on',
        object: {
          title: 'Commit - Merge Request !42 squash',
          url: 'https://gitlab/repo/-/commit/aaa',
        },
      },
      {
        relationship: 'mentioned on',
        object: {
          title: 'Commit - duplicate note link',
          url: 'https://gitlab/repo/-/commit/aaa?ref_type=heads#note_1',
        },
      },
      {
        relationship: 'mentioned on',
        object: { title: 'Merge Request !42', url: 'https://gitlab/repo/-/merge_requests/42' },
      },
      {
        relationship: 'mentioned on',
        object: {
          title: 'Merge Request !42 diffs',
          url: 'https://gitlab/repo/-/merge_requests/42/diffs#note_2',
        },
      },
      {
        relationship: 'is blocked by',
        object: { title: 'Commit - unrelated', url: 'https://gitlab/repo/-/commit/bbb' },
      },
      { relationship: 'mentioned on', object: null },
    ]),
    {
      commitCount: 1,
      mergeRequestCount: 1,
      updatedAt: null,
      available: true,
    },
  );
  assert.deepEqual(jiraDevelopmentFromRemoteLinks([]), {
    commitCount: 0,
    mergeRequestCount: 0,
    updatedAt: null,
    available: true,
  });
});

test('fetchJiraRemoteDevelopment falls back to v3 and tolerates throttling', async () => {
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/rest/api/2/')) return new Response('', { status: 404 });
    return new Response(
      JSON.stringify([
        {
          relationship: 'mentioned on',
          object: {
            title: 'Commit - TV-101',
            url: 'https://gitlab/repo/-/commit/aaa',
          },
        },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    assert.deepEqual(
      await fetchJiraRemoteDevelopment('https://jira.example', 'TV-101', {}),
      {
        commitCount: 1,
        mergeRequestCount: 0,
        updatedAt: null,
        available: true,
      },
    );
    assert.deepEqual(calls, [
      'https://jira.example/rest/api/2/issue/TV-101/remotelink',
      'https://jira.example/rest/api/3/issue/TV-101/remotelink',
    ]);

    calls.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      return url.includes('/rest/api/2/')
        ? new Response('{bad json', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        : new Response('[]', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
    }) as typeof fetch;
    assert.deepEqual(
      await fetchJiraRemoteDevelopment('https://jira.example', 'TV-101', {}),
      {
        commitCount: 0,
        mergeRequestCount: 0,
        updatedAt: null,
        available: true,
      },
    );
    assert.equal(calls.length, 2);

    calls.length = 0;
    globalThis.fetch = (async () => new Response('', { status: 429 })) as typeof fetch;
    assert.equal(
      await fetchJiraRemoteDevelopment('https://jira.example', 'TV-101', {}),
      null,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
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

    if (String(input).endsWith('/rest/api/2/issue/PMS-42/remotelink')) {
      return new Response(
        JSON.stringify([
          ...['aaa', 'bbb', 'ccc', 'ddd'].map((sha) => ({
            globalId: `gitlab-commit-${sha}`,
            relationship: 'mentioned on',
            object: {
              title: `Commit - PMS-42: ${sha}`,
              url: `https://gitlab.example/repo/-/commit/${sha}`,
            },
          })),
          {
            globalId: 'gitlab-mr-1',
            relationship: 'mentioned on',
            object: {
              title: 'Merge Request !1',
              url: 'https://gitlab.example/repo/-/merge_requests/1',
            },
          },
          {
            globalId: 'gitlab-mr-2',
            relationship: 'mentioned on',
            object: {
              title: 'Merge Request !2',
              url: 'https://gitlab.example/repo/-/merge_requests/2',
            },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        names: {
          customfield_10004: 'Sprint',
        },
        issues: [
          {
            id: '10042',
            key: 'PMS-42',
            fields: {
              summary: 'Blocked firmware smoke test',
              status: { name: 'Resolved' },
              priority: { name: 'High' },
              assignee: { displayName: 'Ivan Petrov' },
              issuetype: { name: 'Bug' },
              resolution: { name: 'Fixed' },
              resolutiondate: '2026-05-23T09:00:00.000+0300',
              created: '2026-05-20T09:00:00.000+0300',
              updated: '2026-05-23T10:00:00.000+0300',
              customfield_10004: [
                {
                  name: 'Sprint 24',
                  state: 'ACTIVE',
                },
              ],
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
                      toString: 'Resolved',
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
    const issues = await fetchJiraIssues('project = PMS', { includeAnalyticsFields: true });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://jira.example/rest/api/2/search');
    assert.equal(
      calls[1].url,
      'https://jira.example/rest/api/2/issue/PMS-42/remotelink',
    );
    assert.equal(calls[0].init?.method, 'POST');
    assert.equal(
      (calls[0].init?.headers as Record<string, string>).Authorization,
      'Bearer secret',
    );
    const searchBody = JSON.parse(String(calls[0].init?.body));
    assert.deepEqual(searchBody.expand, [
      'names',
      'schema',
      'changelog',
    ]);
    assert.ok(!searchBody.fields.includes('*navigable'));
    assert.ok(searchBody.fields.includes('customfield_10004'));
    assert.ok(!searchBody.fields.includes('customfield_10200'));
    assert.ok(!searchBody.fields.includes('customfield_10300'));
    assert.ok(searchBody.fields.includes('resolutiondate'));
    assert.deepEqual(issues, [
      {
        jiraId: '10042',
        key: 'PMS-42',
        url: 'https://jira.example/browse/PMS-42',
        summary: 'Blocked firmware smoke test',
        status: 'Resolved',
        priority: 'High',
        assignee: 'Ivan Petrov',
        reporter: null,
        issueType: 'Bug',
        resolution: 'Fixed',
        resolutionAt: new Date('2026-05-23T09:00:00.000+0300'),
        sprint: 'Sprint 24',
        sprintAvailable: true,
        createdAt: new Date('2026-05-20T09:00:00.000+0300'),
        criticalPriorityAt: null,
        criticalEndPriority: 'High',
        updatedAt: new Date('2026-05-23T10:00:00.000+0300'),
        transitions: [
          {
            key: '2001:0',
            fromStatus: 'Open',
            toStatus: 'Resolved',
            transitionedAt: new Date('2026-05-21T11:00:00.000+0300'),
            actor: 'Petr Ivanov',
          },
        ],
        transitionHistoryComplete: true,
        development: {
          commitCount: 4,
          mergeRequestCount: 2,
          updatedAt: null,
          available: true,
        },
      },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues loads every Jira search page', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  const searchBodies: Array<Record<string, unknown>> = [];

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/remotelink')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    searchBodies.push(body);
    const startAt = Number(body.startAt);
    const issueNumber = startAt + 1;
    return new Response(
      JSON.stringify({
        startAt,
        maxResults: 1,
        total: 2,
        issues: [
          {
            id: `1000${issueNumber}`,
            key: `PMS-${issueNumber}`,
            fields: {
              summary: `Issue ${issueNumber}`,
              status: { name: 'Open' },
              priority: { name: 'Major' },
              assignee: null,
              issuetype: { name: 'Task' },
              created: '2026-05-20T09:00:00.000Z',
              updated: '2026-05-23T10:00:00.000Z',
            },
            changelog: { histories: [] },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const issues = await fetchJiraIssues('project = PMS ORDER BY key ASC', {
      fetchAllPages: true,
      includeAnalyticsFields: true,
    });

    assert.deepEqual(searchBodies.map((body) => body.startAt), [0, 1]);
    assert.ok(searchBodies.every((body) => {
      const fields = body.fields as string[];
      return fields.includes('customfield_10004');
    }));
    assert.deepEqual(issues.map((issue) => issue.key), ['PMS-1', 'PMS-2']);
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues keeps the configured result limit for ordinary searches', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  let searchCalls = 0;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async () => {
    searchCalls += 1;
    return new Response(
      JSON.stringify({
        startAt: 0,
        maxResults: 1,
        total: 2,
        issues: [
          {
            key: 'PMS-1',
            fields: {
              summary: 'Limited issue',
              status: { name: 'Open' },
              priority: { name: 'Major' },
              assignee: null,
              issuetype: { name: 'Task' },
              updated: '2026-05-23T10:00:00.000Z',
            },
            changelog: { histories: [] },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const issues = await fetchJiraIssues('project = PMS ORDER BY updated DESC');

    assert.equal(searchCalls, 1);
    assert.deepEqual(issues.map((issue) => issue.key), ['PMS-1']);
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues rejects overlapping Jira search pages', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { startAt: number };
    return new Response(
      JSON.stringify({
        startAt: body.startAt,
        maxResults: 1,
        total: 2,
        issues: [
          {
            key: 'PMS-1',
            fields: {
              summary: 'Repeated issue',
              status: { name: 'Open' },
              priority: { name: 'Major' },
              assignee: null,
              issuetype: { name: 'Task' },
              updated: '2026-05-23T10:00:00.000Z',
            },
            changelog: { histories: [] },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchJiraIssues('project = PMS ORDER BY key ASC', { fetchAllPages: true }),
      /Jira search pages overlap at startAt 1/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssues loads changelog when search omits it', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];

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
              key: 'PMS-45',
              fields: {
                summary: 'Critical issue without expanded changelog',
                status: { name: 'Open' },
                priority: { name: 'Critical' },
                assignee: null,
                issuetype: { name: 'Bug' },
                created: '2026-05-01T09:00:00.000Z',
                updated: '2026-06-15T09:00:00.000Z',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        startAt: 0,
        maxResults: 100,
        total: 1,
        values: [
          {
            id: 'priority-1',
            created: '2026-05-20T12:30:00.000Z',
            items: [
              {
                fieldId: 'priority',
                fromString: 'Major',
                toString: 'Critical',
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const issues = await fetchJiraIssues('project = PMS');

    assert.match(calls[1], /\/rest\/api\/2\/issue\/PMS-45\/changelog\?startAt=0/);
    assert.equal(issues[0]?.transitionHistoryComplete, true);
    assert.deepEqual(
      issues[0]?.criticalPriorityAt,
      new Date('2026-05-20T12:30:00.000Z'),
    );
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
