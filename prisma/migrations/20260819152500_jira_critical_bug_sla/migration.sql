ALTER TABLE "JiraIssueSnapshot"
ADD COLUMN "criticalPriorityAt" TIMESTAMP(3),
ADD COLUMN "resolutionAt" TIMESTAMP(3),
ADD COLUMN "criticalSlaTracked" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "JiraIssueSnapshot_projectId_criticalSlaTracked_idx"
ON "JiraIssueSnapshot"("projectId", "criticalSlaTracked");
