ALTER TYPE "WbsItemStatus" ADD VALUE IF NOT EXISTS 'IN_REVIEW';

INSERT INTO "DictionaryItem" ("id", "dictionary", "code", "label", "description", "sortOrder", "isActive", "updatedAt")
VALUES ('dict_wbs_status_in_review', 'wbs_status', 'IN_REVIEW', 'На проверке', 'Работа выполнена и ожидает проверки', 30, true, CURRENT_TIMESTAMP)
ON CONFLICT ("dictionary", "code") DO NOTHING;

UPDATE "DictionaryItem"
SET "sortOrder" = CASE "code"
  WHEN 'AT_RISK' THEN 40
  WHEN 'BLOCKED' THEN 50
  WHEN 'DONE' THEN 60
  WHEN 'CANCELLED' THEN 70
  ELSE "sortOrder"
END
WHERE "dictionary" = 'wbs_status'
  AND "code" IN ('AT_RISK', 'BLOCKED', 'DONE', 'CANCELLED');
