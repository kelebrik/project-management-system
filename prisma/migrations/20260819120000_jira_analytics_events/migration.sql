ALTER TABLE "JiraIssueSnapshot"
ADD COLUMN "jiraId" TEXT,
ADD COLUMN "issueCreatedAt" TIMESTAMP(3),
ADD COLUMN "commitCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "mergeRequestCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "developmentUpdatedAt" TIMESTAMP(3),
ADD COLUMN "developmentDataAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "developmentBaselineCaptured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "transitionHistoryComplete" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "JiraIssueSnapshot_projectId_syncedAt_idx"
ON "JiraIssueSnapshot"("projectId", "syncedAt");

CREATE INDEX "JiraIssueSnapshot_projectId_status_idx"
ON "JiraIssueSnapshot"("projectId", "status");

CREATE TABLE "JiraIssueStatusTransition" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "transitionKey" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "transitionedAt" TIMESTAMP(3) NOT NULL,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JiraIssueStatusTransition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JiraIssueStatusTransition_snapshotId_transitionKey_key"
ON "JiraIssueStatusTransition"("snapshotId", "transitionKey");

CREATE INDEX "JiraIssueStatusTransition_snapshotId_transitionedAt_idx"
ON "JiraIssueStatusTransition"("snapshotId", "transitionedAt");

CREATE INDEX "JiraIssueStatusTransition_toStatus_transitionedAt_idx"
ON "JiraIssueStatusTransition"("toStatus", "transitionedAt");

ALTER TABLE "JiraIssueStatusTransition"
ADD CONSTRAINT "JiraIssueStatusTransition_snapshotId_fkey"
FOREIGN KEY ("snapshotId") REFERENCES "JiraIssueSnapshot"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "JiraDevelopmentActivity" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "activityKey" TEXT NOT NULL,
    "activityAt" TIMESTAMP(3) NOT NULL,
    "commitCount" INTEGER NOT NULL DEFAULT 0,
    "mergeRequestCount" INTEGER NOT NULL DEFAULT 0,
    "sprintAtObservation" TEXT,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JiraDevelopmentActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JiraDevelopmentActivity_snapshotId_activityKey_key"
ON "JiraDevelopmentActivity"("snapshotId", "activityKey");

CREATE INDEX "JiraDevelopmentActivity_snapshotId_activityAt_idx"
ON "JiraDevelopmentActivity"("snapshotId", "activityAt");

CREATE INDEX "JiraDevelopmentActivity_activityAt_idx"
ON "JiraDevelopmentActivity"("activityAt");

ALTER TABLE "JiraDevelopmentActivity"
ADD CONSTRAINT "JiraDevelopmentActivity_snapshotId_fkey"
FOREIGN KEY ("snapshotId") REFERENCES "JiraIssueSnapshot"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
