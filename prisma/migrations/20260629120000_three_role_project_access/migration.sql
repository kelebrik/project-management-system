UPDATE "User"
SET "role" = 'EXECUTIVE_VIEWER'
WHERE "role" = 'TEAM_MEMBER';

ALTER TABLE "User"
ALTER COLUMN "role" SET DEFAULT 'EXECUTIVE_VIEWER';

UPDATE "RolePermission"
SET "enabled" = false
WHERE "role" = 'TEAM_MEMBER';

UPDATE "RolePermission"
SET "enabled" = true
WHERE "role" = 'EXECUTIVE_VIEWER'
  AND "permission" IN (
    'project.read',
    'project.create',
    'wbs.read',
    'issue.read',
    'raid.read',
    'overview.export'
  );

UPDATE "RolePermission"
SET "enabled" = false
WHERE "role" = 'EXECUTIVE_VIEWER'
  AND "permission" NOT IN (
    'project.read',
    'project.create',
    'wbs.read',
    'issue.read',
    'raid.read',
    'overview.export'
  )
  AND "permission" NOT LIKE 'admin.%';
