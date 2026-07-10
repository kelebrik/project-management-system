import {
  labels,
  type IssueSeverity,
  type ProjectStatus,
  type RagStatus,
  type RaidItemStatus,
  type RaidItemType,
  type WbsItemStatus,
  type WbsItemType,
} from "@pms/shared";

type ProjectOption = {
  code: string;
  name: string;
};

type AuditEventLike = {
  objectType: string;
  projectId: string | null;
};

type IssueJiraLinkLike = {
  jiraKey: string;
  jiraUrl: string;
};

type IssueLike = {
  jiraTicketKey: string | null;
  jiraTicketUrl: string | null;
  jiraLinks: IssueJiraLinkLike[];
};

export function projectOptionLabel(project: ProjectOption) {
  return `${project.code} - ${project.name}`;
}

export function auditActionLabel(action: string) {
  const labelsByAction: Record<string, string> = {
    "auth.bootstrap_admin": "Первичная настройка администратора",
    "auth.login": "Вход в систему",
    "auth.logout": "Выход из системы",
    "user.create": "Создание пользователя",
    "user.update": "Изменение пользователя",
    "user.password_change": "Смена пароля пользователя",
    "project.create": "Создание проекта",
    "project.update": "Изменение проекта",
    "project.close": "Закрытие проекта",
    "project.delete": "Удаление проекта",
    "project.target_date.update": "Изменение даты цели проекта",
    "project.ui_state.update": "Изменение вида проекта",
    "issue.create": "Создание открытого вопроса",
    "issue.update": "Изменение открытого вопроса",
    "issue.convert_to_problem": "Перевод вопроса в проблему",
    "issue.status_update.create": "Комментарий к открытому вопросу",
    "issue.jira_link.create": "Добавление Jira-связи",
    "issue.jira_link.update": "Изменение Jira-связи",
    "issue.jira_link.delete": "Удаление Jira-связи",
    "raid_item.create": "Создание RAID-записи",
    "raid_item.update": "Изменение RAID-записи",
    "raid_item.delete": "Удаление RAID-записи",
    "raid_item.status_update.create": "Комментарий к RAID-записи",
    "change_request.create": "Создание запроса на изменение",
    "change_request.update": "Изменение запроса на изменение",
    "change_request.delete": "Удаление запроса на изменение",
    "overview.generate": "Генерация обзора",
    "overview.status": "Статус обзора",
    "overview.publish": "Публикация обзора",
    "admin.role_permission.update": "Изменение прав роли",
    "admin.dictionary.upsert": "Создание элемента справочника",
    "admin.dictionary.update": "Изменение элемента справочника",
    "admin.dictionary.deactivate": "Отключение элемента справочника",
    "admin.system_settings.update": "Изменение системных настроек",
  };
  return labelsByAction[action] ?? action;
}

export function auditObjectLabel(event: AuditEventLike) {
  if (event.objectType === "Project" && event.projectId) return "Проект";
  if (event.objectType === "Issue") return "Открытый вопрос";
  if (event.objectType === "IssueStatusUpdate") return "Комментарий вопроса";
  if (event.objectType === "IssueJiraLink") return "Jira-связь";
  if (event.objectType === "RaidItem") return "RAID-запись";
  if (event.objectType === "RaidItemStatusUpdate") return "Комментарий RAID";
  if (event.objectType === "ChangeRequest") return "Запрос на изменение";
  if (event.objectType === "User") return "Пользователь";
  if (event.objectType === "RolePermission") return "Право роли";
  if (event.objectType === "DictionaryItem") return "Справочник";
  if (event.objectType === "SystemSetting") return "Системные настройки";
  return event.objectType;
}

export function projectStatusLabel(status: ProjectStatus) {
  return labels.projectStatus[status];
}

export function projectHealthLabel(rag: RagStatus) {
  return labels.rag[rag];
}

export function projectScheduleHealth(
  rag: RagStatus,
  scheduleVarianceDays: number,
) {
  if (scheduleVarianceDays > 10) {
    return {
      tone: "red" as const,
      label: `Отставание +${scheduleVarianceDays} дн.`,
    };
  }
  if (scheduleVarianceDays > 0) {
    return {
      tone: "amber" as const,
      label: `Отставание +${scheduleVarianceDays} дн.`,
    };
  }
  return {
    tone: rag.toLowerCase() as Lowercase<RagStatus>,
    label: projectHealthLabel(rag),
  };
}

export function ragOptionLabel(rag: RagStatus) {
  const ragLabels: Record<RagStatus, string> = {
    GREEN: "Зеленый",
    AMBER: "Желтый",
    RED: "Красный",
  };
  return ragLabels[rag];
}

export function wbsTypeLabel(type: WbsItemType) {
  return labels.wbsType[type];
}

export function wbsStatusLabel(status: WbsItemStatus) {
  return labels.wbsStatus[status];
}

export function issueSeverityLabel(severity: IssueSeverity) {
  return labels.issueSeverity[severity];
}

export function issueStatusLabel(status: string) {
  return (
    labels.openIssueStatus[status as keyof typeof labels.openIssueStatus] ??
    status
  );
}

export function issuePrimaryJiraLink(issue: IssueLike) {
  const linkedIssue = issue.jiraTicketKey
    ? issue.jiraLinks.find((link) => link.jiraKey === issue.jiraTicketKey) ??
      issue.jiraLinks[0]
    : issue.jiraLinks[0];
  const key = issue.jiraTicketKey || linkedIssue?.jiraKey || "";
  const url = issue.jiraTicketUrl || linkedIssue?.jiraUrl || "";
  return { key, url };
}

export function artifactStatusLabel(status: string) {
  const artifactStatusLabels: Record<string, string> = {
    Draft: "Черновик",
    "In Review": "На согласовании",
    Approved: "Одобрен",
    Baseline: "Базовый план",
    Archived: "Архив",
  };
  return artifactStatusLabels[status] ?? status;
}

export function raidTypeLabel(type: RaidItemType) {
  return labels.raidType[type];
}

export function raidStatusLabel(status: RaidItemStatus) {
  return labels.raidStatus[status];
}

export function riskTone(score: number): "red" | "amber" | "green" {
  if (score >= 15) return "red";
  if (score >= 8) return "amber";
  return "green";
}
