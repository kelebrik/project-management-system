-- Editing sessions of the schedule shift journal: one person's run of edits of a project.
CREATE TABLE "ScheduleShiftSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "ScheduleShiftSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduleShiftSession_projectId_actorId_closedAt_idx" ON "ScheduleShiftSession"("projectId", "actorId", "closedAt");

-- At most one open session per project.
CREATE UNIQUE INDEX "ScheduleShiftSession_one_open_per_project" ON "ScheduleShiftSession"("projectId") WHERE "closedAt" IS NULL;

ALTER TABLE "ScheduleShiftSession" ADD CONSTRAINT "ScheduleShiftSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduleShift" ADD COLUMN "sessionId" TEXT;

CREATE INDEX "ScheduleShift_sessionId_idx" ON "ScheduleShift"("sessionId");

ALTER TABLE "ScheduleShift" ADD CONSTRAINT "ScheduleShift_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScheduleShiftSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
