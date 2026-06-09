import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import { apiClient } from "../api/client";
import {
  dictionaryItemsToDrafts,
  systemSettingsToDraft,
  usersToDrafts,
} from "../app/adminHelpers";
import type {
  AdminConfig,
  AdminHealth,
  AdminIntegrations,
  AuditEvent,
  BackupStatus,
  CurrentUser,
  DictionaryItem,
  DictionaryItemDraft,
  RolePermission,
  SystemSetting,
  SystemSettingsDraft,
  SystemUser,
  UserDraftState,
} from "../app/adminTypes";
import {
  defaultProjectModules,
  normalizeProjectModulesForUi,
  projectModulesToDraft,
  type ProjectModule,
  type ProjectModuleKey,
} from "../app/projectModules";
import { isAdminSectionViewName, type AppView } from "../app/routes";

type UseAdminDataControllerOptions = {
  activeView: AppView;
  authReady: boolean;
  currentUser: CurrentUser | null;
  setUsers: Dispatch<SetStateAction<SystemUser[]>>;
  setUserDrafts: Dispatch<SetStateAction<Record<string, UserDraftState>>>;
  setAuditEvents: Dispatch<SetStateAction<AuditEvent[]>>;
  setRolePermissions: Dispatch<SetStateAction<RolePermission[]>>;
  setDictionaryItems: Dispatch<SetStateAction<DictionaryItem[]>>;
  setDictionaryDrafts: Dispatch<SetStateAction<Record<string, DictionaryItemDraft>>>;
  setSystemSettings: Dispatch<SetStateAction<SystemSetting[]>>;
  setSystemSettingsDraft: Dispatch<SetStateAction<SystemSettingsDraft>>;
  setProjectModules: Dispatch<SetStateAction<ProjectModule[]>>;
  setProjectModuleDrafts: Dispatch<SetStateAction<Record<ProjectModuleKey, boolean>>>;
  setAdminHealth: Dispatch<SetStateAction<AdminHealth | null>>;
  setBackupStatus: Dispatch<SetStateAction<BackupStatus | null>>;
  setAdminIntegrations: Dispatch<SetStateAction<AdminIntegrations | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

export function useAdminDataController({
  activeView,
  authReady,
  currentUser,
  setUsers,
  setUserDrafts,
  setAuditEvents,
  setRolePermissions,
  setDictionaryItems,
  setDictionaryDrafts,
  setSystemSettings,
  setSystemSettingsDraft,
  setProjectModules,
  setProjectModuleDrafts,
  setAdminHealth,
  setBackupStatus,
  setAdminIntegrations,
  setError,
}: UseAdminDataControllerOptions) {
  const isAdmin = currentUser?.role === "ADMIN";

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    apiClient
      .get<ProjectModule[]>("/api/project-modules", "Не удалось загрузить настройки модулей")
      .then((modules) => {
        if (cancelled) return;
        const normalized = normalizeProjectModulesForUi(modules);
        setProjectModules(normalized);
        setProjectModuleDrafts(projectModulesToDraft(normalized));
      })
      .catch(() => {
        if (!cancelled) {
          setProjectModules(defaultProjectModules);
          setProjectModuleDrafts(projectModulesToDraft(defaultProjectModules));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, setProjectModuleDrafts, setProjectModules]);

  useEffect(() => {
    if (!authReady || !isAdminSectionViewName(activeView) || !isAdmin) return;
    let cancelled = false;
    Promise.all([
      apiClient.get<SystemUser[]>("/api/users", "Не удалось загрузить пользователей"),
      apiClient.get<AuditEvent[]>(
        "/api/audit-events?limit=100",
        "Не удалось загрузить журнал аудита",
      ),
      apiClient.get<AdminConfig>(
        "/api/admin/config",
        "Не удалось загрузить настройки администрирования",
      ),
      apiClient.get<AdminIntegrations>(
        "/api/admin/integrations",
        "Не удалось загрузить интеграции",
      ),
    ])
      .then(([data, events, config, integrations]) => {
        if (cancelled) return;
        setUsers(data);
        setUserDrafts(usersToDrafts(data));
        setAuditEvents(events);
        setRolePermissions(config.rolePermissions);
        setDictionaryItems(config.dictionaryItems);
        setDictionaryDrafts(dictionaryItemsToDrafts(config.dictionaryItems));
        setSystemSettings(config.systemSettings);
        setSystemSettingsDraft(systemSettingsToDraft(config.systemSettings));
        const normalizedModules = normalizeProjectModulesForUi(config.projectModules);
        setProjectModules(normalizedModules);
        setProjectModuleDrafts(projectModulesToDraft(normalizedModules));
        setAdminHealth(config.health);
        setBackupStatus(config.backupStatus);
        setAdminIntegrations(integrations);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не удалось загрузить пользователей",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeView,
    authReady,
    isAdmin,
    setAdminHealth,
    setAdminIntegrations,
    setAuditEvents,
    setBackupStatus,
    setDictionaryDrafts,
    setDictionaryItems,
    setError,
    setProjectModuleDrafts,
    setProjectModules,
    setRolePermissions,
    setSystemSettings,
    setSystemSettingsDraft,
    setUserDrafts,
    setUsers,
  ]);

  const reloadUsers = useCallback(async () => {
    if (!isAdmin) return;
    const data = await apiClient.get<SystemUser[]>(
      "/api/users",
      "Не удалось загрузить пользователей",
    );
    setUsers(data);
    setUserDrafts(usersToDrafts(data));
  }, [isAdmin, setUserDrafts, setUsers]);

  const reloadAuditEvents = useCallback(async () => {
    if (!isAdmin) return;
    const data = await apiClient.get<AuditEvent[]>(
      "/api/audit-events?limit=100",
      "Не удалось загрузить журнал аудита",
    );
    setAuditEvents(data);
  }, [isAdmin, setAuditEvents]);

  const reloadAdminConfig = useCallback(async () => {
    if (!isAdmin) return;
    const config = await apiClient.get<AdminConfig>(
      "/api/admin/config",
      "Не удалось загрузить настройки администрирования",
    );
    setRolePermissions(config.rolePermissions);
    setDictionaryItems(config.dictionaryItems);
    setDictionaryDrafts(dictionaryItemsToDrafts(config.dictionaryItems));
    setSystemSettings(config.systemSettings);
    setSystemSettingsDraft(systemSettingsToDraft(config.systemSettings));
    const normalizedModules = normalizeProjectModulesForUi(config.projectModules);
    setProjectModules(normalizedModules);
    setProjectModuleDrafts(projectModulesToDraft(normalizedModules));
    setAdminHealth(config.health);
    setBackupStatus(config.backupStatus);
  }, [
    isAdmin,
    setAdminHealth,
    setBackupStatus,
    setDictionaryDrafts,
    setDictionaryItems,
    setProjectModuleDrafts,
    setProjectModules,
    setRolePermissions,
    setSystemSettings,
    setSystemSettingsDraft,
  ]);

  const reloadAdminIntegrations = useCallback(async () => {
    if (!isAdmin) return;
    const integrations = await apiClient.get<AdminIntegrations>(
      "/api/admin/integrations",
      "Не удалось загрузить интеграции",
    );
    setAdminIntegrations(integrations);
  }, [isAdmin, setAdminIntegrations]);

  const reloadAdminHealth = useCallback(async () => {
    if (!isAdmin) return;
    const [health, backup] = await Promise.all([
      apiClient.get<AdminHealth>(
        "/api/admin/system-health",
        "Не удалось загрузить состояние системы",
      ),
      apiClient.get<BackupStatus>(
        "/api/admin/backup-status",
        "Не удалось загрузить состояние backup",
      ),
    ]);
    setAdminHealth(health);
    setBackupStatus(backup);
  }, [isAdmin, setAdminHealth, setBackupStatus]);

  return {
    reloadUsers,
    reloadAuditEvents,
    reloadAdminConfig,
    reloadAdminIntegrations,
    reloadAdminHealth,
  };
}
