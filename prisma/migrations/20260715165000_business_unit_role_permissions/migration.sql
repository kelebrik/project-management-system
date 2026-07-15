CREATE TABLE "BusinessUnitRolePermission" (
    "id" TEXT NOT NULL,
    "role" "BusinessUnitRole" NOT NULL,
    "permission" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BusinessUnitRolePermission_pkey" PRIMARY KEY ("id")
);

INSERT INTO "BusinessUnitRolePermission" ("id", "role", "permission", "enabled", "updatedAt")
VALUES
    ('burp-admin-view', 'ADMIN', 'PROJECT_VIEW', true, CURRENT_TIMESTAMP),
    ('burp-admin-create', 'ADMIN', 'PROJECT_CREATE', true, CURRENT_TIMESTAMP),
    ('burp-admin-project-admin', 'ADMIN', 'PROJECT_ADMIN', true, CURRENT_TIMESTAMP),
    ('burp-admin-members', 'ADMIN', 'MEMBERS_MANAGE', true, CURRENT_TIMESTAMP),
    ('burp-pm-view', 'PROJECT_MANAGER', 'PROJECT_VIEW', true, CURRENT_TIMESTAMP),
    ('burp-pm-create', 'PROJECT_MANAGER', 'PROJECT_CREATE', true, CURRENT_TIMESTAMP),
    ('burp-pm-project-admin', 'PROJECT_MANAGER', 'PROJECT_ADMIN', false, CURRENT_TIMESTAMP),
    ('burp-pm-members', 'PROJECT_MANAGER', 'MEMBERS_MANAGE', false, CURRENT_TIMESTAMP),
    ('burp-viewer-view', 'VIEWER', 'PROJECT_VIEW', true, CURRENT_TIMESTAMP),
    ('burp-viewer-create', 'VIEWER', 'PROJECT_CREATE', true, CURRENT_TIMESTAMP),
    ('burp-viewer-project-admin', 'VIEWER', 'PROJECT_ADMIN', false, CURRENT_TIMESTAMP),
    ('burp-viewer-members', 'VIEWER', 'MEMBERS_MANAGE', false, CURRENT_TIMESTAMP);

CREATE UNIQUE INDEX "BusinessUnitRolePermission_role_permission_key"
ON "BusinessUnitRolePermission"("role", "permission");

CREATE INDEX "BusinessUnitRolePermission_role_idx"
ON "BusinessUnitRolePermission"("role");

CREATE INDEX "BusinessUnitRolePermission_permission_idx"
ON "BusinessUnitRolePermission"("permission");
