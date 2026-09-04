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

test('capacity sampling measures paged content and verifies attachment exclusion', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  let searchBody: Record<string, unknown> | null = null;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/remotelink')) {
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    searchBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      startAt: 0,
      maxResults: 10,
      total: 123,
      issues: [{
        id: '10042',
        key: 'PMS-42',
        fields: {
          summary: 'Capacity fixture',
          status: { name: 'Open' },
          priority: { name: 'Major' },
          assignee: null,
          issuetype: { name: 'Bug' },
          created: '2026-05-20T09:00:00.000Z',
          updated: '2026-05-23T10:00:00.000Z',
          description: {
            type: 'doc',
            content: [{
              type: 'mediaSingle',
              content: [{
                type: 'media',
                attrs: { id: 'must-not-be-measured', payload: 'x'.repeat(100_000) },
              }],
            }],
          },
          comment: { total: 3, comments: [{ body: 'one observed comment' }] },
          worklog: { total: 1, worklogs: [{ timeSpentSeconds: 60 }] },
        },
        changelog: {
          startAt: 0,
          maxResults: 100,
          total: 1,
          histories: [{
            id: 'attachment-history',
            created: '2026-05-21T09:00:00.000Z',
            items: [{ field: 'Attachment', toString: 'old-file.zip' }],
          }],
        },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const result = await fetchJiraIssuesWithMeta('labels = "cvte968"', {
      capacitySample: true,
      includeAnalyticsFields: true,
      pageSize: 10,
    });

    assert.equal(result.total, 123);
    assert.equal(searchBody?.maxResults, 10);
    assert.deepEqual((searchBody?.fields as string[]).slice(0, 2), ['*all', '-attachment']);
    assert.equal(result.capacityMeasurements?.[0]?.comments, 3);
    assert.equal(result.capacityMeasurements?.[0]?.commentsComplete, false);
    assert.equal(result.capacityMeasurements?.[0]?.attachmentExcluded, true);
    assert.equal(result.capacityMeasurements?.[0]?.attachmentFieldExclusionHonored, true);
    assert.equal(result.capacityMeasurements?.[0]?.attachmentReferencesStripped, 2);
    assert.ok((result.capacityMeasurements?.[0]?.currentJsonBytes ?? 0) < 50_000);
    assert.ok(
      (result.capacityMeasurements?.[0]?.estimatedFullJsonBytes ?? 0) >
      (result.capacityMeasurements?.[0]?.currentJsonBytes ?? 0),
    );
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});
test('stage A1 fetch hydrates and sanitizes a complete immutable history document', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  let searchBody: Record<string, unknown> | null = null;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/comment?')) {
      return new Response(JSON.stringify({
        startAt: 0,
        maxResults: 100,
        total: 2,
        comments: [
          { id: '2', body: 'second', created: '2026-08-21T12:00:00+0300' },
          { id: '1', body: 'first', created: '2026-08-21T11:00:00+0300' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/remotelink')) {
      return new Response(JSON.stringify([{
        id: 9,
        self: 'https://jira.example/rest/api/2/issue/100/remotelink/9',
        object: { title: 'Commit - CVTE-1', url: 'https://git.example/commit/1' },
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    searchBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      startAt: 0,
      maxResults: 20,
      total: 1,
      names: { customfield_10008: 'Epic Link' },
      issues: [{
        id: '100',
        key: 'CVTE-1',
        self: 'https://jira.example/rest/api/2/issue/100',
        fields: {
          summary: 'A1 history',
          status: { name: 'In Progress', statusCategory: { name: 'In Progress' } },
          priority: { name: 'Major' },
          assignee: null,
          reporter: { displayName: 'Reporter' },
          issuetype: { name: 'Task' },
          resolution: null,
          resolutiondate: null,
          created: '2026-08-20T09:00:00+0300',
          updated: '2026-08-21T10:00:00+0300',
          labels: ['cvte968'],
          customfield_10008: 'CVTE-EPIC-1',
          customfield_10004: ['Sprint[id=9,state=ACTIVE,name=Sprint 9]'],
          attachment: [{ id: 'a-1', filename: 'removed.bin' }],
          description: { type: 'doc', content: [{ type: 'media', attrs: { id: 'a-1' } }] },
          comment: { startAt: 0, maxResults: 1, total: 2, comments: [{ id: '1' }] },
          worklog: {
            startAt: 0,
            maxResults: 1,
            total: 1,
            worklogs: [{ id: '1', started: '2026-08-21T09:00:00Z' }],
          },
        },
        changelog: { startAt: 0, maxResults: 100, total: 0, histories: [] },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const result = await fetchJiraIssuesWithMeta('issuekey = CVTE-1', {
      includeAnalyticsFields: true,
      includeChangelog: true,
      includeRemoteDevelopment: true,
      includeHistoryDocument: true,
      pageSize: 20,
    });
    const issue = result.issues[0];
    const document = JSON.stringify(issue?.history?.document);

    assert.deepEqual((searchBody?.fields as string[]).slice(0, 2), ['*all', '-attachment']);
    assert.ok(calls.some((url) => url.includes('/comment?')));
    assert.equal(calls.some((url) => url.includes('/worklog?')), false);
    assert.equal(issue?.history?.changelogComplete, true);
    assert.equal(issue?.history?.commentsComplete, true);
    assert.equal(issue?.history?.worklogsComplete, true);
    assert.equal(issue?.history?.remoteLinksComplete, true);
    assert.equal(issue?.history?.attachmentReferencesStripped, 2);
    assert.equal(document.includes('removed.bin'), false);
    assert.equal(document.includes('"media"'), false);
    assert.equal(document.includes('"self"'), false);
    assert.equal(document.includes('second'), true);
    assert.equal(issue?.statusCategory, 'In Progress');
    assert.equal(issue?.epicKey, 'CVTE-EPIC-1');
    assert.deepEqual(issue?.labels, ['cvte968']);
    assert.deepEqual(issue?.sprintIds, ['9']);
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

test('fetchJiraIssueKeys keeps label discovery lightweight on every page', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    assert.match(url, /\/rest\/api\/2\/search$/);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, body });
    const startAt = Number(body.startAt);
    return new Response(
      JSON.stringify({
        startAt,
        maxResults: 1,
        total: 2,
        issues: [{ key: startAt === 0 ? 'cvte-1' : 'SPS-2' }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const issueKeys = await fetchJiraIssueKeys(
      'project = CVTE OR project = SPS ORDER BY created DESC',
      {
        fetchAllPages: true,
        labelScope: 'cvte968',
        pageSize: 1,
      },
    );

    assert.deepEqual(issueKeys, ['CVTE-1', 'SPS-2']);
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.deepEqual(call.body.fields, []);
      assert.equal(Object.hasOwn(call.body, 'expand'), false);
      assert.equal(
        call.body.jql,
        '(project = CVTE OR project = SPS) AND labels = "cvte968" ORDER BY created DESC',
      );
    }
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssueKeys scopes a saved filter after resolving its JQL', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  let searchBody: Record<string, unknown> | null = null;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/rest/api/2/filter/123')) {
      return new Response(
        JSON.stringify({ jql: 'project = CVTE ORDER BY priority DESC' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    searchBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({ startAt: 0, maxResults: 100, total: 1, issues: [{ key: 'CVTE-1' }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    assert.deepEqual(
      await fetchJiraIssueKeys('filter = 123', { labelScope: 'cvte968' }),
      ['CVTE-1'],
    );
    assert.equal(
      searchBody?.jql,
      '(project = CVTE) AND labels = "cvte968" ORDER BY priority DESC',
    );
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssueKeys reports invalid epic JQL without retrying authentication', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  let calls = 0;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ errorMessages: ["Field 'Epic Link' does not exist"] }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    await assert.rejects(
      fetchJiraIssueKeys('ORDER BY key ASC', {
        analyticsScope: { type: 'EPIC', value: 'CVTE-1778' },
      }),
      /Jira request failed: 400.*Epic Link/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssueKeys fails closed when discovery pages overlap', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const startAt = Number(body.startAt);
    return new Response(
      JSON.stringify({
        startAt,
        maxResults: 1,
        total: 2,
        issues: [{ key: 'CVTE-1' }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchJiraIssueKeys('ORDER BY key ASC', {
        fetchAllPages: true,
        labelScope: 'cvte968',
        pageSize: 1,
      }),
      /pages overlap/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssueKeys restarts one inconsistent discovery pass', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  let calls = 0;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const startAt = Number(body.startAt);
    const firstPass = calls <= 2;
    return new Response(
      JSON.stringify({
        startAt,
        maxResults: 1,
        total: firstPass && startAt === 1 ? 3 : 2,
        issues: [{ key: startAt === 0 ? 'CVTE-1' : 'SPS-2' }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const issueKeys = await fetchJiraIssueKeys('ORDER BY key ASC', {
      fetchAllPages: true,
      pageSize: 1,
    });
    assert.deepEqual(issueKeys, ['CVTE-1', 'SPS-2']);
    assert.equal(calls, 4);
  } finally {
    globalThis.fetch = previousFetch;
    restoreJiraEnv(previousEnv);
  }
});

test('fetchJiraIssueKeys rejects an unexpectedly empty discovery restart', async () => {
  const previousEnv = snapshotJiraEnv();
  const previousFetch = globalThis.fetch;
  let calls = 0;

  process.env.JIRA_BASE_URL = 'https://jira.example';
  process.env.JIRA_EMAIL = 'bot@example.com';
  process.env.JIRA_API_TOKEN = 'secret';
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const startAt = Number(body.startAt);
    if (calls >= 2) {
      return new Response(
        JSON.stringify({ startAt, maxResults: 1, total: 0, issues: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({
        startAt: 0,
        maxResults: 1,
        total: 2,
        issues: [{ key: 'CVTE-1' }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchJiraIssueKeys('ORDER BY key ASC', {
        fetchAllPages: true,
        pageSize: 1,
      }),
      /unexpectedly returned an empty scope/,
    );
    assert.equal(calls, 3);
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
