ALTER TYPE "WbsItemType" ADD VALUE 'MILESTONE';
CREATE TYPE "WbsDependencyType" AS ENUM ('FS', 'SS', 'FF', 'SF');

ALTER TABLE "Milestone" ADD COLUMN "code" TEXT;

CREATE TABLE "WbsDependency" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "type" "WbsDependencyType" NOT NULL DEFAULT 'FS',
    "lagDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WbsDependency_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Milestone_projectId_code_idx" ON "Milestone"("projectId", "code");
CREATE INDEX "WbsDependency_projectId_predecessorId_idx" ON "WbsDependency"("projectId", "predecessorId");
CREATE INDEX "WbsDependency_projectId_successorId_idx" ON "WbsDependency"("projectId", "successorId");
CREATE UNIQUE INDEX "WbsDependency_projectId_predecessorId_successorId_type_key" ON "WbsDependency"("projectId", "predecessorId", "successorId", "type");

ALTER TABLE "WbsDependency" ADD CONSTRAINT "WbsDependency_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WbsDependency" ADD CONSTRAINT "WbsDependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "WbsItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WbsDependency" ADD CONSTRAINT "WbsDependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "WbsItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
