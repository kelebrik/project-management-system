import type { BusinessUnitRole } from '@prisma/client';
import { prisma } from '../db.js';

export const BUSINESS_UNIT_PERMISSIONS = [
  'PROJECT_VIEW',
  'PROJECT_CREATE',
  'PROJECT_ADMIN',
  'MEMBERS_MANAGE',
] as const;

export type BusinessUnitPermission = (typeof BUSINESS_UNIT_PERMISSIONS)[number];

export function defaultBusinessUnitPermissionEnabled(
  role: BusinessUnitRole,
  permission: BusinessUnitPermission,
) {
  if (permission === 'PROJECT_VIEW' || permission === 'PROJECT_CREATE') return true;
  return role === 'ADMIN';
}

export async function ensureBusinessUnitPermissionDefaults() {
  const roles: BusinessUnitRole[] = ['ADMIN', 'VIEWER'];
  await prisma.businessUnitRolePermission.createMany({
    data: roles.flatMap((role) =>
      BUSINESS_UNIT_PERMISSIONS.map((permission) => ({
        role,
        permission,
        enabled: defaultBusinessUnitPermissionEnabled(role, permission),
      })),
    ),
    skipDuplicates: true,
  });
}

export async function businessUnitRolesWithPermission(permission: BusinessUnitPermission) {
  const records = await prisma.businessUnitRolePermission.findMany({
    where: { permission, enabled: true },
    select: { role: true },
  });
  return records.map((record) => record.role);
}

export async function businessUnitRoleHasPermission(
  role: BusinessUnitRole,
  permission: BusinessUnitPermission,
) {
  const record = await prisma.businessUnitRolePermission.findUnique({
    where: { role_permission: { role, permission } },
    select: { enabled: true },
  });
  return record?.enabled ?? false;
}
