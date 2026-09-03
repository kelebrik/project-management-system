ALTER TYPE "JiraSyncRunKind" ADD VALUE IF NOT EXISTS 'CURRENT';

ALTER TABLE "JiraAnalyticsSettings"
  ADD COLUMN "currentProjectionRefreshedAt" TIMESTAMP(3);
