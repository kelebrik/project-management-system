import type { Prisma, PrismaClient } from '@prisma/client';
import { isJiraBugIssueType, isJiraCriticalPriority } from '@pms/shared';

import type { JiraIssue } from '../jira.js';

export type JiraAnalyticsSnapshotState = {
  id: string;
  status: string;
  sprint: string | null;
  criticalPriorityAt: Date | null;
  criticalEndPriority: string | null;
  resolutionAt: Date | null;
  commitCount: number;
  mergeRequestCount: number;
  developmentBaselineCaptured: boolean;
};

export type JiraAnalyticsSyncedSnapshot = {
  id: string;
  issueType: string;
  criticalPriorityAt: Date | null;
  criticalEndPriority: string | null;
};

export type JiraAnalyticsTransitionInput = {
  snapshotId: string;
  transitionKey: string;
  fromStatus: string | null;
  toStatus: string;
  transitionedAt: Date;
  actor: string | null;
};

export type JiraAnalyticsActivityInput = {
  snapshotId: string;
  activityKey: string;
  activityAt: Date;
  commitCount: number;
  mergeRequestCount: number;
  sprintAtObservation: string | null;
  isBaseline: boolean;
  observedAt: Date;
};

export type JiraAnalyticsSyncStore = {
  findSnapshot: (
    projectId: string,
    issueKey: string,
  ) => Promise<JiraAnalyticsSnapshotState | null>;
  deleteSyntheticTransitions: (snapshotId: string) => Promise<void>;
  createTransitions: (transitions: JiraAnalyticsTransitionInput[]) => Promise<void>;
  createDevelopmentActivity: (activity: JiraAnalyticsActivityInput) => Promise<void>;
  upsertSnapshot: (
    projectId: string,
    issue: JiraIssue,
    syncedAt: Date,
  ) => Promise<JiraAnalyticsSyncedSnapshot>;
};

type JiraCriticalSlaTrackingTransaction = Pick<Prisma.TransactionClient, 'jiraIssueSnapshot'>;

type JiraAnalyticsSyncFinalizationTransaction = Pick<
  Prisma.TransactionClient,
  'jiraIssueSnapshot' | 'jiraWorkSectionIssue'
>;

export type JiraAnalyticsSectionMembership = {
  sectionId: string;
  issueKeys: readonly string[];
};

type JiraAnalyticsSettingsDelegate = Pick<
  PrismaClient['jiraAnalyticsSettings'],
  'createMany' | 'updateMany'
>;

export async function acquireJiraAnalyticsSyncLock(
  settings: JiraAnalyticsSettingsDelegate,
  projectId: string,
  scope: { type: 'LABEL' | 'EPIC'; value: string },
  startedAt: Date,
  expiresAt: Date,
) {
  await settings.createMany({
    data: [{
      projectId,
      jiraScopeType: scope.type,
      jiraScopeValue: scope.value,
      jiraLabel: scope.type === 'LABEL' ? scope.value : '',
      syncStatus: 'CONFIGURED',
    }],
    skipDuplicates: true,
  });
  const lock = await settings.updateMany({
    where: {
      projectId,
      OR: [
        { syncStartedAt: null },
        { syncLockExpiresAt: null },
        { syncLockExpiresAt: { lte: startedAt } },
      ],
    },
    data: {
      jiraScopeType: scope.type,
      jiraScopeValue: scope.value,
      jiraLabel: scope.type === 'LABEL' ? scope.value : '',
      syncStatus: 'SYNCING',
      syncStartedAt: startedAt,
      syncLockExpiresAt: expiresAt,
    },
  });
  return lock.count === 1;
}

export async function replaceJiraCriticalSlaTracking(
  transaction: JiraCriticalSlaTrackingTransaction,
  projectId: string,
  snapshotIds: readonly string[],
  batchSize = 500,
) {
  await transaction.jiraIssueSnapshot.updateMany({
    where: { projectId, criticalSlaTracked: true },
    data: { criticalSlaTracked: false },
  });
  for (let offset = 0; offset < snapshotIds.length; offset += batchSize) {
    await transaction.jiraIssueSnapshot.updateMany({
      where: {
        projectId,
        id: { in: snapshotIds.slice(offset, offset + batchSize) },
      },
      data: { criticalSlaTracked: true },
    });
  }
}

export async function finalizeJiraAnalyticsSync(
  transaction: JiraAnalyticsSyncFinalizationTransaction,
  projectId: string,
  syncedAt: Date,
  sectionMemberships: readonly JiraAnalyticsSectionMembership[],
  snapshotIdByIssueKey: ReadonlyMap<string, string>,
  trackedSnapshotIds: readonly string[],
) {
  await transaction.jiraIssueSnapshot.updateMany({
    where: { projectId, syncedAt },
    data: { retiredAt: null },
  });
  await transaction.jiraIssueSnapshot.updateMany({
    where: { projectId, syncedAt: { lt: syncedAt }, retiredAt: null },
    data: { retiredAt: syncedAt, criticalSlaTracked: false },
  });
  for (const section of sectionMemberships) {
    await transaction.jiraWorkSectionIssue.deleteMany({
      where: { sectionId: section.sectionId },
    });
    const links = section.issueKeys.flatMap((issueKey) => {
      const snapshotId = snapshotIdByIssueKey.get(issueKey);
      return snapshotId ? [{ sectionId: section.sectionId, snapshotId, syncedAt }] : [];
    });
    if (links.length > 0) {
      await transaction.jiraWorkSectionIssue.createMany({
        data: links,
        skipDuplicates: true,
      });
    }
  }
  await replaceJiraCriticalSlaTracking(
    transaction,
    projectId,
    trackedSnapshotIds,
  );
}

export function criticalPriorityAtUpdate(issue: JiraIssue) {
  if (!issue.transitionHistoryComplete && !issue.criticalPriorityAt) {
    return undefined;
  }
  return issue.criticalPriorityAt;
}

export function isJiraCriticalBugSlaCandidate(
  issue: Pick<JiraIssue, 'issueType' | 'criticalPriorityAt' | 'criticalEndPriority'>,
) {
  return (
    isJiraBugIssueType(issue.issueType) &&
    issue.criticalPriorityAt !== null &&
    isJiraCriticalPriority(issue.criticalEndPriority)
  );
}

export function jiraCriticalBugSlaSnapshotIds(
  snapshots: readonly JiraAnalyticsSyncedSnapshot[],
) {
  return snapshots
    .filter(isJiraCriticalBugSlaCandidate)
    .map((snapshot) => snapshot.id);
}

function sameDate(left: Date | null | undefined, right: Date | null | undefined) {
  return left?.getTime() === right?.getTime();
}

export function criticalEndPriorityUpdate(
  issue: JiraIssue,
  existing: JiraAnalyticsSnapshotState | null,
) {
  if (!issue.resolutionAt || issue.transitionHistoryComplete) {
    return issue.criticalEndPriority;
  }
  if (sameDate(existing?.resolutionAt, issue.resolutionAt)) {
    return existing?.criticalEndPriority ?? null;
  }
  return null;
}

function earliestDate(left: Date | null | undefined, right: Date | null | undefined) {
  if (!left) return right ?? null;
  if (!right) return left;
  return left <= right ? left : right;
}

export async function syncJiraIssueAnalytics(
  store: JiraAnalyticsSyncStore,
  projectId: string,
  issue: JiraIssue,
  syncedAt: Date,
) {
  const existing = await store.findSnapshot(projectId, issue.key);
  const observedDevelopment = issue.development;
  // Remote links are an "ever observed" signal: temporary removal must not erase history.
  const development = observedDevelopment.available && existing
    ? {
        ...observedDevelopment,
        commitCount: Math.max(observedDevelopment.commitCount, existing.commitCount),
        mergeRequestCount: Math.max(
          observedDevelopment.mergeRequestCount,
          existing.mergeRequestCount,
        ),
      }
    : observedDevelopment;
  const criticalPriorityAt = issue.transitionHistoryComplete
    ? issue.criticalPriorityAt
    : earliestDate(existing?.criticalPriorityAt, issue.criticalPriorityAt);
  const criticalEndPriority = criticalEndPriorityUpdate(issue, existing);
  const criticalPriorityUnchanged =
    criticalPriorityAt?.getTime() === issue.criticalPriorityAt?.getTime();
  const criticalEndPriorityUnchanged = criticalEndPriority === issue.criticalEndPriority;
  const issueForPersistence =
    development === observedDevelopment &&
    criticalPriorityUnchanged &&
    criticalEndPriorityUnchanged
      ? issue
      : { ...issue, development, criticalPriorityAt, criticalEndPriority };
  const transitions = [...issue.transitions];
  if (
    existing &&
    existing.status !== issue.status &&
    !transitions.some((transition) => transition.toStatus === issue.status)
  ) {
    transitions.push({
      key: `sync:${issue.updatedAt.toISOString()}:${existing.status}:${issue.status}`,
      fromStatus: existing.status,
      toStatus: issue.status,
      transitionedAt: syncedAt,
      actor: null,
    });
  }

  const commitDelta = development.available
    ? Math.max(0, development.commitCount - (existing?.commitCount ?? 0))
    : 0;
  const mergeRequestDelta = development.available
    ? Math.max(0, development.mergeRequestCount - (existing?.mergeRequestCount ?? 0))
    : 0;
  const persistEvents = async (snapshotId: string) => {
    if (issue.transitionHistoryComplete) {
      await store.deleteSyntheticTransitions(snapshotId);
    }
    if (transitions.length > 0) {
      await store.createTransitions(
        transitions.map((transition) => ({
          snapshotId,
          transitionKey: transition.key,
          fromStatus: transition.fromStatus,
          toStatus: transition.toStatus,
          transitionedAt: transition.transitionedAt,
          actor: transition.actor,
        })),
      );
    }
    if (commitDelta > 0 || mergeRequestDelta > 0) {
      const activityAt = development.updatedAt ?? syncedAt;
      await store.createDevelopmentActivity({
        snapshotId,
        activityKey: `counts:${development.commitCount}:${development.mergeRequestCount}`,
        activityAt,
        commitCount: commitDelta,
        mergeRequestCount: mergeRequestDelta,
        sprintAtObservation: issue.sprintAvailable ? issue.sprint : (existing?.sprint ?? null),
        isBaseline: !existing?.developmentBaselineCaptured,
        observedAt: syncedAt,
      });
    }
  };

  if (existing) await persistEvents(existing.id);
  const snapshot = await store.upsertSnapshot(projectId, issueForPersistence, syncedAt);
  if (!existing) await persistEvents(snapshot.id);
  return snapshot;
}

export function createPrismaJiraAnalyticsSyncStore(
  transaction: Prisma.TransactionClient,
  newSnapshotRetiredAt: Date | null = null,
): JiraAnalyticsSyncStore {
  return {
    async findSnapshot(projectId, issueKey) {
      return transaction.jiraIssueSnapshot.findUnique({
        where: { projectId_issueKey: { projectId, issueKey } },
        select: {
          id: true,
          status: true,
          sprint: true,
          criticalPriorityAt: true,
          criticalEndPriority: true,
          resolutionAt: true,
          commitCount: true,
          mergeRequestCount: true,
          developmentBaselineCaptured: true,
        },
      });
    },
    async deleteSyntheticTransitions(snapshotId) {
      await transaction.jiraIssueStatusTransition.deleteMany({
        where: { snapshotId, transitionKey: { startsWith: 'sync:' } },
      });
    },
    async createTransitions(transitions) {
      await transaction.jiraIssueStatusTransition.createMany({
        data: transitions,
        skipDuplicates: true,
      });
    },
    async createDevelopmentActivity(activity) {
      await transaction.jiraDevelopmentActivity.createMany({
        data: [activity],
        skipDuplicates: true,
      });
    },
    async upsertSnapshot(projectId, issue, syncedAt) {
      const development = issue.development;
      const hasDevelopmentBaseline =
        development.available &&
        (development.commitCount > 0 || development.mergeRequestCount > 0);
      return transaction.jiraIssueSnapshot.upsert({
        where: { projectId_issueKey: { projectId, issueKey: issue.key } },
        update: {
          jiraId: issue.jiraId,
          issueUrl: issue.url,
          summary: issue.summary,
          status: issue.status,
          priority: issue.priority,
          assignee: issue.assignee,
          reporter: issue.reporter,
          issueType: issue.issueType,
          resolution: issue.resolution,
          sprint: issue.sprintAvailable ? issue.sprint : undefined,
          issueCreatedAt: issue.createdAt,
          criticalPriorityAt: criticalPriorityAtUpdate(issue),
          criticalEndPriority: issue.criticalEndPriority,
          resolutionAt: issue.resolutionAt,
          commitCount: development.available ? development.commitCount : undefined,
          mergeRequestCount: development.available ? development.mergeRequestCount : undefined,
          developmentUpdatedAt:
            development.available && development.updatedAt ? development.updatedAt : undefined,
          developmentDataAvailable: development.available,
          developmentBaselineCaptured: hasDevelopmentBaseline ? true : undefined,
          transitionHistoryComplete: issue.transitionHistoryComplete,
          updatedAt: issue.updatedAt,
          syncedAt,
        },
        create: {
          projectId,
          jiraId: issue.jiraId,
          issueKey: issue.key,
          issueUrl: issue.url,
          summary: issue.summary,
          status: issue.status,
          priority: issue.priority,
          assignee: issue.assignee,
          reporter: issue.reporter,
          issueType: issue.issueType,
          resolution: issue.resolution,
          sprint: issue.sprint,
          issueCreatedAt: issue.createdAt,
          criticalPriorityAt: issue.criticalPriorityAt,
          criticalEndPriority: issue.criticalEndPriority,
          resolutionAt: issue.resolutionAt,
          commitCount: development.available ? development.commitCount : 0,
          mergeRequestCount: development.available ? development.mergeRequestCount : 0,
          developmentUpdatedAt: development.available ? development.updatedAt : null,
          developmentDataAvailable: development.available,
          developmentBaselineCaptured: hasDevelopmentBaseline,
          transitionHistoryComplete: issue.transitionHistoryComplete,
          updatedAt: issue.updatedAt,
          syncedAt,
          retiredAt: newSnapshotRetiredAt,
        },
        select: {
          id: true,
          issueType: true,
          criticalPriorityAt: true,
          criticalEndPriority: true,
        },
      });
    },
  };
}
