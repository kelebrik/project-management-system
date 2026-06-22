-- Add managed project target dates and change history.
ALTER TABLE "Project"
ADD COLUMN "initialTargetDate" TIMESTAMP(3);

UPDATE "Project"
SET "initialTargetDate" = "targetDate"
WHERE "initialTargetDate" IS NULL;

CREATE TABLE "ProjectTargetDateChange" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "previousDate" TIMESTAMP(3) NOT NULL,
    "newDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTargetDateChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectTargetDateChange_projectId_createdAt_idx"
ON "ProjectTargetDateChange"("projectId", "createdAt");

CREATE INDEX "ProjectTargetDateChange_createdById_idx"
ON "ProjectTargetDateChange"("createdById");

ALTER TABLE "ProjectTargetDateChange"
ADD CONSTRAINT "ProjectTargetDateChange_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectTargetDateChange"
ADD CONSTRAINT "ProjectTargetDateChange_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
