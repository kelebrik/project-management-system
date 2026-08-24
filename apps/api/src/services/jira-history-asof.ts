import { isJiraCriticalBugSlaCandidate, type JiraAnalyticsIssueData } from '@pms/shared';
import { Prisma, type PrismaClient } from '@prisma/client';

export const JIRA_ASOF_MAX_VERSION_ROWS = 200_000;
export const JIRA_ASOF_TICKET_PAGE_SIZE = 250;

export class JiraAsOfVersionLimitError extends Error {
  constructor(public readonly limit: number) {
    super('JIRA_ASOF_VERSION_LIMIT');
  }
}

export type JiraAsOfReconstruction = {
  mode: 'AS_OF';
  provenance: 'RECONSTRUCTED';
  basis: 'OBSERVED_VERSIONS';
  asOf: string;
  tickets: number;
  ticketsWithoutObservation: number;
  ticketsRetiredAfterAsOf: number;
  versionRowsScanned: number;
  earliestObservationAt: string | null;
  stalenessHours: { p50: number; p95: number; max: number } | null;
  beforeHistoryStart: boolean;
  historyWriteGap: {
    includesAsOf: boolean;
    runs: number;
    firstAt: string | null;
    lastAt: string | null;
  };
  quality: 'AVAILABLE' | 'UNAVAILABLE_HISTORY_WRITE_GAP';
};

type JiraAsOfReadClient = Pick<PrismaClient, '$queryRaw'>;

type PopulationRow = {
  versionRows: bigint | number;
  scopedTickets: bigint | number;
  earliestObservationAt: Date | string | null;
};

type WinnerSummaryRow = {
  tickets: bigint | number;
  ticketsRetiredAfterAsOf: bigint | number;
  stalenessP50: number | null;
  stalenessP95: number | null;
  stalenessMax: number | null;
};

type IssueIdRow = { jiraIssueId: string };
type HistoryWriteGapRow = {
  runs: bigint | number;
  firstAt: Date | string | null;
  lastAt: Date | string | null;
  includesAsOf: boolean;
};

export type JiraAsOfVersionRow = {
  versionId: string;
  snapshotId: string;
  jiraIssueId: string;
  issueKey: string;
  issueUrl: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string | null;
  reporter: string | null;
  issueType: string;
  resolution: string | null;
  sprint: string | null;
  issueCreatedAt: Date | string | null;
  criticalPriorityAt: Date | string | null;
  criticalEndPriority: string | null;
  resolutionAt: Date | string | null;
  commitCount: number;
  mergeRequestCount: number;
  developmentDataAvailable: boolean;
  transitionHistoryComplete: boolean;
  issueUpdatedAt: Date | string;
  observedAt: Date | string;
  retiredAt: Date | string | null;
};

function numeric(value: bigint | number | null | undefined) {
  return Number(value ?? 0);
}

function iso(value: Date | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('INVALID_JIRA_ASOF_TIMESTAMP');
  return date.toISOString();
}

export function jiraAsOfIssueFromRow(row: JiraAsOfVersionRow): JiraAnalyticsIssueData {
  return {
    id: row.snapshotId,
    issueKey: row.issueKey,
    issueUrl: row.issueUrl,
    summary: row.summary,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    reporter: row.reporter,
    issueType: row.issueType,
    resolution: row.resolution,
    sprint: row.sprint,
    issueCreatedAt: iso(row.issueCreatedAt),
    criticalPriorityAt: iso(row.criticalPriorityAt),
    criticalEndPriority: row.criticalEndPriority,
    resolutionAt: iso(row.resolutionAt),
    criticalSlaTracked: isJiraCriticalBugSlaCandidate(row),
    commitCount: row.commitCount,
    mergeRequestCount: row.mergeRequestCount,
    developmentDataAvailable: row.developmentDataAvailable,
    transitionHistoryComplete: row.transitionHistoryComplete,
    dataObservedAt: iso(row.observedAt),
    updatedAt: iso(row.issueUpdatedAt)!,
    statusTransitions: [],
    developmentActivities: [],
  };
}

async function* jiraAsOfIssueBatches(
  client: JiraAsOfReadClient,
  projectId: string,
  asOf: Date,
): AsyncGenerator<JiraAnalyticsIssueData[]> {
  let cursor: string | null = null;
  while (true) {
    const cursorClause = cursor
      ? Prisma.sql`AND v."jiraIssueId" > ${cursor}`
      : Prisma.empty;
    const ids: IssueIdRow[] = await client.$queryRaw<IssueIdRow[]>(Prisma.sql`
      SELECT DISTINCT v."jiraIssueId" AS "jiraIssueId"
      FROM "JiraIssueVersion" v
      JOIN "JiraIssueSnapshot" s ON s."id" = v."snapshotId"
      WHERE v."projectId" = ${projectId}
        AND v."observedAt" <= ${asOf}
        AND v."provenance" = 'OBSERVED'::"JiraIssueVersionProvenance"
        AND (s."retiredAt" IS NULL OR s."retiredAt" > ${asOf})
        ${cursorClause}
      ORDER BY v."jiraIssueId" ASC
      LIMIT ${JIRA_ASOF_TICKET_PAGE_SIZE}
    `);
    if (ids.length === 0) return;
    const jiraIssueIds: string[] = ids.map((row: IssueIdRow) => row.jiraIssueId);
    const rows = await client.$queryRaw<JiraAsOfVersionRow[]>(Prisma.sql`
      SELECT DISTINCT ON (v."jiraIssueId")
        v."id" AS "versionId",
        v."snapshotId" AS "snapshotId",
        v."jiraIssueId" AS "jiraIssueId",
        v."issueKey" AS "issueKey",
        v."issueUrl" AS "issueUrl",
        v."summary" AS "summary",
        v."status" AS "status",
        v."priority" AS "priority",
        v."assignee" AS "assignee",
        v."reporter" AS "reporter",
        v."issueType" AS "issueType",
        v."resolution" AS "resolution",
        v."sprint" AS "sprint",
        v."issueCreatedAt" AS "issueCreatedAt",
        v."criticalPriorityAt" AS "criticalPriorityAt",
        v."criticalEndPriority" AS "criticalEndPriority",
        v."resolutionAt" AS "resolutionAt",
        v."commitCount" AS "commitCount",
        v."mergeRequestCount" AS "mergeRequestCount",
        v."developmentDataAvailable" AS "developmentDataAvailable",
        v."transitionHistoryComplete" AS "transitionHistoryComplete",
        v."issueUpdatedAt" AS "issueUpdatedAt",
        v."observedAt" AS "observedAt",
        s."retiredAt" AS "retiredAt"
      FROM "JiraIssueVersion" v
      JOIN "JiraIssueSnapshot" s ON s."id" = v."snapshotId"
      WHERE v."projectId" = ${projectId}
        AND v."observedAt" <= ${asOf}
        AND v."provenance" = 'OBSERVED'::"JiraIssueVersionProvenance"
        AND (s."retiredAt" IS NULL OR s."retiredAt" > ${asOf})
        AND v."jiraIssueId" IN (${Prisma.join(jiraIssueIds)})
      ORDER BY v."jiraIssueId" ASC, v."jiraUpdatedAt" DESC, v."observedAt" DESC, v."id" DESC
    `);
    yield rows.map(jiraAsOfIssueFromRow);
    cursor = jiraIssueIds.at(-1) ?? null;
    if (ids.length < JIRA_ASOF_TICKET_PAGE_SIZE) return;
  }
}

export async function prepareJiraAsOfIssueBatches(
  client: JiraAsOfReadClient,
  projectId: string,
  asOf: Date,
): Promise<{
  reconstruction: JiraAsOfReconstruction;
  batches: AsyncGenerator<JiraAnalyticsIssueData[]>;
}> {
  const populationRows = await client.$queryRaw<PopulationRow[]>(Prisma.sql`
    WITH eligible AS MATERIALIZED (
      SELECT v."observedAt"
      FROM "JiraIssueVersion" v
      JOIN "JiraIssueSnapshot" s ON s."id" = v."snapshotId"
      WHERE v."projectId" = ${projectId}
        AND v."observedAt" <= ${asOf}
        AND v."provenance" = 'OBSERVED'::"JiraIssueVersionProvenance"
        AND (s."retiredAt" IS NULL OR s."retiredAt" > ${asOf})
      LIMIT ${JIRA_ASOF_MAX_VERSION_ROWS + 1}
    )
    SELECT
      COUNT(*)::bigint AS "versionRows",
      MIN(eligible."observedAt") AS "earliestObservationAt",
      (
        SELECT COUNT(DISTINCT s."jiraId")::bigint
        FROM "JiraIssueSnapshot" s
        WHERE s."projectId" = ${projectId}
          AND s."jiraId" IS NOT NULL
          AND s."issueCreatedAt" IS NOT NULL
          AND s."issueCreatedAt" <= ${asOf}
          AND (s."retiredAt" IS NULL OR s."retiredAt" > ${asOf})
      ) AS "scopedTickets"
    FROM eligible
  `);
  const population = populationRows[0];
  const versionRows = numeric(population?.versionRows);
  if (versionRows > JIRA_ASOF_MAX_VERSION_ROWS) {
    throw new JiraAsOfVersionLimitError(JIRA_ASOF_MAX_VERSION_ROWS);
  }

  const winnerRows = await client.$queryRaw<WinnerSummaryRow[]>(Prisma.sql`
    WITH winners AS (
      SELECT DISTINCT ON (v."jiraIssueId")
        v."jiraIssueId",
        v."jiraUpdatedAt",
        v."observedAt",
        s."retiredAt"
      FROM "JiraIssueVersion" v
      JOIN "JiraIssueSnapshot" s ON s."id" = v."snapshotId"
      WHERE v."projectId" = ${projectId}
        AND v."observedAt" <= ${asOf}
        AND v."provenance" = 'OBSERVED'::"JiraIssueVersionProvenance"
        AND (s."retiredAt" IS NULL OR s."retiredAt" > ${asOf})
      ORDER BY v."jiraIssueId" ASC, v."jiraUpdatedAt" DESC, v."observedAt" DESC, v."id" DESC
    ), lagged AS (
      SELECT
        "retiredAt",
        GREATEST(0, EXTRACT(EPOCH FROM ("observedAt" - "jiraUpdatedAt")) / 3600.0) AS hours
      FROM winners
    )
    SELECT
      COUNT(*)::bigint AS tickets,
      COUNT(*) FILTER (WHERE "retiredAt" IS NOT NULL)::bigint AS "ticketsRetiredAfterAsOf",
      percentile_cont(0.50) WITHIN GROUP (ORDER BY hours)::float8 AS "stalenessP50",
      percentile_cont(0.95) WITHIN GROUP (ORDER BY hours)::float8 AS "stalenessP95",
      MAX(hours)::float8 AS "stalenessMax"
    FROM lagged
  `);
  const winners = winnerRows[0];
  const gapRows = await client.$queryRaw<HistoryWriteGapRow[]>(Prisma.sql`
    WITH disabled AS MATERIALIZED (
      SELECT d."startedAt", d."finishedAt"
        FROM "JiraSyncRun" d
       WHERE d."projectId" = ${projectId}
         AND NOT d."historyWriteEnabled"
         AND d."startedAt" IS NOT NULL
    ), gaps AS (
      SELECT d.*,
             (
               SELECT MIN(r."finishedAt")
                 FROM "JiraSyncRun" r
                WHERE r."projectId" = ${projectId}
                  AND r."historyWriteEnabled"
                  AND r."status" IN ('SUCCEEDED', 'SUCCEEDED_WITH_RETRIES')
                  AND r."finishedAt" > d."startedAt"
                  AND (
                    r."result" #>> '{history,fullReconciliationClean}' = 'true'
                    OR r."result" #>> '{history,historyGapRecoveryClean}' = 'true'
                  )
             ) AS recovered_at
        FROM disabled d
    )
    SELECT COUNT(*)::bigint AS runs,
           MIN("startedAt") AS "firstAt",
           MAX("finishedAt") AS "lastAt",
           COALESCE(BOOL_OR(
             "startedAt" <= ${asOf}
             AND (recovered_at IS NULL OR ${asOf} < recovered_at)
           ), false) AS "includesAsOf"
      FROM gaps
  `);
  const historyWriteGap = gapRows[0];
  const tickets = numeric(winners?.tickets);
  const scopedTickets = numeric(population?.scopedTickets);
  const earliestObservationAt = iso(population?.earliestObservationAt);
  const hasStaleness = winners?.stalenessP50 !== null && winners?.stalenessP50 !== undefined;
  const reconstruction: JiraAsOfReconstruction = {
    mode: 'AS_OF',
    provenance: 'RECONSTRUCTED',
    basis: 'OBSERVED_VERSIONS',
    asOf: asOf.toISOString(),
    tickets,
    ticketsWithoutObservation: Math.max(0, scopedTickets - tickets),
    ticketsRetiredAfterAsOf: numeric(winners?.ticketsRetiredAfterAsOf),
    versionRowsScanned: versionRows,
    earliestObservationAt,
    stalenessHours: hasStaleness
      ? {
          p50: numeric(winners?.stalenessP50),
          p95: numeric(winners?.stalenessP95),
          max: numeric(winners?.stalenessMax),
        }
      : null,
    beforeHistoryStart: scopedTickets > 0 && versionRows === 0,
    historyWriteGap: {
      includesAsOf: historyWriteGap?.includesAsOf ?? false,
      runs: numeric(historyWriteGap?.runs),
      firstAt: iso(historyWriteGap?.firstAt),
      lastAt: iso(historyWriteGap?.lastAt),
    },
    quality: historyWriteGap?.includesAsOf
      ? 'UNAVAILABLE_HISTORY_WRITE_GAP'
      : 'AVAILABLE',
  };
  return {
    reconstruction,
    batches: jiraAsOfIssueBatches(client, projectId, asOf),
  };
}
