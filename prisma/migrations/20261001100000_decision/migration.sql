-- The project's decision log: proposals, approvals by one approver, decisions recorded as taken.
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT '',
    "decision" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByName" TEXT,
    "approverUserId" TEXT,
    "approverName" TEXT,
    "requestedAt" TIMESTAMP(3),
    "approvalComment" TEXT,
    "answeredAt" TIMESTAMP(3),
    "issueId" TEXT,
    "raidItemId" TEXT,
    "wbsItemId" TEXT,
    "changeRequestId" TEXT,
    "supersedesId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Decision_supersedesId_key" ON "Decision"("supersedesId");
CREATE INDEX "Decision_projectId_status_idx" ON "Decision"("projectId", "status");
CREATE INDEX "Decision_approverUserId_status_idx" ON "Decision"("approverUserId", "status");

ALTER TABLE "Decision" ADD CONSTRAINT "Decision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
