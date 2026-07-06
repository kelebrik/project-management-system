import type { ProjectSectionView } from "./routes";

export type ProjectModuleKey =
  | "overview"
  | "passport"
  | "businessRequirements"
  | "structure"
  | "gantt"
  | "jiraWork"
  | "issues"
  | "raid"
  | "changes"
  | "budget"
  | "calendars"
  | "artifacts";

export type ProjectModule = {
  key: ProjectModuleKey;
  label: string;
  description: string;
  route: string;
  enabled: boolean;
};

export const defaultProjectModules: ProjectModule[] = [
  {
    key: "overview",
    label: "Состояние проекта",
    description: "Состояние проекта, ключевые риски, решения и график вех",
    route: "overview",
    enabled: true,
  },
  {
    key: "passport",
    label: "Паспорт проекта",
    description: "Редактируемые атрибуты паспорта проекта",
    route: "passport",
    enabled: true,
  },
  {
    key: "businessRequirements",
    label: "Бизнес требования",
    description: "Редактируемая таблица бизнес-требований проекта",
    route: "business-requirements",
    enabled: true,
  },
  {
    key: "structure",
    label: "Структура",
    description: "Иерархия работ проекта, сроки, исполнители и предшественники",
    route: "wbs",
    enabled: true,
  },
  {
    key: "gantt",
    label: "Гантт",
    description: "Временная шкала, связи, базовый план и критический путь",
    route: "gantt",
    enabled: true,
  },
  {
    key: "jiraWork",
    label: "Работы в Jira",
    description: "Jira-фильтры проекта и синхронизированные тикеты Jira",
    route: "jira-work",
    enabled: true,
  },
  {
    key: "issues",
    label: "Открытые вопросы",
    description: "Открытые и закрытые вопросы проекта с Jira-связями",
    route: "issues",
    enabled: true,
  },
  {
    key: "raid",
    label: "Риски и проблемы",
    description: "Риски, проблемы и допущения проекта",
    route: "risks",
    enabled: true,
  },
  {
    key: "changes",
    label: "Управление изменениями",
    description: "Запросы на изменение scope, сроков и управленческих решений",
    route: "changes",
    enabled: true,
  },
  {
    key: "budget",
    label: "Управление бюджетом",
    description: "Контур план-факт-прогноз бюджета проекта",
    route: "budget",
    enabled: true,
  },
  {
    key: "calendars",
    label: "Календари",
    description: "RU и CN производственные календари проекта",
    route: "calendars",
    enabled: true,
  },
  {
    key: "artifacts",
    label: "Артефакты проекта",
    description: "Управленческие артефакты и ссылки на документы",
    route: "artifacts",
    enabled: true,
  },
];

export const projectModuleKeyByView: Record<
  ProjectSectionView,
  ProjectModuleKey
> = {
  "project-overview": "overview",
  "project-schedule": "overview",
  "project-passport": "passport",
  "project-business-requirements": "businessRequirements",
  "project-structure": "structure",
  "project-gantt": "gantt",
  "project-jira-work": "jiraWork",
  "project-issues": "issues",
  "project-raid": "raid",
  "project-changes": "changes",
  "project-budget": "budget",
  "project-calendars": "calendars",
  "project-artifacts": "artifacts",
};

export const projectModuleViewByKey: Record<
  ProjectModuleKey,
  ProjectSectionView
> = {
  overview: "project-overview",
  passport: "project-passport",
  businessRequirements: "project-business-requirements",
  structure: "project-structure",
  gantt: "project-gantt",
  jiraWork: "project-jira-work",
  issues: "project-issues",
  raid: "project-raid",
  changes: "project-changes",
  budget: "project-budget",
  calendars: "project-calendars",
  artifacts: "project-artifacts",
};

export function normalizeProjectModulesForUi(
  modules: ProjectModule[] = defaultProjectModules,
) {
  const byKey = new Map(modules.map((module) => [module.key, module]));
  return defaultProjectModules.map((module) => {
    const current = byKey.get(module.key);
    return {
      ...module,
      ...current,
      key: module.key,
      label: current?.label || module.label,
      description: current?.description || module.description,
      route: current?.route || module.route,
      enabled: current?.enabled ?? module.enabled,
    };
  });
}

export function projectModulesToDraft(modules: ProjectModule[]) {
  return normalizeProjectModulesForUi(modules).reduce(
    (draft, module) => {
      draft[module.key] = module.enabled;
      return draft;
    },
    {} as Record<ProjectModuleKey, boolean>,
  );
}
