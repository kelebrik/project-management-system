CREATE TYPE "BusinessUnitRole" AS ENUM ('ADMIN', 'PROJECT_MANAGER', 'VIEWER');

CREATE TABLE "BusinessUnit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BusinessUnit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessUnitMembership" (
    "id" TEXT NOT NULL,
    "businessUnitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "BusinessUnitRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BusinessUnitMembership_pkey" PRIMARY KEY ("id")
);

INSERT INTO "BusinessUnit" ("id", "code", "name", "isDefault", "isActive", "updatedAt")
VALUES ('business-unit-default', 'main', 'Основной бизнес-юнит', true, true, CURRENT_TIMESTAMP);

ALTER TABLE "Project" ADD COLUMN "businessUnitId" TEXT;
UPDATE "Project" SET "businessUnitId" = 'business-unit-default';
ALTER TABLE "Project" ALTER COLUMN "businessUnitId" SET NOT NULL;

INSERT INTO "BusinessUnitMembership" ("id", "businessUnitId", "userId", "role", "updatedAt")
SELECT
    'bum-' || "id",
    'business-unit-default',
    "id",
    CASE
        WHEN "role" = 'ADMIN' THEN 'ADMIN'::"BusinessUnitRole"
        WHEN "role" = 'PROJECT_MANAGER' THEN 'PROJECT_MANAGER'::"BusinessUnitRole"
        ELSE 'VIEWER'::"BusinessUnitRole"
    END,
    CURRENT_TIMESTAMP
FROM "User";

CREATE UNIQUE INDEX "BusinessUnit_code_key" ON "BusinessUnit"("code");
CREATE INDEX "BusinessUnit_isActive_name_idx" ON "BusinessUnit"("isActive", "name");
CREATE UNIQUE INDEX "BusinessUnitMembership_businessUnitId_userId_key" ON "BusinessUnitMembership"("businessUnitId", "userId");
CREATE INDEX "BusinessUnitMembership_userId_role_idx" ON "BusinessUnitMembership"("userId", "role");
CREATE INDEX "BusinessUnitMembership_businessUnitId_role_idx" ON "BusinessUnitMembership"("businessUnitId", "role");
CREATE INDEX "Project_businessUnitId_status_idx" ON "Project"("businessUnitId", "status");

ALTER TABLE "BusinessUnitMembership" ADD CONSTRAINT "BusinessUnitMembership_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessUnitMembership" ADD CONSTRAINT "BusinessUnitMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
