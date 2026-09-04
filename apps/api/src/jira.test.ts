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

test('remote-link hydration preserves the fatal synchronization deadline', async () => {
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      fetchJiraRemoteLinks(
        'https://jira.example',
        'CVTE-1',
        { Authorization: 'Bearer test' },
        Date.now() - 1,
      ),
      JiraSyncDeadlineError,
    );
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('jiraJqlWithLabelScope preserves boolean precedence and top-level ordering', () => {
  assert.equal(
    jiraJqlWithLabelScope(
      'project = CVTE OR project = SPS ORDER BY created DESC',
      'cvte968',
    ),
    '(project = CVTE OR project = SPS) AND labels = "cvte968" ORDER BY created DESC',
  );
  assert.equal(
    jiraJqlWithLabelScope('summary ~ "order by device"', 'cvte968'),
    '(summary ~ "order by device") AND labels = "cvte968"',
  );
  assert.throws(
    () => jiraJqlWithLabelScope('project = CVTE', 'bad label'),
    /не должен содержать/,
  );
  assert.throws(
    () => jiraJqlWithLabelScope('(project = CVTE', 'cvte968'),
    /незакрытая строка или скобка/,
  );
});

test('jiraJqlWithLabelScope normalizes multiple labels as an OR scope', () => {
  assert.equal(
    jiraJqlWithLabelScope('project = CVTE ORDER BY created DESC', ' cvte968, cvte950, cvte968 '),
    '(project = CVTE) AND labels IN ("cvte950", "cvte968") ORDER BY created DESC',
  );
  assert.throws(
    () => jiraJqlWithLabelScope('project = CVTE', 'cvte968,,cvte950'),
    /без пустых значений/,
  );
});

test('jiraJqlWithAnalyticsScope filters by epic key without losing ordering', () => {
  assert.equal(
    jiraJqlWithAnalyticsScope('statusCategory != Done ORDER BY key ASC', {
      type: 'EPIC',
      value: ' cvte-1778 ',
    }),
    '(statusCategory != Done) AND ("Epic Link" = "CVTE-1778" OR key = "CVTE-1778") ORDER BY key ASC',
  );
  assert.throws(
    () => jiraJqlWithAnalyticsScope('ORDER BY key ASC', {
      type: 'EPIC',
      value: 'not-an-epic',
    }),
    /корректный код эпика/,
  );
});

test('jiraJqlWithIssueKeys keeps discovered epic subtasks in a bounded query', () => {
  assert.equal(
    jiraJqlWithIssueKeys(
      'statusCategory != Done ORDER BY updated DESC',
      ['cvte-1778', 'cvte-1800', 'cvte-1801'],
    ),
    '(statusCategory != Done) AND issuekey IN ("CVTE-1778", "CVTE-1800", "CVTE-1801") ORDER BY updated DESC',
  );
  assert.throws(
    () => jiraJqlWithIssueKeys('statusCategory != Done', ['not-an-issue']),
    /Некорректный ключ тикета Jira/,
  );
});

test('Jira request guard allows only known read and authentication operations', () => {
  const allowedRequests: Array<[string, RequestInit?]> = [
    ['https://jira.example/rest/api/2/filter/123'],
    ['https://jira.example/rest/api/3/myself'],
    ['https://jira.example/rest/api/2/issue/PMS-42?fields=updated'],
    ['https://jira.example/rest/api/3/issue/PMS-42/changelog?startAt=0'],
    ['https://jira.example/rest/api/2/issue/PMS-42/comment?startAt=0'],
    ['https://jira.example/rest/api/2/issue/PMS-42/worklog?startAt=0'],
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

test('Jira request capture keeps full paths while durable summaries stay bounded', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 200 });

  try {
    const captured = await captureJiraReadOnlyRequestMetrics(() =>
      captureJiraReadOnlyRequestSummary(() =>
        fetchJiraReadOnly('https://jira.example/rest/api/2/issue/CVTE-1778/changelog')));
    assert.equal(captured.requests[0]?.path, '/rest/api/2/issue/CVTE-1778/changelog');
    assert.deepEqual(captured.result.summary.byRoute, { changelog: 1 });
    assert.doesNotMatch(JSON.stringify(captured.result.summary), /CVTE-1778/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Jira request summary remains available when the captured operation fails', async () => {
  const originalFetch = globalThis.fetch;
  const failure = new Error('network unavailable');
  globalThis.fetch = async () => {
    throw failure;
  };

  try {
    await assert.rejects(
      captureJiraReadOnlyRequestSummary(() =>
        fetchJiraReadOnly('https://jira.example/rest/api/2/issue/PMS-42')),
      failure,
    );
    const summary = jiraReadOnlyRequestSummaryForError(failure);
    assert.equal(summary?.count, 1);
    assert.deepEqual(summary?.byRoute, { issue: 1 });
    assert.deepEqual(summary?.byStatusClass, { transport: 1 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Jira modules have no direct fetch calls outside the read-only wrapper', async () => {
  const source = (
    await Promise.all(
      [
        './jira.ts',
        './jira-model.ts',
        './jira-client.ts',
        './jira-data.ts',
        './jira-search.ts',
        './jira-changelog.ts',
      ].map((fileName) => readFile(new URL(fileName, import.meta.url), 'utf8')),
    )
  ).join('\n');
  const directFetchCalls = source.match(/\bfetch\s*\(/g) ?? [];

  assert.equal(directFetchCalls.length, 1);
  assert.match(
    source,
    /export async function fetchJiraReadOnly[\s\S]*?await fetch\(url, \{ \.\.\.init, redirect: 'manual' \}\);/,
  );
});

test('capacity sampling asks for all fields except attachments', async () => {
  const source = await readFile(new URL('./jira-data.ts', import.meta.url), 'utf8');

  assert.match(source, /options\.capacitySample \|\| options\.fullHistory[\s\S]*\['\*all', '-attachment'\]/);
  assert.match(source, /function containsJiraAttachmentMetadata/);
  assert.match(source, /adfType === 'media'/);
});

test('capacity sanitizer audits its output and strips nested attachment metadata', () => {
  const clean = sanitizeJiraCapacityPayload({
    fields: { custom: { content: [{ type: 'paragraph', text: 'kept' }] } },
  });
  assert.equal(clean.attachmentExcluded, true);
  assert.equal(clean.attachmentReferencesStripped, 0);

  const dirty = sanitizeJiraCapacityPayload({
    fields: {
      Attachments: [{ id: 'structured-attachment' }],
      description: {
        type: 'doc',
        content: [{
          type: 'mediaGroup',
          content: [{ type: 'media', attrs: { id: 'adf-attachment', secret: 'must-go' } }],
        }],
      },
    },
    changelog: [{ field: 'Attachment', to: 'history-attachment' }],
  });
  assert.equal(dirty.attachmentExcluded, true);
  assert.equal(dirty.attachmentReferencesStripped, 3);
  assert.equal(JSON.stringify(dirty.payload).includes('must-go'), false);
  assert.equal(JSON.stringify(dirty.payload).includes('history-attachment'), false);
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
              labels: ['cvte968', 'release'],
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
                    {
                      field: 'Labels',
                      fieldId: 'labels',
                      fromString: 'cvte968',
                      toString: 'release cvte968',
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
    assert.ok(searchBody.fields.includes('labels'));
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
        labels: ['cvte968', 'release'],
        sprintIds: [],
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
        labelChanges: [
          {
            key: '2001:1',
            changedAt: new Date('2026-05-21T11:00:00.000+0300'),
            fromLabels: ['cvte968'],
            toLabels: ['cvte968', 'release'],
            actor: 'Petr Ivanov',
          },
        ],
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
