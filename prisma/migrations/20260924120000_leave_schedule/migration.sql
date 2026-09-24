-- Leave schedule (Development section): people, leave types, leaves and the
-- production calendar used to count working days.
CREATE TABLE "LeaveEmployee" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "department" TEXT NOT NULL DEFAULT '',
  "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "LeaveEmployee_userId_idx" ON "LeaveEmployee"("userId");

CREATE TABLE "LeaveType" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "nameEn" TEXT NOT NULL DEFAULT '',
  "color" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Leave" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "employeeId" TEXT NOT NULL REFERENCES "LeaveEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "typeId" TEXT NOT NULL REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "comment" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Leave_dates_check" CHECK ("startDate" <= "endDate")
);
CREATE INDEX "Leave_employeeId_startDate_idx" ON "Leave"("employeeId", "startDate");
CREATE INDEX "Leave_startDate_endDate_idx" ON "Leave"("startDate", "endDate");

CREATE TABLE "LeaveCalendarDay" (
  "date" DATE NOT NULL PRIMARY KEY,
  "isWorkingDay" BOOLEAN NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "LeaveType" ("id", "name", "nameEn", "color", "sortOrder", "updatedAt") VALUES
  ('leave-type-vacation', 'Отпуск', 'Vacation', '#8bc34a', 10, CURRENT_TIMESTAMP),
  ('leave-type-sick', 'Больничный', 'Sick leave', '#f07056', 20, CURRENT_TIMESTAMP),
  ('leave-type-time-off', 'Отгул', 'Time off', '#5b9be6', 30, CURRENT_TIMESTAMP),
  ('leave-type-family', 'Семейный отпуск', 'Family leave', '#a86ad8', 40, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Russian non-working days in 2026 that fall on weekdays (Labour Code art. 112
-- and Government Decree No. 1466 of 24.09.2025 moving 3 Jan to 9 Jan and 4 Jan
-- to 31 Dec). 2026 has no working Saturdays.
INSERT INTO "LeaveCalendarDay" ("date", "isWorkingDay", "description") VALUES
  ('2026-01-01', false, 'Новогодние каникулы'),
  ('2026-01-02', false, 'Новогодние каникулы'),
  ('2026-01-05', false, 'Новогодние каникулы'),
  ('2026-01-06', false, 'Новогодние каникулы'),
  ('2026-01-07', false, 'Рождество Христово'),
  ('2026-01-08', false, 'Новогодние каникулы'),
  ('2026-01-09', false, 'Перенос выходного с 3 января'),
  ('2026-02-23', false, 'День защитника Отечества'),
  ('2026-03-09', false, 'Перенос с 8 марта'),
  ('2026-05-01', false, 'Праздник Весны и Труда'),
  ('2026-05-11', false, 'Перенос с 9 мая'),
  ('2026-06-12', false, 'День России'),
  ('2026-11-04', false, 'День народного единства'),
  ('2026-12-31', false, 'Перенос выходного с 4 января')
ON CONFLICT ("date") DO NOTHING;
