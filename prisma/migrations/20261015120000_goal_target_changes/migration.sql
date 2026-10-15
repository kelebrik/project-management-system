-- A target date change names the goal it moved and whether the move was agreed as no delay.
ALTER TABLE "ProjectTargetDateChange" ALTER COLUMN "previousDate" DROP NOT NULL;
ALTER TABLE "ProjectTargetDateChange" ADD COLUMN "goalId" TEXT;
ALTER TABLE "ProjectTargetDateChange" ADD COLUMN "goalCode" TEXT;
ALTER TABLE "ProjectTargetDateChange" ADD COLUMN "goalTitle" TEXT;
ALTER TABLE "ProjectTargetDateChange" ADD COLUMN "notDelay" BOOLEAN NOT NULL DEFAULT false;

-- The project's target date is the date of its last goal.
UPDATE "Project" p
SET "initialTargetDate" = COALESCE(p."initialTargetDate", p."targetDate"),
    "targetDate" = g."lastGoalDate"
FROM (
  SELECT "projectId", MAX("dueDate") AS "lastGoalDate"
  FROM "WbsItem"
  WHERE "type" = 'GOAL' AND "status" <> 'CANCELLED' AND "dueDate" IS NOT NULL
  GROUP BY "projectId"
) g
WHERE g."projectId" = p."id" AND p."targetDate" IS DISTINCT FROM g."lastGoalDate";
