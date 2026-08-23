-- Add durable Jira synchronization runs without rewriting existing history rows.
CREATE TYPE "JiraSyncRunKind" AS ENUM ('SYNC', 'BACKFILL');
CREATE TYPE "JiraSyncRunStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'SUCCEEDED_WITH_RETRIES',
  'PAUSED_DEADLINE',
  'STOPPED_CAPACITY',
  'FAILED',
  'CANCELLED'
);

ALTER TABLE "JiraAnalyticsSettings"
  ADD COLUMN "syncRunId" TEXT,
  ADD COLUMN "syncFenceToken" INTEGER;

ALTER TABLE "JiraIssueSnapshot"
  ADD COLUMN "projectionUnversionedSince" TIMESTAMP(3);

CREATE TABLE "JiraSyncRun" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "kind" "JiraSyncRunKind" NOT NULL DEFAULT 'SYNC',
  "status" "JiraSyncRunStatus" NOT NULL DEFAULT 'QUEUED',
  "phase" TEXT NOT NULL DEFAULT 'PENDING',
  "activeSlot" TEXT,
  "historyWriteEnabled" BOOLEAN NOT NULL,
  "jiraScopeType" "JiraAnalyticsScopeType" NOT NULL,
  "jiraScopeValue" TEXT NOT NULL,
  "jiraBaseUrl" TEXT,
  "scopeChanged" BOOLEAN NOT NULL DEFAULT false,
  "requestedById" TEXT,
  "requestedByRole" TEXT,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "deadlinePauseCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "fenceToken" INTEGER NOT NULL DEFAULT 0,
  "workerId" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "heartbeatAt" TIMESTAMP(3),
  "deadlineAt" TIMESTAMP(3),
  "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "elapsedMs" INTEGER,
  "resumeCursorIssueKey" TEXT,
  "resumedFromRunId" TEXT,
  "discoveredIssueCount" INTEGER NOT NULL DEFAULT 0,
  "hydratedIssueCount" INTEGER NOT NULL DEFAULT 0,
  "versionsCreated" INTEGER NOT NULL DEFAULT 0,
  "retriesQueued" INTEGER NOT NULL DEFAULT 0,
  "jiraRequestCount" INTEGER NOT NULL DEFAULT 0,
  "jiraRequestDurationMsTotal" INTEGER NOT NULL DEFAULT 0,
  "jiraRequestDurationMsMax" INTEGER NOT NULL DEFAULT 0,
  "jiraRequestsByRoute" JSONB,
  "jiraRequestsByStatusClass" JSONB,
  "progressDone" INTEGER NOT NULL DEFAULT 0,
  "progressTotal" INTEGER NOT NULL DEFAULT 0,
  "progressUnit" TEXT,
  "result" JSONB,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JiraSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JiraSyncRun_projectId_activeSlot_key"
  ON "JiraSyncRun"("projectId", "activeSlot");
CREATE INDEX "JiraSyncRun_activeSlot_status_enqueuedAt_idx"
  ON "JiraSyncRun"("activeSlot", "status", "enqueuedAt");
CREATE INDEX "JiraSyncRun_projectId_enqueuedAt_idx"
  ON "JiraSyncRun"("projectId", "enqueuedAt" DESC);
CREATE INDEX "JiraSyncRun_projectId_kind_status_idx"
  ON "JiraSyncRun"("projectId", "kind", "status");
CREATE INDEX "JiraIssueSnapshot_projectId_projectionUnversionedSince_idx"
  ON "JiraIssueSnapshot"("projectId", "projectionUnversionedSince");
CREATE INDEX "JiraIssueVersion_projectId_syncRunId_idx"
  ON "JiraIssueVersion"("projectId", "syncRunId");

ALTER TABLE "JiraSyncRun"
  ADD CONSTRAINT "JiraSyncRun_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
