import type { Router } from 'express';
import { prisma } from '../../db.js';
import { recordAuditEvent } from '../../services/audit.js';
import { integrationSettings, managedPermissions } from './defaults.js';
import {
  adminConfigImportSchema,
  dictionaryItemSchema,
  rolePermissionSchema,
  systemSettingsSchema,
} from './schemas.js';
import {
  projectModulesConfig,
  saveProjectModulesConfig,
} from './project-modules.js';
import {
  adminBackupStatus,
  adminSettingResponse,
  adminSystemHealth,
  ensureAdminConfigDefaults,
} from './system.js';
import type { AdminRoutesContext } from './types.js';

export function registerAdminConfigRoutes(router: Router, context: AdminRoutesContext) {
  const { requireAdmin, currentUser, startedAt } = context;

  router.get('/admin/config', requireAdmin, async (_req, res) => {
    await ensureAdminConfigDefaults();
    const [rolePermissions, dictionaryItems, systemSettings, projectModules, health, backupStatus] =
      await Promise.all([
        prisma.rolePermission.findMany({
          orderBy: [{ role: 'asc' }, { permission: 'asc' }],
        }),
        prisma.dictionaryItem.findMany({
          orderBy: [{ dictionary: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
        }),
        prisma.systemSetting.findMany({
          orderBy: { key: 'asc' },
        }),
        projectModulesConfig(),
        adminSystemHealth(startedAt),
        adminBackupStatus(),
      ]);

    res.json({
      rolePermissions,
      dictionaryItems,
      systemSettings: systemSettings.map(adminSettingResponse),
      projectModules,
      managedPermissions,
      health,
      backupStatus,
    });
  });

  router.get('/admin/config/export', requireAdmin, async (_req, res) => {
    await ensureAdminConfigDefaults();
    const [rolePermissions, dictionaryItems, systemSettings, projectModules] = await Promise.all([
      prisma.rolePermission.findMany({
        orderBy: [{ role: 'asc' }, { permission: 'asc' }],
      }),
      prisma.dictionaryItem.findMany({
        orderBy: [{ dictionary: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
      }),
      prisma.systemSetting.findMany({
        orderBy: { key: 'asc' },
      }),
      projectModulesConfig(),
    ]);

    res.json({
      exportedAt: new Date().toISOString(),
      rolePermissions: rolePermissions.map(({ role, permission, enabled }) => ({
        role,
        permission,
        enabled,
      })),
      dictionaryItems: dictionaryItems.map(
        ({ dictionary, code, label, description, sortOrder, isActive }) => ({
          dictionary,
          code,
          label,
          description,
          sortOrder,
          isActive,
        }),
      ),
      systemSettings: systemSettings.map(({ key, value, isSecret }) => ({
        key,
        value: isSecret ? '' : value,
        isSecret,
        hasValue: value.length > 0,
      })),
      projectModules: projectModules.map(({ key, enabled }) => ({ key, enabled })),
    });
  });

  router.post('/admin/config/import', requireAdmin, async (req, res) => {
    const parsed = adminConfigImportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const rolePermissions = parsed.data.rolePermissions ?? [];
    const dictionaryItems = parsed.data.dictionaryItems ?? [];
    const systemSettings = parsed.data.systemSettings ?? [];
    const projectModules = parsed.data.projectModules ?? [];

    await prisma.$transaction([
      ...rolePermissions.map((permission) =>
        prisma.rolePermission.upsert({
          where: {
            role_permission: {
              role: permission.role,
              permission: permission.permission,
            },
          },
          update: { enabled: permission.enabled },
          create: permission,
        }),
      ),
      ...dictionaryItems.map((item) =>
        prisma.dictionaryItem.upsert({
          where: {
            dictionary_code: {
              dictionary: item.dictionary,
              code: item.code,
            },
          },
          update: {
            label: item.label,
            description: item.description || null,
            sortOrder: item.sortOrder,
            isActive: item.isActive,
          },
          create: {
            dictionary: item.dictionary,
            code: item.code,
            label: item.label,
            description: item.description || null,
            sortOrder: item.sortOrder,
            isActive: item.isActive,
          },
        }),
      ),
      ...systemSettings
        .filter((setting) => setting.value || !setting.isSecret)
        .map((setting) =>
          prisma.systemSetting.upsert({
            where: { key: setting.key },
            update: {
              value: setting.value,
              isSecret: setting.isSecret ?? false,
            },
            create: {
              key: setting.key,
              value: setting.value,
              isSecret: setting.isSecret ?? false,
            },
          }),
        ),
    ]);
    if (projectModules.length > 0) {
      await saveProjectModulesConfig(projectModules);
    }
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'admin.config.import',
      objectType: 'SystemSetting',
      metadata: {
        rolePermissions: rolePermissions.length,
        dictionaryItems: dictionaryItems.length,
        systemSettings: systemSettings.length,
        projectModules: projectModules.length,
      },
    });
    res.json({ ok: true });
  });

  router.patch('/admin/role-permissions/:permissionId', requireAdmin, async (req, res) => {
    const parsed = rolePermissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const permissionId = Array.isArray(req.params.permissionId)
      ? req.params.permissionId[0]
      : req.params.permissionId;
    if (!permissionId) {
      res.status(400).json({ error: 'Право не указано' });
      return;
    }

    const before = await prisma.rolePermission.findUnique({ where: { id: permissionId } });
    if (!before) {
      res.status(404).json({ error: 'Право не найдено' });
      return;
    }
    if (before.role === 'ADMIN' && !parsed.data.enabled) {
      res.status(400).json({ error: 'Права администратора нельзя отключить' });
      return;
    }
    const updated = await prisma.rolePermission.update({
      where: { id: permissionId },
      data: { enabled: parsed.data.enabled },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'admin.role_permission.update',
      objectType: 'RolePermission',
      objectId: updated.id,
      beforeValue: before,
      afterValue: updated,
    });
    res.json(updated);
  });

  router.post('/admin/dictionary-items', requireAdmin, async (req, res) => {
    const parsed = dictionaryItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const item = await prisma.dictionaryItem.upsert({
      where: {
        dictionary_code: {
          dictionary: parsed.data.dictionary,
          code: parsed.data.code,
        },
      },
      update: {
        label: parsed.data.label,
        description: parsed.data.description || null,
        sortOrder: parsed.data.sortOrder,
        isActive: parsed.data.isActive,
      },
      create: {
        dictionary: parsed.data.dictionary,
        code: parsed.data.code,
        label: parsed.data.label,
        description: parsed.data.description || null,
        sortOrder: parsed.data.sortOrder,
        isActive: parsed.data.isActive,
      },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'admin.dictionary.upsert',
      objectType: 'DictionaryItem',
      objectId: item.id,
      afterValue: item,
      metadata: { dictionary: item.dictionary, code: item.code },
    });
    res.status(201).json(item);
  });

  router.patch('/admin/dictionary-items/:itemId', requireAdmin, async (req, res) => {
    const parsed = dictionaryItemSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
    if (!itemId) {
      res.status(400).json({ error: 'Элемент справочника не указан' });
      return;
    }

    const before = await prisma.dictionaryItem.findUnique({ where: { id: itemId } });
    if (!before) {
      res.status(404).json({ error: 'Элемент справочника не найден' });
      return;
    }
    const updated = await prisma.dictionaryItem.update({
      where: { id: itemId },
      data: {
        dictionary: parsed.data.dictionary,
        code: parsed.data.code,
        label: parsed.data.label,
        description:
          parsed.data.description === undefined ? undefined : parsed.data.description || null,
        sortOrder: parsed.data.sortOrder,
        isActive: parsed.data.isActive,
      },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'admin.dictionary.update',
      objectType: 'DictionaryItem',
      objectId: updated.id,
      beforeValue: before,
      afterValue: updated,
      metadata: { dictionary: updated.dictionary, code: updated.code },
    });
    res.json(updated);
  });

  router.delete('/admin/dictionary-items/:itemId', requireAdmin, async (req, res) => {
    const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
    if (!itemId) {
      res.status(400).json({ error: 'Элемент справочника не указан' });
      return;
    }
    const before = await prisma.dictionaryItem.findUnique({ where: { id: itemId } });
    if (!before) {
      res.status(404).json({ error: 'Элемент справочника не найден' });
      return;
    }
    const updated = await prisma.dictionaryItem.update({
      where: { id: itemId },
      data: { isActive: false },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'admin.dictionary.deactivate',
      objectType: 'DictionaryItem',
      objectId: updated.id,
      beforeValue: before,
      afterValue: updated,
      metadata: { dictionary: updated.dictionary, code: updated.code },
    });
    res.json(updated);
  });

  router.put('/admin/system-settings', requireAdmin, async (req, res) => {
    const parsed = systemSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const keys = Object.keys(parsed.data.settings);
    if (keys.length === 0) {
      res.status(400).json({ error: 'Настройки не переданы' });
      return;
    }

    const before = await prisma.systemSetting.findMany({
      where: { key: { in: keys } },
    });
    const beforeByKey = new Map(before.map((setting) => [setting.key, setting]));
    const updated = await prisma.$transaction(
      keys.map((key) => {
        const input = parsed.data.settings[key];
        const current = beforeByKey.get(key);
        const isSecret = input.isSecret ?? current?.isSecret ?? false;
        const preserveSecret = isSecret && input.value === '' && current?.value;
        return prisma.systemSetting.upsert({
          where: { key },
          update: {
            value: preserveSecret ? current.value : input.value,
            isSecret,
          },
          create: {
            key,
            value: input.value,
            isSecret,
          },
        });
      }),
    );
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'admin.system_settings.update',
      objectType: 'SystemSetting',
      metadata: {
        keys,
        secretKeys: updated.filter((setting) => setting.isSecret).map((setting) => setting.key),
      },
    });
    res.json(updated.map(adminSettingResponse));
  });
}
