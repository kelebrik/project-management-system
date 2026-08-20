import assert from 'node:assert/strict';
import test from 'node:test';
import { isJiraBugIssueType } from '@pms/shared';

import type { JiraIssue } from '../jira.js';
import {
  acquireJiraAnalyticsSyncLock,
  criticalEndPriorityUpdate,
  criticalPriorityAtUpdate,
  finalizeJiraLabelSync,
  isJiraCriticalBugSlaCandidate,
  jiraCriticalBugSlaSnapshotIds,
  replaceJiraCriticalSlaTracking,
  syncJiraIssueAnalytics,
  type JiraAnalyticsActivityInput,
  type JiraAnalyticsSnapshotState,
  type JiraAnalyticsSyncStore,
  type JiraAnalyticsTransitionInput,
} from './jira-analytics-sync.js';

test('Jira analytics sync lock is created idempotently and acquired atomically', async () => {
  const calls: Array<{ operation: string; value: unknown }> = [];
  const settings = {
    createMany: async (value: unknown) => {
      calls.push({ operation: 'createMany', value });
      return { count: 0 };
    },
    updateMany: async (value: unknown) => {
      calls.push({ operation: 'updateMany', value });
      return { count: 1 };
    },
  } as Parameters<typeof acquireJiraAnalyticsSyncLock>[0];
  const startedAt = new Date('2026-08-20T15:00:00Z');
  const expiresAt = new Date('2026-08-20T15:05:00Z');

  assert.equal(
    await acquireJiraAnalyticsSyncLock(
      settings,
      'project-1',
      'cvte968',
      startedAt,
      expiresAt,
    ),
    true,
  );
  assert.deepEqual(calls, [
    {
      operation: 'createMany',
      value: {
        data: [{ projectId: 'project-1', jiraLabel: 'cvte968', syncStatus: 'CONFIGURED' }],
        skipDuplicates: true,
      },
    },
    {
      operation: 'updateMany',
      value: {
        where: {
          projectId: 'project-1',
          OR: [
            { syncStartedAt: null },
            { syncLockExpiresAt: null },
            { syncLockExpiresAt: { lte: startedAt } },
          ],
        },
        data: {
          jiraLabel: 'cvte968',
          syncStatus: 'SYNCING',
          syncStartedAt: startedAt,
          syncLockExpiresAt: expiresAt,
        },
      },
    },
  ]);
});

test('incomplete priority history preserves a previously known SLA start', () => {
  assert.equal(
    criticalPriorityAtUpdate(jiraIssue({
      priority: 'Critical',
      criticalPriorityAt: null,
      transitionHistoryComplete: false,
    })),
    undefined,
  );
  assert.equal(
    criticalPriorityAtUpdate(jiraIssue({
      priority: 'Major',
      criticalPriorityAt: null,
      transitionHistoryComplete: false,
    })),
    undefined,
  );
  assert.deepEqual(
    criticalPriorityAtUpdate(jiraIssue({
      priority: 'Major',
      criticalPriorityAt: new Date('2026-05-01T09:00:00Z'),
      transitionHistoryComplete: false,
    })),
    new Date('2026-05-01T09:00:00Z'),
  );
});

test('resolved critical bug SLA candidate uses priority at Resolution', () => {
  assert.equal(
    isJiraCriticalBugSlaCandidate(jiraIssue({
      issueType: 'Дефект',
      priority: 'Major',
      criticalPriorityAt: new Date('2026-05-01T09:00:00Z'),
      criticalEndPriority: 'Critical',
      transitionHistoryComplete: true,
    })),
    true,
  );
  assert.equal(
    isJiraCriticalBugSlaCandidate(jiraIssue({
      issueType: 'Дефект',
      priority: 'Critical',
      criticalPriorityAt: new Date('2026-05-01T09:00:00Z'),
      criticalEndPriority: 'Major',
      transitionHistoryComplete: true,
    })),
    false,
  );
});

test('unresolved critical bug SLA candidate requires a current critical priority', () => {
  assert.equal(
    isJiraCriticalBugSlaCandidate(jiraIssue({
      issueType: 'Bug - Production',
      priority: 'Critical',
      criticalPriorityAt: new Date('2026-05-01T09:00:00Z'),
      criticalEndPriority: 'Critical',
      transitionHistoryComplete: false,
    })),
    true,
  );
  assert.equal(
    isJiraCriticalBugSlaCandidate(jiraIssue({
      issueType: 'Bug - Production',
      priority: 'Major',
      criticalPriorityAt: new Date('2026-05-01T09:00:00Z'),
      criticalEndPriority: 'Major',
      transitionHistoryComplete: false,
    })),
    false,
  );
  assert.equal(
    isJiraCriticalBugSlaCandidate(jiraIssue({
      issueType: 'Task',
      criticalPriorityAt: new Date('2026-05-01T09:00:00Z'),
      criticalEndPriority: 'Critical',
    })),
    false,
  );
  assert.equal(
    isJiraCriticalBugSlaCandidate(jiraIssue({
      issueType: 'Bug',
      criticalPriorityAt: null,
      criticalEndPriority: 'Critical',
    })),
    false,
  );
});

test('partial resolved history preserves end priority only for the same Resolution date', () => {
  const resolutionAt = new Date('2026-06-01T09:00:00Z');
  const existing = {
    ...existingSnapshot(),
    resolutionAt,
    criticalEndPriority: 'Blocker',
  };

  assert.equal(
    criticalEndPriorityUpdate(jiraIssue({
      resolutionAt: new Date(resolutionAt),
      criticalEndPriority: null,
      transitionHistoryComplete: false,
    }), existing),
    'Blocker',
  );
  assert.equal(
    criticalEndPriorityUpdate(jiraIssue({
      resolutionAt: new Date('2026-06-02T09:00:00Z'),
      criticalEndPriority: null,
      transitionHistoryComplete: false,
    }), existing),
    null,
  );
});

test('Jira bug issue type matching accepts type names but not task descriptions', () => {
  const cases: Array<[string, boolean]> = [
    ['Bug', true],
    ['Bug Report', true],
    ['Defect', true],
    ['Баг', true],
    ['Ошибка', true],
    ['Дефект', true],
    ['Bug - Production', true],
    ['Debug', false],
    ['Bugfix', false],
    ['Исправление ошибки', false],
    ['Task', false],
  ];

  for (const [issueType, expected] of cases) {
    assert.equal(isJiraBugIssueType(issueType), expected, issueType);
  }
});

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
    resolutionAt: null,
    sprint: null,
    sprintAvailable: true,
    createdAt: new Date('2026-08-01T09:00:00Z'),
    criticalPriorityAt: null,
    criticalEndPriority: 'High',
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
      const criticalPriorityAt = criticalPriorityAtUpdate(issue);
      state.snapshot = {
        id: state.snapshot?.id ?? 'snapshot-1',
        status: issue.status,
        sprint: issue.sprintAvailable
          ? issue.sprint
          : (state.snapshot?.sprint ?? null),
        criticalPriorityAt: criticalPriorityAt === undefined
          ? (state.snapshot?.criticalPriorityAt ?? null)
          : criticalPriorityAt,
        criticalEndPriority: issue.criticalEndPriority,
        resolutionAt: issue.resolutionAt,
        commitCount: issue.development.available
          ? issue.development.commitCount
          : (state.snapshot?.commitCount ?? 0),
        mergeRequestCount: issue.development.available
          ? issue.development.mergeRequestCount
          : (state.snapshot?.mergeRequestCount ?? 0),
        developmentBaselineCaptured:
          (issue.development.available &&
            (issue.development.commitCount > 0 || issue.development.mergeRequestCount > 0)) ||
          (state.snapshot?.developmentBaselineCaptured ?? false),
      };
      return {
        id: state.snapshot.id,
        issueType: issue.issueType,
        criticalPriorityAt: state.snapshot.criticalPriorityAt,
        criticalEndPriority: state.snapshot.criticalEndPriority,
      };
    },
  };
  return { activities, state, store, transitions };
}

const existingSnapshot = (): JiraAnalyticsSnapshotState => ({
  id: 'snapshot-1',
  status: 'Open',
  sprint: null,
  criticalPriorityAt: null,
  criticalEndPriority: null,
  resolutionAt: null,
  commitCount: 0,
  mergeRequestCount: 0,
  developmentBaselineCaptured: false,
});

test('partial priority history keeps the earliest known SLA start', async () => {
  const previousStart = new Date('2026-05-01T09:00:00Z');
  const { state, store } = memoryStore({
    ...existingSnapshot(),
    criticalPriorityAt: previousStart,
  });

  await syncJiraIssueAnalytics(
    store,
    'project-1',
    jiraIssue({
      issueType: 'Bug',
      criticalPriorityAt: new Date('2026-06-01T09:00:00Z'),
      transitionHistoryComplete: false,
    }),
    new Date('2026-08-20T09:00:00Z'),
  );

  assert.deepEqual(state.snapshot?.criticalPriorityAt, previousStart);
});

test('partial resolved history keeps a previously verified SLA candidate', async () => {
  const resolutionAt = new Date('2026-06-01T09:00:00Z');
  const previousStart = new Date('2026-05-01T09:00:00Z');
  const { state, store } = memoryStore({
    ...existingSnapshot(),
    criticalPriorityAt: previousStart,
    criticalEndPriority: 'Critical',
    resolutionAt,
  });

  await syncJiraIssueAnalytics(
    store,
    'project-1',
    jiraIssue({
      issueType: 'Bug',
      resolutionAt: new Date(resolutionAt),
      criticalPriorityAt: null,
      criticalEndPriority: null,
      transitionHistoryComplete: false,
    }),
    new Date('2026-08-20T09:00:00Z'),
  );

  assert.deepEqual(state.snapshot?.criticalPriorityAt, previousStart);
  assert.equal(state.snapshot?.criticalEndPriority, 'Critical');
  assert.equal(
    isJiraCriticalBugSlaCandidate({
      issueType: 'Bug',
      criticalPriorityAt: state.snapshot?.criticalPriorityAt ?? null,
      criticalEndPriority: state.snapshot?.criticalEndPriority ?? null,
    }),
    true,
  );
});

test('complete priority history clears an obsolete SLA start', async () => {
  const { state, store } = memoryStore({
    ...existingSnapshot(),
    criticalPriorityAt: new Date('2026-05-01T09:00:00Z'),
  });

  await syncJiraIssueAnalytics(
    store,
    'project-1',
    jiraIssue({
      criticalPriorityAt: null,
      transitionHistoryComplete: true,
    }),
    new Date('2026-08-20T09:00:00Z'),
  );

  assert.equal(state.snapshot?.criticalPriorityAt, null);
});

test('configured SLA sync replaces tracked snapshots in bounded batches', async () => {
  const calls: unknown[] = [];
  const transaction = {
    jiraIssueSnapshot: {
      updateMany: async (value: unknown) => {
        calls.push(value);
        return { count: 1 };
      },
    },
  } as Parameters<typeof replaceJiraCriticalSlaTracking>[0];

  await replaceJiraCriticalSlaTracking(
    transaction,
    'project-1',
    ['snapshot-1', 'snapshot-2', 'snapshot-3'],
    2,
  );

  assert.deepEqual(calls, [
    {
      where: { projectId: 'project-1', criticalSlaTracked: true },
      data: { criticalSlaTracked: false },
    },
    {
      where: { projectId: 'project-1', id: { in: ['snapshot-1', 'snapshot-2'] } },
      data: { criticalSlaTracked: true },
    },
    {
      where: { projectId: 'project-1', id: { in: ['snapshot-3'] } },
      data: { criticalSlaTracked: true },
    },
  ]);
});

test('label sync finalization activates current snapshots before retiring stale scope', async () => {
  const calls: Array<{ model: string; operation: string; value: unknown }> = [];
  const transaction = {
    jiraIssueSnapshot: {
      updateMany: async (value: unknown) => {
        calls.push({ model: 'snapshot', operation: 'updateMany', value });
        return { count: 1 };
      },
    },
    jiraWorkSectionIssue: {
      deleteMany: async (value: unknown) => {
        calls.push({ model: 'section', operation: 'deleteMany', value });
        return { count: 1 };
      },
      createMany: async (value: unknown) => {
        calls.push({ model: 'section', operation: 'createMany', value });
        return { count: 1 };
      },
    },
  } as Parameters<typeof finalizeJiraLabelSync>[0];
  const syncedAt = new Date('2026-08-20T15:00:00Z');

  await finalizeJiraLabelSync(
    transaction,
    'project-1',
    syncedAt,
    [{ sectionId: 'section-1', issueKeys: ['CVTE-1', 'MISSING-2'] }],
    new Map([['CVTE-1', 'snapshot-1']]),
    ['snapshot-1'],
  );

  assert.deepEqual(calls, [
    {
      model: 'snapshot',
      operation: 'updateMany',
      value: {
        where: { projectId: 'project-1', syncedAt },
        data: { retiredAt: null },
      },
    },
    {
      model: 'snapshot',
      operation: 'updateMany',
      value: {
        where: { projectId: 'project-1', syncedAt: { lt: syncedAt }, retiredAt: null },
        data: { retiredAt: syncedAt, criticalSlaTracked: false },
      },
    },
    {
      model: 'section',
      operation: 'deleteMany',
      value: { where: { sectionId: 'section-1' } },
    },
    {
      model: 'section',
      operation: 'createMany',
      value: {
        data: [{ sectionId: 'section-1', snapshotId: 'snapshot-1', syncedAt }],
        skipDuplicates: true,
      },
    },
    {
      model: 'snapshot',
      operation: 'updateMany',
      value: {
        where: { projectId: 'project-1', criticalSlaTracked: true },
        data: { criticalSlaTracked: false },
      },
    },
    {
      model: 'snapshot',
      operation: 'updateMany',
      value: {
        where: { projectId: 'project-1', id: { in: ['snapshot-1'] } },
        data: { criticalSlaTracked: true },
      },
    },
  ]);
});

test('SLA tracking ids use the merged snapshot state returned by sync', () => {
  assert.deepEqual(
    jiraCriticalBugSlaSnapshotIds([
      {
        id: 'tracked',
        issueType: 'Bug',
        criticalPriorityAt: new Date('2026-05-01T09:00:00Z'),
        criticalEndPriority: 'Critical',
      },
      {
        id: 'wrong-end-priority',
        issueType: 'Bug',
        criticalPriorityAt: new Date('2026-05-01T09:00:00Z'),
        criticalEndPriority: 'Major',
      },
      {
        id: 'missing-start',
        issueType: 'Bug',
        criticalPriorityAt: null,
        criticalEndPriority: 'Blocker',
      },
    ]),
    ['tracked'],
  );
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

test('first non-empty remote development observation remains a baseline', async () => {
  const memory = memoryStore(existingSnapshot());

  await syncJiraIssueAnalytics(
    memory.store,
    'project-1',
    jiraIssue({
      development: {
        commitCount: 0,
        mergeRequestCount: 0,
        updatedAt: null,
        available: true,
      },
    }),
    new Date('2026-08-19T10:00:00Z'),
  );
  assert.equal(memory.state.snapshot?.developmentBaselineCaptured, false);

  await syncJiraIssueAnalytics(
    memory.store,
    'project-1',
    jiraIssue({
      development: {
        commitCount: 3,
        mergeRequestCount: 0,
        updatedAt: null,
        available: true,
      },
    }),
    new Date('2026-08-19T11:00:00Z'),
  );

  assert.equal(memory.activities.size, 1);
  assert.equal([...memory.activities.values()][0]?.isBaseline, true);
});

test('development totals do not regress when remote links disappear', async () => {
  const memory = memoryStore({
    ...existingSnapshot(),
    commitCount: 3,
    developmentBaselineCaptured: true,
  });

  await syncJiraIssueAnalytics(
    memory.store,
    'project-1',
    jiraIssue({
      development: {
        commitCount: 1,
        mergeRequestCount: 0,
        updatedAt: null,
        available: true,
      },
    }),
    new Date('2026-08-19T10:00:00Z'),
  );
  assert.equal(memory.state.snapshot?.commitCount, 3);
  assert.equal(memory.activities.size, 0);

  await syncJiraIssueAnalytics(
    memory.store,
    'project-1',
    jiraIssue({
      development: {
        commitCount: 4,
        mergeRequestCount: 0,
        updatedAt: null,
        available: true,
      },
    }),
    new Date('2026-08-19T11:00:00Z'),
  );
  assert.equal(memory.state.snapshot?.commitCount, 4);
  assert.equal([...memory.activities.values()][0]?.commitCount, 1);
});

test('an unavailable Sprint field preserves the snapshot and activity context', async () => {
  const memory = memoryStore({
    ...existingSnapshot(),
    sprint: 'Sprint 24',
    developmentBaselineCaptured: true,
  });

  await syncJiraIssueAnalytics(
    memory.store,
    'project-1',
    jiraIssue({
      sprint: null,
      sprintAvailable: false,
      development: {
        commitCount: 1,
        mergeRequestCount: 0,
        updatedAt: null,
        available: true,
      },
    }),
    new Date('2026-08-19T10:00:00Z'),
  );

  assert.equal(memory.state.snapshot?.sprint, 'Sprint 24');
  assert.equal([...memory.activities.values()][0]?.sprintAtObservation, 'Sprint 24');
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
