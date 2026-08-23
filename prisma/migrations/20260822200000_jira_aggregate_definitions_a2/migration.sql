CREATE TABLE "JiraAggregateDefinition" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "groupBy" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "filterLogic" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "periodMode" TEXT NOT NULL,
    "periodDays" INTEGER,
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "fingerprint" CHAR(64) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraAggregateDefinition_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JiraAggregateDefinition_source_check"
      CHECK ("source" IN ('issues', 'transitions', 'development', 'criticalBugs')),
    CONSTRAINT "JiraAggregateDefinition_metric_check"
      CHECK ("metric" IN ('count', 'averageDuration', 'p50Duration', 'p85Duration', 'p95Duration', 'commits', 'mergeRequests')),
    CONSTRAINT "JiraAggregateDefinition_groupBy_check"
      CHECK ("groupBy" IN ('none', 'project', 'status', 'assignee', 'priority', 'sprint', 'issueType', 'resolution', 'fromStatus', 'toStatus', 'week')),
    CONSTRAINT "JiraAggregateDefinition_scope_check"
      CHECK ("scope" IN ('active', 'retro')),
    CONSTRAINT "JiraAggregateDefinition_filterLogic_check"
      CHECK ("filterLogic" IN ('and', 'or')),
    CONSTRAINT "JiraAggregateDefinition_periodMode_check"
      CHECK ("periodMode" IN ('NONE', 'FIXED', 'DASHBOARD')),
    CONSTRAINT "JiraAggregateDefinition_period_check"
      CHECK (("periodMode" = 'FIXED') = ("periodDays" IS NOT NULL)),
    CONSTRAINT "JiraAggregateDefinition_periodDays_check"
      CHECK ("periodDays" IS NULL OR "periodDays" IN (30, 90, 180, 365)),
    CONSTRAINT "JiraAggregateDefinition_timeZone_check"
      CHECK ("timeZone" IN ('Europe/Moscow', 'UTC')),
    CONSTRAINT "JiraAggregateDefinition_fingerprint_check"
      CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "JiraAggregateDefinition_sortOrder_check"
      CHECK ("sortOrder" >= 0 AND "sortOrder" <= 10000),
    CONSTRAINT "JiraAggregateDefinition_version_check"
      CHECK ("version" >= 1)
);

CREATE UNIQUE INDEX "JiraAggregateDefinition_projectId_nameKey_key"
ON "JiraAggregateDefinition"("projectId", "nameKey");

CREATE UNIQUE INDEX "JiraAggregateDefinition_projectId_fingerprint_key"
ON "JiraAggregateDefinition"("projectId", "fingerprint");

CREATE INDEX "JiraAggregateDefinition_projectId_sortOrder_createdAt_idx"
ON "JiraAggregateDefinition"("projectId", "sortOrder", "createdAt");

ALTER TABLE "JiraAggregateDefinition"
ADD CONSTRAINT "JiraAggregateDefinition_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "JiraAnalyticsDashboardConversion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "originalConfig" JSONB NOT NULL,
    "originalConfigHash" CHAR(64) NOT NULL,
    "convertedConfigHash" CHAR(64) NOT NULL,
    "convertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraAnalyticsDashboardConversion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JiraAnalyticsDashboardConversion_originalConfigHash_check"
      CHECK ("originalConfigHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "JiraAnalyticsDashboardConversion_convertedConfigHash_check"
      CHECK ("convertedConfigHash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "JiraAnalyticsDashboardConversion_projectId_key"
ON "JiraAnalyticsDashboardConversion"("projectId");

CREATE INDEX "JiraAnalyticsDashboardConversion_convertedAt_idx"
ON "JiraAnalyticsDashboardConversion"("convertedAt");

CREATE INDEX "JiraAnalyticsDashboardConversion_rolledBackAt_idx"
ON "JiraAnalyticsDashboardConversion"("rolledBackAt");

ALTER TABLE "JiraAnalyticsDashboardConversion"
ADD CONSTRAINT "JiraAnalyticsDashboardConversion_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
