-- Roles, WBS command history and normalized WBS baseline snapshots.
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PROJECT_MANAGER', 'TEAM_MEMBER', 'EXECUTIVE_VIEWER');

CREATE TYPE "WbsCommandType" AS ENUM (
  'CREATE',
  'UPDATE',
  'DELETE',
  'MOVE',
  'INDENT',
  'OUTDENT',
  'BULK_UPDATE',
  'RESTORE',
  'BASELINE'
);

CREATE TYPE "WbsBaselineStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'PROJECT_MANAGER',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WbsCommand" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT,
  "type" "WbsCommandType" NOT NULL,
  "payload" JSONB NOT NULL,
  "beforeSnapshot" JSONB,
  "afterSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WbsCommand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WbsBaseline" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "status" "WbsBaselineStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WbsBaseline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WbsBaselineItem" (
  "id" TEXT NOT NULL,
  "baselineId" TEXT NOT NULL,
  "sourceWbsItemId" TEXT,
  "parentCode" TEXT,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" "WbsItemType" NOT NULL DEFAULT 'TASK',
  "status" "WbsItemStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "owner" TEXT NOT NULL,
  "startDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "wbsLevel" INTEGER,
  "predecessor1" TEXT,
  "predecessor2" TEXT,
  "predecessor3" TEXT,
  "leadLagDays" INTEGER NOT NULL DEFAULT 0,
  "workDays" INTEGER,
  "calendarDays" INTEGER,
  "calendarCode" "ProjectCalendarCode" NOT NULL DEFAULT 'RU',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "WbsBaselineItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

CREATE INDEX "WbsCommand_projectId_createdAt_idx" ON "WbsCommand"("projectId", "createdAt");
CREATE INDEX "WbsCommand_userId_createdAt_idx" ON "WbsCommand"("userId", "createdAt");
CREATE INDEX "WbsCommand_type_createdAt_idx" ON "WbsCommand"("type", "createdAt");

CREATE UNIQUE INDEX "WbsBaseline_projectId_version_key" ON "WbsBaseline"("projectId", "version");
CREATE INDEX "WbsBaseline_projectId_status_idx" ON "WbsBaseline"("projectId", "status");
CREATE INDEX "WbsBaseline_createdById_idx" ON "WbsBaseline"("createdById");

CREATE UNIQUE INDEX "WbsBaselineItem_baselineId_code_key" ON "WbsBaselineItem"("baselineId", "code");
CREATE INDEX "WbsBaselineItem_baselineId_sortOrder_idx" ON "WbsBaselineItem"("baselineId", "sortOrder");
CREATE INDEX "WbsBaselineItem_sourceWbsItemId_idx" ON "WbsBaselineItem"("sourceWbsItemId");

ALTER TABLE "WbsCommand"
  ADD CONSTRAINT "WbsCommand_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WbsCommand"
  ADD CONSTRAINT "WbsCommand_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WbsBaseline"
  ADD CONSTRAINT "WbsBaseline_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WbsBaseline"
  ADD CONSTRAINT "WbsBaseline_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WbsBaselineItem"
  ADD CONSTRAINT "WbsBaselineItem_baselineId_fkey"
  FOREIGN KEY ("baselineId") REFERENCES "WbsBaseline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
