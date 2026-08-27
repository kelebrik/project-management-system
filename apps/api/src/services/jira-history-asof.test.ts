import assert from 'node:assert/strict';
import test from 'node:test';
import type { JiraAnalyticsAggregateDraft } from '@pms/shared';
import type { PrismaClient } from '@prisma/client';

import { evaluateJiraAggregateFromDatabase } from './jira-aggregates.js';
import {
  JIRA_ASOF_MAX_VERSION_ROWS,
  JiraAsOfVersionLimitError,
  jiraAsOfIssueFromRow,
  prepareJiraAsOfIssueBatches,
  type JiraAsOfVersionRow,
} from './jira-history-asof.js';

const asOf = new Date('2026-03-01T00:00:00.000Z');

function definition(patch: Partial<JiraAnalyticsAggregateDraft> = {}): JiraAnalyticsAggregateDraft {
  return {
    name: 'Historical issues',
    description: '',
    source: 'issues',
    metric: 'count',
    groupBy: 'none',
    scope: 'retro',
    filterLogic: 'and',
    filters: [],
    periodMode: 'NONE',
    periodDays: null,
    timeZone: 'Europe/Moscow',
    sortOrder: 0,
    ...patch,
  };
}

function versionRow(patch: Partial<JiraAsOfVersionRow> = {}): JiraAsOfVersionRow {
  return {
    versionId: 'version-100',
    snapshotId: 'snapshot-1',
    jiraIssueId: '10001',
    issueKey: 'CVTE-1',
    issueUrl: 'https://jira.example/browse/CVTE-1',
    summary: 'Observed issue',
    status: 'In Progress',
    priority: 'Major',
    assignee: 'User',
    reporter: 'Reporter',
    issueType: 'Bug',
    resolution: null,
    sprint: null,
    sprintIds: [],
    issueCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
    criticalPriorityAt: null,
    criticalEndPriority: 'Major',
    resolutionAt: null,
    commitCount: 2,
    mergeRequestCount: 1,
    developmentDataAvailable: true,
    transitionHistoryComplete: true,
    issueUpdatedAt: new Date('2026-02-28T23:00:00.000Z'),
    observedAt: new Date('2026-02-28T23:10:00.000Z'),
    retiredAt: null,
    ...patch,
  };
}

function queryText(query: unknown) {
  const value = query as { text?: string; sql?: string };
  return value.text ?? value.sql ?? '';
}

function mockAsOfClient(
  responses: unknown[][],
  gapResponse = { runs: 0n, firstAt: null, lastAt: null, includesAsOf: false },
) {
  const queries: string[] = [];
  const client = {
    $queryRaw: async (query: unknown) => {
      const sql = queryText(query);
      queries.push(sql);
      if (/FROM "JiraSyncRun"/u.test(sql)) {
        return [gapResponse];
      }
      const response = responses.shift();
      if (!response) throw new Error('Unexpected as-of query');
      return response;
    },
  } as unknown as PrismaClient;
  return { client, queries };
}

const options = {
  now: asOf.toISOString(),
  assignee: '',
  page: 1,
  pageSize: 100,
};

test('as-of evaluation counts one Jira ticket once even when 100 versions are eligible', async () => {
  const { client, queries } = mockAsOfClient([
    [{ versionRows: 100n, scopedTickets: 1n, earliestObservationAt: new Date('2026-01-01T00:00:00.000Z') }],
    [{ tickets: 1n, ticketsRetiredAfterAsOf: 0n, stalenessP50: 1 / 6, stalenessP95: 1 / 6, stalenessMax: 1 / 6 }],
    [{ jiraIssueId: '10001' }],
    [versionRow()],
  ]);

  const result = await evaluateJiraAggregateFromDatabase(
    client,
    'project-1',
    definition(),
    options,
    asOf,
  );

  assert.equal(result.value, 1);
  assert.equal(result.totalRecords, 1);
  assert.equal(result.records[0]?.id, 'issue:snapshot-1');
  assert.equal(result.reconstruction?.versionRowsScanned, 100);
  assert.equal(result.reconstruction?.provenance, 'RECONSTRUCTED');
  const sql = queries.join('\n');
  assert.match(sql, /DISTINCT ON \(v\."jiraIssueId"\)/u);
  assert.match(sql, /v\."jiraUpdatedAt" DESC, v\."observedAt" DESC, v\."id" DESC/u);
  assert.match(sql, /v\."provenance" = 'OBSERVED'/u);
  assert.match(sql, /s\."retiredAt" IS NULL OR s\."retiredAt" >/u);
  assert.doesNotMatch(sql, /"payload"|"validationWarnings"/u);
  assert.doesNotMatch(JSON.stringify(result), /payload|validationWarnings/u);
});

test('as-of quality stays unavailable after disabled writes until a clean reconciliation', async () => {
  const { client, queries } = mockAsOfClient([
    [{ versionRows: 1n, scopedTickets: 1n, earliestObservationAt: new Date('2026-01-01T00:00:00.000Z') }],
    [{ tickets: 1n, ticketsRetiredAfterAsOf: 0n, stalenessP50: 0, stalenessP95: 0, stalenessMax: 0 }],
  ], {
    runs: 1n,
    firstAt: new Date('2026-02-01T00:00:00.000Z'),
    lastAt: new Date('2026-02-01T01:00:00.000Z'),
    includesAsOf: true,
  });

  const prepared = await prepareJiraAsOfIssueBatches(client, 'project-1', asOf);
  assert.equal(prepared.reconstruction.quality, 'UNAVAILABLE_HISTORY_WRITE_GAP');
  assert.equal(prepared.reconstruction.historyWriteGap.includesAsOf, true);
  const gapSql = queries.find((sql) => /FROM "JiraSyncRun"/u.test(sql)) ?? '';
  assert.match(gapSql, /fullReconciliationClean/u);
  assert.match(gapSql, /historyGapRecoveryClean/u);
  assert.match(gapSql, /recovered_at IS NULL/u);
});

test('as-of before the first observation is explicit instead of a bare zero', async () => {
  const { client } = mockAsOfClient([
    [{ versionRows: 0n, scopedTickets: 4n, earliestObservationAt: null }],
    [{ tickets: 0n, ticketsRetiredAfterAsOf: 0n, stalenessP50: null, stalenessP95: null, stalenessMax: null }],
    [],
  ]);

  const result = await evaluateJiraAggregateFromDatabase(
    client,
    'project-1',
    definition(),
    options,
    asOf,
  );

  assert.equal(result.value, 0);
  assert.equal(result.reconstruction?.beforeHistoryStart, true);
  assert.equal(result.reconstruction?.ticketsWithoutObservation, 4);
  assert.equal(result.reconstruction?.stalenessHours, null);
});

test('as-of ticket pagination emits an indexable cursor clause only after page one', async () => {
  const firstPageIds = Array.from({ length: 250 }, (_, index) => ({
    jiraIssueId: String(index + 1).padStart(5, '0'),
  }));
  const { client, queries } = mockAsOfClient([
    [{ versionRows: 251n, scopedTickets: 251n, earliestObservationAt: new Date('2026-01-01T00:00:00.000Z') }],
    [{ tickets: 251n, ticketsRetiredAfterAsOf: 0n, stalenessP50: 0, stalenessP95: 0, stalenessMax: 0 }],
    firstPageIds,
    [versionRow({ jiraIssueId: '00250', issueKey: 'CVTE-250' })],
    [{ jiraIssueId: '00251' }],
    [versionRow({ jiraIssueId: '00251', issueKey: 'CVTE-251' })],
  ]);

  const prepared = await prepareJiraAsOfIssueBatches(client, 'project-1', asOf);
  const issues = [];
  for await (const batch of prepared.batches) issues.push(...batch);

  assert.deepEqual(issues.map((issue) => issue.issueKey), ['CVTE-250', 'CVTE-251']);
  const candidateQueries = queries.filter((sql) => /SELECT DISTINCT v\."jiraIssueId"/u.test(sql));
  assert.equal(candidateQueries.length, 2);
  assert.doesNotMatch(candidateQueries[0]!, /::text IS NULL OR v\."jiraIssueId" >/u);
  assert.doesNotMatch(candidateQueries[0]!, /v\."jiraIssueId" >/u);
  assert.match(candidateQueries[1]!, /v\."jiraIssueId" >/u);
});

test('as-of Critical/Blocker duration uses the observed candidate and selected instant', async () => {
  const criticalAsOf = new Date('2026-01-03T00:00:00.000Z');
  const { client } = mockAsOfClient([
    [{ versionRows: 2n, scopedTickets: 1n, earliestObservationAt: new Date('2026-01-01T00:00:00.000Z') }],
    [{ tickets: 1n, ticketsRetiredAfterAsOf: 0n, stalenessP50: 0, stalenessP95: 0, stalenessMax: 0 }],
    [{ jiraIssueId: '10001' }],
    [versionRow({
      priority: 'Blocker',
      criticalPriorityAt: new Date('2026-01-01T00:00:00.000Z'),
      criticalEndPriority: 'Blocker',
      issueUpdatedAt: new Date('2026-01-02T00:00:00.000Z'),
      observedAt: new Date('2026-01-02T00:00:00.000Z'),
    })],
  ]);

  const result = await evaluateJiraAggregateFromDatabase(
    client,
    'project-1',
    definition({ source: 'criticalBugs', metric: 'averageDuration' }),
    { ...options, now: criticalAsOf.toISOString() },
    criticalAsOf,
  );

  assert.equal(result.totalRecords, 1);
  assert.equal(result.value, 48);
});

test('as-of mapper preserves ticket identity and derives SLA tracking from typed fields', () => {
  const issue = jiraAsOfIssueFromRow(versionRow({
    issueType: 'Defect',
    criticalPriorityAt: new Date('2026-01-01T00:00:00.000Z'),
    criticalEndPriority: 'Critical',
  }));
  assert.equal(issue.id, 'snapshot-1');
  assert.equal(issue.criticalSlaTracked, true);
  assert.equal(issue.sprintCount, 0);
  assert.deepEqual(issue.statusTransitions, []);
  assert.deepEqual(issue.developmentActivities, []);
});

test('as-of version limit fails before winner or ticket queries', async () => {
  const { client, queries } = mockAsOfClient([
    [{
      versionRows: BigInt(JIRA_ASOF_MAX_VERSION_ROWS + 1),
      scopedTickets: 1n,
      earliestObservationAt: new Date('2026-01-01T00:00:00.000Z'),
    }],
  ]);
  await assert.rejects(
    prepareJiraAsOfIssueBatches(client, 'project-1', asOf),
    JiraAsOfVersionLimitError,
  );
  assert.equal(queries.length, 1);
  assert.match(queries[0]!, /WITH eligible AS MATERIALIZED/u);
  assert.match(queries[0]!, /v\."observedAt" <=/u);
  assert.match(queries[0]!, /v\."provenance" = 'OBSERVED'/u);
  assert.match(queries[0]!, /LIMIT/u);
  assert.doesNotMatch(queries[0]!, /COUNT\(\*\) FILTER/u);
});

test('as-of evaluation reasserts the ticket cap while draining batches', async () => {
  const { client } = mockAsOfClient([
    [{ versionRows: 5_001n, scopedTickets: 5_000n, earliestObservationAt: new Date('2026-01-01T00:00:00.000Z') }],
    [{ tickets: 5_000n, ticketsRetiredAfterAsOf: 0n, stalenessP50: 0, stalenessP95: 0, stalenessMax: 0 }],
    Array.from({ length: 250 }, (_, index) => ({ jiraIssueId: String(index + 1) })),
    Array.from({ length: 5_001 }, (_, index) => versionRow({
      snapshotId: `snapshot-${index}`,
      jiraIssueId: String(index + 1),
      issueKey: `CVTE-${index + 1}`,
    })),
  ]);

  await assert.rejects(
    evaluateJiraAggregateFromDatabase(client, 'project-1', definition(), options, asOf),
    /JIRA_AGGREGATE_POPULATION_LIMIT/u,
  );
});
