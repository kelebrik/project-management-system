CREATE TYPE "JiraIssueVersionProvenance" AS ENUM ('OBSERVED', 'RECONSTRUCTED');
CREATE TYPE "JiraHistoryRetryStatus" AS ENUM ('PENDING', 'RESOLVED');

ALTER TABLE "JiraAnalyticsSettings"
ADD COLUMN "historyCursorUpdatedAt" TIMESTAMP(3),
ADD COLUMN "historyCursorJiraIssueId" TEXT,
ADD COLUMN "historyLastFullReconciledAt" TIMESTAMP(3),
ADD COLUMN "historyFullCursorIssueKey" TEXT,
ADD COLUMN "historyFullStartedAt" TIMESTAMP(3);

CREATE TABLE "JiraIssueVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "jiraIssueId" TEXT NOT NULL,
    "issueKey" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jiraUpdatedAt" TIMESTAMP(3) NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "provenance" "JiraIssueVersionProvenance" NOT NULL DEFAULT 'OBSERVED',
    "contentHash" CHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadBytes" INTEGER NOT NULL,
    "syncRunId" TEXT NOT NULL,
    "changelogComplete" BOOLEAN NOT NULL,
    "commentsComplete" BOOLEAN NOT NULL,
    "worklogsComplete" BOOLEAN NOT NULL,
    "remoteLinksComplete" BOOLEAN NOT NULL,
    "attachmentReferencesStripped" INTEGER NOT NULL DEFAULT 0,
    "validationWarnings" JSONB,
    "summary" TEXT NOT NULL,
    "issueUrl" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "statusCategory" TEXT,
    "priority" TEXT NOT NULL,
    "resolution" TEXT,
    "resolutionAt" TIMESTAMP(3),
    "issueCreatedAt" TIMESTAMP(3),
    "issueUpdatedAt" TIMESTAMP(3) NOT NULL,
    "assignee" TEXT,
    "reporter" TEXT,
    "parentKey" TEXT,
    "epicKey" TEXT,
    "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sprintIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sprint" TEXT,
    "criticalPriorityAt" TIMESTAMP(3),
    "criticalEndPriority" TEXT,
    "commitCount" INTEGER NOT NULL DEFAULT 0,
    "mergeRequestCount" INTEGER NOT NULL DEFAULT 0,
    "developmentUpdatedAt" TIMESTAMP(3),
    "developmentDataAvailable" BOOLEAN NOT NULL DEFAULT false,
    "developmentBaselineCaptured" BOOLEAN NOT NULL DEFAULT false,
    "transitionHistoryComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JiraIssueVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JiraIssueVersion_projectId_jiraIssueId_contentHash_key"
ON "JiraIssueVersion"("projectId", "jiraIssueId", "contentHash");

CREATE INDEX "JiraIssueVersion_projectId_jiraUpdatedAt_jiraIssueId_idx"
ON "JiraIssueVersion"("projectId", "jiraUpdatedAt", "jiraIssueId");

CREATE INDEX "JiraIssueVersion_snapshotId_observedAt_idx"
ON "JiraIssueVersion"("snapshotId", "observedAt");

CREATE INDEX "JiraIssueVersion_projectId_status_priority_idx"
ON "JiraIssueVersion"("projectId", "status", "priority");

CREATE INDEX "JiraIssueVersion_projectId_resolution_resolutionAt_idx"
ON "JiraIssueVersion"("projectId", "resolution", "resolutionAt");

CREATE INDEX "JiraIssueVersion_labels_idx"
ON "JiraIssueVersion" USING GIN ("labels");

ALTER TABLE "JiraIssueVersion"
ADD CONSTRAINT "JiraIssueVersion_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JiraIssueVersion"
ADD CONSTRAINT "JiraIssueVersion_snapshotId_fkey"
FOREIGN KEY ("snapshotId") REFERENCES "JiraIssueSnapshot"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JiraIssueSnapshot"
ADD COLUMN "currentVersionId" TEXT;

CREATE UNIQUE INDEX "JiraIssueSnapshot_currentVersionId_key"
ON "JiraIssueSnapshot"("currentVersionId");

ALTER TABLE "JiraIssueSnapshot"
ADD CONSTRAINT "JiraIssueSnapshot_currentVersionId_fkey"
FOREIGN KEY ("currentVersionId") REFERENCES "JiraIssueVersion"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "JiraIssueHistoryRetry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "jiraIssueId" TEXT,
    "issueKey" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "lastError" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "firstFailedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFailedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRetryAt" TIMESTAMP(3) NOT NULL,
    "lastObservedUpdatedAt" TIMESTAMP(3),
    "status" "JiraHistoryRetryStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraIssueHistoryRetry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JiraIssueHistoryRetry_projectId_issueKey_key"
ON "JiraIssueHistoryRetry"("projectId", "issueKey");

CREATE INDEX "JiraIssueHistoryRetry_status_nextRetryAt_idx"
ON "JiraIssueHistoryRetry"("status", "nextRetryAt");

CREATE INDEX "JiraIssueHistoryRetry_projectId_status_firstFailedAt_idx"
ON "JiraIssueHistoryRetry"("projectId", "status", "firstFailedAt");

ALTER TABLE "JiraIssueHistoryRetry"
ADD CONSTRAINT "JiraIssueHistoryRetry_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
