import assert from 'node:assert/strict';
import test from 'node:test';

import type { JiraIssue } from '../jira.js';
import {
  syncJiraIssueAnalytics,
  type JiraAnalyticsActivityInput,
  type JiraAnalyticsSnapshotState,
  type JiraAnalyticsSyncStore,
  type JiraAnalyticsTransitionInput,
} from './jira-analytics-sync.js';

function jiraIssue(patch: Partial<JiraIssue> = {}): JiraIssue {
  return {
    jiraId: '1001',
    key: 'TV-101',
    url: 'https://jira.example/browse/TV-101',
    summary: 'Analytics sync',
    status: 'In Progress',
    priority: 'High',
    assignee: 'Ivan',
    reporter: 'Petr',
    issueType: 'Task',
    resolution: null,
    sprint: null,
    createdAt: new Date('2026-08-01T09:00:00Z'),
    updatedAt: new Date('2026-08-18T10:00:00Z'),
    transitions: [],
    transitionHistoryComplete: false,
    development: {
      commitCount: 0,
      mergeRequestCount: 0,
      updatedAt: null,
      available: false,
    },
    ...patch,
  };
}

function memoryStore(seed: JiraAnalyticsSnapshotState | null) {
  const state: {
    snapshot: JiraAnalyticsSnapshotState | null;
    failNextUpsert: boolean;
  } = { snapshot: seed, failNextUpsert: false };
  const transitions = new Map<string, JiraAnalyticsTransitionInput>();
  const activities = new Map<string, JiraAnalyticsActivityInput>();
  const store: JiraAnalyticsSyncStore = {
    async findSnapshot() {
      return state.snapshot ? { ...state.snapshot } : null;
    },
    async deleteSyntheticTransitions(snapshotId) {
      for (const [key, transition] of transitions) {
        if (transition.snapshotId === snapshotId && transition.transitionKey.startsWith('sync:')) {
          transitions.delete(key);
        }
      }
    },
    async createTransitions(values) {
      for (const transition of values) {
        const key = `${transition.snapshotId}:${transition.transitionKey}`;
        if (!transitions.has(key)) transitions.set(key, transition);
      }
    },
    async createDevelopmentActivity(activity) {
      const key = `${activity.snapshotId}:${activity.activityKey}`;
      if (!activities.has(key)) activities.set(key, activity);
    },
    async upsertSnapshot(_projectId, issue) {
      if (state.failNextUpsert) {
        state.failNextUpsert = false;
        throw new Error('simulated snapshot failure');
      }
      state.snapshot = {
        id: state.snapshot?.id ?? 'snapshot-1',
        status: issue.status,
        commitCount: issue.development.available
          ? issue.development.commitCount
          : (state.snapshot?.commitCount ?? 0),
        mergeRequestCount: issue.development.available
          ? issue.development.mergeRequestCount
          : (state.snapshot?.mergeRequestCount ?? 0),
        developmentBaselineCaptured:
          issue.development.available ||
          (state.snapshot?.developmentBaselineCaptured ?? false),
      };
      return { id: state.snapshot.id };
    },
  };
  return { activities, state, store, transitions };
}

const existingSnapshot = (): JiraAnalyticsSnapshotState => ({
  id: 'snapshot-1',
  status: 'Open',
  commitCount: 0,
  mergeRequestCount: 0,
  developmentBaselineCaptured: false,
});

test('repeated Jira sync does not duplicate transitions or development activity', async () => {
  const memory = memoryStore(existingSnapshot());
  const issue = jiraIssue({
    transitions: [
      {
        key: 'history-1:0',
        fromStatus: 'Open',
        toStatus: 'In Progress',
        transitionedAt: new Date('2026-08-17T10:00:00Z'),
        actor: 'Ivan',
      },
    ],
    transitionHistoryComplete: true,
    development: {
      commitCount: 3,
      mergeRequestCount: 1,
      updatedAt: new Date('2026-08-18T09:00:00Z'),
      available: true,
    },
  });

  await syncJiraIssueAnalytics(memory.store, 'project-1', issue, new Date('2026-08-19T10:00:00Z'));
  await syncJiraIssueAnalytics(memory.store, 'project-1', issue, new Date('2026-08-19T11:00:00Z'));

  assert.equal(memory.transitions.size, 1);
  assert.equal(memory.activities.size, 1);
  assert.equal([...memory.activities.values()][0]?.isBaseline, true);
});

test('status change without changelog creates one stable synthetic transition', async () => {
  const memory = memoryStore({
    ...existingSnapshot(),
    developmentBaselineCaptured: true,
  });
  const issue = jiraIssue();

  await syncJiraIssueAnalytics(memory.store, 'project-1', issue, new Date('2026-08-19T10:00:00Z'));
  await syncJiraIssueAnalytics(memory.store, 'project-1', issue, new Date('2026-08-19T11:00:00Z'));

  assert.equal(memory.transitions.size, 1);
  const transition = [...memory.transitions.values()][0];
  assert.match(transition?.transitionKey ?? '', /^sync:/);
  assert.equal(transition?.fromStatus, 'Open');
  assert.equal(transition?.toStatus, 'In Progress');
});

test('complete changelog removes synthetic transitions and stores Jira history', async () => {
  const memory = memoryStore({
    ...existingSnapshot(),
    status: 'In Progress',
    developmentBaselineCaptured: true,
  });
  memory.transitions.set('snapshot-1:sync:old', {
    snapshotId: 'snapshot-1',
    transitionKey: 'sync:old',
    fromStatus: 'Open',
    toStatus: 'In Progress',
    transitionedAt: new Date('2026-08-17T10:00:00Z'),
    actor: null,
  });
  const issue = jiraIssue({
    status: 'Done',
    transitionHistoryComplete: true,
    transitions: [
      {
        key: 'history-2:0',
        fromStatus: 'In Progress',
        toStatus: 'Done',
        transitionedAt: new Date('2026-08-18T10:00:00Z'),
        actor: 'Ivan',
      },
    ],
  });

  await syncJiraIssueAnalytics(memory.store, 'project-1', issue, new Date('2026-08-19T10:00:00Z'));

  assert.deepEqual(
    [...memory.transitions.values()].map((transition) => transition.transitionKey),
    ['history-2:0'],
  );
});

test('retry after partial failure reuses the stable development activity key', async () => {
  const memory = memoryStore(existingSnapshot());
  memory.state.failNextUpsert = true;
  const issue = jiraIssue({
    status: 'Open',
    development: {
      commitCount: 2,
      mergeRequestCount: 1,
      updatedAt: null,
      available: true,
    },
  });

  await assert.rejects(
    () => syncJiraIssueAnalytics(memory.store, 'project-1', issue, new Date('2026-08-19T10:00:00Z')),
    /simulated snapshot failure/,
  );
  await syncJiraIssueAnalytics(memory.store, 'project-1', issue, new Date('2026-08-19T11:00:00Z'));

  assert.equal(memory.activities.size, 1);
  assert.equal([...memory.activities.values()][0]?.activityKey, 'counts:2:1');
  assert.equal([...memory.activities.values()][0]?.isBaseline, true);
});
