import assert from 'node:assert/strict';
import test from 'node:test';

import { JiraSyncRunKind, JiraSyncRunStatus } from '@prisma/client';

import type { JiraIssue } from '../jira.js';
import {
  jiraCurrentFreshnessFromState,
  jiraCurrentProjectionChanged,
  jiraCurrentRefreshPolicy,
  jiraCurrentSlaState,
  latestJiraProjectionRefreshAt,
} from './jira-current-refresh.js';

const now = new Date('2026-09-03T09:00:00.000Z');
const policy = jiraCurrentRefreshPolicy({
  JIRA_CURRENT_REFRESH_TTL_MS: '300000',
  JIRA_CURRENT_REFRESH_RETRY_MS: '60000',
});

test('current Jira freshness is fresh inside TTL and stale outside it', () => {
  const common = {
    configured: true,
    refreshAllowed: true,
    activeRun: null,
    latestCurrentRun: null,
  };
  assert.equal(jiraCurrentFreshnessFromState({
    ...common,
    refreshedAt: new Date(now.getTime() - 299_000),
  }, now, policy).state, 'FRESH');
  assert.equal(jiraCurrentFreshnessFromState({
    ...common,
    refreshedAt: new Date(now.getTime() - 301_000),
  }, now, policy).state, 'STALE');
});

test('effective projection freshness uses the newer lightweight or full refresh', () => {
  const older = new Date('2026-09-03T08:00:00.000Z');
  const newer = new Date('2026-09-03T09:00:00.000Z');
  assert.equal(latestJiraProjectionRefreshAt(older, newer), newer);
  assert.equal(latestJiraProjectionRefreshAt(newer, older), newer);
  assert.equal(latestJiraProjectionRefreshAt(null, newer), newer);
  assert.equal(latestJiraProjectionRefreshAt(older, null), older);
});

test('an active durable run coalesces current refresh requests', () => {
  const freshness = jiraCurrentFreshnessFromState({
    configured: true,
    refreshAllowed: true,
    refreshedAt: null,
    activeRun: {
      id: 'run-1',
      kind: JiraSyncRunKind.CURRENT,
      status: JiraSyncRunStatus.RUNNING,
      finishedAt: null,
    },
    latestCurrentRun: null,
  }, now, policy);
  assert.equal(freshness.state, 'REFRESHING');
  assert.equal(freshness.runId, 'run-1');
  assert.equal(freshness.pollAfterMs, 3_000);
});

test('a long explicit Jira run is polled at a low frequency', () => {
  const freshness = jiraCurrentFreshnessFromState({
    configured: true,
    refreshAllowed: true,
    refreshedAt: new Date(now.getTime() - 600_000),
    activeRun: {
      id: 'run-backfill',
      kind: JiraSyncRunKind.BACKFILL,
      status: JiraSyncRunStatus.RUNNING,
      finishedAt: null,
    },
    latestCurrentRun: null,
  }, now, policy);
  assert.equal(freshness.state, 'REFRESHING');
  assert.equal(freshness.pollAfterMs, 60_000);
});

test('a configured scope without a completed full sync does not trigger current refresh', () => {
  const freshness = jiraCurrentFreshnessFromState({
    configured: false,
    refreshAllowed: false,
    refreshedAt: null,
    activeRun: null,
    latestCurrentRun: null,
  }, now, policy);
  assert.equal(freshness.state, 'NOT_CONFIGURED');
  assert.equal(freshness.pollAfterMs, null);
  assert.equal(freshness.refreshAllowed, false);
});

test('failed current refresh is retried only after its cooldown', () => {
  const failed = {
    id: 'run-failed',
    status: JiraSyncRunStatus.FAILED,
    finishedAt: new Date(now.getTime() - 30_000),
  };
  const freshness = jiraCurrentFreshnessFromState({
    configured: true,
    refreshAllowed: true,
    refreshedAt: new Date(now.getTime() - 600_000),
    activeRun: null,
    latestCurrentRun: failed,
  }, now, policy);
  assert.equal(freshness.state, 'ERROR');
  assert.equal(freshness.pollAfterMs, 30_000);
});

test('empty current scope preserves the projection and is retried only after cooldown', () => {
  const freshness = jiraCurrentFreshnessFromState({
    configured: true,
    refreshAllowed: true,
    refreshedAt: new Date(now.getTime() - 600_000),
    activeRun: null,
    latestCurrentRun: {
      id: 'run-empty',
      status: JiraSyncRunStatus.SUCCEEDED,
      finishedAt: new Date(now.getTime() - 30_000),
      emptyScope: true,
    },
  }, now, policy);
  assert.equal(freshness.state, 'ERROR');
  assert.equal(freshness.pollAfterMs, 30_000);
});

function issue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    jiraId: '10001',
    key: 'CVTE-1',
    url: 'https://tasks.sberdevices.ru/browse/CVTE-1',
    summary: 'Issue',
    status: 'Done',
    priority: 'Critical',
    assignee: null,
    reporter: null,
    issueType: 'Bug',
    labels: ['cvte968'],
    resolution: 'Resolved',
    resolutionAt: new Date('2026-09-02T10:00:00.000Z'),
    sprint: null,
    sprintAvailable: true,
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    criticalPriorityAt: null,
    criticalEndPriority: null,
    updatedAt: new Date('2026-09-02T10:00:00.000Z'),
    transitions: [],
    transitionHistoryComplete: false,
    labelChanges: [],
    development: {
      commitCount: 0,
      mergeRequestCount: 0,
      updatedAt: null,
      available: false,
    },
    ...overrides,
  };
}

test('current projection comparison catches resolution changes without history', () => {
  const current = issue();
  const existing = {
    id: 'snapshot-1',
    jiraId: current.jiraId,
    issueUrl: current.url,
    summary: current.summary,
    status: 'Ready for QA',
    priority: current.priority,
    assignee: current.assignee,
    reporter: current.reporter,
    issueType: current.issueType,
    labels: current.labels,
    resolution: null,
    sprint: current.sprint,
    issueCreatedAt: current.createdAt,
    resolutionAt: null,
    updatedAt: new Date('2026-08-28T10:00:00.000Z'),
    retiredAt: null,
    projectionUnversionedSince: null,
    criticalPriorityAt: new Date('2026-08-01T10:00:00.000Z'),
    criticalEndPriority: 'Critical',
    criticalSlaTracked: true,
  };
  assert.equal(jiraCurrentProjectionChanged(existing, current), true);
  assert.equal(jiraCurrentProjectionChanged({
    ...existing,
    status: current.status,
    resolution: current.resolution,
    resolutionAt: current.resolutionAt,
    updatedAt: current.updatedAt,
  }, current), false);
});

test('current projection comparison treats Jira labels as an unordered set', () => {
  const current = issue({ labels: ['cvte968', 'mp'] });
  assert.equal(jiraCurrentProjectionChanged({
    id: 'snapshot-1',
    jiraId: current.jiraId,
    issueUrl: current.url,
    summary: current.summary,
    status: current.status,
    priority: current.priority,
    assignee: current.assignee,
    reporter: current.reporter,
    issueType: current.issueType,
    labels: ['mp', 'cvte968'],
    resolution: current.resolution,
    sprint: current.sprint,
    issueCreatedAt: current.createdAt,
    resolutionAt: current.resolutionAt,
    updatedAt: current.updatedAt,
    retiredAt: null,
    projectionUnversionedSince: null,
    criticalPriorityAt: null,
    criticalEndPriority: null,
    criticalSlaTracked: false,
  }, current), false);
});

test('current refresh updates only SLA state that is knowable without history', () => {
  const unresolvedCritical = issue({ resolution: null, resolutionAt: null });
  const knownStart = {
    criticalPriorityAt: new Date('2026-08-01T10:00:00.000Z'),
    criticalEndPriority: 'Critical',
    criticalSlaTracked: true,
  };
  assert.deepEqual(jiraCurrentSlaState(knownStart, {
    ...unresolvedCritical,
    priority: 'Major',
  }), {
    criticalEndPriority: 'Major',
    criticalSlaTracked: false,
  });
  assert.deepEqual(jiraCurrentSlaState(knownStart, unresolvedCritical), {
    criticalEndPriority: 'Critical',
    criticalSlaTracked: true,
  });
  assert.deepEqual(jiraCurrentSlaState(knownStart, issue({ priority: 'Major' })), {
    criticalEndPriority: 'Critical',
    criticalSlaTracked: true,
  });
  assert.deepEqual(jiraCurrentSlaState(null, unresolvedCritical), {
    criticalEndPriority: 'Critical',
    criticalSlaTracked: false,
  });
});
