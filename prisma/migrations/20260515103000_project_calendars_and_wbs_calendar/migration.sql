CREATE TYPE "ProjectCalendarCode" AS ENUM ('RU', 'CN');

ALTER TABLE "WbsItem"
ADD COLUMN "calendarCode" "ProjectCalendarCode" NOT NULL DEFAULT 'RU';

CREATE TABLE "ProjectCalendarOverride" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "calendarCode" "ProjectCalendarCode" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isWorkingDay" BOOLEAN NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCalendarOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectCalendarOverride_projectId_calendarCode_date_key"
ON "ProjectCalendarOverride"("projectId", "calendarCode", "date");

CREATE INDEX "ProjectCalendarOverride_projectId_calendarCode_date_idx"
ON "ProjectCalendarOverride"("projectId", "calendarCode", "date");

ALTER TABLE "ProjectCalendarOverride"
ADD CONSTRAINT "ProjectCalendarOverride_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
