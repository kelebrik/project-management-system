ALTER TABLE "JiraIssueSnapshot"
ADD COLUMN "criticalEndPriority" TEXT;

UPDATE "JiraIssueSnapshot"
SET "criticalSlaTracked" = false
WHERE "criticalSlaTracked" = true;
