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
  jiraBackgroundSync: "off" | "current" | "nightly";
  gitlabToken: string;
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
  "admin.config",
  "admin.integrations",
];

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
    "admin.config": "Import/export конфигурации",
    "admin.integrations": "Интеграции и API",
  };
  return labelsByPermission[permission] ?? permission;
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

export function systemSettingsToDraft(settings: SystemSetting[]): SystemSettingsDraft {
  const byKey = new Map(settings.map((setting) => [setting.key, setting]));
  return {
    gitlabEnabled: byKey.get("gitlab.enabled")?.value === "true",
    gitlabBaseUrl: byKey.get("gitlab.baseUrl")?.value ?? "",
    jiraBackgroundSync: jiraBackgroundSyncMode(byKey.get("jira.backgroundSync")?.value),
    gitlabToken: "",
  };
}

export function systemSettingHasValue(settings: SystemSetting[], key: string) {
  return Boolean(settings.find((setting) => setting.key === key)?.hasValue);
}

/** The stored mode of background Jira syncs; anything unknown is the default, current. */
export function jiraBackgroundSyncMode(value: string | undefined): "off" | "current" | "nightly" {
  return value === "off" || value === "nightly" ? value : "current";
}
