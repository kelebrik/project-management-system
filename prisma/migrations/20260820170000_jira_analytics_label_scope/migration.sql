CREATE TABLE "JiraAnalyticsSettings" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "jiraLabel" TEXT NOT NULL,
    "syncStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "lastSyncedAt" TIMESTAMP(3),
    "syncStartedAt" TIMESTAMP(3),
    "syncLockExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraAnalyticsSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JiraAnalyticsSettings_projectId_key"
ON "JiraAnalyticsSettings"("projectId");

ALTER TABLE "JiraAnalyticsSettings"
ADD CONSTRAINT "JiraAnalyticsSettings_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JiraIssueSnapshot"
ADD COLUMN "retiredAt" TIMESTAMP(3);

CREATE INDEX "JiraIssueSnapshot_projectId_retiredAt_idx"
ON "JiraIssueSnapshot"("projectId", "retiredAt");

INSERT INTO "JiraAnalyticsSettings" (
    "id",
    "projectId",
    "jiraLabel",
    "syncStatus",
    "createdAt",
    "updatedAt"
)
SELECT
    'jira_analytics_' || "id",
    "id",
    'cvte968',
    'CONFIGURED',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Project"
WHERE LOWER("code") = 'cvte968d4'
ON CONFLICT ("projectId") DO NOTHING;
