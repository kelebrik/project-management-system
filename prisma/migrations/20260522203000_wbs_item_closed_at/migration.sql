ALTER TABLE "WbsItem" ADD COLUMN "closedAt" TIMESTAMP(3);

UPDATE "WbsItem"
SET "closedAt" = COALESCE("dueDate", "updatedAt")
WHERE "status" = 'DONE'
  AND "closedAt" IS NULL;

CREATE INDEX "WbsItem_projectId_closedAt_idx" ON "WbsItem"("projectId", "closedAt");
