CREATE TYPE "ProjectAccessLevel" AS ENUM ('VIEW', 'EDIT', 'ADMIN');

CREATE TABLE "ProjectAccess" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "ProjectAccessLevel" NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectAccess_projectId_userId_key" ON "ProjectAccess"("projectId", "userId");
CREATE INDEX "ProjectAccess_userId_level_idx" ON "ProjectAccess"("userId", "level");
CREATE INDEX "ProjectAccess_projectId_level_idx" ON "ProjectAccess"("projectId", "level");

ALTER TABLE "ProjectAccess"
  ADD CONSTRAINT "ProjectAccess_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectAccess"
  ADD CONSTRAINT "ProjectAccess_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ProjectAccess" ("id", "projectId", "userId", "level", "createdAt", "updatedAt")
SELECT
  CONCAT('pa_', md5(CONCAT(p."id", ':', u."id"))),
  p."id",
  u."id",
  CASE
    WHEN u."role" = 'EXECUTIVE_VIEWER' THEN 'VIEW'::"ProjectAccessLevel"
    ELSE 'EDIT'::"ProjectAccessLevel"
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Project" p
CROSS JOIN "User" u
WHERE u."isActive" = true
  AND u."role" IN ('PROJECT_MANAGER', 'TEAM_MEMBER', 'EXECUTIVE_VIEWER')
ON CONFLICT ("projectId", "userId") DO NOTHING;
