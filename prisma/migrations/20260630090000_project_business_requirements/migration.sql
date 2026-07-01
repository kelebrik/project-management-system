CREATE TABLE "ProjectBusinessRequirements" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBusinessRequirements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectBusinessRequirements_projectId_key" ON "ProjectBusinessRequirements"("projectId");
CREATE INDEX "ProjectBusinessRequirements_projectId_idx" ON "ProjectBusinessRequirements"("projectId");

ALTER TABLE "ProjectBusinessRequirements"
ADD CONSTRAINT "ProjectBusinessRequirements_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
