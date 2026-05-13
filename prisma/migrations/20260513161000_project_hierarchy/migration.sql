ALTER TABLE "Project" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Project" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

INSERT INTO "Project" (
    "id",
    "code",
    "name",
    "portfolio",
    "sponsor",
    "projectManager",
    "status",
    "rag",
    "startDate",
    "targetDate",
    "budgetPlanned",
    "budgetForecast",
    "scheduleVariance",
    "progress",
    "summary",
    "sortOrder",
    "createdAt",
    "updatedAt"
)
SELECT
    'test_project_001',
    'TEST-001',
    'Первый тестовый проект',
    'Project Management',
    'PMO',
    'Project Manager',
    'ACTIVE'::"ProjectStatus",
    'GREEN'::"RagStatus",
    '2026-05-01T00:00:00.000Z'::timestamp,
    '2026-08-31T00:00:00.000Z'::timestamp,
    10000000.00,
    10000000.00,
    0,
    0,
    'Тестовый проект для настройки структуры проектов и WBS.',
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Project" WHERE "code" = 'TEST-001');

UPDATE "Project"
SET "parentId" = (SELECT "id" FROM "Project" WHERE "code" = 'TEST-001' LIMIT 1), "sortOrder" = 10
WHERE "code" = 'ERP' AND "id" <> 'test_project_001';

UPDATE "WbsItem"
SET "projectId" = (SELECT "id" FROM "Project" WHERE "code" = 'TEST-001' LIMIT 1)
WHERE "projectId" = (SELECT "id" FROM "Project" WHERE "code" = 'ERP' LIMIT 1)
  AND NOT EXISTS (
    SELECT 1
    FROM "WbsItem"
    WHERE "projectId" = (SELECT "id" FROM "Project" WHERE "code" = 'TEST-001' LIMIT 1)
  );

CREATE INDEX "Project_parentId_idx" ON "Project"("parentId");
CREATE INDEX "Project_sortOrder_idx" ON "Project"("sortOrder");

ALTER TABLE "Project" ADD CONSTRAINT "Project_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
