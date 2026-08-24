CREATE TYPE "JiraAnalyticsRollbackState" AS ENUM ('AVAILABLE', 'USED', 'CLOSED');

ALTER TABLE "JiraAnalyticsDashboardConversion"
ADD COLUMN "originalConfigStored" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "sourceConfigHash" CHAR(64),
ADD COLUMN "createdDefinitionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "rollbackState" "JiraAnalyticsRollbackState" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN "rollbackFinalizedAt" TIMESTAMP(3);

UPDATE "JiraAnalyticsDashboardConversion"
SET
  "sourceConfigHash" = "originalConfigHash",
  "rollbackState" = CASE
    WHEN "rolledBackAt" IS NULL THEN 'AVAILABLE'::"JiraAnalyticsRollbackState"
    ELSE 'USED'::"JiraAnalyticsRollbackState"
  END;

ALTER TABLE "JiraAnalyticsDashboardConversion"
ALTER COLUMN "sourceConfigHash" SET NOT NULL,
ADD CONSTRAINT "JiraAnalyticsDashboardConversion_sourceConfigHash_check"
  CHECK ("sourceConfigHash" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "JiraAnalyticsDashboardConversion_attempt_check"
  CHECK ("attempt" > 0),
ADD CONSTRAINT "JiraAnalyticsDashboardConversion_createdDefinitionIds_check"
  CHECK (jsonb_typeof("createdDefinitionIds") = 'array'),
ADD CONSTRAINT "JiraAnalyticsDashboardConversion_rollbackState_check"
  CHECK (
    ("rollbackState" = 'AVAILABLE' AND "rolledBackAt" IS NULL AND "rollbackFinalizedAt" IS NULL)
    OR ("rollbackState" = 'USED' AND "rolledBackAt" IS NOT NULL AND "rollbackFinalizedAt" IS NULL)
    OR ("rollbackState" = 'CLOSED' AND "rollbackFinalizedAt" IS NOT NULL)
  );

CREATE INDEX "JiraAnalyticsDashboardConversion_rollbackState_idx"
ON "JiraAnalyticsDashboardConversion"("rollbackState");
