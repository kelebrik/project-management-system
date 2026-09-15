import type { Router } from 'express';
import { prisma } from '../../db.js';
import { recordAuditEvent } from '../../services/audit.js';
import { projectModulesSchema } from './schemas.js';
import type { AdminRoutesContext } from './types.js';

export const projectModulesSettingKey = 'project.modules';

export type ProjectModuleConfig = {
  key: string;
  label: string;
  description: string;
  route: string;
  enabled: boolean;
};

export const projectModuleDefaults: ProjectModuleConfig[] = [
  {
    key: 'overview',
    label: 'Обзор и вехи',
    description: 'Executive Overview, ключевые риски, решения и вехи проекта',
    route: 'overview',
    enabled: true,
  },
  {
    key: 'passport',
    label: 'Паспорт проекта',
    description: 'Редактируемые атрибуты паспорта проекта',
    route: 'passport',
    enabled: true,
  },
  {
    key: 'businessRequirements',
    label: 'Бизнес требования',
    description: 'Редактируемая таблица бизнес-требований проекта',
    route: 'business-requirements',
    enabled: true,
  },
  {
    key: 'structure',
    label: 'Структура',
    description: 'Иерархия работ проекта, сроки, исполнители и предшественники',
    route: 'wbs',
    enabled: true,
  },
  {
    key: 'gantt',
    label: 'Гантт',
    description: 'Временная шкала, связи, базовый план и критический путь',
    route: 'gantt',
    enabled: true,
  },
  {
    key: 'jiraWork',
    label: 'Работы в Jira',
    description: 'Jira-фильтры проекта и синхронизированные тикеты Jira',
    route: 'jira-work',
    enabled: true,
  },
  {
    key: 'issues',
    label: 'Открытые вопросы',
    description: 'Открытые и закрытые вопросы проекта с Jira-связями',
    route: 'issues',
    enabled: true,
  },
  {
    key: 'raid',
    label: 'Риски и проблемы',
    description: 'Риски, проблемы и допущения проекта',
    route: 'risks',
    enabled: true,
  },
  {
    key: 'changes',
    label: 'Управление изменениями',
    description: 'Запросы на изменение scope, сроков и управленческих решений',
    route: 'changes',
    enabled: false,
  },
  {
    key: 'resources',
    label: 'Управление ресурсами',
    description: 'Загрузка команды, исполнители и распределение работ',
    route: 'resources',
    enabled: true,
  },
  {
    key: 'budget',
    label: 'Управление бюджетом',
    description: 'Контур план-факт-прогноз бюджета проекта',
    route: 'budget',
    enabled: false,
  },
  {
    key: 'calendars',
    label: 'Календари',
    description: 'RU и CN производственные календари проекта',
    route: 'calendars',
    enabled: true,
  },
  {
    key: 'artifacts',
    label: 'Артефакты проекта',
    description: 'Управленческие артефакты и ссылки на документы',
    route: 'artifacts',
    enabled: true,
  },
];

export function normalizeProjectModules(input?: unknown): ProjectModuleConfig[] {
  const enabledByKey = new Map<string, boolean>();
  const inputModules =
    Array.isArray(input)
      ? input
      : input && typeof input === 'object' && Array.isArray((input as { modules?: unknown }).modules)
        ? (input as { modules: unknown[] }).modules
        : [];

  for (const module of inputModules) {
    if (
      module &&
      typeof module === 'object' &&
      typeof (module as { key?: unknown }).key === 'string' &&
      typeof (module as { enabled?: unknown }).enabled === 'boolean'
    ) {
      enabledByKey.set(
        (module as { key: string }).key,
        (module as { enabled: boolean }).enabled,
      );
    }
  }

  return projectModuleDefaults.map((module) => ({
    ...module,
    enabled: enabledByKey.get(module.key) ?? module.enabled,
  }));
}

export function parseProjectModulesSetting(value?: string | null) {
  if (!value) return normalizeProjectModules();
  try {
    return normalizeProjectModules(JSON.parse(value));
  } catch {
    return normalizeProjectModules();
  }
}

export function projectModulesSettingValue(modules: ProjectModuleConfig[]) {
  return JSON.stringify({
    modules: modules.map(({ key, enabled }) => ({ key, enabled })),
  });
}

export async function projectModulesConfig() {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: projectModulesSettingKey },
  });
  return parseProjectModulesSetting(setting?.value);
}

export async function saveProjectModulesConfig(input: unknown) {
  const modules = normalizeProjectModules(input);
  await prisma.systemSetting.upsert({
    where: { key: projectModulesSettingKey },
    update: {
      value: projectModulesSettingValue(modules),
      isSecret: false,
    },
    create: {
      key: projectModulesSettingKey,
      value: projectModulesSettingValue(modules),
      isSecret: false,
    },
  });
  return modules;
}

export function registerProjectModuleRoutes(router: Router, context: AdminRoutesContext) {
  const { requireAdmin, currentUser } = context;

  router.get('/project-modules', async (_req, res) => {
    const { ensureAdminConfigDefaults } = await import('./system.js');
    await ensureAdminConfigDefaults();
    res.json(await projectModulesConfig());
  });

  router.put('/admin/project-modules', requireAdmin, async (req, res) => {
    const parsed = projectModulesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const before = await projectModulesConfig();
    const updated = await saveProjectModulesConfig(parsed.data.modules);
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'admin.project_modules.update',
      objectType: 'SystemSetting',
      objectId: projectModulesSettingKey,
      beforeValue: before,
      afterValue: updated,
      metadata: {
        enabled: updated.filter((module) => module.enabled).map((module) => module.key),
        disabled: updated.filter((module) => !module.enabled).map((module) => module.key),
      },
    });
    res.json(updated);
  });
}
