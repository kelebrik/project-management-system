ALTER TYPE "WbsItemType" ADD VALUE 'GOAL';

INSERT INTO "DictionaryItem" ("id", "dictionary", "code", "label", "description", "sortOrder", "isActive", "updatedAt")
VALUES
  ('dict_wbs_type_goal', 'wbs_type', 'GOAL', 'Цель', 'Управленческая цель проекта', 45, true, CURRENT_TIMESTAMP)
ON CONFLICT ("dictionary", "code") DO UPDATE
SET
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "sortOrder" = EXCLUDED."sortOrder",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
