-- The version of a project's Structure: every write under the project's lock
-- moves it by one, so a browser applying changes knows whether it saw them all.
CREATE TABLE "ProjectStructureVersion" (
    "projectId" TEXT NOT NULL,
    "version" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "ProjectStructureVersion_pkey" PRIMARY KEY ("projectId")
);

ALTER TABLE "ProjectStructureVersion" ADD CONSTRAINT "ProjectStructureVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Commands of one write share its version and keep their order inside it;
-- both stay empty on older commands, so the table is not rewritten.
ALTER TABLE "WbsCommand" ADD COLUMN "structureVersion" BIGINT,
ADD COLUMN "commandOrdinal" INTEGER;
