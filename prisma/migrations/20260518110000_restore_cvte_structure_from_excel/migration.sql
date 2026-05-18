-- Restore imported CVTE project structure from the source Excel plan.
-- This intentionally replaces current WBS rows because the earlier import produced an incorrect task structure.
CREATE TEMP TABLE "_restore_cvte_project" ("id" TEXT PRIMARY KEY);

INSERT INTO "_restore_cvte_project" ("id")
SELECT project."id"
FROM "Project" project
WHERE project."code" IN ('001', 'TEST-001')
   OR project."name" = 'CVTE CH AML 968d4'
   OR EXISTS (
     SELECT 1
     FROM "WbsItem" wbs
     WHERE wbs."projectId" = project."id"
       AND wbs."code" = '1.1.1'
       AND wbs."title" IN ('Prototipe mainboard', 'Prototype mainboard', 'Прототип основной платы')
   )
ORDER BY
  CASE
    WHEN project."code" = '001' THEN 1
    WHEN project."name" = 'CVTE CH AML 968d4' THEN 2
    WHEN project."code" = 'TEST-001' THEN 3
    ELSE 4
  END,
  project."updatedAt" DESC
LIMIT 1
ON CONFLICT ("id") DO NOTHING;

DELETE FROM "WbsCommand"
WHERE "projectId" IN (SELECT "id" FROM "_restore_cvte_project");

DELETE FROM "WbsBaseline"
WHERE "projectId" IN (SELECT "id" FROM "_restore_cvte_project");

DELETE FROM "Milestone"
WHERE "projectId" IN (SELECT "id" FROM "_restore_cvte_project");

DELETE FROM "WbsItem"
WHERE "projectId" IN (SELECT "id" FROM "_restore_cvte_project");

WITH wbs_data (
  "id", "code", "parentCode", "title", "type", "status", "owner", "startDate", "dueDate",
  "baselineStartDate", "baselineDueDate", "forecastStartDate", "forecastDueDate",
  "progress", "sortOrder", "wbsLevel", "predecessor1", "predecessor2", "predecessor3",
  "leadLagDays", "workDays", "calendarDays", "excelStartDate", "excelEndDate",
  "planWorkDays", "planCalendarDays", "templateColor", "priority", "description"
) AS (
  VALUES
    ('test001_wbs_1', '1', NULL, 'Выпуск заводского ПО', 'PHASE'::"WbsItemType", 'IN_PROGRESS'::"WbsItemStatus", 'TBD', '2025-12-01T00:00:00.000Z'::timestamp, '2026-09-03T00:00:00.000Z'::timestamp, '2025-12-01T00:00:00.000Z'::timestamp, '2026-09-03T00:00:00.000Z'::timestamp, '2025-12-01T00:00:00.000Z'::timestamp, '2026-09-03T00:00:00.000Z'::timestamp, 53, 10, 1, NULL, NULL, NULL, 0, NULL, NULL, '2025-12-01T00:00:00.000Z'::timestamp, '2026-09-03T00:00:00.000Z'::timestamp, 178, 277, 'B', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 14. Template color: B.'),
    ('test001_wbs_1_1', '1.1', '1', 'Запуск проекта', 'WORK_PACKAGE'::"WbsItemType", 'IN_PROGRESS'::"WbsItemStatus", 'Gladkov', '2025-12-01T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, '2025-12-01T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, '2025-12-01T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, 86, 20, 2, NULL, NULL, NULL, 0, NULL, NULL, '2025-12-01T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, 106, 173, 'B', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 15. Template color: B.'),
    ('test001_wbs_1_1_1', '1.1.1', '1.1', 'Прототип основной платы', 'TASK'::"WbsItemType", 'DONE'::"WbsItemStatus", 'Loginov', '2025-12-01T00:00:00.000Z'::timestamp, '2025-12-01T00:00:00.000Z'::timestamp, '2025-12-01T00:00:00.000Z'::timestamp, '2025-12-01T00:00:00.000Z'::timestamp, '2025-12-01T00:00:00.000Z'::timestamp, '2025-12-01T00:00:00.000Z'::timestamp, 100, 30, 3, NULL, NULL, NULL, 0, 1, NULL, '2025-12-01T00:00:00.000Z'::timestamp, NULL::timestamp, 1, 1, 'G', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 16. Work days: 1. Template color: G.'),
    ('test001_wbs_1_1_2', '1.1.2', '1.1', 'Первичная сборка прошивки', 'TASK'::"WbsItemType", 'DONE'::"WbsItemStatus", 'Salomatov', '2025-12-02T00:00:00.000Z'::timestamp, '2025-12-12T00:00:00.000Z'::timestamp, '2025-12-02T00:00:00.000Z'::timestamp, '2025-12-12T00:00:00.000Z'::timestamp, '2025-12-02T00:00:00.000Z'::timestamp, '2025-12-12T00:00:00.000Z'::timestamp, 100, 40, 3, '1.1.1', NULL, NULL, 0, 9, NULL, NULL::timestamp, NULL::timestamp, 9, 11, 'G', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 17. Predecessors: 1.1.1. Work days: 9. Template color: G.'),
    ('test001_wbs_1_1_3', '1.1.3', '1.1', 'Первичные тесты печатной платы в сборе', 'TASK'::"WbsItemType", 'DONE'::"WbsItemStatus", 'Ivanov', '2025-12-15T00:00:00.000Z'::timestamp, '2025-12-26T00:00:00.000Z'::timestamp, '2025-12-15T00:00:00.000Z'::timestamp, '2025-12-26T00:00:00.000Z'::timestamp, '2025-12-15T00:00:00.000Z'::timestamp, '2025-12-26T00:00:00.000Z'::timestamp, 100, 50, 3, '1.1.2', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 12, 'G', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 18. Predecessors: 1.1.2. Work days: 10. Template color: G.'),
    ('test001_wbs_1_1_4', '1.1.4', '1.1', 'Первичное устранение неисправностей', 'TASK'::"WbsItemType", 'BLOCKED'::"WbsItemStatus", 'CVTE', '2025-12-29T00:00:00.000Z'::timestamp, '2026-03-12T00:00:00.000Z'::timestamp, '2025-12-29T00:00:00.000Z'::timestamp, '2026-03-12T00:00:00.000Z'::timestamp, '2025-12-29T00:00:00.000Z'::timestamp, '2026-03-12T00:00:00.000Z'::timestamp, 95, 60, 3, '1.1.3', NULL, NULL, 0, 40, NULL, NULL::timestamp, NULL::timestamp, 40, 74, 'R', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 19. Predecessors: 1.1.3. Work days: 40. Template color: R.'),
    ('test001_wbs_1_1_5', '1.1.5', '1.1', 'Синхронизация патчей', 'TASK'::"WbsItemType", 'DONE'::"WbsItemStatus", 'Antonov', '2026-01-22T00:00:00.000Z'::timestamp, '2026-01-28T00:00:00.000Z'::timestamp, '2026-01-22T00:00:00.000Z'::timestamp, '2026-01-28T00:00:00.000Z'::timestamp, '2026-01-22T00:00:00.000Z'::timestamp, '2026-01-28T00:00:00.000Z'::timestamp, 100, 70, 3, '1.1.1', NULL, NULL, 30, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 7, 'G', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 20. Predecessors: 1.1.1. Lead / lag: 30. Work days: 5. Template color: G.'),
    ('test001_wbs_1_1_6', '1.1.6', '1.1', 'Эпики, метки, фильтры, паспорт и прочее', 'TASK'::"WbsItemType", 'DONE'::"WbsItemStatus", 'Gladkov', '2026-01-22T00:00:00.000Z'::timestamp, '2026-01-28T00:00:00.000Z'::timestamp, '2026-01-22T00:00:00.000Z'::timestamp, '2026-01-28T00:00:00.000Z'::timestamp, '2026-01-22T00:00:00.000Z'::timestamp, '2026-01-28T00:00:00.000Z'::timestamp, 100, 80, 3, '1.1.1', NULL, NULL, 30, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 7, 'G', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 21. Predecessors: 1.1.1. Lead / lag: 30. Work days: 5. Template color: G.'),
    ('test001_wbs_1_1_7', '1.1.7', '1.1', 'Первичная настройка Jenkins', 'TASK'::"WbsItemType", 'DONE'::"WbsItemStatus", 'Antonov', '2026-01-29T00:00:00.000Z'::timestamp, '2026-03-13T00:00:00.000Z'::timestamp, '2026-01-29T00:00:00.000Z'::timestamp, '2026-03-13T00:00:00.000Z'::timestamp, '2026-01-29T00:00:00.000Z'::timestamp, '2026-03-13T00:00:00.000Z'::timestamp, 100, 90, 3, '1.1.5', NULL, NULL, 0, 25, NULL, NULL::timestamp, NULL::timestamp, 25, 44, 'G', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 22. Predecessors: 1.1.5. Work days: 25. Template color: G.'),
    ('test001_wbs_1_1_8', '1.1.8', '1.1', 'Планирование образцов', 'TASK'::"WbsItemType", 'DONE'::"WbsItemStatus", 'Gladkov', '2026-01-29T00:00:00.000Z'::timestamp, '2026-02-26T00:00:00.000Z'::timestamp, '2026-01-29T00:00:00.000Z'::timestamp, '2026-02-26T00:00:00.000Z'::timestamp, '2026-01-29T00:00:00.000Z'::timestamp, '2026-02-26T00:00:00.000Z'::timestamp, 100, 100, 3, '1.1.6', NULL, NULL, 0, 15, NULL, NULL::timestamp, NULL::timestamp, 15, 29, 'G', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 23. Predecessors: 1.1.6. Work days: 15. Template color: G.'),
    ('test001_wbs_1_1_9', '1.1.9', '1.1', 'Старт команды ТВ', 'TASK'::"WbsItemType", 'DONE'::"WbsItemStatus", 'Terentiev', '2026-03-17T00:00:00.000Z'::timestamp, '2026-03-17T00:00:00.000Z'::timestamp, '2026-03-17T00:00:00.000Z'::timestamp, '2026-03-17T00:00:00.000Z'::timestamp, '2026-03-17T00:00:00.000Z'::timestamp, '2026-03-17T00:00:00.000Z'::timestamp, 100, 110, 3, NULL, NULL, NULL, 0, 1, NULL, '2026-03-17T00:00:00.000Z'::timestamp, '2026-03-17T00:00:00.000Z'::timestamp, 1, 1, 'G', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 24. Work days: 1. Template color: G.'),
    ('test001_wbs_1_1_10', '1.1.10', '1.1', 'Функциональные требования', 'TASK'::"WbsItemType", 'DONE'::"WbsItemStatus", 'Terentiev', '2026-03-20T00:00:00.000Z'::timestamp, '2026-03-26T00:00:00.000Z'::timestamp, '2026-03-20T00:00:00.000Z'::timestamp, '2026-03-26T00:00:00.000Z'::timestamp, '2026-03-20T00:00:00.000Z'::timestamp, '2026-03-26T00:00:00.000Z'::timestamp, 100, 120, 3, '1.1.9', NULL, NULL, 2, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 7, 'G', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 25. Predecessors: 1.1.9. Lead / lag: 2. Work days: 5. Template color: G.'),
    ('test001_wbs_1_1_11', '1.1.11', '1.1', 'Старт работ SD - CVTE - CH', 'TASK'::"WbsItemType", 'IN_PROGRESS'::"WbsItemStatus", 'Loginov', '2026-04-27T00:00:00.000Z'::timestamp, '2026-05-06T00:00:00.000Z'::timestamp, '2026-04-27T00:00:00.000Z'::timestamp, '2026-05-06T00:00:00.000Z'::timestamp, '2026-04-27T00:00:00.000Z'::timestamp, '2026-05-06T00:00:00.000Z'::timestamp, 10, 130, 3, NULL, NULL, NULL, 2, 5, NULL, '2026-04-27T00:00:00.000Z'::timestamp, '2026-04-27T00:00:00.000Z'::timestamp, 5, 10, 'G', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 26. Lead / lag: 2. Work days: 5. Template color: G.'),
    ('test001_wbs_1_1_12', '1.1.12', '1.1', 'Согласование заказа образцов', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-14T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-14T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-14T00:00:00.000Z'::timestamp, 0, 140, 3, '1.1.11', NULL, NULL, 0, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 8, 'G', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 27. Predecessors: 1.1.11. Work days: 5. Template color: G.'),
    ('test001_wbs_1_1_13', '1.1.13', '1.1', 'Согласование функциональных требований ТВ с тремя сторонами', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-05-12T00:00:00.000Z'::timestamp, '2026-05-18T00:00:00.000Z'::timestamp, '2026-05-12T00:00:00.000Z'::timestamp, '2026-05-18T00:00:00.000Z'::timestamp, '2026-05-12T00:00:00.000Z'::timestamp, '2026-05-18T00:00:00.000Z'::timestamp, 0, 150, 3, '1.1.11', NULL, NULL, 2, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 7, 'G', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 28. Predecessors: 1.1.11. Lead / lag: 2. Work days: 5. Template color: G.'),
    ('test001_wbs_1_1_14', '1.1.14', '1.1', 'Подготовка базового плана проекта', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-14T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-14T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-14T00:00:00.000Z'::timestamp, 0, 160, 3, '1.1.11', NULL, NULL, 0, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 8, 'B', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 29. Predecessors: 1.1.11. Work days: 5. Template color: B.'),
    ('test001_wbs_1_1_15', '1.1.15', '1.1', 'Согласование плана проекта с тремя сторонами', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-05-15T00:00:00.000Z'::timestamp, '2026-05-21T00:00:00.000Z'::timestamp, '2026-05-15T00:00:00.000Z'::timestamp, '2026-05-21T00:00:00.000Z'::timestamp, '2026-05-15T00:00:00.000Z'::timestamp, '2026-05-21T00:00:00.000Z'::timestamp, 0, 170, 3, '1.1.14', NULL, NULL, 0, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 7, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 30. Predecessors: 1.1.14. Work days: 5. Template color: X.'),
    ('test001_wbs_1_2', '1.2', '1', 'Проект с тремя сторонами запущен', 'DELIVERABLE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-05-22T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, 0, 180, 2, '1.1.15', NULL, NULL, 0, 0, NULL, NULL::timestamp, NULL::timestamp, 1, 1, 'O', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 31. Predecessors: 1.1.15. Work days: 0. Template color: O.'),
    ('test001_wbs_1_3', '1.3', '1', 'Аппаратная часть', 'WORK_PACKAGE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-05-07T00:00:00.000Z'::timestamp, '2026-08-25T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-08-25T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-08-25T00:00:00.000Z'::timestamp, 0, 190, 2, NULL, NULL, NULL, 0, NULL, NULL, '2026-05-07T00:00:00.000Z'::timestamp, '2026-08-25T00:00:00.000Z'::timestamp, 76, 111, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 32. Template color: X.'),
    ('test001_wbs_1_3_1', '1.3.1', '1.3', 'Пакет документации по аппаратной части', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CH', '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-28T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-28T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-28T00:00:00.000Z'::timestamp, 0, 200, 3, '1.1.11', NULL, NULL, 0, 15, NULL, NULL::timestamp, NULL::timestamp, 15, 22, 'B', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 33. Predecessors: 1.1.11. Work days: 15. Template color: B.'),
    ('test001_wbs_1_3_2', '1.3.2', '1.3', 'Проверка документации', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Makarov', '2026-05-29T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-05-29T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-05-29T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, 0, 210, 3, '1.3.1', NULL, NULL, 0, 15, NULL, NULL::timestamp, NULL::timestamp, 15, 25, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 34. Predecessors: 1.3.1. Work days: 15. Template color: X.'),
    ('test001_wbs_1_3_3', '1.3.3', '1.3', 'Плата дальней голосовой зоны', 'WORK_PACKAGE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-05-07T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, 0, 220, 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-05-07T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, 30, 47, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 35. Template color: X.'),
    ('test001_wbs_1_3_3_1', '1.3.3.1', '1.3.3', 'Проектирование платы дальней голосовой зоны', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-21T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-21T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-21T00:00:00.000Z'::timestamp, 0, 230, 4, '1.1.11', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 15, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 36. Predecessors: 1.1.11. Work days: 10. Template color: X.'),
    ('test001_wbs_1_3_3_2', '1.3.3.2', '1.3.3', 'Тесты платы дальней голосовой зоны', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-05-22T00:00:00.000Z'::timestamp, '2026-06-04T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, '2026-06-04T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, '2026-06-04T00:00:00.000Z'::timestamp, 0, 240, 4, '1.3.3.1', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 14, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 37. Predecessors: 1.3.3.1. Work days: 10. Template color: X.'),
    ('test001_wbs_1_3_3_3', '1.3.3.3', '1.3.3', 'Оценка платы дальней голосовой зоны', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-06-05T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-06-05T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-06-05T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, 0, 250, 4, '1.3.3.2', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 18, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 38. Predecessors: 1.3.3.2. Work days: 10. Template color: X.'),
    ('test001_wbs_1_3_4', '1.3.4', '1.3', 'Инженерная основная плата', 'WORK_PACKAGE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-05-07T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, 0, 260, 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-05-07T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, 30, 47, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 39. Template color: X.'),
    ('test001_wbs_1_3_4_1', '1.3.4.1', '1.3.4', 'Проектирование инженерного образца', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-21T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-21T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-21T00:00:00.000Z'::timestamp, 0, 270, 4, '1.1.11', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 15, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 40. Predecessors: 1.1.11. Work days: 10. Template color: X.'),
    ('test001_wbs_1_3_4_2', '1.3.4.2', '1.3.4', 'Тесты инженерного образца', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-05-22T00:00:00.000Z'::timestamp, '2026-06-04T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, '2026-06-04T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, '2026-06-04T00:00:00.000Z'::timestamp, 0, 280, 4, '1.3.4.1', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 14, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 41. Predecessors: 1.3.4.1. Work days: 10. Template color: X.'),
    ('test001_wbs_1_3_4_3', '1.3.4.3', '1.3.4', 'Тесты аппаратной части', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-06-05T00:00:00.000Z'::timestamp, '2026-06-11T00:00:00.000Z'::timestamp, '2026-06-05T00:00:00.000Z'::timestamp, '2026-06-11T00:00:00.000Z'::timestamp, '2026-06-05T00:00:00.000Z'::timestamp, '2026-06-11T00:00:00.000Z'::timestamp, 0, 290, 4, '1.3.4.2', NULL, NULL, 0, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 7, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 42. Predecessors: 1.3.4.2. Work days: 5. Template color: X.'),
    ('test001_wbs_1_3_4_4', '1.3.4.4', '1.3.4', 'Оценка инженерного образца', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-06-15T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-06-15T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-06-15T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, 0, 300, 4, '1.3.4.3', NULL, NULL, 0, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 8, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 43. Predecessors: 1.3.4.3. Work days: 5. Template color: X.'),
    ('test001_wbs_1_3_5', '1.3.5', '1.3', 'Дизайн основной платы', 'WORK_PACKAGE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-06-23T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, '2026-06-23T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, '2026-06-23T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, 0, 310, 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-06-23T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, 30, 42, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 44. Template color: X.'),
    ('test001_wbs_1_3_5_1', '1.3.5.1', '1.3.5', 'Старт проектной версии', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-06-23T00:00:00.000Z'::timestamp, '2026-07-06T00:00:00.000Z'::timestamp, '2026-06-23T00:00:00.000Z'::timestamp, '2026-07-06T00:00:00.000Z'::timestamp, '2026-06-23T00:00:00.000Z'::timestamp, '2026-07-06T00:00:00.000Z'::timestamp, 0, 320, 4, '1.3.4.4', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 14, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 45. Predecessors: 1.3.4.4. Work days: 10. Template color: X.'),
    ('test001_wbs_1_3_5_2', '1.3.5.2', '1.3.5', 'Поверхностный монтаж', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-07-07T00:00:00.000Z'::timestamp, '2026-07-20T00:00:00.000Z'::timestamp, '2026-07-07T00:00:00.000Z'::timestamp, '2026-07-20T00:00:00.000Z'::timestamp, '2026-07-07T00:00:00.000Z'::timestamp, '2026-07-20T00:00:00.000Z'::timestamp, 0, 330, 4, '1.3.5.1', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 14, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 46. Predecessors: 1.3.5.1. Work days: 10. Template color: X.'),
    ('test001_wbs_1_3_5_3', '1.3.5.3', '1.3.5', 'Тест проектной версии', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-07-21T00:00:00.000Z'::timestamp, '2026-07-27T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-07-27T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-07-27T00:00:00.000Z'::timestamp, 0, 340, 4, '1.3.5.2', NULL, NULL, 0, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 7, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 47. Predecessors: 1.3.5.2. Work days: 5. Template color: X.'),
    ('test001_wbs_1_3_5_4', '1.3.5.4', '1.3.5', 'Оценка проектной версии', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-07-28T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, '2026-07-28T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, '2026-07-28T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, 0, 350, 4, '1.3.5.3', NULL, NULL, 0, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 7, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 48. Predecessors: 1.3.5.3. Work days: 5. Template color: X.'),
    ('test001_wbs_1_3_5_5', '1.3.5.5', '1.3.5', 'Готовность материалов основной платы для массового производства', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-08-04T00:00:00.000Z'::timestamp, '2026-08-10T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-08-10T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-08-10T00:00:00.000Z'::timestamp, 0, 360, 4, '1.3.5.4', NULL, NULL, 0, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 7, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 49. Predecessors: 1.3.5.4. Work days: 5. Template color: X.'),
    ('test001_wbs_1_3_6', '1.3.6', '1.3', 'Основная плата готова к массовому производству', 'DELIVERABLE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-08-11T00:00:00.000Z'::timestamp, '2026-08-11T00:00:00.000Z'::timestamp, '2026-08-11T00:00:00.000Z'::timestamp, '2026-08-11T00:00:00.000Z'::timestamp, '2026-08-11T00:00:00.000Z'::timestamp, '2026-08-11T00:00:00.000Z'::timestamp, 0, 370, 3, '1.3.5.5', NULL, NULL, 0, 0, NULL, NULL::timestamp, NULL::timestamp, 1, 1, 'O', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 50. Predecessors: 1.3.5.5. Work days: 0. Template color: O.'),
    ('test001_wbs_1_3_7', '1.3.7', '1.3', 'Дизайн ТВ', 'WORK_PACKAGE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CH', '2026-05-07T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, 0, 380, 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-05-07T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, 51, 76, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 51. Template color: X.'),
    ('test001_wbs_1_3_7_1', '1.3.7.1', '1.3.7', 'Получение печатных плат в сборе', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-21T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-21T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-21T00:00:00.000Z'::timestamp, 0, 390, 4, '1.1.11', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 15, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 52. Predecessors: 1.1.11. Work days: 10. Template color: X.'),
    ('test001_wbs_1_3_7_2', '1.3.7.2', '1.3.7', 'Проектирование', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CH', '2026-05-22T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, 0, 400, 4, '1.3.7.1', NULL, NULL, 0, 20, NULL, NULL::timestamp, NULL::timestamp, 20, 32, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 53. Predecessors: 1.3.7.1. Work days: 20. Template color: X.'),
    ('test001_wbs_1_3_7_3', '1.3.7.3', '1.3.7', 'Тестирование', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CH', '2026-06-23T00:00:00.000Z'::timestamp, '2026-07-06T00:00:00.000Z'::timestamp, '2026-06-23T00:00:00.000Z'::timestamp, '2026-07-06T00:00:00.000Z'::timestamp, '2026-06-23T00:00:00.000Z'::timestamp, '2026-07-06T00:00:00.000Z'::timestamp, 0, 410, 4, '1.3.7.2', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 14, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 54. Predecessors: 1.3.7.2. Work days: 10. Template color: X.'),
    ('test001_wbs_1_3_7_4', '1.3.7.4', '1.3.7', 'Релиз', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CH', '2026-07-07T00:00:00.000Z'::timestamp, '2026-07-20T00:00:00.000Z'::timestamp, '2026-07-07T00:00:00.000Z'::timestamp, '2026-07-20T00:00:00.000Z'::timestamp, '2026-07-07T00:00:00.000Z'::timestamp, '2026-07-20T00:00:00.000Z'::timestamp, 0, 420, 4, '1.3.7.3', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 14, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 55. Predecessors: 1.3.7.3. Work days: 10. Template color: X.'),
    ('test001_wbs_1_3_8', '1.3.8', '1.3', 'ТВ готов к массовому производству', 'DELIVERABLE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CH', '2026-07-21T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, 0, 430, 3, '1.3.7.4', NULL, NULL, 0, 0, NULL, NULL::timestamp, NULL::timestamp, 1, 1, 'O', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 56. Predecessors: 1.3.7.4. Work days: 0. Template color: O.'),
    ('test001_wbs_1_3_9', '1.3.9', '1.3', 'ТВ-образцы', 'WORK_PACKAGE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CH', '2026-06-23T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-06-23T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-06-23T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, 0, 440, 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-06-23T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, 31, 43, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 57. Template color: X.'),
    ('test001_wbs_1_3_9_1', '1.3.9.1', '1.3.9', 'Производство основных плат', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-06-23T00:00:00.000Z'::timestamp, '2026-06-29T00:00:00.000Z'::timestamp, '2026-06-23T00:00:00.000Z'::timestamp, '2026-06-29T00:00:00.000Z'::timestamp, '2026-06-23T00:00:00.000Z'::timestamp, '2026-06-29T00:00:00.000Z'::timestamp, 0, 450, 4, '1.3.4.4', NULL, NULL, 0, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 7, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 58. Predecessors: 1.3.4.4. Work days: 5. Template color: X.'),
    ('test001_wbs_1_3_9_2', '1.3.9.2', '1.3.9', 'Доставка основных плат в Китай', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-06-30T00:00:00.000Z'::timestamp, '2026-07-06T00:00:00.000Z'::timestamp, '2026-06-30T00:00:00.000Z'::timestamp, '2026-07-06T00:00:00.000Z'::timestamp, '2026-06-30T00:00:00.000Z'::timestamp, '2026-07-06T00:00:00.000Z'::timestamp, 0, 460, 4, '1.3.9.1', NULL, NULL, 0, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 7, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 59. Predecessors: 1.3.9.1. Work days: 5. Template color: X.'),
    ('test001_wbs_1_3_9_3', '1.3.9.3', '1.3.9', 'Производство ТВ-образцов', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CH', '2026-06-30T00:00:00.000Z'::timestamp, '2026-07-13T00:00:00.000Z'::timestamp, '2026-06-30T00:00:00.000Z'::timestamp, '2026-07-13T00:00:00.000Z'::timestamp, '2026-06-30T00:00:00.000Z'::timestamp, '2026-07-13T00:00:00.000Z'::timestamp, 0, 470, 4, '1.3.9.2', '1.3.7.4', NULL, -15, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 14, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 60. Predecessors: 1.3.9.2. Lead / lag: -15. Work days: 10. Template color: X.'),
    ('test001_wbs_1_3_9_4', '1.3.9.4', '1.3.9', 'Доставка ТВ-образцов в московский офис SD', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Zhuykov', '2026-07-14T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, '2026-07-14T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, '2026-07-14T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, 0, 480, 4, '1.3.9.3', NULL, NULL, 0, 15, NULL, NULL::timestamp, NULL::timestamp, 15, 21, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 61. Predecessors: 1.3.9.3. Work days: 15. Template color: X.'),
    ('test001_wbs_1_3_10', '1.3.10', '1.3', 'ТВ-образцы готовы', 'DELIVERABLE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-08-04T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, 0, 490, 3, '1.3.9.4', NULL, NULL, 0, 0, NULL, NULL::timestamp, NULL::timestamp, 1, 1, 'O', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 62. Predecessors: 1.3.9.4. Work days: 0. Template color: O.'),
    ('test001_wbs_1_3_11', '1.3.11', '1.3', 'Образцы инженерной основной платы', 'WORK_PACKAGE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-06-01T00:00:00.000Z'::timestamp, '2026-06-29T00:00:00.000Z'::timestamp, '2026-06-01T00:00:00.000Z'::timestamp, '2026-06-29T00:00:00.000Z'::timestamp, '2026-06-01T00:00:00.000Z'::timestamp, '2026-06-29T00:00:00.000Z'::timestamp, 0, 500, 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-06-01T00:00:00.000Z'::timestamp, '2026-06-29T00:00:00.000Z'::timestamp, 19, 29, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 63. Template color: X.'),
    ('test001_wbs_1_3_11_1', '1.3.11.1', '1.3.11', 'Производство основных плат', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-06-01T00:00:00.000Z'::timestamp, '2026-06-03T00:00:00.000Z'::timestamp, '2026-06-01T00:00:00.000Z'::timestamp, '2026-06-03T00:00:00.000Z'::timestamp, '2026-06-01T00:00:00.000Z'::timestamp, '2026-06-03T00:00:00.000Z'::timestamp, 0, 510, 4, NULL, NULL, NULL, 0, 3, NULL, '2026-06-01T00:00:00.000Z'::timestamp, NULL::timestamp, 3, 3, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 64. Work days: 3. Template color: X.'),
    ('test001_wbs_1_3_11_2', '1.3.11.2', '1.3.11', 'Доставка образцов основной платы в московский офис SD', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Zhuykov', '2026-06-04T00:00:00.000Z'::timestamp, '2026-06-26T00:00:00.000Z'::timestamp, '2026-06-04T00:00:00.000Z'::timestamp, '2026-06-26T00:00:00.000Z'::timestamp, '2026-06-04T00:00:00.000Z'::timestamp, '2026-06-26T00:00:00.000Z'::timestamp, 0, 520, 4, '1.3.11.1', NULL, NULL, 0, 15, NULL, NULL::timestamp, NULL::timestamp, 15, 23, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 65. Predecessors: 1.3.11.1. Work days: 15. Template color: X.'),
    ('test001_wbs_1_3_12', '1.3.12', '1.3', 'Образцы инженерной основной платы готовы', 'DELIVERABLE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-06-29T00:00:00.000Z'::timestamp, '2026-06-29T00:00:00.000Z'::timestamp, '2026-06-29T00:00:00.000Z'::timestamp, '2026-06-29T00:00:00.000Z'::timestamp, '2026-06-29T00:00:00.000Z'::timestamp, '2026-06-29T00:00:00.000Z'::timestamp, 0, 530, 3, '1.3.11.2', NULL, NULL, 0, 0, NULL, NULL::timestamp, NULL::timestamp, 1, 1, 'O', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 66. Predecessors: 1.3.11.2. Work days: 0. Template color: O.'),
    ('test001_wbs_1_3_13', '1.3.13', '1.3', 'Образцы дизайн-версии основной платы', 'WORK_PACKAGE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-07-27T00:00:00.000Z'::timestamp, '2026-08-25T00:00:00.000Z'::timestamp, '2026-07-27T00:00:00.000Z'::timestamp, '2026-08-25T00:00:00.000Z'::timestamp, '2026-07-27T00:00:00.000Z'::timestamp, '2026-08-25T00:00:00.000Z'::timestamp, 0, 540, 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-07-27T00:00:00.000Z'::timestamp, '2026-08-25T00:00:00.000Z'::timestamp, 22, 30, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 67. Template color: X.'),
    ('test001_wbs_1_3_13_1', '1.3.13.1', '1.3.13', 'Печатная плата в сборе готова', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-07-27T00:00:00.000Z'::timestamp, '2026-07-31T00:00:00.000Z'::timestamp, '2026-07-27T00:00:00.000Z'::timestamp, '2026-07-31T00:00:00.000Z'::timestamp, '2026-07-27T00:00:00.000Z'::timestamp, '2026-07-31T00:00:00.000Z'::timestamp, 0, 550, 4, NULL, NULL, NULL, 0, 5, NULL, '2026-07-27T00:00:00.000Z'::timestamp, NULL::timestamp, 5, 5, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 68. Work days: 5. Template color: X.'),
    ('test001_wbs_1_3_13_2', '1.3.13.2', '1.3.13', 'Доставка образцов основной платы в московский офис SD', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Zhuykov', '2026-08-03T00:00:00.000Z'::timestamp, '2026-08-21T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, '2026-08-21T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, '2026-08-21T00:00:00.000Z'::timestamp, 0, 560, 4, '1.3.13.1', NULL, NULL, 0, 15, NULL, NULL::timestamp, NULL::timestamp, 15, 19, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 69. Predecessors: 1.3.13.1. Work days: 15. Template color: X.'),
    ('test001_wbs_1_3_14', '1.3.14', '1.3', 'Образцы дизайн-версии основной платы готовы', 'DELIVERABLE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-08-24T00:00:00.000Z'::timestamp, '2026-08-24T00:00:00.000Z'::timestamp, '2026-08-24T00:00:00.000Z'::timestamp, '2026-08-24T00:00:00.000Z'::timestamp, '2026-08-24T00:00:00.000Z'::timestamp, '2026-08-24T00:00:00.000Z'::timestamp, 0, 570, 3, '1.3.13.2', NULL, NULL, 0, 0, NULL, NULL::timestamp, NULL::timestamp, 1, 1, 'O', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 70. Predecessors: 1.3.13.2. Work days: 0. Template color: O.'),
    ('test001_wbs_1_4', '1.4', '1', 'Аппаратная часть готова к массовому производству', 'DELIVERABLE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-08-25T00:00:00.000Z'::timestamp, '2026-08-25T00:00:00.000Z'::timestamp, '2026-08-25T00:00:00.000Z'::timestamp, '2026-08-25T00:00:00.000Z'::timestamp, '2026-08-25T00:00:00.000Z'::timestamp, '2026-08-25T00:00:00.000Z'::timestamp, 0, 580, 2, '1.3.14', '1.3.10', '1.3.6', 0, 0, NULL, NULL::timestamp, NULL::timestamp, 1, 1, 'O', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 71. Predecessors: 1.3.14. Work days: 0. Template color: O.'),
    ('test001_wbs_1_5', '1.5', '1', 'Программная часть', 'WORK_PACKAGE'::"WbsItemType", 'IN_PROGRESS'::"WbsItemStatus", 'Gladkov', '2026-04-06T00:00:00.000Z'::timestamp, '2026-09-02T00:00:00.000Z'::timestamp, '2026-04-06T00:00:00.000Z'::timestamp, '2026-09-02T00:00:00.000Z'::timestamp, '2026-04-06T00:00:00.000Z'::timestamp, '2026-09-02T00:00:00.000Z'::timestamp, 15, 590, 2, NULL, NULL, NULL, 0, NULL, NULL, '2026-04-06T00:00:00.000Z'::timestamp, '2026-09-02T00:00:00.000Z'::timestamp, 101, 150, 'B', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 72. Template color: B.'),
    ('test001_wbs_1_5_1', '1.5.1', '1.5', 'Подготовка требований к заводской сборке', 'WORK_PACKAGE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Antonov', '2026-05-25T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-05-25T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-05-25T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, 0, 600, 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-05-25T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, 40, 58, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 73. Template color: X.'),
    ('test001_wbs_1_5_1_1', '1.5.1.1', '1.5.1', 'Согласование критичных требований к заводской сборке', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Antonov', '2026-05-25T00:00:00.000Z'::timestamp, '2026-06-05T00:00:00.000Z'::timestamp, '2026-05-25T00:00:00.000Z'::timestamp, '2026-06-05T00:00:00.000Z'::timestamp, '2026-05-25T00:00:00.000Z'::timestamp, '2026-06-05T00:00:00.000Z'::timestamp, 0, 610, 4, '1.2', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 12, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 74. Predecessors: 1.2. Work days: 10. Template color: X.'),
    ('test001_wbs_1_5_1_2', '1.5.1.2', '1.5.1', 'Таблица разделов', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-06-08T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-06-08T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-06-08T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, 0, 620, 4, '1.5.1.1', NULL, NULL, 0, 30, NULL, NULL::timestamp, NULL::timestamp, 30, 44, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 75. Predecessors: 1.5.1.1. Work days: 30. Template color: X.'),
    ('test001_wbs_1_5_1_3', '1.5.1.3', '1.5.1', 'Ключ для прошивки в массовом производстве', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-06-08T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-06-08T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-06-08T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, 0, 630, 4, '1.5.1.1', NULL, NULL, 0, 30, NULL, NULL::timestamp, NULL::timestamp, 30, 44, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 76. Predecessors: 1.5.1.1. Work days: 30. Template color: X.'),
    ('test001_wbs_1_5_1_4', '1.5.1.4', '1.5.1', 'Функция OTA', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-06-08T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-06-08T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-06-08T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, 0, 640, 4, '1.5.1.1', NULL, NULL, 0, 30, NULL, NULL::timestamp, NULL::timestamp, 30, 44, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 77. Predecessors: 1.5.1.1. Work days: 30. Template color: X.'),
    ('test001_wbs_1_5_1_5', '1.5.1.5', '1.5.1', 'Функция AT', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-06-08T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-06-08T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-06-08T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, 0, 650, 4, '1.5.1.1', NULL, NULL, 0, 30, NULL, NULL::timestamp, NULL::timestamp, 30, 44, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 78. Predecessors: 1.5.1.1. Work days: 30. Template color: X.'),
    ('test001_wbs_1_5_1_6', '1.5.1.6', '1.5.1', 'Таблица каналов', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-06-08T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-06-08T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-06-08T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, 0, 660, 4, '1.5.1.1', NULL, NULL, 0, 30, NULL, NULL::timestamp, NULL::timestamp, 30, 44, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 79. Predecessors: 1.5.1.1. Work days: 30. Template color: X.'),
    ('test001_wbs_1_5_2', '1.5.2', '1.5', 'Подготовка функциональных требований к ТВ-железу', 'WORK_PACKAGE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Antonov', '2026-05-07T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, 0, 670, 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-05-07T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, 60, 89, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 80. Template color: X.'),
    ('test001_wbs_1_5_2_1', '1.5.2.1', '1.5.2', 'LED-индикатор', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-21T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-21T00:00:00.000Z'::timestamp, '2026-05-07T00:00:00.000Z'::timestamp, '2026-05-21T00:00:00.000Z'::timestamp, 0, 680, 4, '1.1.11', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 15, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 81. Predecessors: 1.1.11. Work days: 10. Template color: X.'),
    ('test001_wbs_1_5_2_2', '1.5.2.2', '1.5.2', 'AI PQ', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-05-22T00:00:00.000Z'::timestamp, '2026-06-04T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, '2026-06-04T00:00:00.000Z'::timestamp, '2026-05-22T00:00:00.000Z'::timestamp, '2026-06-04T00:00:00.000Z'::timestamp, 0, 690, 4, '1.5.2.1', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 14, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 82. Predecessors: 1.5.2.1. Work days: 10. Template color: X.'),
    ('test001_wbs_1_5_2_3', '1.5.2.3', '1.5.2', 'AI EQ', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-06-05T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-06-05T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-06-05T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, 0, 700, 4, '1.5.2.2', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 18, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 83. Predecessors: 1.5.2.2. Work days: 10. Template color: X.'),
    ('test001_wbs_1_5_2_4', '1.5.2.4', '1.5.2', 'DLG 288', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-06-23T00:00:00.000Z'::timestamp, '2026-07-06T00:00:00.000Z'::timestamp, '2026-06-23T00:00:00.000Z'::timestamp, '2026-07-06T00:00:00.000Z'::timestamp, '2026-06-23T00:00:00.000Z'::timestamp, '2026-07-06T00:00:00.000Z'::timestamp, 0, 710, 4, '1.5.2.3', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 14, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 84. Predecessors: 1.5.2.3. Work days: 10. Template color: X.'),
    ('test001_wbs_1_5_2_5', '1.5.2.5', '1.5.2', 'VRR, ALLM, HDMI 2.1', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-07-07T00:00:00.000Z'::timestamp, '2026-07-20T00:00:00.000Z'::timestamp, '2026-07-07T00:00:00.000Z'::timestamp, '2026-07-20T00:00:00.000Z'::timestamp, '2026-07-07T00:00:00.000Z'::timestamp, '2026-07-20T00:00:00.000Z'::timestamp, 0, 720, 4, '1.5.2.4', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 14, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 85. Predecessors: 1.5.2.4. Work days: 10. Template color: X.'),
    ('test001_wbs_1_5_2_6', '1.5.2.6', '1.5.2', 'Zigbee', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-07-21T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-08-03T00:00:00.000Z'::timestamp, 0, 730, 4, '1.5.2.5', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 14, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 86. Predecessors: 1.5.2.5. Work days: 10. Template color: X.'),
    ('test001_wbs_1_5_3', '1.5.3', '1.5', 'Все функции подготовлены', 'DELIVERABLE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-08-04T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, 0, 740, 3, '1.5.2', '1.5.1', NULL, 0, 0, NULL, NULL::timestamp, NULL::timestamp, 1, 1, 'O', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 87. Predecessors: 1.5.2. Work days: 0. Template color: O.'),
    ('test001_wbs_1_5_4', '1.5.4', '1.5', 'Старт HomeOS', 'DELIVERABLE'::"WbsItemType", 'DONE'::"WbsItemStatus", 'Gladkov', '2026-04-06T00:00:00.000Z'::timestamp, '2026-04-07T00:00:00.000Z'::timestamp, '2026-04-06T00:00:00.000Z'::timestamp, '2026-04-07T00:00:00.000Z'::timestamp, '2026-04-06T00:00:00.000Z'::timestamp, '2026-04-07T00:00:00.000Z'::timestamp, 100, 750, 3, NULL, NULL, NULL, 0, 0, NULL, '2026-04-06T00:00:00.000Z'::timestamp, '2026-04-06T00:00:00.000Z'::timestamp, 1, 2, 'O', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 88. Work days: 0. Template color: O.'),
    ('test001_wbs_1_5_5', '1.5.5', '1.5', 'Подготовка кандидата релиза ПО', 'WORK_PACKAGE'::"WbsItemType", 'IN_PROGRESS'::"WbsItemStatus", 'Gladkov', '2026-04-08T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-04-08T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-04-08T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, 22, 760, 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-04-08T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, 60, 92, 'B', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 89. Template color: B.'),
    ('test001_wbs_1_5_5_1', '1.5.5.1', '1.5.5', 'Первая сборка StarOS', 'TASK'::"WbsItemType", 'DONE'::"WbsItemStatus", 'Antonov', '2026-04-08T00:00:00.000Z'::timestamp, '2026-04-21T00:00:00.000Z'::timestamp, '2026-04-08T00:00:00.000Z'::timestamp, '2026-04-21T00:00:00.000Z'::timestamp, '2026-04-08T00:00:00.000Z'::timestamp, '2026-04-21T00:00:00.000Z'::timestamp, 100, 770, 4, '1.5.4', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 14, 'G', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 90. Predecessors: 1.5.4. Work days: 10. Template color: G.'),
    ('test001_wbs_1_5_5_2', '1.5.5.2', '1.5.5', 'Первичные регрессионные тесты', 'TASK'::"WbsItemType", 'IN_PROGRESS'::"WbsItemStatus", 'Ivanov', '2026-04-22T00:00:00.000Z'::timestamp, '2026-05-08T00:00:00.000Z'::timestamp, '2026-04-22T00:00:00.000Z'::timestamp, '2026-05-08T00:00:00.000Z'::timestamp, '2026-04-22T00:00:00.000Z'::timestamp, '2026-05-08T00:00:00.000Z'::timestamp, 35, 780, 4, '1.5.5.1', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 17, 'B', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 91. Predecessors: 1.5.5.1. Work days: 10. Template color: B.'),
    ('test001_wbs_1_5_5_3', '1.5.5.3', '1.5.5', 'Определение состава тикетов перед кандидатом релиза', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-05-12T00:00:00.000Z'::timestamp, '2026-05-18T00:00:00.000Z'::timestamp, '2026-05-12T00:00:00.000Z'::timestamp, '2026-05-18T00:00:00.000Z'::timestamp, '2026-05-12T00:00:00.000Z'::timestamp, '2026-05-18T00:00:00.000Z'::timestamp, 0, 790, 4, '1.5.5.2', NULL, NULL, 0, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 7, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 92. Predecessors: 1.5.5.2. Work days: 5. Template color: X.'),
    ('test001_wbs_1_5_5_4', '1.5.5.4', '1.5.5', 'Принятие решения по версии StarOS', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Prilutsky', '2026-05-19T00:00:00.000Z'::timestamp, '2026-05-25T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-05-25T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-05-25T00:00:00.000Z'::timestamp, 0, 800, 4, '1.5.5.3', NULL, NULL, 0, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 7, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 93. Predecessors: 1.5.5.3. Work days: 5. Template color: X.'),
    ('test001_wbs_1_5_5_5', '1.5.5.5', '1.5.5', 'Принятие решения по версиям приложений', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Prilutsky', '2026-05-19T00:00:00.000Z'::timestamp, '2026-05-25T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-05-25T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-05-25T00:00:00.000Z'::timestamp, 0, 810, 4, '1.5.5.3', NULL, NULL, 0, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 7, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 94. Predecessors: 1.5.5.3. Work days: 5. Template color: X.'),
    ('test001_wbs_1_5_5_6', '1.5.5.6', '1.5.5', 'Ветвление репозитория', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'RE', '2026-05-26T00:00:00.000Z'::timestamp, '2026-06-01T00:00:00.000Z'::timestamp, '2026-05-26T00:00:00.000Z'::timestamp, '2026-06-01T00:00:00.000Z'::timestamp, '2026-05-26T00:00:00.000Z'::timestamp, '2026-06-01T00:00:00.000Z'::timestamp, 0, 820, 4, '1.5.5.5', '1.5.5.4', NULL, 0, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 7, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 95. Predecessors: 1.5.5.5. Work days: 5. Template color: X.'),
    ('test001_wbs_1_5_5_7', '1.5.5.7', '1.5.5', 'Создание серверных групп', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Ivanov', '2026-06-02T00:00:00.000Z'::timestamp, '2026-06-08T00:00:00.000Z'::timestamp, '2026-06-02T00:00:00.000Z'::timestamp, '2026-06-08T00:00:00.000Z'::timestamp, '2026-06-02T00:00:00.000Z'::timestamp, '2026-06-08T00:00:00.000Z'::timestamp, 0, 830, 4, '1.5.5.6', NULL, NULL, 0, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 7, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 96. Predecessors: 1.5.5.6. Work days: 5. Template color: X.'),
    ('test001_wbs_1_5_5_8', '1.5.5.8', '1.5.5', 'Создание конфигураций умных приложений', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'RE', '2026-06-02T00:00:00.000Z'::timestamp, '2026-06-08T00:00:00.000Z'::timestamp, '2026-06-02T00:00:00.000Z'::timestamp, '2026-06-08T00:00:00.000Z'::timestamp, '2026-06-02T00:00:00.000Z'::timestamp, '2026-06-08T00:00:00.000Z'::timestamp, 0, 840, 4, '1.5.5.6', NULL, NULL, 0, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 7, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 97. Predecessors: 1.5.5.6. Work days: 5. Template color: X.'),
    ('test001_wbs_1_5_5_9', '1.5.5.9', '1.5.5', 'Заполнение конфигураций умных приложений', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-06-09T00:00:00.000Z'::timestamp, '2026-06-24T00:00:00.000Z'::timestamp, '2026-06-09T00:00:00.000Z'::timestamp, '2026-06-24T00:00:00.000Z'::timestamp, '2026-06-09T00:00:00.000Z'::timestamp, '2026-06-24T00:00:00.000Z'::timestamp, 0, 850, 4, '1.5.5.8', '1.5.5.3', NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 16, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 98. Predecessors: 1.5.5.8. Work days: 10. Template color: X.'),
    ('test001_wbs_1_5_5_10', '1.5.5.10', '1.5.5', 'Перенос конфигураций умных приложений в релизный цикл', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-06-25T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-06-25T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-06-25T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, 0, 860, 4, '1.5.5.9', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 14, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 99. Predecessors: 1.5.5.9. Work days: 10. Template color: X.'),
    ('test001_wbs_1_5_5_11', '1.5.5.11', '1.5.5', '[CVTE] Исправления по результатам первых тестов', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, 0, 870, 4, '1.5.5.3', '1.3.12', NULL, 0, 20, NULL, NULL::timestamp, NULL::timestamp, 20, 29, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 100. Predecessors: 1.5.5.3. Work days: 20. Template color: X.'),
    ('test001_wbs_1_5_5_12', '1.5.5.12', '1.5.5', '[AOSP] Исправления по результатам первых тестов', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Porkovsky', '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, 0, 880, 4, '1.5.5.3', '1.3.12', NULL, 0, 20, NULL, NULL::timestamp, NULL::timestamp, 20, 29, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 101. Predecessors: 1.5.5.3. Work days: 20. Template color: X.'),
    ('test001_wbs_1_5_5_13', '1.5.5.13', '1.5.5', '[SPS] Исправления по результатам первых тестов', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Driuchkov', '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, 0, 890, 4, '1.5.5.3', '1.3.12', NULL, 0, 20, NULL, NULL::timestamp, NULL::timestamp, 20, 29, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 102. Predecessors: 1.5.5.3. Work days: 20. Template color: X.'),
    ('test001_wbs_1_5_5_14', '1.5.5.14', '1.5.5', '[Пуш-уведомления] Исправления по результатам первых тестов', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Semenov', '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, 0, 900, 4, '1.5.5.3', '1.3.12', NULL, 0, 20, NULL, NULL::timestamp, NULL::timestamp, 20, 29, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 103. Predecessors: 1.5.5.3. Work days: 20. Template color: X.'),
    ('test001_wbs_1_5_5_15', '1.5.5.15', '1.5.5', '[ТВ и видео] Исправления по результатам первых тестов', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gorokhov', '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, 0, 910, 4, '1.5.5.3', '1.3.12', NULL, 0, 20, NULL, NULL::timestamp, NULL::timestamp, 20, 29, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 104. Predecessors: 1.5.5.3. Work days: 20. Template color: X.'),
    ('test001_wbs_1_5_5_16', '1.5.5.16', '1.5.5', '[Первичная настройка] Исправления по результатам первых тестов', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Romashko', '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, 0, 920, 4, '1.5.5.3', '1.3.12', NULL, 0, 20, NULL, NULL::timestamp, NULL::timestamp, 20, 29, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 105. Predecessors: 1.5.5.3. Work days: 20. Template color: X.'),
    ('test001_wbs_1_5_5_17', '1.5.5.17', '1.5.5', 'Исправления по результатам первых тестов', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, '2026-05-19T00:00:00.000Z'::timestamp, '2026-06-16T00:00:00.000Z'::timestamp, 0, 930, 4, '1.5.5.3', '1.3.12', NULL, 0, 20, NULL, NULL::timestamp, NULL::timestamp, 20, 29, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 106. Predecessors: 1.5.5.3. Work days: 20. Template color: X.'),
    ('test001_wbs_1_5_6', '1.5.6', '1.5', 'Все первичные критичные ошибки и блокеры исправлены', 'DELIVERABLE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-06-17T00:00:00.000Z'::timestamp, '2026-06-17T00:00:00.000Z'::timestamp, '2026-06-17T00:00:00.000Z'::timestamp, '2026-06-17T00:00:00.000Z'::timestamp, '2026-06-17T00:00:00.000Z'::timestamp, '2026-06-17T00:00:00.000Z'::timestamp, 0, 940, 3, '1.5.5.11', '1.5.5.15', '1.5.5.9', 0, 0, NULL, NULL::timestamp, NULL::timestamp, 1, 1, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 107. Predecessors: 1.5.5.11. Work days: 0. Template color: X.'),
    ('test001_wbs_1_5_7', '1.5.7', '1.5', 'ТВ-устройства готовы к тестам', 'DELIVERABLE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Ivanov', '2026-06-18T00:00:00.000Z'::timestamp, '2026-06-18T00:00:00.000Z'::timestamp, '2026-06-18T00:00:00.000Z'::timestamp, '2026-06-18T00:00:00.000Z'::timestamp, '2026-06-18T00:00:00.000Z'::timestamp, '2026-06-18T00:00:00.000Z'::timestamp, 0, 950, 3, '1.5.6', '1.4', NULL, 0, 0, NULL, NULL::timestamp, NULL::timestamp, 1, 1, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 108. Predecessors: 1.5.6. Work days: 0. Template color: X.'),
    ('test001_wbs_1_5_8', '1.5.8', '1.5', 'Релиз ПО', 'WORK_PACKAGE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-06-22T00:00:00.000Z'::timestamp, '2026-09-02T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-09-02T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-09-02T00:00:00.000Z'::timestamp, 0, 960, 3, NULL, NULL, NULL, 0, NULL, NULL, '2026-06-22T00:00:00.000Z'::timestamp, '2026-09-02T00:00:00.000Z'::timestamp, 53, 73, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 109. Template color: X.'),
    ('test001_wbs_1_5_8_1', '1.5.8.1', '1.5.8', 'Планирование регрессионных тестов (эпики)', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Ivanov', '2026-06-22T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, 0, 970, 4, '1.5.7', '1.5.6', '1.5.3', 0, 1, NULL, NULL::timestamp, NULL::timestamp, 1, 1, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 110. Predecessors: 1.5.7. Work days: 1. Template color: X.'),
    ('test001_wbs_1_5_8_2', '1.5.8.2', '1.5.8', 'Регрессионные тесты приложений', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'App teams', '2026-07-07T00:00:00.000Z'::timestamp, '2026-07-20T00:00:00.000Z'::timestamp, '2026-07-07T00:00:00.000Z'::timestamp, '2026-07-20T00:00:00.000Z'::timestamp, '2026-07-07T00:00:00.000Z'::timestamp, '2026-07-20T00:00:00.000Z'::timestamp, 0, 980, 4, '1.5.8.1', NULL, NULL, 10, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 14, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 111. Predecessors: 1.5.8.1. Lead / lag: 10. Work days: 10. Template color: X.'),
    ('test001_wbs_1_5_8_3', '1.5.8.3', '1.5.8', 'Регрессионные тесты платы', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Ivanov', '2026-07-07T00:00:00.000Z'::timestamp, '2026-07-20T00:00:00.000Z'::timestamp, '2026-07-07T00:00:00.000Z'::timestamp, '2026-07-20T00:00:00.000Z'::timestamp, '2026-07-07T00:00:00.000Z'::timestamp, '2026-07-20T00:00:00.000Z'::timestamp, 0, 990, 4, '1.5.8.1', NULL, NULL, 10, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 14, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 112. Predecessors: 1.5.8.1. Lead / lag: 10. Work days: 10. Template color: X.'),
    ('test001_wbs_1_5_8_4', '1.5.8.4', '1.5.8', 'Настройки телевизионного эквалайзера и кривой громкости', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Makarov', '2026-06-22T00:00:00.000Z'::timestamp, '2026-06-26T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-06-26T00:00:00.000Z'::timestamp, '2026-06-22T00:00:00.000Z'::timestamp, '2026-06-26T00:00:00.000Z'::timestamp, 0, 1000, 4, '1.5.7', NULL, NULL, 0, 5, NULL, NULL::timestamp, NULL::timestamp, 5, 5, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 113. Predecessors: 1.5.7. Work days: 5. Template color: X.'),
    ('test001_wbs_1_5_8_5', '1.5.8.5', '1.5.8', 'Тесты обработки голоса и активации', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Ivanov', '2026-06-29T00:00:00.000Z'::timestamp, '2026-07-17T00:00:00.000Z'::timestamp, '2026-06-29T00:00:00.000Z'::timestamp, '2026-07-17T00:00:00.000Z'::timestamp, '2026-06-29T00:00:00.000Z'::timestamp, '2026-07-17T00:00:00.000Z'::timestamp, 0, 1010, 4, '1.5.8.4', NULL, NULL, 0, 15, NULL, NULL::timestamp, NULL::timestamp, 15, 19, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 114. Predecessors: 1.5.8.4. Work days: 15. Template color: X.'),
    ('test001_wbs_1_5_8_6', '1.5.8.6', '1.5.8', 'Финальный состав тикетов', 'DELIVERABLE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-07-21T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, '2026-07-21T00:00:00.000Z'::timestamp, 0, 1020, 4, '1.5.8.2', '1.5.8.3', NULL, 0, 0, NULL, NULL::timestamp, NULL::timestamp, 1, 1, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 115. Predecessors: 1.5.8.2. Work days: 0. Template color: X.'),
    ('test001_wbs_1_5_8_7', '1.5.8.7', '1.5.8', '[CVTE] Исправления по регрессу и бете', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'CVTE', '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, 0, 1030, 4, '1.5.8.6', NULL, NULL, -10, 20, NULL, NULL::timestamp, NULL::timestamp, 20, 28, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 116. Predecessors: 1.5.8.6. Lead / lag: -10. Work days: 20. Template color: X.'),
    ('test001_wbs_1_5_8_8', '1.5.8.8', '1.5.8', '[AOSP] Исправления по регрессу и бете', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Porkovsky', '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, 0, 1040, 4, '1.5.8.6', NULL, NULL, -10, 20, NULL, NULL::timestamp, NULL::timestamp, 20, 28, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 117. Predecessors: 1.5.8.6. Lead / lag: -10. Work days: 20. Template color: X.'),
    ('test001_wbs_1_5_8_9', '1.5.8.9', '1.5.8', '[SPS] Исправления по регрессу и бете', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Driuchkov', '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, 0, 1050, 4, '1.5.8.6', NULL, NULL, -10, 20, NULL, NULL::timestamp, NULL::timestamp, 20, 28, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 118. Predecessors: 1.5.8.6. Lead / lag: -10. Work days: 20. Template color: X.'),
    ('test001_wbs_1_5_8_10', '1.5.8.10', '1.5.8', '[Пуш-уведомления] Исправления по регрессу и бете', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Semenov', '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, 0, 1060, 4, '1.5.8.6', NULL, NULL, -10, 20, NULL, NULL::timestamp, NULL::timestamp, 20, 28, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 119. Predecessors: 1.5.8.6. Lead / lag: -10. Work days: 20. Template color: X.'),
    ('test001_wbs_1_5_8_11', '1.5.8.11', '1.5.8', '[ТВ и видео] Исправления по регрессу и бете', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gorokhov', '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, 0, 1070, 4, '1.5.8.6', NULL, NULL, -10, 20, NULL, NULL::timestamp, NULL::timestamp, 20, 28, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 120. Predecessors: 1.5.8.6. Lead / lag: -10. Work days: 20. Template color: X.'),
    ('test001_wbs_1_5_8_12', '1.5.8.12', '1.5.8', '[Первичная настройка] Исправления по регрессу и бете', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Romashko', '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, 0, 1080, 4, '1.5.8.6', NULL, NULL, -10, 20, NULL, NULL::timestamp, NULL::timestamp, 20, 28, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 121. Predecessors: 1.5.8.6. Lead / lag: -10. Work days: 20. Template color: X.'),
    ('test001_wbs_1_5_8_13', '1.5.8.13', '1.5.8', 'Исправления по регрессу и бете', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, '2026-07-08T00:00:00.000Z'::timestamp, '2026-08-04T00:00:00.000Z'::timestamp, 0, 1090, 4, '1.5.8.6', NULL, NULL, -10, 20, NULL, NULL::timestamp, NULL::timestamp, 20, 28, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 122. Predecessors: 1.5.8.6. Lead / lag: -10. Work days: 20. Template color: X.'),
    ('test001_wbs_1_5_9', '1.5.9', '1.5', 'Решение о готовности', 'DELIVERABLE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-08-05T00:00:00.000Z'::timestamp, '2026-08-05T00:00:00.000Z'::timestamp, '2026-08-05T00:00:00.000Z'::timestamp, '2026-08-05T00:00:00.000Z'::timestamp, '2026-08-05T00:00:00.000Z'::timestamp, '2026-08-05T00:00:00.000Z'::timestamp, 0, 1100, 3, '1.5.8.7', '1.5.8.11', '1.5.8.12', 0, 0, NULL, NULL::timestamp, NULL::timestamp, 1, 1, 'O', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 123. Predecessors: 1.5.8.7. Work days: 0. Template color: O.'),
    ('test001_wbs_1_5_10', '1.5.10', '1.5', 'Финальные регрессионные тесты', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Ivanov', '2026-08-06T00:00:00.000Z'::timestamp, '2026-08-19T00:00:00.000Z'::timestamp, '2026-08-06T00:00:00.000Z'::timestamp, '2026-08-19T00:00:00.000Z'::timestamp, '2026-08-06T00:00:00.000Z'::timestamp, '2026-08-19T00:00:00.000Z'::timestamp, 0, 1110, 3, '1.5.9', NULL, NULL, 0, 10, NULL, NULL::timestamp, NULL::timestamp, 10, 14, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 124. Predecessors: 1.5.9. Work days: 10. Template color: X.'),
    ('test001_wbs_1_5_11', '1.5.11', '1.5', 'Релиз приложений', 'TASK'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-08-06T00:00:00.000Z'::timestamp, '2026-09-02T00:00:00.000Z'::timestamp, '2026-08-06T00:00:00.000Z'::timestamp, '2026-09-02T00:00:00.000Z'::timestamp, '2026-08-06T00:00:00.000Z'::timestamp, '2026-09-02T00:00:00.000Z'::timestamp, 0, 1120, 3, '1.5.9', NULL, NULL, 0, 20, NULL, NULL::timestamp, NULL::timestamp, 20, 28, 'X', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 125. Predecessors: 1.5.9. Work days: 20. Template color: X.'),
    ('test001_wbs_1_6', '1.6', '1', 'Релиз массового производства', 'DELIVERABLE'::"WbsItemType", 'NOT_STARTED'::"WbsItemStatus", 'Gladkov', '2026-09-03T00:00:00.000Z'::timestamp, '2026-09-03T00:00:00.000Z'::timestamp, '2026-09-03T00:00:00.000Z'::timestamp, '2026-09-03T00:00:00.000Z'::timestamp, '2026-09-03T00:00:00.000Z'::timestamp, '2026-09-03T00:00:00.000Z'::timestamp, 0, 1130, 2, '1.5.11', NULL, NULL, 0, 0, NULL, NULL::timestamp, NULL::timestamp, 1, 1, 'O', NULL, 'Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 126. Predecessors: 1.5.11. Work days: 0. Template color: O.')
)
INSERT INTO "WbsItem" (
  "id", "projectId", "code", "title", "type", "status", "owner", "startDate", "dueDate",
  "baselineStartDate", "baselineDueDate", "forecastStartDate", "forecastDueDate",
  "plannedCost", "forecastCost", "progress", "description", "sortOrder", "wbsLevel",
  "predecessor1", "predecessor2", "predecessor3", "leadLagDays", "workDays", "calendarDays",
  "excelStartDate", "excelEndDate", "planWorkDays", "planCalendarDays", "templateColor", "priority",
  "createdAt", "updatedAt"
)
SELECT
  wbs_data."id", target_projects."id", wbs_data."code", wbs_data."title", wbs_data."type",
  wbs_data."status", wbs_data."owner", wbs_data."startDate", wbs_data."dueDate",
  wbs_data."baselineStartDate", wbs_data."baselineDueDate", wbs_data."forecastStartDate", wbs_data."forecastDueDate",
  0.00, 0.00, wbs_data."progress", wbs_data."description", wbs_data."sortOrder", wbs_data."wbsLevel",
  wbs_data."predecessor1", wbs_data."predecessor2", wbs_data."predecessor3", wbs_data."leadLagDays",
  wbs_data."workDays", wbs_data."calendarDays", wbs_data."excelStartDate", wbs_data."excelEndDate",
  wbs_data."planWorkDays", wbs_data."planCalendarDays", wbs_data."templateColor", wbs_data."priority",
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "_restore_cvte_project" target_projects
CROSS JOIN wbs_data;

WITH wbs_data ("code", "parentCode") AS (
  VALUES
    ('1', NULL),
    ('1.1', '1'),
    ('1.1.1', '1.1'),
    ('1.1.2', '1.1'),
    ('1.1.3', '1.1'),
    ('1.1.4', '1.1'),
    ('1.1.5', '1.1'),
    ('1.1.6', '1.1'),
    ('1.1.7', '1.1'),
    ('1.1.8', '1.1'),
    ('1.1.9', '1.1'),
    ('1.1.10', '1.1'),
    ('1.1.11', '1.1'),
    ('1.1.12', '1.1'),
    ('1.1.13', '1.1'),
    ('1.1.14', '1.1'),
    ('1.1.15', '1.1'),
    ('1.2', '1'),
    ('1.3', '1'),
    ('1.3.1', '1.3'),
    ('1.3.2', '1.3'),
    ('1.3.3', '1.3'),
    ('1.3.3.1', '1.3.3'),
    ('1.3.3.2', '1.3.3'),
    ('1.3.3.3', '1.3.3'),
    ('1.3.4', '1.3'),
    ('1.3.4.1', '1.3.4'),
    ('1.3.4.2', '1.3.4'),
    ('1.3.4.3', '1.3.4'),
    ('1.3.4.4', '1.3.4'),
    ('1.3.5', '1.3'),
    ('1.3.5.1', '1.3.5'),
    ('1.3.5.2', '1.3.5'),
    ('1.3.5.3', '1.3.5'),
    ('1.3.5.4', '1.3.5'),
    ('1.3.5.5', '1.3.5'),
    ('1.3.6', '1.3'),
    ('1.3.7', '1.3'),
    ('1.3.7.1', '1.3.7'),
    ('1.3.7.2', '1.3.7'),
    ('1.3.7.3', '1.3.7'),
    ('1.3.7.4', '1.3.7'),
    ('1.3.8', '1.3'),
    ('1.3.9', '1.3'),
    ('1.3.9.1', '1.3.9'),
    ('1.3.9.2', '1.3.9'),
    ('1.3.9.3', '1.3.9'),
    ('1.3.9.4', '1.3.9'),
    ('1.3.10', '1.3'),
    ('1.3.11', '1.3'),
    ('1.3.11.1', '1.3.11'),
    ('1.3.11.2', '1.3.11'),
    ('1.3.12', '1.3'),
    ('1.3.13', '1.3'),
    ('1.3.13.1', '1.3.13'),
    ('1.3.13.2', '1.3.13'),
    ('1.3.14', '1.3'),
    ('1.4', '1'),
    ('1.5', '1'),
    ('1.5.1', '1.5'),
    ('1.5.1.1', '1.5.1'),
    ('1.5.1.2', '1.5.1'),
    ('1.5.1.3', '1.5.1'),
    ('1.5.1.4', '1.5.1'),
    ('1.5.1.5', '1.5.1'),
    ('1.5.1.6', '1.5.1'),
    ('1.5.2', '1.5'),
    ('1.5.2.1', '1.5.2'),
    ('1.5.2.2', '1.5.2'),
    ('1.5.2.3', '1.5.2'),
    ('1.5.2.4', '1.5.2'),
    ('1.5.2.5', '1.5.2'),
    ('1.5.2.6', '1.5.2'),
    ('1.5.3', '1.5'),
    ('1.5.4', '1.5'),
    ('1.5.5', '1.5'),
    ('1.5.5.1', '1.5.5'),
    ('1.5.5.2', '1.5.5'),
    ('1.5.5.3', '1.5.5'),
    ('1.5.5.4', '1.5.5'),
    ('1.5.5.5', '1.5.5'),
    ('1.5.5.6', '1.5.5'),
    ('1.5.5.7', '1.5.5'),
    ('1.5.5.8', '1.5.5'),
    ('1.5.5.9', '1.5.5'),
    ('1.5.5.10', '1.5.5'),
    ('1.5.5.11', '1.5.5'),
    ('1.5.5.12', '1.5.5'),
    ('1.5.5.13', '1.5.5'),
    ('1.5.5.14', '1.5.5'),
    ('1.5.5.15', '1.5.5'),
    ('1.5.5.16', '1.5.5'),
    ('1.5.5.17', '1.5.5'),
    ('1.5.6', '1.5'),
    ('1.5.7', '1.5'),
    ('1.5.8', '1.5'),
    ('1.5.8.1', '1.5.8'),
    ('1.5.8.2', '1.5.8'),
    ('1.5.8.3', '1.5.8'),
    ('1.5.8.4', '1.5.8'),
    ('1.5.8.5', '1.5.8'),
    ('1.5.8.6', '1.5.8'),
    ('1.5.8.7', '1.5.8'),
    ('1.5.8.8', '1.5.8'),
    ('1.5.8.9', '1.5.8'),
    ('1.5.8.10', '1.5.8'),
    ('1.5.8.11', '1.5.8'),
    ('1.5.8.12', '1.5.8'),
    ('1.5.8.13', '1.5.8'),
    ('1.5.9', '1.5'),
    ('1.5.10', '1.5'),
    ('1.5.11', '1.5'),
    ('1.6', '1')
)
UPDATE "WbsItem" child
SET "parentId" = parent."id",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "_restore_cvte_project" target_projects, wbs_data, "WbsItem" parent
WHERE child."projectId" = target_projects."id"
  AND child."projectId" = parent."projectId"
  AND child."code" = wbs_data."code"
  AND parent."code" = wbs_data."parentCode";

WITH milestone_data ("id", "code", "title", "dueDate", "status", "owner", "description") AS (
  VALUES
    ('test001_ms_1_2', '1.2', 'Проект с тремя сторонами запущен', '2026-05-22T00:00:00.000Z'::timestamp, 'Planned', 'Gladkov', 'Imported milestone from WBS 1.2. Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 31. Predecessors: 1.1.15. Work days: 0. Template color: O.'),
    ('test001_ms_1_3_6', '1.3.6', 'Основная плата готова к массовому производству', '2026-08-11T00:00:00.000Z'::timestamp, 'Planned', 'CVTE', 'Imported milestone from WBS 1.3.6. Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 50. Predecessors: 1.3.5.5. Work days: 0. Template color: O.'),
    ('test001_ms_1_3_8', '1.3.8', 'ТВ готов к массовому производству', '2026-07-21T00:00:00.000Z'::timestamp, 'Planned', 'CH', 'Imported milestone from WBS 1.3.8. Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 56. Predecessors: 1.3.7.4. Work days: 0. Template color: O.'),
    ('test001_ms_1_3_10', '1.3.10', 'ТВ-образцы готовы', '2026-08-04T00:00:00.000Z'::timestamp, 'Planned', 'Gladkov', 'Imported milestone from WBS 1.3.10. Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 62. Predecessors: 1.3.9.4. Work days: 0. Template color: O.'),
    ('test001_ms_1_3_12', '1.3.12', 'Образцы инженерной основной платы готовы', '2026-06-29T00:00:00.000Z'::timestamp, 'Planned', 'Gladkov', 'Imported milestone from WBS 1.3.12. Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 66. Predecessors: 1.3.11.2. Work days: 0. Template color: O.'),
    ('test001_ms_1_3_14', '1.3.14', 'Образцы дизайн-версии основной платы готовы', '2026-08-24T00:00:00.000Z'::timestamp, 'Planned', 'Gladkov', 'Imported milestone from WBS 1.3.14. Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 70. Predecessors: 1.3.13.2. Work days: 0. Template color: O.'),
    ('test001_ms_1_4', '1.4', 'Аппаратная часть готова к массовому производству', '2026-08-25T00:00:00.000Z'::timestamp, 'Planned', 'Gladkov', 'Imported milestone from WBS 1.4. Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 71. Predecessors: 1.3.14. Work days: 0. Template color: O.'),
    ('test001_ms_1_5_3', '1.5.3', 'Все функции подготовлены', '2026-08-04T00:00:00.000Z'::timestamp, 'Planned', 'Gladkov', 'Imported milestone from WBS 1.5.3. Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 87. Predecessors: 1.5.2. Work days: 0. Template color: O.'),
    ('test001_ms_1_5_4', '1.5.4', 'Старт HomeOS', '2026-04-07T00:00:00.000Z'::timestamp, 'Done', 'Gladkov', 'Imported milestone from WBS 1.5.4. Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 88. Work days: 0. Template color: O.'),
    ('test001_ms_1_5_6', '1.5.6', 'Все первичные критичные ошибки и блокеры исправлены', '2026-06-17T00:00:00.000Z'::timestamp, 'Planned', 'Gladkov', 'Imported milestone from WBS 1.5.6. Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 107. Predecessors: 1.5.5.11. Work days: 0. Template color: X.'),
    ('test001_ms_1_5_7', '1.5.7', 'ТВ-устройства готовы к тестам', '2026-06-18T00:00:00.000Z'::timestamp, 'Planned', 'Ivanov', 'Imported milestone from WBS 1.5.7. Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 108. Predecessors: 1.5.6. Work days: 0. Template color: X.'),
    ('test001_ms_1_5_8_6', '1.5.8.6', 'Финальный состав тикетов', '2026-07-21T00:00:00.000Z'::timestamp, 'Planned', 'Gladkov', 'Imported milestone from WBS 1.5.8.6. Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 115. Predecessors: 1.5.8.2. Work days: 0. Template color: X.'),
    ('test001_ms_1_5_9', '1.5.9', 'Решение о готовности', '2026-08-05T00:00:00.000Z'::timestamp, 'Planned', 'Gladkov', 'Imported milestone from WBS 1.5.9. Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 123. Predecessors: 1.5.8.7. Work days: 0. Template color: O.'),
    ('test001_ms_1_6', '1.6', 'Релиз массового производства', '2026-09-03T00:00:00.000Z'::timestamp, 'Planned', 'Gladkov', 'Imported milestone from WBS 1.6. Source: CVTE CH AML 968d4 FF base project plan.xlsx, sheet Base project plan, row 126. Predecessors: 1.5.11. Work days: 0. Template color: O.')
)
INSERT INTO "Milestone" ("id", "projectId", "code", "title", "dueDate", "status", "owner", "description", "createdAt", "updatedAt")
SELECT
  milestone_data."id", target_projects."id", milestone_data."code", milestone_data."title",
  milestone_data."dueDate", milestone_data."status", milestone_data."owner", milestone_data."description",
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "_restore_cvte_project" target_projects
CROSS JOIN milestone_data;

WITH dependency_data ("successorId", "predecessorCode", "slotNumber", "lagDays") AS (
  VALUES
    ('test001_wbs_1_1_2', '1.1.1', 1, 0),
    ('test001_wbs_1_1_3', '1.1.2', 1, 0),
    ('test001_wbs_1_1_4', '1.1.3', 1, 0),
    ('test001_wbs_1_1_5', '1.1.1', 1, 30),
    ('test001_wbs_1_1_6', '1.1.1', 1, 30),
    ('test001_wbs_1_1_7', '1.1.5', 1, 0),
    ('test001_wbs_1_1_8', '1.1.6', 1, 0),
    ('test001_wbs_1_1_10', '1.1.9', 1, 2),
    ('test001_wbs_1_1_12', '1.1.11', 1, 0),
    ('test001_wbs_1_1_13', '1.1.11', 1, 2),
    ('test001_wbs_1_1_14', '1.1.11', 1, 0),
    ('test001_wbs_1_1_15', '1.1.14', 1, 0),
    ('test001_wbs_1_2', '1.1.15', 1, 0),
    ('test001_wbs_1_3_1', '1.1.11', 1, 0),
    ('test001_wbs_1_3_2', '1.3.1', 1, 0),
    ('test001_wbs_1_3_3_1', '1.1.11', 1, 0),
    ('test001_wbs_1_3_3_2', '1.3.3.1', 1, 0),
    ('test001_wbs_1_3_3_3', '1.3.3.2', 1, 0),
    ('test001_wbs_1_3_4_1', '1.1.11', 1, 0),
    ('test001_wbs_1_3_4_2', '1.3.4.1', 1, 0),
    ('test001_wbs_1_3_4_3', '1.3.4.2', 1, 0),
    ('test001_wbs_1_3_4_4', '1.3.4.3', 1, 0),
    ('test001_wbs_1_3_5_1', '1.3.4.4', 1, 0),
    ('test001_wbs_1_3_5_2', '1.3.5.1', 1, 0),
    ('test001_wbs_1_3_5_3', '1.3.5.2', 1, 0),
    ('test001_wbs_1_3_5_4', '1.3.5.3', 1, 0),
    ('test001_wbs_1_3_5_5', '1.3.5.4', 1, 0),
    ('test001_wbs_1_3_6', '1.3.5.5', 1, 0),
    ('test001_wbs_1_3_7_1', '1.1.11', 1, 0),
    ('test001_wbs_1_3_7_2', '1.3.7.1', 1, 0),
    ('test001_wbs_1_3_7_3', '1.3.7.2', 1, 0),
    ('test001_wbs_1_3_7_4', '1.3.7.3', 1, 0),
    ('test001_wbs_1_3_8', '1.3.7.4', 1, 0),
    ('test001_wbs_1_3_9_1', '1.3.4.4', 1, 0),
    ('test001_wbs_1_3_9_2', '1.3.9.1', 1, 0),
    ('test001_wbs_1_3_9_3', '1.3.9.2', 1, -15),
    ('test001_wbs_1_3_9_3', '1.3.7.4', 2, -15),
    ('test001_wbs_1_3_9_4', '1.3.9.3', 1, 0),
    ('test001_wbs_1_3_10', '1.3.9.4', 1, 0),
    ('test001_wbs_1_3_11_2', '1.3.11.1', 1, 0),
    ('test001_wbs_1_3_12', '1.3.11.2', 1, 0),
    ('test001_wbs_1_3_13_2', '1.3.13.1', 1, 0),
    ('test001_wbs_1_3_14', '1.3.13.2', 1, 0),
    ('test001_wbs_1_4', '1.3.14', 1, 0),
    ('test001_wbs_1_4', '1.3.10', 2, 0),
    ('test001_wbs_1_4', '1.3.6', 3, 0),
    ('test001_wbs_1_5_1_1', '1.2', 1, 0),
    ('test001_wbs_1_5_1_2', '1.5.1.1', 1, 0),
    ('test001_wbs_1_5_1_3', '1.5.1.1', 1, 0),
    ('test001_wbs_1_5_1_4', '1.5.1.1', 1, 0),
    ('test001_wbs_1_5_1_5', '1.5.1.1', 1, 0),
    ('test001_wbs_1_5_1_6', '1.5.1.1', 1, 0),
    ('test001_wbs_1_5_2_1', '1.1.11', 1, 0),
    ('test001_wbs_1_5_2_2', '1.5.2.1', 1, 0),
    ('test001_wbs_1_5_2_3', '1.5.2.2', 1, 0),
    ('test001_wbs_1_5_2_4', '1.5.2.3', 1, 0),
    ('test001_wbs_1_5_2_5', '1.5.2.4', 1, 0),
    ('test001_wbs_1_5_2_6', '1.5.2.5', 1, 0),
    ('test001_wbs_1_5_3', '1.5.2', 1, 0),
    ('test001_wbs_1_5_3', '1.5.1', 2, 0),
    ('test001_wbs_1_5_5_1', '1.5.4', 1, 0),
    ('test001_wbs_1_5_5_2', '1.5.5.1', 1, 0),
    ('test001_wbs_1_5_5_3', '1.5.5.2', 1, 0),
    ('test001_wbs_1_5_5_4', '1.5.5.3', 1, 0),
    ('test001_wbs_1_5_5_5', '1.5.5.3', 1, 0),
    ('test001_wbs_1_5_5_6', '1.5.5.5', 1, 0),
    ('test001_wbs_1_5_5_6', '1.5.5.4', 2, 0),
    ('test001_wbs_1_5_5_7', '1.5.5.6', 1, 0),
    ('test001_wbs_1_5_5_8', '1.5.5.6', 1, 0),
    ('test001_wbs_1_5_5_9', '1.5.5.8', 1, 0),
    ('test001_wbs_1_5_5_9', '1.5.5.3', 2, 0),
    ('test001_wbs_1_5_5_10', '1.5.5.9', 1, 0),
    ('test001_wbs_1_5_5_11', '1.5.5.3', 1, 0),
    ('test001_wbs_1_5_5_11', '1.3.12', 2, 0),
    ('test001_wbs_1_5_5_12', '1.5.5.3', 1, 0),
    ('test001_wbs_1_5_5_12', '1.3.12', 2, 0),
    ('test001_wbs_1_5_5_13', '1.5.5.3', 1, 0),
    ('test001_wbs_1_5_5_13', '1.3.12', 2, 0),
    ('test001_wbs_1_5_5_14', '1.5.5.3', 1, 0),
    ('test001_wbs_1_5_5_14', '1.3.12', 2, 0),
    ('test001_wbs_1_5_5_15', '1.5.5.3', 1, 0),
    ('test001_wbs_1_5_5_15', '1.3.12', 2, 0),
    ('test001_wbs_1_5_5_16', '1.5.5.3', 1, 0),
    ('test001_wbs_1_5_5_16', '1.3.12', 2, 0),
    ('test001_wbs_1_5_5_17', '1.5.5.3', 1, 0),
    ('test001_wbs_1_5_5_17', '1.3.12', 2, 0),
    ('test001_wbs_1_5_6', '1.5.5.11', 1, 0),
    ('test001_wbs_1_5_6', '1.5.5.15', 2, 0),
    ('test001_wbs_1_5_6', '1.5.5.9', 3, 0),
    ('test001_wbs_1_5_7', '1.5.6', 1, 0),
    ('test001_wbs_1_5_7', '1.4', 2, 0),
    ('test001_wbs_1_5_8_1', '1.5.7', 1, 0),
    ('test001_wbs_1_5_8_1', '1.5.6', 2, 0),
    ('test001_wbs_1_5_8_1', '1.5.3', 3, 0),
    ('test001_wbs_1_5_8_2', '1.5.8.1', 1, 10),
    ('test001_wbs_1_5_8_3', '1.5.8.1', 1, 10),
    ('test001_wbs_1_5_8_4', '1.5.7', 1, 0),
    ('test001_wbs_1_5_8_5', '1.5.8.4', 1, 0),
    ('test001_wbs_1_5_8_6', '1.5.8.2', 1, 0),
    ('test001_wbs_1_5_8_6', '1.5.8.3', 2, 0),
    ('test001_wbs_1_5_8_7', '1.5.8.6', 1, -10),
    ('test001_wbs_1_5_8_8', '1.5.8.6', 1, -10),
    ('test001_wbs_1_5_8_9', '1.5.8.6', 1, -10),
    ('test001_wbs_1_5_8_10', '1.5.8.6', 1, -10),
    ('test001_wbs_1_5_8_11', '1.5.8.6', 1, -10),
    ('test001_wbs_1_5_8_12', '1.5.8.6', 1, -10),
    ('test001_wbs_1_5_8_13', '1.5.8.6', 1, -10),
    ('test001_wbs_1_5_9', '1.5.8.7', 1, 0),
    ('test001_wbs_1_5_9', '1.5.8.11', 2, 0),
    ('test001_wbs_1_5_9', '1.5.8.12', 3, 0),
    ('test001_wbs_1_5_10', '1.5.9', 1, 0),
    ('test001_wbs_1_5_11', '1.5.9', 1, 0),
    ('test001_wbs_1_6', '1.5.11', 1, 0)
)
INSERT INTO "WbsDependency" ("id", "projectId", "predecessorId", "successorId", "type", "lagDays", "createdAt", "updatedAt")
SELECT
  'test001_dep_' || replace(successor."code", '.', '_') || '_' || dependency_data."slotNumber",
  target_projects."id", predecessor."id", successor."id", 'FS'::"WbsDependencyType", dependency_data."lagDays",
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "_restore_cvte_project" target_projects
JOIN dependency_data ON TRUE
JOIN "WbsItem" successor
  ON successor."projectId" = target_projects."id"
 AND successor."id" = dependency_data."successorId"
JOIN "WbsItem" predecessor
  ON predecessor."projectId" = target_projects."id"
 AND predecessor."code" = dependency_data."predecessorCode"
WHERE predecessor."id" <> successor."id"
ON CONFLICT ("projectId", "predecessorId", "successorId", "type") DO UPDATE
SET "lagDays" = EXCLUDED."lagDays", "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Project" project
SET "summary" = 'Импортировано из CVTE CH AML 968d4 FF base project plan.xlsx: 113 элементов структуры, 14 вех. Маркер Today в файле: 2026-04-27.',
    "progress" = 53,
    "scheduleVariance" = 0,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE project."id" IN (SELECT "id" FROM "_restore_cvte_project");
