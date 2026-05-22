CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permission" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DictionaryItem" (
    "id" TEXT NOT NULL,
    "dictionary" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DictionaryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "RolePermission_role_permission_key" ON "RolePermission"("role", "permission");
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");
CREATE INDEX "RolePermission_permission_idx" ON "RolePermission"("permission");
CREATE UNIQUE INDEX "DictionaryItem_dictionary_code_key" ON "DictionaryItem"("dictionary", "code");
CREATE INDEX "DictionaryItem_dictionary_isActive_sortOrder_idx" ON "DictionaryItem"("dictionary", "isActive", "sortOrder");

INSERT INTO "RolePermission" ("id", "role", "permission", "enabled", "updatedAt")
VALUES
  ('perm_admin_project_read', 'ADMIN', 'project.read', true, CURRENT_TIMESTAMP),
  ('perm_admin_project_write', 'ADMIN', 'project.write', true, CURRENT_TIMESTAMP),
  ('perm_admin_wbs_write', 'ADMIN', 'wbs.write', true, CURRENT_TIMESTAMP),
  ('perm_admin_issue_write', 'ADMIN', 'issue.write', true, CURRENT_TIMESTAMP),
  ('perm_admin_raid_write', 'ADMIN', 'raid.write', true, CURRENT_TIMESTAMP),
  ('perm_admin_overview_publish', 'ADMIN', 'overview.publish', true, CURRENT_TIMESTAMP),
  ('perm_admin_admin_manage', 'ADMIN', 'admin.manage', true, CURRENT_TIMESTAMP),
  ('perm_pm_project_read', 'PROJECT_MANAGER', 'project.read', true, CURRENT_TIMESTAMP),
  ('perm_pm_project_write', 'PROJECT_MANAGER', 'project.write', true, CURRENT_TIMESTAMP),
  ('perm_pm_wbs_write', 'PROJECT_MANAGER', 'wbs.write', true, CURRENT_TIMESTAMP),
  ('perm_pm_issue_write', 'PROJECT_MANAGER', 'issue.write', true, CURRENT_TIMESTAMP),
  ('perm_pm_raid_write', 'PROJECT_MANAGER', 'raid.write', true, CURRENT_TIMESTAMP),
  ('perm_pm_overview_publish', 'PROJECT_MANAGER', 'overview.publish', true, CURRENT_TIMESTAMP),
  ('perm_pm_admin_manage', 'PROJECT_MANAGER', 'admin.manage', false, CURRENT_TIMESTAMP),
  ('perm_team_project_read', 'TEAM_MEMBER', 'project.read', true, CURRENT_TIMESTAMP),
  ('perm_team_project_write', 'TEAM_MEMBER', 'project.write', false, CURRENT_TIMESTAMP),
  ('perm_team_wbs_write', 'TEAM_MEMBER', 'wbs.write', false, CURRENT_TIMESTAMP),
  ('perm_team_issue_write', 'TEAM_MEMBER', 'issue.write', true, CURRENT_TIMESTAMP),
  ('perm_team_raid_write', 'TEAM_MEMBER', 'raid.write', true, CURRENT_TIMESTAMP),
  ('perm_team_overview_publish', 'TEAM_MEMBER', 'overview.publish', false, CURRENT_TIMESTAMP),
  ('perm_team_admin_manage', 'TEAM_MEMBER', 'admin.manage', false, CURRENT_TIMESTAMP),
  ('perm_exec_project_read', 'EXECUTIVE_VIEWER', 'project.read', true, CURRENT_TIMESTAMP),
  ('perm_exec_project_write', 'EXECUTIVE_VIEWER', 'project.write', false, CURRENT_TIMESTAMP),
  ('perm_exec_wbs_write', 'EXECUTIVE_VIEWER', 'wbs.write', false, CURRENT_TIMESTAMP),
  ('perm_exec_issue_write', 'EXECUTIVE_VIEWER', 'issue.write', false, CURRENT_TIMESTAMP),
  ('perm_exec_raid_write', 'EXECUTIVE_VIEWER', 'raid.write', false, CURRENT_TIMESTAMP),
  ('perm_exec_overview_publish', 'EXECUTIVE_VIEWER', 'overview.publish', false, CURRENT_TIMESTAMP),
  ('perm_exec_admin_manage', 'EXECUTIVE_VIEWER', 'admin.manage', false, CURRENT_TIMESTAMP);

INSERT INTO "DictionaryItem" ("id", "dictionary", "code", "label", "description", "sortOrder", "isActive", "updatedAt")
VALUES
  ('dict_wbs_type_phase', 'wbs_type', 'PHASE', 'Фаза', 'Верхний уровень структуры проекта', 10, true, CURRENT_TIMESTAMP),
  ('dict_wbs_type_work_package', 'wbs_type', 'WORK_PACKAGE', 'Пакет работ', 'Группа связанных задач', 20, true, CURRENT_TIMESTAMP),
  ('dict_wbs_type_deliverable', 'wbs_type', 'DELIVERABLE', 'Результат', 'Контрольный результат работ', 30, true, CURRENT_TIMESTAMP),
  ('dict_wbs_type_milestone', 'wbs_type', 'MILESTONE', 'Веха', 'Нулевая по длительности контрольная точка', 40, true, CURRENT_TIMESTAMP),
  ('dict_wbs_type_task', 'wbs_type', 'TASK', 'Задача', 'Работа с длительностью и исполнителем', 50, true, CURRENT_TIMESTAMP),
  ('dict_wbs_status_not_started', 'wbs_status', 'NOT_STARTED', 'Не начата', 'Работы еще не стартовали', 10, true, CURRENT_TIMESTAMP),
  ('dict_wbs_status_in_progress', 'wbs_status', 'IN_PROGRESS', 'В работе', 'Работы выполняются', 20, true, CURRENT_TIMESTAMP),
  ('dict_wbs_status_at_risk', 'wbs_status', 'AT_RISK', 'Под риском', 'Есть риск нарушения срока', 30, true, CURRENT_TIMESTAMP),
  ('dict_wbs_status_blocked', 'wbs_status', 'BLOCKED', 'Провалено', 'Работа заблокирована или сорвана', 40, true, CURRENT_TIMESTAMP),
  ('dict_wbs_status_done', 'wbs_status', 'DONE', 'Сделано', 'Работа завершена', 50, true, CURRENT_TIMESTAMP),
  ('dict_wbs_status_cancelled', 'wbs_status', 'CANCELLED', 'Отменено', 'Работа исключена из плана', 60, true, CURRENT_TIMESTAMP),
  ('dict_issue_severity_low', 'issue_severity', 'LOW', 'Низкая', 'Низкая критичность', 10, true, CURRENT_TIMESTAMP),
  ('dict_issue_severity_medium', 'issue_severity', 'MEDIUM', 'Средняя', 'Средняя критичность', 20, true, CURRENT_TIMESTAMP),
  ('dict_issue_severity_high', 'issue_severity', 'HIGH', 'Высокая', 'Высокая критичность', 30, true, CURRENT_TIMESTAMP),
  ('dict_issue_severity_critical', 'issue_severity', 'CRITICAL', 'Критичная', 'Критичная проблема', 40, true, CURRENT_TIMESTAMP),
  ('dict_raid_type_risk', 'raid_type', 'RISK', 'Риск', 'Потенциальное событие с влиянием на проект', 10, true, CURRENT_TIMESTAMP),
  ('dict_raid_type_dependency', 'raid_type', 'DEPENDENCY', 'Проблема', 'Фактическая проблема или зависимость', 20, true, CURRENT_TIMESTAMP),
  ('dict_raid_type_assumption', 'raid_type', 'ASSUMPTION', 'Допущение', 'Управленческое допущение проекта', 30, true, CURRENT_TIMESTAMP),
  ('dict_raid_status_open', 'raid_status', 'OPEN', 'Открыто', 'Запись открыта', 10, true, CURRENT_TIMESTAMP),
  ('dict_raid_status_in_progress', 'raid_status', 'IN_PROGRESS', 'В работе', 'Идет обработка', 20, true, CURRENT_TIMESTAMP),
  ('dict_raid_status_mitigated', 'raid_status', 'MITIGATED', 'Смягчено', 'Меры снижения выполнены', 30, true, CURRENT_TIMESTAMP),
  ('dict_raid_status_validated', 'raid_status', 'VALIDATED', 'Подтверждено', 'Статус подтвержден', 40, true, CURRENT_TIMESTAMP),
  ('dict_raid_status_breached', 'raid_status', 'BREACHED', 'Нарушено', 'Ограничение или допущение нарушено', 50, true, CURRENT_TIMESTAMP),
  ('dict_raid_status_closed', 'raid_status', 'CLOSED', 'Закрыто', 'Запись закрыта', 60, true, CURRENT_TIMESTAMP);

INSERT INTO "SystemSetting" ("key", "value", "isSecret", "updatedAt")
VALUES
  ('jira.enabled', 'false', false, CURRENT_TIMESTAMP),
  ('jira.baseUrl', '', false, CURRENT_TIMESTAMP),
  ('jira.email', '', false, CURRENT_TIMESTAMP),
  ('jira.apiToken', '', true, CURRENT_TIMESTAMP),
  ('jira.maxResults', '100', false, CURRENT_TIMESTAMP);
