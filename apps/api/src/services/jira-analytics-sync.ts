import type { Prisma } from '@prisma/client';
import {
  isJiraBugIssueType,
  isJiraCriticalPriority,
  jiraCriticalBugSlaHours,
} from '@pms/shared';

import type { JiraIssue } from '../jira.js';

export type JiraAnalyticsSnapshotState = {
  id: string;
  status: string;
  commitCount: number;
  mergeRequestCount: number;
  developmentBaselineCaptured: boolean;
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
  ) => Promise<{ id: string }>;
};

export function criticalPriorityAtUpdate(issue: JiraIssue) {
  if (isJiraCriticalPriority(issue.priority) && !issue.transitionHistoryComplete) {
    return undefined;
  }
  return issue.criticalPriorityAt;
}

export function isJiraCriticalBugSlaViolation(issue: JiraIssue, now: Date) {
  if (
    !isJiraBugIssueType(issue.issueType) ||
    !issue.transitionHistoryComplete ||
    !issue.criticalPriorityAt
  ) {
    return false;
  }
  const finishedAt = issue.resolutionAt ?? now;
  return (
    finishedAt.getTime() - issue.criticalPriorityAt.getTime() >
    jiraCriticalBugSlaHours * 3_600_000
  );
}

export async function syncJiraIssueAnalytics(
  store: JiraAnalyticsSyncStore,
  projectId: string,
  issue: JiraIssue,
  syncedAt: Date,
) {
  const existing = await store.findSnapshot(projectId, issue.key);
  const development = issue.development;
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
        sprintAtObservation: issue.sprint,
        isBaseline: !existing?.developmentBaselineCaptured,
        observedAt: syncedAt,
      });
    }
  };

  if (existing) await persistEvents(existing.id);
  const snapshot = await store.upsertSnapshot(projectId, issue, syncedAt);
  if (!existing) await persistEvents(snapshot.id);
  return snapshot;
}

export function createPrismaJiraAnalyticsSyncStore(
  transaction: Prisma.TransactionClient,
): JiraAnalyticsSyncStore {
  return {
    async findSnapshot(projectId, issueKey) {
      return transaction.jiraIssueSnapshot.findUnique({
        where: { projectId_issueKey: { projectId, issueKey } },
        select: {
          id: true,
          status: true,
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
          sprint: issue.sprint,
          issueCreatedAt: issue.createdAt,
          criticalPriorityAt: criticalPriorityAtUpdate(issue),
          resolutionAt: issue.resolutionAt,
          commitCount: development.available ? development.commitCount : undefined,
          mergeRequestCount: development.available ? development.mergeRequestCount : undefined,
          developmentUpdatedAt: development.available ? development.updatedAt : undefined,
          developmentDataAvailable: development.available,
          developmentBaselineCaptured: development.available ? true : undefined,
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
          resolutionAt: issue.resolutionAt,
          commitCount: development.available ? development.commitCount : 0,
          mergeRequestCount: development.available ? development.mergeRequestCount : 0,
          developmentUpdatedAt: development.available ? development.updatedAt : null,
          developmentDataAvailable: development.available,
          developmentBaselineCaptured: development.available,
          transitionHistoryComplete: issue.transitionHistoryComplete,
          updatedAt: issue.updatedAt,
          syncedAt,
        },
        select: { id: true },
      });
    },
  };
}
