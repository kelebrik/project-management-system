CREATE TABLE "IssueStatusUpdate" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "statusAt" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssueStatusUpdate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IssueStatusUpdate_issueId_statusAt_idx" ON "IssueStatusUpdate"("issueId", "statusAt");

CREATE INDEX "IssueStatusUpdate_issueId_createdAt_idx" ON "IssueStatusUpdate"("issueId", "createdAt");

ALTER TABLE "IssueStatusUpdate" ADD CONSTRAINT "IssueStatusUpdate_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
