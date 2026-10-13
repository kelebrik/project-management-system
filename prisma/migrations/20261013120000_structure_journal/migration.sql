-- The journal of Structure writes: a browser that holds the Structure at some
-- version reads only the rows and links changed since. The journal starts now:
-- versions before it are read whole.
ALTER TABLE "ProjectStructureVersion" ADD COLUMN "journalFloor" BIGINT NOT NULL DEFAULT 0;
UPDATE "ProjectStructureVersion" SET "journalFloor" = "version";

CREATE TABLE "ProjectStructureCommit" (
    "projectId" TEXT NOT NULL,
    "version" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectStructureCommit_pkey" PRIMARY KEY ("projectId","version")
);

CREATE TABLE "ProjectStructureChange" (
    "projectId" TEXT NOT NULL,
    "version" BIGINT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,

    CONSTRAINT "ProjectStructureChange_pkey" PRIMARY KEY ("projectId","version","entityType","entityId")
);

ALTER TABLE "ProjectStructureCommit" ADD CONSTRAINT "ProjectStructureCommit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectStructureChange" ADD CONSTRAINT "ProjectStructureChange_projectId_version_fkey" FOREIGN KEY ("projectId", "version") REFERENCES "ProjectStructureCommit"("projectId", "version") ON DELETE CASCADE ON UPDATE CASCADE;
