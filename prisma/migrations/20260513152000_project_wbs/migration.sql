CREATE TYPE "WbsItemType" AS ENUM ('PHASE', 'WORK_PACKAGE', 'DELIVERABLE', 'TASK');

CREATE TYPE "WbsItemStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'AT_RISK', 'BLOCKED', 'DONE', 'CANCELLED');

CREATE TABLE "WbsItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "WbsItemType" NOT NULL DEFAULT 'TASK',
    "status" "WbsItemStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "owner" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "plannedCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "forecastCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "jiraTicketKey" TEXT,
    "jiraTicketUrl" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WbsItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WbsItem_projectId_code_key" ON "WbsItem"("projectId", "code");

CREATE INDEX "WbsItem_projectId_parentId_idx" ON "WbsItem"("projectId", "parentId");

CREATE INDEX "WbsItem_projectId_sortOrder_idx" ON "WbsItem"("projectId", "sortOrder");

ALTER TABLE "WbsItem" ADD CONSTRAINT "WbsItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WbsItem" ADD CONSTRAINT "WbsItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WbsItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
