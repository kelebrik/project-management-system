CREATE TYPE "JiraAnalyticsScopeType" AS ENUM ('LABEL', 'EPIC');

ALTER TABLE "JiraAnalyticsSettings"
ADD COLUMN "jiraScopeType" "JiraAnalyticsScopeType" NOT NULL DEFAULT 'LABEL',
ADD COLUMN "jiraScopeValue" TEXT,
ADD COLUMN "dashboardConfig" JSONB;

UPDATE "JiraAnalyticsSettings"
SET "jiraScopeValue" = "jiraLabel";

ALTER TABLE "JiraAnalyticsSettings"
ALTER COLUMN "jiraScopeValue" SET NOT NULL,
ALTER COLUMN "jiraLabel" SET DEFAULT '';
