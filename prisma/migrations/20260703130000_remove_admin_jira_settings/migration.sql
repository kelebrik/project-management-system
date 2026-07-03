DELETE FROM "RolePermission"
WHERE "permission" = 'admin.jira';

DELETE FROM "SystemSetting"
WHERE "key" IN (
  'jira.enabled',
  'jira.baseUrl',
  'jira.email',
  'jira.apiToken',
  'jira.maxResults'
);
