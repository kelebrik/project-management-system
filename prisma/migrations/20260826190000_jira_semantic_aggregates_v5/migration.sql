-- Replace the unused analytics presentation catalog with semantic aggregate
-- definitions. Jira snapshots, versions and event tables are intentionally
-- untouched: they remain the data lake and source of truth.
ALTER TABLE "JiraAggregateDefinition"
  ADD COLUMN "aggregateKey" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "system" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publishedVersion" INTEGER,
  ADD COLUMN "draftDefinition" JSONB,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "JiraAggregateDefinitionRevision"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN "changeKind" TEXT NOT NULL DEFAULT 'compatible',
  ADD COLUMN "publishedAt" TIMESTAMP(3);

ALTER TABLE "JiraAggregateDefinitionRevision"
  ADD CONSTRAINT "JiraAggregateDefinitionRevision_status_check"
    CHECK ("status" IN ('draft', 'published', 'archived')),
  ADD CONSTRAINT "JiraAggregateDefinitionRevision_changeKind_check"
    CHECK ("changeKind" IN ('compatible', 'breaking'));

-- The user explicitly approved removal of the unused dashboard/aggregate
-- configuration. No Jira or project planning data is deleted here.
DELETE FROM "JiraAnalyticsDashboardConversion";
DELETE FROM "JiraAggregateDefinition";

UPDATE "JiraAnalyticsSettings"
SET "dashboardConfig" = '{"version":5,"periodDays":180,"assignee":"","widgets":[]}'::jsonb;

CREATE UNIQUE INDEX "JiraAggregateDefinition_projectId_aggregateKey_key"
  ON "JiraAggregateDefinition"("projectId", "aggregateKey");

ALTER TABLE "JiraAggregateDefinition"
  ADD CONSTRAINT "JiraAggregateDefinition_publishedVersion_check"
    CHECK ("publishedVersion" IS NULL OR "publishedVersion" > 0);
