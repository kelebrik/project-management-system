-- WBS templates and the GitHub, Azure DevOps and BI settings were stored but never read; their pages and fields are gone.
DELETE FROM "SystemSetting" WHERE "key" IN ('wbs.templates', 'github.enabled', 'github.baseUrl', 'github.token', 'azureDevOps.enabled', 'azureDevOps.organizationUrl', 'azureDevOps.token', 'bi.enabled', 'bi.exportUrl');
-- No route or screen checks these admin permissions any more.
DELETE FROM "RolePermission" WHERE "permission" IN ('admin.templates', 'admin.dictionaries', 'admin.health', 'admin.backup', 'admin.project_access', 'admin.audit');
