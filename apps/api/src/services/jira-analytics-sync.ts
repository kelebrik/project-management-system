import { Prisma, type PrismaClient } from '@prisma/client';
import { isJiraCriticalBugSlaCandidate } from '@pms/shared';

export { isJiraCriticalBugSlaCandidate } from '@pms/shared';

import type { JiraIssue } from '../jira.js';
import { hashJiraVersionV1 } from './jira-version-canonical.js';

export class JiraHistoryObservationError extends Error {
  override name = 'JiraHistoryObservationError';

  constructor(
    readonly reasonCode: 'MISSING_JIRA_ID' | 'MISSING_HISTORY_DOCUMENT' | 'INCOMPLETE_HYDRATION',
    message: string,
  ) {
    super(message);
  }
}

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
  issueType?: string;
  updatedAt?: Date;
};

export type JiraAnalyticsSyncedSnapshot = {
  id: string;
  issueType: string;
  criticalPriorityAt: Date | null;
  criticalEndPriority: string | null;
};

export type JiraIssueVersionProjection = {
  id: string;
  projectId: string;
  jiraIssueId: string;
  issueKey: string;
  issueUrl: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string | null;
  reporter: string | null;
  issueType: string;
  labels: string[];
  resolution: string | null;
  sprint: string | null;
  issueCreatedAt: Date | null;
  criticalPriorityAt: Date | null;
  criticalEndPriority: string | null;
  resolutionAt: Date | null;
  commitCount: number;
  mergeRequestCount: number;
  developmentUpdatedAt: Date | null;
  developmentDataAvailable: boolean;
  developmentBaselineCaptured: boolean;
  transitionHistoryComplete: boolean;
  issueUpdatedAt: Date;
  observedAt: Date;
};

export function jiraSnapshotDataFromObservedVersion(
  version: JiraIssueVersionProjection,
  active = true,
) {
  return {
    projectId: version.projectId,
    jiraId: version.jiraIssueId,
    issueKey: version.issueKey,
    issueUrl: version.issueUrl,
    summary: version.summary,
    status: version.status,
    priority: version.priority,
    assignee: version.assignee,
    reporter: version.reporter,
    issueType: version.issueType,
    labels: version.labels,
    resolution: version.resolution,
    sprint: version.sprint,
    issueCreatedAt: version.issueCreatedAt,
    criticalPriorityAt: version.criticalPriorityAt,
    criticalEndPriority: version.criticalEndPriority,
    resolutionAt: version.resolutionAt,
    criticalSlaTracked: active && isJiraCriticalBugSlaCandidate(version),
    commitCount: version.commitCount,
    mergeRequestCount: version.mergeRequestCount,
    developmentUpdatedAt: version.developmentUpdatedAt,
    developmentDataAvailable: version.developmentDataAvailable,
    developmentBaselineCaptured: version.developmentBaselineCaptured,
    transitionHistoryComplete: version.transitionHistoryComplete,
    updatedAt: version.issueUpdatedAt,
    syncedAt: version.observedAt,
    currentVersionId: version.id,
  };
}

export async function rebuildJiraCurrentProjections(
  prisma: PrismaClient,
  projectId: string,
  batchSize = 200,
  assertLease?: (transaction: Prisma.TransactionClient) => Promise<void>,
) {
  let rebuilt = 0;
  const skippedUnversioned = await prisma.jiraIssueSnapshot.count({
    where: { projectId, retiredAt: null, projectionUnversionedSince: { not: null } },
  });
  let cursor: string | undefined;
  while (true) {
    const batch = await prisma.$transaction(async (transaction) => {
      await assertLease?.(transaction);
      const snapshots = await transaction.jiraIssueSnapshot.findMany({
        where: {
          projectId,
          retiredAt: null,
          currentVersionId: { not: null },
          projectionUnversionedSince: null,
        },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          retiredAt: true,
          currentVersion: {
            select: {
              id: true,
              projectId: true,
              jiraIssueId: true,
              issueKey: true,
              issueUrl: true,
              summary: true,
              status: true,
              priority: true,
              assignee: true,
              reporter: true,
              issueType: true,
              labels: true,
              resolution: true,
              sprint: true,
              issueCreatedAt: true,
              criticalPriorityAt: true,
              criticalEndPriority: true,
              resolutionAt: true,
              commitCount: true,
              mergeRequestCount: true,
              developmentUpdatedAt: true,
              developmentDataAvailable: true,
              developmentBaselineCaptured: true,
              transitionHistoryComplete: true,
              issueUpdatedAt: true,
              observedAt: true,
            },
          },
        },
      });
      let updated = 0;
      for (const snapshot of snapshots) {
        if (!snapshot.currentVersion) continue;
        await transaction.jiraIssueSnapshot.update({
          where: { id: snapshot.id },
          data: jiraSnapshotDataFromObservedVersion(
            snapshot.currentVersion,
            snapshot.retiredAt === null,
          ),
        });
        updated += 1;
      }
      return { updated, cursor: snapshots.at(-1)?.id, empty: snapshots.length === 0 };
    }, { maxWait: 10_000, timeout: 60_000 });
    if (batch.empty) break;
    rebuilt += batch.updated;
    cursor = batch.cursor;
  }
  return { rebuilt, skippedUnversioned };
}

export type JiraAnalyticsTransitionInput = {
  snapshotId: string;
  transitionKey: string;
  fromStatus: string | null;
  toStatus: string;
  transitionedAt: Date;
  actor: string | null;
};

export type JiraAnalyticsLabelChangeInput = {
  snapshotId: string;
  changeKey: string;
  changedAt: Date;
  fromLabels: string[];
  toLabels: string[];
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
  acquireIssueLock?: (projectId: string, issueIdentity: string) => Promise<void>;
  findSnapshot: (
    projectId: string,
    issueKey: string,
  ) => Promise<JiraAnalyticsSnapshotState | null>;
  deleteSyntheticTransitions: (snapshotId: string) => Promise<void>;
  createTransitions: (transitions: JiraAnalyticsTransitionInput[]) => Promise<void>;
  createLabelChanges?: (changes: JiraAnalyticsLabelChangeInput[]) => Promise<void>;
  createDevelopmentActivity: (activity: JiraAnalyticsActivityInput) => Promise<void>;
  upsertSnapshot: (
    projectId: string,
    issue: JiraIssue,
    syncedAt: Date,
  ) => Promise<JiraAnalyticsSyncedSnapshot>;
  persistObservedVersion?: (input: {
    projectId: string;
    snapshotId: string;
    issue: JiraIssue;
    observedAt: Date;
    syncRunId: string;
    makeCurrent: boolean;
  }) => Promise<{ versionId: string; created: boolean }>;
};

type JiraCriticalSlaTrackingTransaction = Pick<Prisma.TransactionClient, 'jiraIssueSnapshot'>;

type JiraAnalyticsSyncFinalizationTransaction = Pick<
  Prisma.TransactionClient,
  'jiraIssueSnapshot' | 'jiraWorkSectionIssue' | 'jiraIssueHistoryRetry'
>;

export type JiraAnalyticsSectionMembership = {
  sectionId: string;
  issueKeys: readonly string[];
};

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
  discoveredIssueKeys: readonly string[],
  trackedSnapshotIds: readonly string[],
) {
  const activeSnapshotIds = [...new Set(snapshotIdByIssueKey.values())];
  await transaction.jiraIssueSnapshot.updateMany({
    where: { projectId, id: { in: activeSnapshotIds } },
    data: { retiredAt: null },
  });
  await transaction.jiraIssueSnapshot.updateMany({
    where: {
      projectId,
      id: { notIn: activeSnapshotIds },
      retiredAt: null,
    },
    data: {
      retiredAt: syncedAt,
      criticalSlaTracked: false,
    },
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
  await transaction.jiraIssueHistoryRetry.updateMany({
    where: {
      projectId,
      status: 'PENDING',
      issueKey: { notIn: [...new Set(discoveredIssueKeys.map((issueKey) => issueKey.toUpperCase()))] },
    },
    data: { status: 'RESOLVED', resolvedAt: syncedAt },
  });
}

export function criticalPriorityAtUpdate(issue: JiraIssue) {
  if (!issue.transitionHistoryComplete && !issue.criticalPriorityAt) {
    return undefined;
  }
  return issue.criticalPriorityAt;
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
  syncRunId = syncedAt.toISOString(),
) {
  await store.acquireIssueLock?.(projectId, issue.jiraId ?? issue.key);
  const existing = await store.findSnapshot(projectId, issue.key);
  const staleObservation = Boolean(
    existing?.updatedAt && existing.updatedAt.getTime() > issue.updatedAt.getTime(),
  );
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
    if (issue.labelChanges.length > 0 && store.createLabelChanges) {
      await store.createLabelChanges(
        issue.labelChanges.map((change) => ({
          snapshotId,
          changeKey: change.key,
          changedAt: change.changedAt,
          fromLabels: change.fromLabels,
          toLabels: change.toLabels,
          actor: change.actor,
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
  const snapshot = staleObservation && existing
    ? {
        id: existing.id,
        issueType: existing.issueType ?? issue.issueType,
        criticalPriorityAt: existing.criticalPriorityAt,
        criticalEndPriority: existing.criticalEndPriority,
      }
    : await store.upsertSnapshot(projectId, issueForPersistence, syncedAt);
  if (!existing) await persistEvents(snapshot.id);
  await store.persistObservedVersion?.({
    projectId,
    snapshotId: snapshot.id,
    issue: issueForPersistence,
    observedAt: syncedAt,
    syncRunId,
    makeCurrent: !staleObservation,
  });
  return snapshot;
}

export function createPrismaJiraAnalyticsSyncStore(
  transaction: Prisma.TransactionClient,
  newSnapshotRetiredAt: Date | null = null,
  historyWriteEnabled = true,
): JiraAnalyticsSyncStore {
  const store: JiraAnalyticsSyncStore = {
    async acquireIssueLock(projectId, issueIdentity) {
      await transaction.$queryRaw<Array<{ lock: string }>>(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${projectId}:${issueIdentity}`}, 0))::text AS lock`,
      );
    },
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
          issueType: true,
          updatedAt: true,
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
    async createLabelChanges(changes) {
      await transaction.jiraIssueLabelChange.createMany({
        data: changes,
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
          labels: issue.labels,
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
          projectionUnversionedSince: historyWriteEnabled ? null : syncedAt,
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
          labels: issue.labels,
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
          projectionUnversionedSince: historyWriteEnabled ? null : syncedAt,
        },
        select: {
          id: true,
          issueType: true,
          criticalPriorityAt: true,
          criticalEndPriority: true,
        },
      });
    },
    async persistObservedVersion({
      projectId,
      snapshotId,
      issue,
      observedAt,
      syncRunId,
      makeCurrent,
    }) {
      if (!issue.jiraId) {
        throw new JiraHistoryObservationError(
          'MISSING_JIRA_ID',
          `Jira issue ${issue.key} does not contain a stable id`,
        );
      }
      if (!issue.history) {
        throw new JiraHistoryObservationError(
          'MISSING_HISTORY_DOCUMENT',
          `Jira issue ${issue.key} does not contain a hydrated history document`,
        );
      }
      const incomplete = Object.entries({
        changelog: issue.history.changelogComplete,
        comments: issue.history.commentsComplete,
        worklogs: issue.history.worklogsComplete,
        remoteLinks: issue.history.remoteLinksComplete,
      }).filter(([, complete]) => !complete).map(([name]) => name);
      if (incomplete.length > 0) {
        throw new JiraHistoryObservationError(
          'INCOMPLETE_HYDRATION',
          `Jira issue ${issue.key} has incomplete ${incomplete.join(', ')}`,
        );
      }

      const hashed = hashJiraVersionV1(issue.history.document);
      const payload = JSON.parse(hashed.canonicalJson) as Prisma.InputJsonValue;
      const currentProjection = makeCurrent
        ? await transaction.jiraIssueSnapshot.findUniqueOrThrow({
            where: { id: snapshotId },
            select: {
              issueUrl: true,
              summary: true,
              status: true,
              priority: true,
              assignee: true,
              reporter: true,
              issueType: true,
              resolution: true,
              sprint: true,
              issueCreatedAt: true,
              criticalPriorityAt: true,
              criticalEndPriority: true,
              resolutionAt: true,
              commitCount: true,
              mergeRequestCount: true,
              developmentUpdatedAt: true,
              developmentDataAvailable: true,
              developmentBaselineCaptured: true,
              transitionHistoryComplete: true,
              updatedAt: true,
            },
          })
        : null;
      const resolution = currentProjection ? currentProjection.resolution : issue.resolution;
      const normalizedResolution = !resolution
        || ['unresolved', 'не решен', 'не решено'].includes(resolution.trim().toLowerCase())
        ? null
        : resolution;
      const created = await transaction.jiraIssueVersion.createMany({
        data: [{
          projectId,
          snapshotId,
          jiraIssueId: issue.jiraId,
          issueKey: issue.key,
          observedAt,
          jiraUpdatedAt: issue.updatedAt,
          schemaVersion: 1,
          provenance: 'OBSERVED',
          contentHash: hashed.contentHash,
          payload,
          payloadBytes: Buffer.byteLength(hashed.canonicalJson, 'utf8'),
          syncRunId,
          changelogComplete: issue.history.changelogComplete,
          commentsComplete: issue.history.commentsComplete,
          worklogsComplete: issue.history.worklogsComplete,
          remoteLinksComplete: issue.history.remoteLinksComplete,
          attachmentReferencesStripped: issue.history.attachmentReferencesStripped,
          validationWarnings: hashed.warnings,
          summary: currentProjection?.summary ?? issue.summary,
          issueUrl: currentProjection?.issueUrl ?? issue.url,
          issueType: currentProjection?.issueType ?? issue.issueType,
          status: currentProjection?.status ?? issue.status,
          statusCategory: issue.statusCategory ?? null,
          priority: currentProjection?.priority ?? issue.priority,
          resolution: normalizedResolution,
          resolutionAt: currentProjection ? currentProjection.resolutionAt : issue.resolutionAt,
          issueCreatedAt: currentProjection ? currentProjection.issueCreatedAt : issue.createdAt,
          issueUpdatedAt: currentProjection?.updatedAt ?? issue.updatedAt,
          assignee: currentProjection ? currentProjection.assignee : issue.assignee,
          reporter: currentProjection ? currentProjection.reporter : issue.reporter,
          parentKey: issue.parentKey ?? null,
          epicKey: issue.epicKey ?? null,
          labels: issue.labels ?? [],
          sprintIds: issue.sprintIds ?? [],
          sprint: currentProjection ? currentProjection.sprint : issue.sprint,
          criticalPriorityAt: currentProjection
            ? currentProjection.criticalPriorityAt
            : issue.criticalPriorityAt,
          criticalEndPriority: currentProjection
            ? currentProjection.criticalEndPriority
            : issue.criticalEndPriority,
          commitCount: currentProjection?.commitCount ?? issue.development.commitCount,
          mergeRequestCount:
            currentProjection?.mergeRequestCount ?? issue.development.mergeRequestCount,
          developmentUpdatedAt: currentProjection
            ? currentProjection.developmentUpdatedAt
            : issue.development.updatedAt,
          developmentDataAvailable:
            currentProjection?.developmentDataAvailable ?? issue.development.available,
          developmentBaselineCaptured: currentProjection?.developmentBaselineCaptured
            ?? (issue.development.available
              && (issue.development.commitCount > 0 || issue.development.mergeRequestCount > 0)),
          transitionHistoryComplete:
            currentProjection?.transitionHistoryComplete ?? issue.transitionHistoryComplete,
        }],
        skipDuplicates: true,
      });
      const version = await transaction.jiraIssueVersion.findUniqueOrThrow({
        where: {
          projectId_jiraIssueId_contentHash: {
            projectId,
            jiraIssueId: issue.jiraId,
            contentHash: hashed.contentHash,
          },
        },
        select: { id: true },
      });
      if (makeCurrent) {
        await transaction.jiraIssueSnapshot.update({
          where: { id: snapshotId },
          data: { currentVersionId: version.id, projectionUnversionedSince: null },
        });
      }
      return { versionId: version.id, created: created.count === 1 };
    },
  };
  if (!historyWriteEnabled) {
    delete store.persistObservedVersion;
    delete store.createLabelChanges;
  }
  return store;
}
