import { Prisma, type UserRole } from '@prisma/client';
import { changeUserPasswordSchema, createUserSchema, updateUserSchema } from '@pms/shared';
import { Router, type Request, type RequestHandler } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { prisma } from '../db.js';
import { isJiraConfigured } from '../jira.js';
import { recordAuditEvent } from '../services/audit.js';
import { emitWebhookEvent } from '../services/webhooks.js';

const managedRoles: UserRole[] = ['ADMIN', 'PROJECT_MANAGER', 'TEAM_MEMBER', 'EXECUTIVE_VIEWER'];
const managedPermissions = [
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
  'admin.dictionaries',
  'admin.templates',
  'admin.rag',
  'admin.workflow',
  'admin.jira',
  'admin.health',
  'admin.backup',
  'admin.config',
  'admin.audit',
  'admin.integrations',
];

const defaultDictionaryItems = [
  ['project_status', 'DRAFT', 'Черновик', 'Проект готовится к запуску', 10],
  ['project_status', 'ACTIVE', 'Активен', 'Проект находится в работе', 20],
  ['project_status', 'ON_HOLD', 'Приостановлен', 'Проект временно остановлен', 30],
  ['project_status', 'CLOSED', 'Закрыт', 'Проект переведен в архив', 40],
  ['project_type', 'PRODUCT', 'Продуктовый', 'Разработка продукта или версии продукта', 10],
  ['project_type', 'IT', 'ИТ', 'Внутренний ИТ-проект', 20],
  ['project_type', 'INTEGRATION', 'Интеграционный', 'Интеграция систем или поставщиков', 30],
  ['project_type', 'HARDWARE', 'Аппаратный', 'Разработка или поставка аппаратной части', 40],
  ['project_type', 'SOFTWARE', 'Программный', 'Разработка программного обеспечения', 50],
  ['risk_type', 'RISK', 'Риск', 'Потенциальное событие с влиянием на проект', 10],
  ['risk_type', 'DEPENDENCY', 'Проблема', 'Фактическая проблема или зависимость', 20],
  ['risk_type', 'ASSUMPTION', 'Допущение', 'Управленческое допущение проекта', 30],
  ['wbs_type', 'PHASE', 'Фаза', 'Верхний уровень структуры проекта', 10],
  ['wbs_type', 'WORK_PACKAGE', 'Пакет работ', 'Группа связанных задач', 20],
  ['wbs_type', 'DELIVERABLE', 'Результат', 'Контрольный результат работ', 30],
  ['wbs_type', 'MILESTONE', 'Веха', 'Нулевая по длительности контрольная точка', 40],
  ['wbs_type', 'TASK', 'Задача', 'Работа с длительностью и исполнителем', 50],
  ['wbs_status', 'NOT_STARTED', 'Не начата', 'Работы еще не стартовали', 10],
  ['wbs_status', 'IN_PROGRESS', 'В работе', 'Работы выполняются', 20],
  ['wbs_status', 'AT_RISK', 'Под риском', 'Есть риск нарушения срока', 30],
  ['wbs_status', 'BLOCKED', 'Провалено', 'Работа заблокирована или сорвана', 40],
  ['wbs_status', 'DONE', 'Сделано', 'Работа завершена', 50],
  ['wbs_status', 'CANCELLED', 'Отменено', 'Работа исключена из плана', 60],
  ['issue_severity', 'LOW', 'Низкая', 'Низкая критичность', 10],
  ['issue_severity', 'MEDIUM', 'Средняя', 'Средняя критичность', 20],
  ['issue_severity', 'HIGH', 'Высокая', 'Высокая критичность', 30],
  ['issue_severity', 'CRITICAL', 'Критичная', 'Критичная проблема', 40],
  ['raid_type', 'RISK', 'Риск', 'Потенциальное событие с влиянием на проект', 10],
  ['raid_type', 'DEPENDENCY', 'Проблема', 'Фактическая проблема или зависимость', 20],
  ['raid_type', 'ASSUMPTION', 'Допущение', 'Управленческое допущение проекта', 30],
  ['raid_status', 'OPEN', 'Открыто', 'Запись открыта', 10],
  ['raid_status', 'IN_PROGRESS', 'В работе', 'Идет обработка', 20],
  ['raid_status', 'MITIGATED', 'Смягчено', 'Меры снижения выполнены', 30],
  ['raid_status', 'VALIDATED', 'Подтверждено', 'Статус подтвержден', 40],
  ['raid_status', 'BREACHED', 'Нарушено', 'Ограничение или допущение нарушено', 50],
  ['raid_status', 'CLOSED', 'Закрыто', 'Запись закрыта', 60],
] as const;

const defaultWbsTemplates = JSON.stringify(
  [
    {
      code: 'product-release',
      name: 'Запуск продуктовой версии',
      items: [
        { code: '1', level: 1, type: 'PHASE', title: 'Запуск проекта' },
        { code: '1.1', level: 2, type: 'TASK', title: 'Утверждение паспорта проекта' },
        { code: '2', level: 1, type: 'PHASE', title: 'Поставка решения' },
        { code: '2.1', level: 2, type: 'MILESTONE', title: 'Готовность к пилоту' },
      ],
    },
    {
      code: 'integration',
      name: 'Интеграционный проект',
      items: [
        { code: '1', level: 1, type: 'PHASE', title: 'Обследование' },
        { code: '2', level: 1, type: 'PHASE', title: 'Интеграция' },
        { code: '3', level: 1, type: 'PHASE', title: 'Приемка' },
      ],
    },
  ],
  null,
  2,
);

const defaultSystemSettings = [
  ['jira.enabled', 'false', false],
  ['jira.baseUrl', '', false],
  ['jira.email', '', false],
  ['jira.apiToken', '', true],
  ['jira.maxResults', '100', false],
  ['rag.formula.green', 'Критичных открытых вопросов = 0 AND просроченных задач = 0', false],
  [
    'rag.formula.amber',
    'Есть риски в красной зоне OR отклонение срока <= 10 календарных дней',
    false,
  ],
  ['rag.formula.red', 'Критичный блокер OR отклонение срока > 10 календарных дней', false],
  ['workflow.overview', 'РП -> Спонсор -> Публикация для руководства', false],
  ['workflow.baseline', 'РП -> PMO -> Спонсор', false],
  ['workflow.projectClose', 'РП -> PMO -> Спонсор -> Архив', false],
  ['wbs.templates', defaultWbsTemplates, false],
] as const;

const integrationSettings = [
  ['gitlab.enabled', 'false', false],
  ['gitlab.baseUrl', '', false],
  ['gitlab.token', '', true],
  ['github.enabled', 'false', false],
  ['github.baseUrl', 'https://api.github.com', false],
  ['github.token', '', true],
  ['azureDevOps.enabled', 'false', false],
  ['azureDevOps.organizationUrl', '', false],
  ['azureDevOps.token', '', true],
  ['bi.enabled', 'false', false],
  ['bi.exportUrl', '', false],
] as const;


type AdminRoutesContext = {
  requireAdmin: RequestHandler;
  currentUser: (req: Request) => any;
  hashPassword: (password: string) => string;
  wouldRemoveLastAdmin: (
    userId: string,
    patch: Partial<{ role: UserRole; isActive: boolean }>,
  ) => Promise<boolean>;
  userResponse: (user: any) => any;
  startedAt: Date;
};

export function createAdminRouter({
  requireAdmin,
  currentUser,
  hashPassword,
  wouldRemoveLastAdmin,
  userResponse,
  startedAt,
}: AdminRoutesContext) {
  const router = Router();

router.get('/audit-events', requireAdmin, async (req, res) => {
  const take = Math.min(200, Math.max(1, Number(req.query.limit ?? 100)));
  const events = await prisma.auditEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take,
  });
  res.json(events);
});

const rolePermissionSchema = z.object({
  enabled: z.boolean(),
});

const dictionaryItemSchema = z.object({
  dictionary: z.string().trim().min(1),
  code: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

const systemSettingsSchema = z.object({
  settings: z.record(
    z.string(),
    z.object({
      value: z.string(),
      isSecret: z.boolean().optional(),
    }),
  ),
});

const adminConfigImportSchema = z.object({
  rolePermissions: z
    .array(
      z.object({
        role: z.enum(['ADMIN', 'PROJECT_MANAGER', 'TEAM_MEMBER', 'EXECUTIVE_VIEWER']),
        permission: z.string().trim().min(1),
        enabled: z.boolean(),
      }),
    )
    .optional(),
  dictionaryItems: z.array(dictionaryItemSchema).optional(),
  systemSettings: z
    .array(
      z.object({
        key: z.string().trim().min(1),
        value: z.string().default(''),
        isSecret: z.boolean().optional(),
      }),
    )
    .optional(),
});

const apiTokenSchema = z.object({
  name: z.string().trim().min(1),
  scopes: z.array(z.string().trim().min(1)).min(1).default(['project.read']),
  rateLimitPerMinute: z.coerce.number().int().min(10).max(10_000).default(120),
  expiresAt: z.string().trim().optional().nullable(),
});

const apiTokenPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  scopes: z.array(z.string().trim().min(1)).min(1).optional(),
  rateLimitPerMinute: z.coerce.number().int().min(10).max(10_000).optional(),
  expiresAt: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional(),
});

const webhookEndpointSchema = z.object({
  name: z.string().trim().min(1),
  url: z.string().trim().url().refine((value) => value.startsWith('https://'), {
    message: 'Webhook URL должен начинаться с https://',
  }),
  secret: z.string().trim().optional().nullable(),
  events: z.array(z.string().trim().min(1)).min(1).default(['*']),
  isActive: z.boolean().default(true),
});

const webhookEndpointPatchSchema = webhookEndpointSchema.partial();

function hashApiToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function apiTokenResponse(token: {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: Prisma.JsonValue;
  isActive: boolean;
  rateLimitPerMinute: number;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...token,
    scopes: Array.isArray(token.scopes) ? token.scopes : [],
  };
}

function integrationSettingResponse(setting: {
  key: string;
  value: string;
  isSecret: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return adminSettingResponse(setting);
}

function webhookEndpointResponse(endpoint: {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: Prisma.JsonValue;
  isActive: boolean;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...endpoint,
    secret: endpoint.secret ? '' : null,
    hasSecret: Boolean(endpoint.secret),
    events: Array.isArray(endpoint.events) ? endpoint.events : [],
  };
}

function defaultPermissionEnabled(role: UserRole, permission: string) {
  if (role === 'ADMIN') return true;
  if (permission.startsWith('admin.')) return false;
  if (role === 'EXECUTIVE_VIEWER') {
    return permission.endsWith('.read') || permission === 'overview.export';
  }
  if (role === 'TEAM_MEMBER') {
    return [
      'project.read',
      'wbs.read',
      'issue.read',
      'issue.create',
      'issue.update',
      'raid.read',
      'raid.create',
      'raid.update',
      'overview.export',
    ].includes(permission);
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

async function ensureAdminConfigDefaults() {
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
    [...defaultSystemSettings, ...integrationSettings].map(([key, value, isSecret]) =>
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

async function adminBackupStatus() {
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
    let latestChecksum: string | null = null;
    if (latestBackup) {
      latestChecksum = await fs
        .readFile(`${latestBackup.path}.sha256`, 'utf8')
        .then((value) => value.trim())
        .catch(() => null);
    }
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

async function adminSystemHealth() {
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
    jiraConfigured: isJiraConfigured(),
    uptimeSeconds: Math.round(process.uptime()),
    startedAt: startedAt.toISOString(),
    nodeEnv: process.env.NODE_ENV ?? 'development',
  };
}

function adminSettingResponse(setting: {
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

router.get('/admin/config', requireAdmin, async (_req, res) => {
  await ensureAdminConfigDefaults();
  const [rolePermissions, dictionaryItems, systemSettings, health, backupStatus] = await Promise.all([
    prisma.rolePermission.findMany({
      orderBy: [{ role: 'asc' }, { permission: 'asc' }],
    }),
    prisma.dictionaryItem.findMany({
      orderBy: [{ dictionary: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    }),
    prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    }),
    adminSystemHealth(),
    adminBackupStatus(),
  ]);
  res.json({
    rolePermissions,
    dictionaryItems,
    systemSettings: systemSettings.map(adminSettingResponse),
    managedPermissions,
    health,
    backupStatus,
  });
});

router.get('/admin/system-health', requireAdmin, async (_req, res) => {
  res.json(await adminSystemHealth());
});

router.get('/admin/backup-status', requireAdmin, async (_req, res) => {
  res.json(await adminBackupStatus());
});

router.get('/admin/integrations', requireAdmin, async (_req, res) => {
  await ensureAdminConfigDefaults();
  const [apiTokens, webhookEndpoints, webhookDeliveries, settings] = await Promise.all([
    prisma.apiToken.findMany({
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
    }),
    prisma.webhookEndpoint.findMany({
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
    }),
    prisma.webhookDelivery.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { endpoint: { select: { name: true } } },
    }),
    prisma.systemSetting.findMany({
      where: {
        key: {
          in: integrationSettings.map(([key]) => key),
        },
      },
      orderBy: { key: 'asc' },
    }),
  ]);

  res.json({
    apiTokens: apiTokens.map(apiTokenResponse),
    webhookEndpoints: webhookEndpoints.map(webhookEndpointResponse),
    webhookDeliveries,
    integrationSettings: settings.map(integrationSettingResponse),
  });
});

router.post('/admin/api-tokens', requireAdmin, async (req, res) => {
  const parsed = apiTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const plainToken = `pms_${randomBytes(32).toString('base64url')}`;
  const token = await prisma.apiToken.create({
    data: {
      name: parsed.data.name,
      tokenHash: hashApiToken(plainToken),
      tokenPrefix: plainToken.slice(0, 12),
      scopes: parsed.data.scopes,
      rateLimitPerMinute: parsed.data.rateLimitPerMinute,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      createdById: currentUser(req)?.id ?? null,
    },
  });
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'admin.api_token.create',
    objectType: 'ApiToken',
    objectId: token.id,
    afterValue: apiTokenResponse(token),
  });
  res.status(201).json({
    ...apiTokenResponse(token),
    token: plainToken,
  });
});

router.patch('/admin/api-tokens/:tokenId', requireAdmin, async (req, res) => {
  const parsed = apiTokenPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const tokenId = Array.isArray(req.params.tokenId) ? req.params.tokenId[0] : req.params.tokenId;
  if (!tokenId) {
    res.status(400).json({ error: 'API-токен не указан' });
    return;
  }
  const before = await prisma.apiToken.findUnique({ where: { id: tokenId } });
  if (!before) {
    res.status(404).json({ error: 'API-токен не найден' });
    return;
  }
  const updated = await prisma.apiToken.update({
    where: { id: tokenId },
    data: {
      name: parsed.data.name,
      scopes: parsed.data.scopes,
      rateLimitPerMinute: parsed.data.rateLimitPerMinute,
      expiresAt:
        parsed.data.expiresAt === undefined
          ? undefined
          : parsed.data.expiresAt
            ? new Date(parsed.data.expiresAt)
            : null,
      isActive: parsed.data.isActive,
    },
  });
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'admin.api_token.update',
    objectType: 'ApiToken',
    objectId: updated.id,
    beforeValue: apiTokenResponse(before),
    afterValue: apiTokenResponse(updated),
  });
  res.json(apiTokenResponse(updated));
});

router.delete('/admin/api-tokens/:tokenId', requireAdmin, async (req, res) => {
  const tokenId = Array.isArray(req.params.tokenId) ? req.params.tokenId[0] : req.params.tokenId;
  if (!tokenId) {
    res.status(400).json({ error: 'API-токен не указан' });
    return;
  }
  const before = await prisma.apiToken.findUnique({ where: { id: tokenId } });
  if (!before) {
    res.status(404).json({ error: 'API-токен не найден' });
    return;
  }
  const updated = await prisma.apiToken.update({
    where: { id: tokenId },
    data: { isActive: false },
  });
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'admin.api_token.disable',
    objectType: 'ApiToken',
    objectId: updated.id,
    beforeValue: apiTokenResponse(before),
    afterValue: apiTokenResponse(updated),
  });
  res.json(apiTokenResponse(updated));
});

router.post('/admin/webhooks', requireAdmin, async (req, res) => {
  const parsed = webhookEndpointSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      name: parsed.data.name,
      url: parsed.data.url,
      secret: parsed.data.secret || null,
      events: parsed.data.events,
      isActive: parsed.data.isActive,
      createdById: currentUser(req)?.id ?? null,
    },
  });
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'admin.webhook.create',
    objectType: 'WebhookEndpoint',
    objectId: endpoint.id,
    afterValue: webhookEndpointResponse(endpoint),
  });
  res.status(201).json(webhookEndpointResponse(endpoint));
});

router.patch('/admin/webhooks/:endpointId', requireAdmin, async (req, res) => {
  const parsed = webhookEndpointPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const endpointId = Array.isArray(req.params.endpointId)
    ? req.params.endpointId[0]
    : req.params.endpointId;
  if (!endpointId) {
    res.status(400).json({ error: 'Webhook не указан' });
    return;
  }
  const before = await prisma.webhookEndpoint.findUnique({ where: { id: endpointId } });
  if (!before) {
    res.status(404).json({ error: 'Webhook не найден' });
    return;
  }
  const endpoint = await prisma.webhookEndpoint.update({
    where: { id: endpointId },
    data: {
      name: parsed.data.name,
      url: parsed.data.url,
      secret:
        parsed.data.secret === undefined
          ? undefined
          : parsed.data.secret || null,
      events: parsed.data.events,
      isActive: parsed.data.isActive,
    },
  });
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'admin.webhook.update',
    objectType: 'WebhookEndpoint',
    objectId: endpoint.id,
    beforeValue: webhookEndpointResponse(before),
    afterValue: webhookEndpointResponse(endpoint),
  });
  res.json(webhookEndpointResponse(endpoint));
});

router.delete('/admin/webhooks/:endpointId', requireAdmin, async (req, res) => {
  const endpointId = Array.isArray(req.params.endpointId)
    ? req.params.endpointId[0]
    : req.params.endpointId;
  if (!endpointId) {
    res.status(400).json({ error: 'Webhook не указан' });
    return;
  }
  const before = await prisma.webhookEndpoint.findUnique({ where: { id: endpointId } });
  if (!before) {
    res.status(404).json({ error: 'Webhook не найден' });
    return;
  }
  const endpoint = await prisma.webhookEndpoint.update({
    where: { id: endpointId },
    data: { isActive: false },
  });
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'admin.webhook.disable',
    objectType: 'WebhookEndpoint',
    objectId: endpoint.id,
    beforeValue: webhookEndpointResponse(before),
    afterValue: webhookEndpointResponse(endpoint),
  });
  res.json(webhookEndpointResponse(endpoint));
});

router.post('/admin/webhooks/:endpointId/test', requireAdmin, async (req, res) => {
  const endpointId = Array.isArray(req.params.endpointId)
    ? req.params.endpointId[0]
    : req.params.endpointId;
  if (!endpointId) {
    res.status(400).json({ error: 'Webhook не указан' });
    return;
  }
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: endpointId } });
  if (!endpoint) {
    res.status(404).json({ error: 'Webhook не найден' });
    return;
  }
  await emitWebhookEvent({
    eventType: 'system.webhook.test',
    payload: {
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      triggeredBy: currentUser(req)?.email ?? 'api-token',
    },
  });
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'admin.webhook.test',
    objectType: 'WebhookEndpoint',
    objectId: endpoint.id,
  });
  res.json({ ok: true });
});

router.get('/admin/config/export', requireAdmin, async (_req, res) => {
  await ensureAdminConfigDefaults();
  const [rolePermissions, dictionaryItems, systemSettings] = await Promise.all([
    prisma.rolePermission.findMany({
      orderBy: [{ role: 'asc' }, { permission: 'asc' }],
    }),
    prisma.dictionaryItem.findMany({
      orderBy: [{ dictionary: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    }),
    prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    }),
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
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'admin.config.import',
    objectType: 'SystemSetting',
    metadata: {
      rolePermissions: rolePermissions.length,
      dictionaryItems: dictionaryItems.length,
      systemSettings: systemSettings.length,
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

router.get('/users', requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      passwordHash: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json(users.map(userResponse));
});

router.post('/users', requireAdmin, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        role: parsed.data.role,
        isActive: parsed.data.isActive,
        passwordHash: hashPassword(parsed.data.password),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        passwordHash: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'user.create',
      objectType: 'User',
      objectId: user.id,
      afterValue: userResponse(user),
    });
    res.status(201).json(userResponse(user));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Пользователь с таким email уже существует' });
      return;
    }
    throw error;
  }
});

router.patch('/users/:userId', requireAdmin, async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  if (!userId) {
    res.status(400).json({ error: 'Пользователь не указан' });
    return;
  }

  if (await wouldRemoveLastAdmin(userId, parsed.data)) {
    res.status(400).json({ error: 'Нельзя отключить или понизить последнего администратора' });
    return;
  }

  try {
    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const user = await prisma.user.update({
      where: { id: userId },
      data: parsed.data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        passwordHash: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'user.update',
      objectType: 'User',
      objectId: user.id,
      beforeValue: before,
      afterValue: userResponse(user),
    });
    res.json(userResponse(user));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Пользователь с таким email уже существует' });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }
    throw error;
  }
});

router.post('/users/:userId/password', requireAdmin, async (req, res) => {
  const parsed = changeUserPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  if (!userId) {
    res.status(400).json({ error: 'Пользователь не указан' });
    return;
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashPassword(parsed.data.password) },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        passwordHash: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await prisma.userSession.deleteMany({ where: { userId: user.id } });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'user.password_change',
      objectType: 'User',
      objectId: user.id,
      metadata: { sessionsRevoked: true },
    });
    res.json(userResponse(user));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }
    throw error;
  }
});

  return router;
}
