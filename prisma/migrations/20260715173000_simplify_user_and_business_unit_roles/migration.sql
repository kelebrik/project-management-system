-- Keep legacy enum values for backward compatibility, but normalize active assignments
-- to the two roles exposed by the application.
UPDATE "User"
SET "role" = 'EXECUTIVE_VIEWER'
WHERE "role" IN ('PROJECT_MANAGER', 'TEAM_MEMBER');

UPDATE "BusinessUnitMembership"
SET "role" = 'VIEWER'
WHERE "role" = 'PROJECT_MANAGER';

UPDATE "RolePermission"
SET "enabled" = true,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" = 'EXECUTIVE_VIEWER'
  AND "permission" IN ('project.read', 'project.create');
