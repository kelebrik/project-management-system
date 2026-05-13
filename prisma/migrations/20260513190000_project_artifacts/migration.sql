CREATE TABLE "ProjectArtifact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "url" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectArtifact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectArtifact_projectId_sortOrder_idx" ON "ProjectArtifact"("projectId", "sortOrder");

ALTER TABLE "ProjectArtifact" ADD CONSTRAINT "ProjectArtifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ProjectArtifact" (
    "id",
    "projectId",
    "title",
    "type",
    "owner",
    "status",
    "url",
    "description",
    "sortOrder",
    "createdAt",
    "updatedAt"
)
SELECT
    'test001_artifact_project_plan',
    "id",
    'CVTE CH AML 968d4 FF base project plan',
    'Project plan',
    'Gladkov',
    'Baseline',
    NULL,
    'Imported Excel baseline: WBS, dates, owners and milestones are loaded into TEST-001.',
    10,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Project"
WHERE "code" = 'TEST-001'
ON CONFLICT ("id") DO NOTHING;
