UPDATE "User"
SET "passwordHash" = NULL
WHERE "passwordHash" IS NOT NULL;
