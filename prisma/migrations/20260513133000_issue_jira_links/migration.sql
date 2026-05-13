-- CreateTable
CREATE TABLE "IssueJiraLink" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "jiraUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueJiraLink_pkey" PRIMARY KEY ("id")
);

-- Backfill existing single-ticket issue links into the new relation table.
INSERT INTO "IssueJiraLink" ("id", "issueId", "jiraKey", "jiraUrl", "createdAt")
SELECT
    concat('backfill_', "id"),
    "id",
    "jiraTicketKey",
    "jiraTicketUrl",
    CURRENT_TIMESTAMP
FROM "Issue"
WHERE "jiraTicketKey" IS NOT NULL
  AND "jiraTicketUrl" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "IssueJiraLink_issueId_jiraKey_key" ON "IssueJiraLink"("issueId", "jiraKey");

-- CreateIndex
CREATE INDEX "IssueJiraLink_jiraKey_idx" ON "IssueJiraLink"("jiraKey");

-- AddForeignKey
ALTER TABLE "IssueJiraLink" ADD CONSTRAINT "IssueJiraLink_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
