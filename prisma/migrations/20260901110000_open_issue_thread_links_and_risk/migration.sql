-- Normalize multiple thread links and connect an open issue to one concrete RAID risk.
ALTER TABLE "Issue"
  ADD COLUMN "riskId" TEXT;

CREATE TABLE "IssueThreadLink" (
  "id" TEXT NOT NULL,
  "issueId" TEXT NOT NULL,
  "threadUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IssueThreadLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IssueThreadLink_issueId_threadUrl_key"
  ON "IssueThreadLink"("issueId", "threadUrl");
CREATE INDEX "IssueThreadLink_issueId_createdAt_idx"
  ON "IssueThreadLink"("issueId", "createdAt");
CREATE INDEX "Issue_riskId_idx" ON "Issue"("riskId");

ALTER TABLE "IssueThreadLink"
  ADD CONSTRAINT "IssueThreadLink_issueId_fkey"
  FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Issue"
  ADD CONSTRAINT "Issue_riskId_fkey"
  FOREIGN KEY ("riskId") REFERENCES "RaidItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
