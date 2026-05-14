ALTER TABLE "WbsItem"
ADD COLUMN "baselineStartDate" TIMESTAMP(3),
ADD COLUMN "baselineDueDate" TIMESTAMP(3),
ADD COLUMN "forecastStartDate" TIMESTAMP(3),
ADD COLUMN "forecastDueDate" TIMESTAMP(3);

UPDATE "WbsItem"
SET
  "baselineStartDate" = "startDate",
  "baselineDueDate" = "dueDate",
  "forecastStartDate" = "startDate",
  "forecastDueDate" = "dueDate";
