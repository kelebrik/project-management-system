-- Weekly check-ins of people on their own work.
CREATE TABLE "WorkCheckIn" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "wbsItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "confidence" TEXT NOT NULL,
    "done" TEXT NOT NULL DEFAULT '',
    "blocker" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkCheckIn_wbsItemId_userId_weekStart_key" ON "WorkCheckIn"("wbsItemId", "userId", "weekStart");
CREATE INDEX "WorkCheckIn_projectId_weekStart_idx" ON "WorkCheckIn"("projectId", "weekStart");

ALTER TABLE "WorkCheckIn" ADD CONSTRAINT "WorkCheckIn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkCheckIn" ADD CONSTRAINT "WorkCheckIn_wbsItemId_fkey" FOREIGN KEY ("wbsItemId") REFERENCES "WbsItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
