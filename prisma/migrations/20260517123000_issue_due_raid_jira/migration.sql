ALTER TABLE "Issue" ADD COLUMN "initialDueDate" TIMESTAMP(3);

UPDATE "Issue"
SET "initialDueDate" = "dueDate"
WHERE "dueDate" IS NOT NULL;

ALTER TABLE "RaidItem"
  ADD COLUMN "jiraTicketKey" TEXT,
  ADD COLUMN "jiraTicketUrl" TEXT;
