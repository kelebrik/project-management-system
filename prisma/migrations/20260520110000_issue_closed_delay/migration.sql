ALTER TABLE "Issue" ADD COLUMN "closedDelayDays" INTEGER;

UPDATE "Issue"
SET "closedDelayDays" = GREATEST(
  0,
  FLOOR(EXTRACT(EPOCH FROM ("dueDate" - "initialDueDate")) / 86400)::INTEGER
)
WHERE "status" IN ('Done', 'Closed', 'Resolved')
  AND "dueDate" IS NOT NULL
  AND "initialDueDate" IS NOT NULL;
