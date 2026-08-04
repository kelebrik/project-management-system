import { labels } from "@pms/shared";

type UserRole =
  | "ADMIN"
  | "PROJECT_MANAGER"
  | "TEAM_MEMBER"
  | "EXECUTIVE_VIEWER";

type SystemUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type UserDraftState = {
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
};

type DictionaryItem = {
  id: string;
  dictionary: string;
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type DictionaryItemDraft = {
  dictionary: string;
  code: string;
  label: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
};

type SystemSetting = {
  key: string;
  value: string;
  isSecret: boolean;
  hasValue: boolean;
  createdAt: string;
  updatedAt: string;
};

type SystemSettingsDraft = {
  gitlabEnabled: boolean;
  gitlabBaseUrl: string;
  gitlabToken: string;
  githubEnabled: boolean;
  githubBaseUrl: string;
  githubToken: string;
  azureDevOpsEnabled: boolean;
  azureDevOpsOrganizationUrl: string;
  azureDevOpsToken: string;
  biEnabled: boolean;
  biExportUrl: string;
  ragGreenFormula: string;
  ragAmberFormula: string;
  ragRedFormula: string;
  overviewWorkflow: string;
  baselineWorkflow: string;
  projectCloseWorkflow: string;
  wbsTemplates: string;
};

export const adminPermissionOrder = [
  "project.read",
  "project.create",
  "project.update",
  "project.close",
  "project.delete",
  "wbs.read",
  "wbs.create",
  "wbs.update",
  "wbs.delete",
  "wbs.move",
  "wbs.baseline",
  "wbs.dependency",
  "issue.read",
  "issue.create",
  "issue.update",
  "issue.close",
  "issue.delete",
  "raid.read",
  "raid.create",
  "raid.update",
  "raid.close",
  "raid.delete",
  "overview.generate",
  "overview.publish",
  "overview.export",
  "admin.users",
  "admin.roles",
  "admin.dictionaries",
  "admin.templates",
  "admin.rag",
  "admin.workflow",
  "admin.health",
  "admin.backup",
  "admin.config",
  "admin.project_access",
  "admin.audit",
  "admin.integrations",
];

export const adminDictionaryLabels: Record<string, string> = {
  project_status: "Статусы проектов",
  project_type: "Типы проектов",
  risk_type: "Типы рисков",
  wbs_type: "Типы Структуры",
  wbs_status: "Статусы Структуры",
  issue_severity: "Критичность открытых вопросов",
  raid_type: "Типы рисков и проблем",
  raid_status: "Статусы рисков и проблем",
};

export function userRoleLabel(role: UserRole) {
  return labels.userRole[role] ?? role;
}

export function adminPermissionLabel(permission: string) {
  const labelsByPermission: Record<string, string> = {
    "project.read": "Просмотр проектов",
    "project.create": "Создание проектов",
    "project.update": "Редактирование паспорта проекта",
    "project.close": "Закрытие проектов",
    "project.delete": "Удаление проектов",
    "wbs.read": "Просмотр Структуры",
    "wbs.create": "Создание строк Структуры",
    "wbs.update": "Редактирование Структуры",
    "wbs.delete": "Удаление строк Структуры",
    "wbs.move": "Перемещение строк Структуры",
    "wbs.baseline": "Фиксация базового плана",
    "wbs.dependency": "Связи Структуры и Гантта",
    "issue.read": "Просмотр открытых вопросов",
    "issue.create": "Создание открытых вопросов",
    "issue.update": "Редактирование открытых вопросов",
    "issue.close": "Закрытие открытых вопросов",
    "issue.delete": "Удаление открытых вопросов",
    "raid.read": "Просмотр рисков и проблем",
    "raid.create": "Создание рисков и проблем",
    "raid.update": "Редактирование рисков и проблем",
    "raid.close": "Закрытие рисков и проблем",
    "raid.delete": "Удаление рисков и проблем",
    "overview.generate": "Генерация обзора",
    "overview.publish": "Публикация обзора",
    "overview.export": "Экспорт обзора",
    "admin.users": "Пользователи",
    "admin.roles": "Роли и права",
    "admin.dictionaries": "Справочники",
    "admin.templates": "Шаблоны Структуры",
    "admin.rag": "Формулы RAG",
    "admin.workflow": "Workflow согласований",
    "admin.health": "System health",
    "admin.backup": "Backup/restore status",
    "admin.config": "Import/export конфигурации",
    "admin.project_access": "Доступ к проектам",
    "admin.audit": "Журнал аудита",
    "admin.integrations": "Интеграции и API",
  };
  return labelsByPermission[permission] ?? permission;
}

export function dictionaryLabel(dictionary: string) {
  return adminDictionaryLabels[dictionary] ?? dictionary;
}

export function userToDraft(user: SystemUser): UserDraftState {
  return {
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
  };
}

export function usersToDrafts(users: SystemUser[]) {
  return Object.fromEntries(users.map((user) => [user.id, userToDraft(user)]));
}

export function dictionaryItemToDraft(item: DictionaryItem): DictionaryItemDraft {
  return {
    dictionary: item.dictionary,
    code: item.code,
    label: item.label,
    description: item.description ?? "",
    sortOrder: String(item.sortOrder),
    isActive: item.isActive,
  };
}

export function dictionaryItemsToDrafts(items: DictionaryItem[]) {
  return Object.fromEntries(
    items.map((item) => [item.id, dictionaryItemToDraft(item)]),
  );
}

export function systemSettingsToDraft(settings: SystemSetting[]): SystemSettingsDraft {
  const byKey = new Map(settings.map((setting) => [setting.key, setting]));
  return {
    gitlabEnabled: byKey.get("gitlab.enabled")?.value === "true",
    gitlabBaseUrl: byKey.get("gitlab.baseUrl")?.value ?? "",
    gitlabToken: "",
    githubEnabled: byKey.get("github.enabled")?.value === "true",
    githubBaseUrl: byKey.get("github.baseUrl")?.value ?? "https://api.github.com",
    githubToken: "",
    azureDevOpsEnabled: byKey.get("azureDevOps.enabled")?.value === "true",
    azureDevOpsOrganizationUrl:
      byKey.get("azureDevOps.organizationUrl")?.value ?? "",
    azureDevOpsToken: "",
    biEnabled: byKey.get("bi.enabled")?.value === "true",
    biExportUrl: byKey.get("bi.exportUrl")?.value ?? "",
    ragGreenFormula: byKey.get("rag.formula.green")?.value ?? "",
    ragAmberFormula: byKey.get("rag.formula.amber")?.value ?? "",
    ragRedFormula: byKey.get("rag.formula.red")?.value ?? "",
    overviewWorkflow: byKey.get("workflow.overview")?.value ?? "",
    baselineWorkflow: byKey.get("workflow.baseline")?.value ?? "",
    projectCloseWorkflow: byKey.get("workflow.projectClose")?.value ?? "",
    wbsTemplates: byKey.get("wbs.templates")?.value ?? "",
  };
}

export function systemSettingHasValue(settings: SystemSetting[], key: string) {
  return Boolean(settings.find((setting) => setting.key === key)?.hasValue);
}
