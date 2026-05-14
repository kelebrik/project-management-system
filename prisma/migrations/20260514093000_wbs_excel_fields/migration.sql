ALTER TABLE "WbsItem"
ADD COLUMN "wbsLevel" INTEGER,
ADD COLUMN "predecessor1" TEXT,
ADD COLUMN "predecessor2" TEXT,
ADD COLUMN "predecessor3" TEXT,
ADD COLUMN "leadLagDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "workDays" INTEGER,
ADD COLUMN "calendarDays" INTEGER,
ADD COLUMN "excelStartDate" TIMESTAMP(3),
ADD COLUMN "excelEndDate" TIMESTAMP(3),
ADD COLUMN "planWorkDays" INTEGER,
ADD COLUMN "planCalendarDays" INTEGER,
ADD COLUMN "templateColor" TEXT,
ADD COLUMN "priority" TEXT;

UPDATE "WbsItem"
SET
  "excelStartDate" = "startDate",
  "excelEndDate" = "dueDate";

WITH project AS (
  SELECT "id" FROM "Project" WHERE "code" = 'TEST-001' LIMIT 1
), excel_data (
  "code", "wbsLevel", "predecessor1", "predecessor2", "predecessor3", "leadLagDays", "workDays", "calendarDays", "excelStartDate", "excelEndDate", "planWorkDays", "planCalendarDays", "templateColor", "priority"
) AS (
  VALUES
    ('1', 1, NULL, NULL, NULL, 0, NULL, NULL, '2025-12-01T00:00:00.000Z'::timestamp, '2026-09-03T00:00:00.000Z'::timestamp, 178, 277, 'B', NULL),
    ('1.1', 2, NULL, NULL, NULL, 0, NULL, NULL, '2025-12-01T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, 106, 173, 'B', NULL),
    ('1.1.1', 3, NULL, NULL, NULL, 0, 1, NULL, '2025-12-01T00:00:00.000Z'::timestamp, NULL, 1, 1, 'G', NULL),
    ('1.1.2', 3, '1.1.1', NULL, NULL, 0, 9, NULL, NULL, NULL, 9, 11, 'G', NULL),
    ('1.1.3', 3, '1.1.2', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 12, 'G', NULL),
    ('1.1.4', 3, '1.1.3', NULL, NULL, 0, 40, NULL, NULL, NULL, 40, 74, 'R', NULL),
    ('1.1.5', 3, '1.1.1', NULL, NULL, 30, 5, NULL, NULL, NULL, 5, 7, 'G', NULL),
    ('1.1.6', 3, '1.1.1', NULL, NULL, 30, 5, NULL, NULL, NULL, 5, 7, 'G', NULL),
    ('1.1.7', 3, '1.1.5', NULL, NULL, 0, 25, NULL, NULL, NULL, 25, 44, 'G', NULL),
    ('1.1.8', 3, '1.1.6', NULL, NULL, 0, 15, NULL, NULL, NULL, 15, 29, 'G', NULL),
    ('1.1.9', 3, NULL, NULL, NULL, 0, 1, NULL, '2026-03-17T00:00:00.000Z'::timestamp, '2026-03-17T00:00:00.000Z'::timestamp, 1, 1, 'G', NULL),
    ('1.1.10', 3, '1.1.9', NULL, NULL, 2, 5, NULL, NULL, NULL, 5, 7, 'G', NULL),
    ('1.1.11', 3, NULL, NULL, NULL, 2, 5, NULL, '2026-04-27T00:00:00.000Z'::timestamp, '2026-04-27T00:00:00.000Z'::timestamp, 5, 10, 'G', NULL),
    ('1.1.12', 3, '1.1.11', NULL, NULL, 0, 5, NULL, NULL, NULL, 5, 8, 'G', NULL),
    ('1.1.13', 3, '1.1.11', NULL, NULL, 2, 5, NULL, NULL, NULL, 5, 7, 'G', NULL),
    ('1.1.14', 3, '1.1.11', NULL, NULL, 0, 5, NULL, NULL, NULL, 5, 8, 'B', NULL),
    ('1.1.15', 3, '1.1.14', NULL, NULL, 0, 5, NULL, NULL, NULL, 5, 7, 'X', NULL),
    ('1.2', 2, '1.1.15', NULL, NULL, 0, 0, NULL, NULL, NULL, 1, 1, 'O', NULL),
    ('1.3', 2, NULL, NULL, NULL, 0, NULL, NULL, '2026-05-07T00:00:00.000Z'::timestamp, '2026-08-25T00:00:00.000Z'::timestamp, 76, 111, 'X', NULL),
    ('1.3.1', 3, '1.1.11', NULL, NULL, 0, 15, NULL, NULL, NULL, 15, 22, 'B', NULL),
    ('1.3.2', 3, '1.3.1', NULL, NULL, 0, 15, NULL, NULL, NULL, 15, 25, 'X', NULL),
    ('1.3.3', 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-05-07T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, 30, 47, 'X', NULL),
    ('1.3.3.1', 4, '1.1.11', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 15, 'X', NULL),
    ('1.3.3.2', 4, '1.3.3.1', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 14, 'X', NULL),
    ('1.3.3.3', 4, '1.3.3.2', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 18, 'X', NULL),
    ('1.3.4', 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-05-07T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, 30, 47, 'X', NULL),
    ('1.3.4.1', 4, '1.1.11', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 15, 'X', NULL),
    ('1.3.4.2', 4, '1.3.4.1', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 14, 'X', NULL),
    ('1.3.4.3', 4, '1.3.4.2', NULL, NULL, 0, 5, NULL, NULL, NULL, 5, 7, 'X', NULL),
    ('1.3.4.4', 4, '1.3.4.3', NULL, NULL, 0, 5, NULL, NULL, NULL, 5, 8, 'X', NULL),
    ('1.3.5', 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-06-23T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, 30, 42, 'X', NULL),
    ('1.3.5.1', 4, '1.3.4.4', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 14, 'X', NULL),
    ('1.3.5.2', 4, '1.3.5.1', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 14, 'X', NULL),
    ('1.3.5.3', 4, '1.3.5.2', NULL, NULL, 0, 5, NULL, NULL, NULL, 5, 7, 'X', NULL),
    ('1.3.5.4', 4, '1.3.5.3', NULL, NULL, 0, 5, NULL, NULL, NULL, 5, 7, 'X', NULL),
    ('1.3.5.5', 4, '1.3.5.4', NULL, NULL, 0, 5, NULL, NULL, NULL, 5, 7, 'X', NULL),
    ('1.3.6', 3, '1.3.5.5', NULL, NULL, 0, 0, NULL, NULL, NULL, 1, 1, 'O', NULL),
    ('1.3.7', 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-05-07T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, 51, 76, 'X', NULL),
    ('1.3.7.1', 4, '1.1.11', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 15, 'X', NULL),
    ('1.3.7.2', 4, '1.3.7.1', NULL, NULL, 0, 20, NULL, NULL, NULL, 20, 32, 'X', NULL),
    ('1.3.7.3', 4, '1.3.7.2', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 14, 'X', NULL),
    ('1.3.7.4', 4, '1.3.7.3', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 14, 'X', NULL),
    ('1.3.8', 3, '1.3.7.4', NULL, NULL, 0, 0, NULL, NULL, NULL, 1, 1, 'O', NULL),
    ('1.3.9', 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-06-23T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, 31, 43, 'X', NULL),
    ('1.3.9.1', 4, '1.3.4.4', NULL, NULL, 0, 5, NULL, NULL, NULL, 5, 7, 'X', NULL),
    ('1.3.9.2', 4, '1.3.9.1', NULL, NULL, 0, 5, NULL, NULL, NULL, 5, 7, 'X', NULL),
    ('1.3.9.3', 4, '1.3.9.2', '1.3.7.4', NULL, -15, 10, NULL, NULL, NULL, 10, 14, 'X', NULL),
    ('1.3.9.4', 4, '1.3.9.3', NULL, NULL, 0, 15, NULL, NULL, NULL, 15, 21, 'X', NULL),
    ('1.3.10', 3, '1.3.9.4', NULL, NULL, 0, 0, NULL, NULL, NULL, 1, 1, 'O', NULL),
    ('1.3.11', 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-06-01T00:00:00.000Z'::timestamp, '2026-06-29T00:00:00.000Z'::timestamp, 19, 29, 'X', NULL),
    ('1.3.11.1', 4, NULL, NULL, NULL, 0, 3, NULL, '2026-06-01T00:00:00.000Z'::timestamp, NULL, 3, 3, 'X', NULL),
    ('1.3.11.2', 4, '1.3.11.1', NULL, NULL, 0, 15, NULL, NULL, NULL, 15, 23, 'X', NULL),
    ('1.3.12', 3, '1.3.11.2', NULL, NULL, 0, 0, NULL, NULL, NULL, 1, 1, 'O', NULL),
    ('1.3.13', 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-07-27T00:00:00.000Z'::timestamp, '2026-08-25T00:00:00.000Z'::timestamp, 22, 30, 'X', NULL),
    ('1.3.13.1', 4, NULL, NULL, NULL, 0, 5, NULL, '2026-07-27T00:00:00.000Z'::timestamp, NULL, 5, 5, 'X', NULL),
    ('1.3.13.2', 4, '1.3.13.1', NULL, NULL, 0, 15, NULL, NULL, NULL, 15, 19, 'X', NULL),
    ('1.3.14', 3, '1.3.13.2', NULL, NULL, 0, 0, NULL, NULL, NULL, 1, 1, 'O', NULL),
    ('1.4', 2, '1.3.14', '1.3.10', '1.3.6', 0, 0, NULL, NULL, NULL, 1, 1, 'O', NULL),
    ('1.5', 2, NULL, NULL, NULL, 0, NULL, NULL, '2026-04-06T00:00:00.000Z'::timestamp, '2026-09-02T00:00:00.000Z'::timestamp, 101, 150, 'B', NULL),
    ('1.5.1', 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-05-25T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, 40, 58, 'X', NULL),
    ('1.5.1.1', 4, '1.2', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 12, 'X', NULL),
    ('1.5.1.2', 4, '1.5.1.1', NULL, NULL, 0, 30, NULL, NULL, NULL, 30, 44, 'X', NULL),
    ('1.5.1.3', 4, '1.5.1.1', NULL, NULL, 0, 30, NULL, NULL, NULL, 30, 44, 'X', NULL),
    ('1.5.1.4', 4, '1.5.1.1', NULL, NULL, 0, 30, NULL, NULL, NULL, 30, 44, 'X', NULL),
    ('1.5.1.5', 4, '1.5.1.1', NULL, NULL, 0, 30, NULL, NULL, NULL, 30, 44, 'X', NULL),
    ('1.5.1.6', 4, '1.5.1.1', NULL, NULL, 0, 30, NULL, NULL, NULL, 30, 44, 'X', NULL),
    ('1.5.2', 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-05-07T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, 60, 89, 'X', NULL),
    ('1.5.2.1', 4, '1.1.11', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 15, 'X', NULL),
    ('1.5.2.2', 4, '1.5.2.1', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 14, 'X', NULL),
    ('1.5.2.3', 4, '1.5.2.2', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 18, 'X', NULL),
    ('1.5.2.4', 4, '1.5.2.3', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 14, 'X', NULL),
    ('1.5.2.5', 4, '1.5.2.4', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 14, 'X', NULL),
    ('1.5.2.6', 4, '1.5.2.5', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 14, 'X', NULL),
    ('1.5.3', 3, '1.5.2', '1.5.1', NULL, 0, 0, NULL, NULL, NULL, 1, 1, 'O', NULL),
    ('1.5.4', 3, NULL, NULL, NULL, 0, 0, NULL, '2026-04-06T00:00:00.000Z'::timestamp, '2026-04-06T00:00:00.000Z'::timestamp, 1, 2, 'O', NULL),
    ('1.5.5', 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-04-08T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, 60, 92, 'B', NULL),
    ('1.5.5.1', 4, '1.5.4', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 14, 'G', NULL),
    ('1.5.5.2', 4, '1.5.5.1', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 17, 'B', NULL),
    ('1.5.5.3', 4, '1.5.5.2', NULL, NULL, 0, 5, NULL, NULL, NULL, 5, 7, 'X', NULL),
    ('1.5.5.4', 4, '1.5.5.3', NULL, NULL, 0, 5, NULL, NULL, NULL, 5, 7, 'X', NULL),
    ('1.5.5.5', 4, '1.5.5.3', NULL, NULL, 0, 5, NULL, NULL, NULL, 5, 7, 'X', NULL),
    ('1.5.5.6', 4, '1.5.5.5', '1.5.5.4', NULL, 0, 5, NULL, NULL, NULL, 5, 7, 'X', NULL),
    ('1.5.5.7', 4, '1.5.5.6', NULL, NULL, 0, 5, NULL, NULL, NULL, 5, 7, 'X', NULL),
    ('1.5.5.8', 4, '1.5.5.6', NULL, NULL, 0, 5, NULL, NULL, NULL, 5, 7, 'X', NULL),
    ('1.5.5.9', 4, '1.5.5.8', '1.5.5.3', NULL, 0, 10, NULL, NULL, NULL, 10, 16, 'X', NULL),
    ('1.5.5.10', 4, '1.5.5.9', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 14, 'X', NULL),
    ('1.5.5.11', 4, '1.5.5.3', '1.3.12', NULL, 0, 20, NULL, NULL, NULL, 20, 29, 'X', NULL),
    ('1.5.5.12', 4, '1.5.5.3', '1.3.12', NULL, 0, 20, NULL, NULL, NULL, 20, 29, 'X', NULL),
    ('1.5.5.13', 4, '1.5.5.3', '1.3.12', NULL, 0, 20, NULL, NULL, NULL, 20, 29, 'X', NULL),
    ('1.5.5.14', 4, '1.5.5.3', '1.3.12', NULL, 0, 20, NULL, NULL, NULL, 20, 29, 'X', NULL),
    ('1.5.5.15', 4, '1.5.5.3', '1.3.12', NULL, 0, 20, NULL, NULL, NULL, 20, 29, 'X', NULL),
    ('1.5.5.16', 4, '1.5.5.3', '1.3.12', NULL, 0, 20, NULL, NULL, NULL, 20, 29, 'X', NULL),
    ('1.5.5.17', 4, '1.5.5.3', '1.3.12', NULL, 0, 20, NULL, NULL, NULL, 20, 29, 'X', NULL),
    ('1.5.6', 3, '1.5.5.11', '1.5.5.15', '1.5.5.9', 0, 0, NULL, NULL, NULL, 1, 1, 'X', NULL),
    ('1.5.7', 3, '1.5.6', '1.4', NULL, 0, 0, NULL, NULL, NULL, 1, 1, 'X', NULL),
    ('1.5.8', 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-06-22T00:00:00.000Z'::timestamp, '2026-09-02T00:00:00.000Z'::timestamp, 53, 73, 'X', NULL),
    ('1.5.8.1', 4, '1.5.7', '1.5.6', '1.5.3', 0, 1, NULL, NULL, NULL, 1, 1, 'X', NULL),
    ('1.5.8.2', 4, '1.5.8.1', NULL, NULL, 10, 10, NULL, NULL, NULL, 10, 14, 'X', NULL),
    ('1.5.8.3', 4, '1.5.8.1', NULL, NULL, 10, 10, NULL, NULL, NULL, 10, 14, 'X', NULL),
    ('1.5.8.4', 4, '1.5.7', NULL, NULL, 0, 5, NULL, NULL, NULL, 5, 5, 'X', NULL),
    ('1.5.8.5', 4, '1.5.8.4', NULL, NULL, 0, 15, NULL, NULL, NULL, 15, 19, 'X', NULL),
    ('1.5.8.6', 4, '1.5.8.2', '1.5.8.3', NULL, 0, 0, NULL, NULL, NULL, 1, 1, 'X', NULL),
    ('1.5.8.7', 4, '1.5.8.6', NULL, NULL, -10, 20, NULL, NULL, NULL, 20, 28, 'X', NULL),
    ('1.5.8.8', 4, '1.5.8.6', NULL, NULL, -10, 20, NULL, NULL, NULL, 20, 28, 'X', NULL),
    ('1.5.8.9', 4, '1.5.8.6', NULL, NULL, -10, 20, NULL, NULL, NULL, 20, 28, 'X', NULL),
    ('1.5.8.10', 4, '1.5.8.6', NULL, NULL, -10, 20, NULL, NULL, NULL, 20, 28, 'X', NULL),
    ('1.5.8.11', 4, '1.5.8.6', NULL, NULL, -10, 20, NULL, NULL, NULL, 20, 28, 'X', NULL),
    ('1.5.8.12', 4, '1.5.8.6', NULL, NULL, -10, 20, NULL, NULL, NULL, 20, 28, 'X', NULL),
    ('1.5.8.13', 4, '1.5.8.6', NULL, NULL, -10, 20, NULL, NULL, NULL, 20, 28, 'X', NULL),
    ('1.5.9', 3, '1.5.8.7', '1.5.8.11', '1.5.8.12', 0, 0, NULL, NULL, NULL, 1, 1, 'O', NULL),
    ('1.5.10', 3, '1.5.9', NULL, NULL, 0, 10, NULL, NULL, NULL, 10, 14, 'X', NULL),
    ('1.5.11', 3, '1.5.9', NULL, NULL, 0, 20, NULL, NULL, NULL, 20, 28, 'X', NULL),
    ('1.6', 2, '1.5.11', NULL, NULL, 0, 0, NULL, NULL, NULL, 1, 1, 'O', NULL)
)
UPDATE "WbsItem" target
SET
  "wbsLevel" = excel_data."wbsLevel"::integer,
  "predecessor1" = excel_data."predecessor1",
  "predecessor2" = excel_data."predecessor2",
  "predecessor3" = excel_data."predecessor3",
  "leadLagDays" = excel_data."leadLagDays"::integer,
  "workDays" = excel_data."workDays"::integer,
  "calendarDays" = excel_data."calendarDays"::integer,
  "excelStartDate" = excel_data."excelStartDate"::timestamp,
  "excelEndDate" = excel_data."excelEndDate"::timestamp,
  "planWorkDays" = excel_data."planWorkDays"::integer,
  "planCalendarDays" = excel_data."planCalendarDays"::integer,
  "templateColor" = excel_data."templateColor",
  "priority" = excel_data."priority"
FROM project, excel_data
WHERE target."projectId" = project."id"
  AND target."code" = excel_data."code";

DELETE FROM "WbsDependency"
WHERE "projectId" = (SELECT "id" FROM "Project" WHERE "code" = 'TEST-001' LIMIT 1);

INSERT INTO "WbsDependency" ("id", "projectId", "predecessorId", "successorId", "type", "lagDays", "createdAt", "updatedAt")
SELECT
  'test001_dep_' || replace(successor."code", '.', '_') || '_' || predecessor_slot.slot_number,
  project."id",
  predecessor."id",
  successor."id",
  'FS'::"WbsDependencyType",
  successor."leadLagDays",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM project
JOIN "WbsItem" successor ON successor."projectId" = project."id"
CROSS JOIN LATERAL (
  VALUES
    (1, successor."predecessor1"),
    (2, successor."predecessor2"),
    (3, successor."predecessor3")
) AS predecessor_slot(slot_number, predecessor_code)
JOIN "WbsItem" predecessor
  ON predecessor."projectId" = project."id"
 AND predecessor."code" = predecessor_slot.predecessor_code
WHERE predecessor_slot.predecessor_code IS NOT NULL
  AND predecessor."id" <> successor."id"
ON CONFLICT ("projectId", "predecessorId", "successorId", "type") DO UPDATE
SET "lagDays" = EXCLUDED."lagDays", "updatedAt" = CURRENT_TIMESTAMP;
