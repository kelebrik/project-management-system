-- Why checkpoints moved: one row per milestone or goal date change, with its trigger and, later, a reason.
CREATE TABLE "ScheduleShift" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SHIFT',
    "checkpointId" TEXT,
    "checkpointCode" TEXT NOT NULL,
    "checkpointTitle" TEXT NOT NULL,
    "checkpointType" TEXT NOT NULL,
    "previousDate" DATE,
    "newDate" DATE,
    "deltaDays" INTEGER,
    "baselineDate" DATE,
    "trigger" TEXT NOT NULL,
    "sourceItemId" TEXT,
    "sourceCode" TEXT,
    "sourceTitle" TEXT,
    "sourceIssueId" TEXT,
    "sourceNote" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "operationId" TEXT NOT NULL,
    "reasonCategory" TEXT,
    "reasonText" TEXT,
    "reasonRaidItemId" TEXT,
    "reasonSetById" TEXT,
    "reasonSetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleShift_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduleShift_projectId_createdAt_idx" ON "ScheduleShift"("projectId", "createdAt");
CREATE INDEX "ScheduleShift_checkpointId_createdAt_idx" ON "ScheduleShift"("checkpointId", "createdAt");
CREATE INDEX "ScheduleShift_operationId_idx" ON "ScheduleShift"("operationId");

ALTER TABLE "ScheduleShift" ADD CONSTRAINT "ScheduleShift_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
