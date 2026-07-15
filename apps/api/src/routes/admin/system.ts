import type { UserRole } from '@prisma/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../db.js';
import { ensureBusinessUnitPermissionDefaults } from '../../server/business-unit-permissions.js';
import {
  defaultDictionaryItems,
  defaultSystemSettings,
  integrationSettings,
  managedPermissions,
  managedRoles,
} from './defaults.js';
import {
  normalizeProjectModules,
  projectModulesSettingKey,
  projectModulesSettingValue,
} from './project-modules.js';

export function defaultPermissionEnabled(role: UserRole, permission: string) {
  if (role === 'ADMIN') return true;
  if (permission.startsWith('admin.')) return false;
  if (role === 'EXECUTIVE_VIEWER') {
    return (
      permission.endsWith('.read') ||
      permission === 'project.create' ||
      permission === 'overview.export'
    );
  }
  if (role === 'TEAM_MEMBER') {
    return (
      permission.endsWith('.read') ||
      permission === 'project.create' ||
      permission === 'overview.export'
    );
  }
  return [
    'project.read',
    'project.create',
    'project.update',
    'project.close',
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
  ].includes(permission);
}

export async function ensureAdminConfigDefaults() {
  await ensureBusinessUnitPermissionDefaults();
  await prisma.rolePermission.createMany({
    data: managedRoles.flatMap((role) =>
      managedPermissions.map((permission) => ({
        role,
        permission,
        enabled: defaultPermissionEnabled(role, permission),
      })),
    ),
    skipDuplicates: true,
  });

  await prisma.dictionaryItem.createMany({
    data: defaultDictionaryItems.map(([dictionary, code, label, description, sortOrder]) => ({
      dictionary,
      code,
      label,
      description,
      sortOrder,
      isActive: true,
    })),
    skipDuplicates: true,
  });

  await Promise.all(
    [
      ...defaultSystemSettings,
      ...integrationSettings,
      [projectModulesSettingKey, projectModulesSettingValue(normalizeProjectModules()), false] as const,
    ].map(([key, value, isSecret]) =>
      prisma.systemSetting.upsert({
        where: { key },
        update: { isSecret },
        create: {
          key,
          value,
          isSecret,
        },
      }),
    ),
  );
}

export async function adminBackupStatus() {
  const backupDir = process.env.BACKUP_DIR ?? path.resolve(process.cwd(), 'backups');
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 14);
  try {
    const entries = await fs.readdir(backupDir, { withFileTypes: true });
    const backups = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.dump'))
        .map(async (entry) => {
          const fullPath = path.join(backupDir, entry.name);
          const stat = await fs.stat(fullPath);
          return {
            file: entry.name,
            path: fullPath,
            sizeBytes: stat.size,
            updatedAt: stat.mtime.toISOString(),
          };
        }),
    );
    backups.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const latestBackup = backups[0] ?? null;
    const latestChecksum = latestBackup
      ? await fs.readFile(`${latestBackup.path}.sha256`, 'utf8').then((value) => value.trim()).catch(() => null)
      : null;
    return {
      ok: true,
      backupDir,
      retentionDays,
      totalBackups: backups.length,
      latestBackup,
      latestChecksum,
      message: backups.length ? 'Backup-файлы найдены' : 'Backup-файлы не найдены',
    };
  } catch (error) {
    return {
      ok: false,
      backupDir,
      retentionDays,
      totalBackups: 0,
      latestBackup: null,
      latestChecksum: null,
      message: error instanceof Error ? error.message : 'Не удалось прочитать каталог backup',
    };
  }
}

export async function adminSystemHealth(startedAt: Date) {
  let database = 'ok';
  let databaseLatencyMs = 0;
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseLatencyMs = Date.now() - started;
  } catch (error) {
    database = error instanceof Error ? error.message : 'database error';
  }
  return {
    ok: database === 'ok',
    database,
    databaseLatencyMs,
    uptimeSeconds: Math.round(process.uptime()),
    startedAt: startedAt.toISOString(),
    nodeEnv: process.env.NODE_ENV ?? 'development',
  };
}

export function adminSettingResponse(setting: {
  key: string;
  value: string;
  isSecret: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...setting,
    value: setting.isSecret ? '' : setting.value,
    hasValue: setting.value.length > 0,
  };
}
