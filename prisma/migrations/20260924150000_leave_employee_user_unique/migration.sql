-- A system user can be linked to at most one person on the leave schedule.
-- NULL stays allowed for any number of people who are not system users.
DROP INDEX IF EXISTS "LeaveEmployee_userId_idx";
CREATE UNIQUE INDEX "LeaveEmployee_userId_key" ON "LeaveEmployee"("userId");
