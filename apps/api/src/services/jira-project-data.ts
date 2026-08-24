import { Prisma, type PrismaClient } from '@prisma/client';

export class JiraProjectDataBusyError extends Error {
  override name = 'JiraProjectDataBusyError';
}

export class JiraProjectDataNotFoundError extends Error {
  override name = 'JiraProjectDataNotFoundError';
}

export class JiraProjectDataReadOnlyError extends Error {
  override name = 'JiraProjectDataReadOnlyError';
}

export type JiraProjectDataClearResult = {
  projectId: string;
  ticketsDeleted: number;
  versionsDeleted: number;
  statusTransitionsDeleted: number;
  developmentActivitiesDeleted: number;
  membershipsDeleted: number;
  retriesDeleted: number;
};

export function lockJiraProjectData(
  transaction: Prisma.TransactionClient,
  projectId: string,
) {
  return transaction.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`jira-project-data:${projectId}`}, 0)
    )::text AS lock
  `);
}

export async function clearJiraProjectData(
  database: PrismaClient,
  projectId: string,
): Promise<JiraProjectDataClearResult> {
  return database.$transaction(async (transaction) => {
    await lockJiraProjectData(transaction, projectId);

    const project = await transaction.project.findUnique({
      where: { id: projectId },
      select: { id: true, status: true },
    });
    if (!project) throw new JiraProjectDataNotFoundError();
    if (project.status === 'CLOSED') throw new JiraProjectDataReadOnlyError();

    const settingsRows = await transaction.$queryRaw<Array<{
      leaseActive: boolean;
      syncRunId: string | null;
    }>>(Prisma.sql`
      SELECT "syncRunId",
             ("syncStartedAt" IS NOT NULL AND "syncLockExpiresAt" > now()) AS "leaseActive"
        FROM "JiraAnalyticsSettings"
       WHERE "projectId" = ${projectId}
       FOR UPDATE
    `);
    const settings = settingsRows[0] ?? null;
    const activeRun = await transaction.jiraSyncRun.findFirst({
      where: { projectId, activeSlot: { not: null } },
      select: { id: true },
    });
    if (activeRun || settings?.leaseActive) {
      throw new JiraProjectDataBusyError();
    }

    const memberships = await transaction.jiraWorkSectionIssue.deleteMany({
      where: { snapshot: { projectId } },
    });
    const statusTransitions = await transaction.jiraIssueStatusTransition.deleteMany({
      where: { snapshot: { projectId } },
    });
    const developmentActivities = await transaction.jiraDevelopmentActivity.deleteMany({
      where: { snapshot: { projectId } },
    });
    const versions = await transaction.jiraIssueVersion.deleteMany({
      where: { projectId },
    });
    const snapshots = await transaction.jiraIssueSnapshot.deleteMany({
      where: { projectId },
    });
    const retries = await transaction.jiraIssueHistoryRetry.deleteMany({
      where: { projectId },
    });
    await transaction.jiraAnalyticsSettings.updateMany({
      where: { projectId },
      data: {
        syncStatus: 'CONFIGURED',
        lastSyncedAt: null,
        syncStartedAt: null,
        syncLockExpiresAt: null,
        syncRunId: null,
        syncFenceToken: { increment: 1 },
        historyCursorUpdatedAt: null,
        historyCursorJiraIssueId: null,
        historyLastFullReconciledAt: null,
        historyFullCursorIssueKey: null,
        historyFullStartedAt: null,
      },
    });
    await transaction.jiraIntegration.updateMany({
      where: { projectId },
      data: { lastSyncedAt: null, syncStatus: 'CONFIGURED' },
    });

    return {
      projectId,
      ticketsDeleted: snapshots.count,
      versionsDeleted: versions.count,
      statusTransitionsDeleted: statusTransitions.count,
      developmentActivitiesDeleted: developmentActivities.count,
      membershipsDeleted: memberships.count,
      retriesDeleted: retries.count,
    };
  });
}
