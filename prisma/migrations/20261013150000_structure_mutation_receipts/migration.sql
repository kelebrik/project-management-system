-- Structure writes sent with a mutation id: a request sent again (a lost
-- answer, a retry) is answered with the first one's outcome, never run twice.
CREATE TABLE "StructureMutationReceipt" (
    "userId" TEXT NOT NULL,
    "mutationId" TEXT NOT NULL,
    "projectId" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "baseVersion" BIGINT,
    "state" TEXT NOT NULL,
    "claimToken" TEXT NOT NULL,
    "claimedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commitVersion" BIGINT,
    "outcome" JSONB,
    "outcomeComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StructureMutationReceipt_pkey" PRIMARY KEY ("userId","mutationId")
);

CREATE INDEX "StructureMutationReceipt_createdAt_idx" ON "StructureMutationReceipt"("createdAt");
