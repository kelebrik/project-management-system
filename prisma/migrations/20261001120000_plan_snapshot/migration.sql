-- Named, unchanging copies of a project's plan, taken for committees and compared later.
CREATE TABLE "PlanSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdByName" TEXT,
    "rowCount" INTEGER NOT NULL,
    "rows" JSONB NOT NULL,

    CONSTRAINT "PlanSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanSnapshot_projectId_takenAt_idx" ON "PlanSnapshot"("projectId", "takenAt");

ALTER TABLE "PlanSnapshot" ADD CONSTRAINT "PlanSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
