import type { UserRole } from '@prisma/client';

export const managedRoles: UserRole[] = [
  'ADMIN',
  'EXECUTIVE_VIEWER',
];

export const managedPermissions = [
  'project.read',
  'project.create',
  'project.update',
  'project.close',
  'project.delete',
  'wbs.read',
  'wbs.create',
  'wbs.update',
  'wbs.delete',
  'wbs.move',
  'wbs.baseline',
  'wbs.dependency',
  'issue.read',
  'issue.create',
  'issue.update',
  'issue.close',
  'issue.delete',
  'raid.read',
  'raid.create',
  'raid.update',
  'raid.close',
  'raid.delete',
  'overview.generate',
  'overview.publish',
  'overview.export',
  'admin.users',
  'admin.roles',
  'admin.config',
  'admin.modules',
  'admin.integrations',
];

/** Settings and permissions that were removed; an older configuration export may still carry them. */
export const retiredPermissions: readonly string[] = [
  'admin.rag',
  'admin.workflow',
  'admin.templates',
  'admin.dictionaries',
  'admin.health',
  'admin.backup',
  'admin.project_access',
  'admin.audit',
];
export const retiredSystemSettings: readonly string[] = [
  'rag.formula.green',
  'rag.formula.amber',
  'rag.formula.red',
  'workflow.overview',
  'workflow.baseline',
  'workflow.projectClose',
  'wbs.templates',
  'github.enabled',
  'github.baseUrl',
  'github.token',
  'azureDevOps.enabled',
  'azureDevOps.organizationUrl',
  'azureDevOps.token',
  'bi.enabled',
  'bi.exportUrl',
];

export const integrationSettings = [
  ['gitlab.enabled', 'false', false],
  ['gitlab.baseUrl', '', false],
  ['gitlab.token', '', true],
] as const;
