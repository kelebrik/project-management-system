import {
  useCallback,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { apiClient } from "../api/client";
import {
  dictionaryItemToDraft,
  systemSettingsToDraft,
  userToDraft,
} from "../app/adminHelpers";
import type {
  ApiTokenInfo,
  DictionaryItem,
  DictionaryItemDraft,
  RolePermission,
  SystemSetting,
  SystemSettingsDraft,
  SystemUser,
  UserDraftState,
  UserFormState,
  WebhookDraft,
  WebhookEndpointInfo,
  ApiTokenDraft,
} from "../app/adminTypes";
import { dictionaryPayload } from "../app/formPayloads";
import { emptyDictionaryDraft, emptyUserForm } from "../app/formState";
import {
  normalizeProjectModulesForUi,
  projectModulesToDraft,
  type ProjectModule,
  type ProjectModuleKey,
} from "../app/projectModules";

type UseAdminActionsControllerOptions = {
  users: SystemUser[];
  setUsers: Dispatch<SetStateAction<SystemUser[]>>;
  userDrafts: Record<string, UserDraftState>;
  setUserDrafts: Dispatch<SetStateAction<Record<string, UserDraftState>>>;
  newUserForm: UserFormState;
  setNewUserForm: Dispatch<SetStateAction<UserFormState>>;
  setSavingUserId: Dispatch<SetStateAction<string | null>>;
  setCreatingUser: Dispatch<SetStateAction<boolean>>;
  rolePermissions: RolePermission[];
  setRolePermissions: Dispatch<SetStateAction<RolePermission[]>>;
  dictionaryItems: DictionaryItem[];
  dictionaryDrafts: Record<string, DictionaryItemDraft>;
  setDictionaryDrafts: Dispatch<
    SetStateAction<Record<string, DictionaryItemDraft>>
  >;
  newDictionaryDraft: DictionaryItemDraft;
  setNewDictionaryDraft: Dispatch<SetStateAction<DictionaryItemDraft>>;
  setSavingDictionaryItemId: Dispatch<SetStateAction<string | null>>;
  setCreatingDictionaryItem: Dispatch<SetStateAction<boolean>>;
  systemSettingsDraft: SystemSettingsDraft;
  setSystemSettings: Dispatch<SetStateAction<SystemSetting[]>>;
  setSystemSettingsDraft: Dispatch<SetStateAction<SystemSettingsDraft>>;
  setSavingSystemSettings: Dispatch<SetStateAction<boolean>>;
  normalizedProjectModules: ProjectModule[];
  projectModuleDrafts: Record<ProjectModuleKey, boolean>;
  setProjectModules: Dispatch<SetStateAction<ProjectModule[]>>;
  setProjectModuleDrafts: Dispatch<
    SetStateAction<Record<ProjectModuleKey, boolean>>
  >;
  setSavingProjectModules: Dispatch<SetStateAction<boolean>>;
  apiTokenDraft: ApiTokenDraft;
  webhookDraft: WebhookDraft;
  setWebhookDraft: Dispatch<SetStateAction<WebhookDraft>>;
  setCreatedApiToken: Dispatch<SetStateAction<string | null>>;
  setSavingIntegration: Dispatch<SetStateAction<boolean>>;
  configTransferText: string;
  setConfigTransferText: Dispatch<SetStateAction<string>>;
  setImportingConfig: Dispatch<SetStateAction<boolean>>;
  setSavingRolePermissionId: Dispatch<SetStateAction<string | null>>;
  reloadUsers: () => Promise<void>;
  reloadAuditEvents: () => Promise<void>;
  reloadAdminConfig: () => Promise<void>;
  reloadAdminIntegrations: () => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
};

export function useAdminActionsController({
  users,
  setUsers: _setUsers,
  userDrafts,
  setUserDrafts,
  newUserForm,
  setNewUserForm,
  setSavingUserId,
  setCreatingUser,
  rolePermissions: _rolePermissions,
  setRolePermissions,
  dictionaryItems,
  dictionaryDrafts,
  setDictionaryDrafts,
  newDictionaryDraft,
  setNewDictionaryDraft,
  setSavingDictionaryItemId,
  setCreatingDictionaryItem,
  systemSettingsDraft,
  setSystemSettings,
  setSystemSettingsDraft,
  setSavingSystemSettings,
  normalizedProjectModules,
  projectModuleDrafts,
  setProjectModules,
  setProjectModuleDrafts,
  setSavingProjectModules,
  apiTokenDraft,
  webhookDraft,
  setWebhookDraft,
  setCreatedApiToken,
  setSavingIntegration,
  configTransferText,
  setConfigTransferText,
  setImportingConfig,
  setSavingRolePermissionId,
  reloadUsers,
  reloadAuditEvents,
  reloadAdminConfig,
  reloadAdminIntegrations,
  setError,
  setNotice,
}: UseAdminActionsControllerOptions) {
  void _setUsers;
  void _rolePermissions;

  const updateUserDraft = useCallback(
    (userId: string, patch: Partial<UserDraftState>) => {
      setUserDrafts((current) => {
        const sourceUser = users.find((item) => item.id === userId);
        const currentDraft =
          current[userId] ?? (sourceUser ? userToDraft(sourceUser) : null);
        if (!currentDraft) return current;
        return {
          ...current,
          [userId]: {
            ...currentDraft,
            ...patch,
          },
        };
      });
    },
    [setUserDrafts, users],
  );

  const updateDictionaryDraft = useCallback(
    (itemId: string, patch: Partial<DictionaryItemDraft>) => {
      setDictionaryDrafts((current) => {
        const sourceItem = dictionaryItems.find((item) => item.id === itemId);
        const currentDraft =
          current[itemId] ??
          (sourceItem ? dictionaryItemToDraft(sourceItem) : null);
        if (!currentDraft) return current;
        return {
          ...current,
          [itemId]: {
            ...currentDraft,
            ...patch,
          },
        };
      });
    },
    [dictionaryItems, setDictionaryDrafts],
  );

  const updateProjectModuleDraft = useCallback(
    (key: ProjectModuleKey, enabled: boolean) => {
      setProjectModuleDrafts((current) => ({
        ...current,
        [key]: enabled,
      }));
    },
    [setProjectModuleDrafts],
  );

  const saveProjectModules = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSavingProjectModules(true);
      setError(null);
      setNotice(null);
      try {
        const payload = {
          modules: normalizedProjectModules.map((module) => ({
            key: module.key,
            enabled: projectModuleDrafts[module.key] ?? module.enabled,
          })),
        };
        const updated = await apiClient.put<ProjectModule[]>(
          "/api/admin/project-modules",
          payload,
          "Не удалось сохранить управление модулями",
        );
        const normalized = normalizeProjectModulesForUi(updated);
        setProjectModules(normalized);
        setProjectModuleDrafts(projectModulesToDraft(normalized));
        await reloadAuditEvents();
        setNotice("Настройки модулей сохранены");
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось сохранить управление модулями",
        );
      } finally {
        setSavingProjectModules(false);
      }
    },
    [
      normalizedProjectModules,
      projectModuleDrafts,
      reloadAuditEvents,
      setError,
      setNotice,
      setProjectModuleDrafts,
      setProjectModules,
      setSavingProjectModules,
    ],
  );

  const toggleRolePermission = useCallback(
    async (permission: RolePermission) => {
      setSavingRolePermissionId(permission.id);
      setError(null);
      setNotice(null);
      try {
        const updated = await apiClient.patch<RolePermission>(
          `/api/admin/role-permissions/${permission.id}`,
          { enabled: !permission.enabled },
          "Не удалось сохранить право роли",
        );
        setRolePermissions((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
        await reloadAuditEvents();
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось сохранить право роли",
        );
      } finally {
        setSavingRolePermissionId(null);
      }
    },
    [
      reloadAuditEvents,
      setError,
      setNotice,
      setRolePermissions,
      setSavingRolePermissionId,
    ],
  );

  const createDictionaryItem = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setCreatingDictionaryItem(true);
      setError(null);
      setNotice(null);
      try {
        await apiClient.post<DictionaryItem>(
          "/api/admin/dictionary-items",
          dictionaryPayload(newDictionaryDraft),
          "Не удалось создать элемент справочника",
        );
        setNewDictionaryDraft({
          ...emptyDictionaryDraft,
          dictionary: newDictionaryDraft.dictionary,
        });
        await reloadAdminConfig();
        await reloadAuditEvents();
        setNotice("Элемент справочника сохранен");
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : "Не удалось создать элемент справочника",
        );
      } finally {
        setCreatingDictionaryItem(false);
      }
    },
    [
      newDictionaryDraft,
      reloadAdminConfig,
      reloadAuditEvents,
      setCreatingDictionaryItem,
      setError,
      setNewDictionaryDraft,
      setNotice,
    ],
  );

  const saveDictionaryItem = useCallback(
    async (itemId: string) => {
      const draft = dictionaryDrafts[itemId];
      if (!draft) return;
      setSavingDictionaryItemId(itemId);
      setError(null);
      setNotice(null);
      try {
        await apiClient.patch<DictionaryItem>(
          `/api/admin/dictionary-items/${itemId}`,
          dictionaryPayload(draft),
          "Не удалось сохранить элемент справочника",
        );
        await reloadAdminConfig();
        await reloadAuditEvents();
        setNotice("Справочник обновлен");
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось сохранить элемент справочника",
        );
      } finally {
        setSavingDictionaryItemId(null);
      }
    },
    [
      dictionaryDrafts,
      reloadAdminConfig,
      reloadAuditEvents,
      setError,
      setNotice,
      setSavingDictionaryItemId,
    ],
  );

  const deactivateDictionaryItem = useCallback(
    async (itemId: string) => {
      setSavingDictionaryItemId(itemId);
      setError(null);
      setNotice(null);
      try {
        await apiClient.delete(
          `/api/admin/dictionary-items/${itemId}`,
          "Не удалось отключить элемент справочника",
        );
        await reloadAdminConfig();
        await reloadAuditEvents();
        setNotice("Элемент справочника отключен");
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось отключить элемент справочника",
        );
      } finally {
        setSavingDictionaryItemId(null);
      }
    },
    [
      reloadAdminConfig,
      reloadAuditEvents,
      setError,
      setNotice,
      setSavingDictionaryItemId,
    ],
  );

  const saveSystemSettings = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSavingSystemSettings(true);
      setError(null);
      setNotice(null);
      try {
        const updated = await apiClient.put<SystemSetting[]>(
          "/api/admin/system-settings",
          {
            settings: {
              "jira.enabled": {
                value: systemSettingsDraft.jiraEnabled ? "true" : "false",
              },
              "jira.baseUrl": {
                value: systemSettingsDraft.jiraBaseUrl.trim(),
              },
              "jira.email": {
                value: systemSettingsDraft.jiraEmail.trim(),
              },
              "jira.apiToken": {
                value: systemSettingsDraft.jiraApiToken.trim(),
                isSecret: true,
              },
              "jira.maxResults": {
                value: String(Number(systemSettingsDraft.jiraMaxResults) || 100),
              },
              "gitlab.enabled": {
                value: systemSettingsDraft.gitlabEnabled ? "true" : "false",
              },
              "gitlab.baseUrl": {
                value: systemSettingsDraft.gitlabBaseUrl.trim(),
              },
              "gitlab.token": {
                value: systemSettingsDraft.gitlabToken.trim(),
                isSecret: true,
              },
              "github.enabled": {
                value: systemSettingsDraft.githubEnabled ? "true" : "false",
              },
              "github.baseUrl": {
                value: systemSettingsDraft.githubBaseUrl.trim(),
              },
              "github.token": {
                value: systemSettingsDraft.githubToken.trim(),
                isSecret: true,
              },
              "azureDevOps.enabled": {
                value: systemSettingsDraft.azureDevOpsEnabled ? "true" : "false",
              },
              "azureDevOps.organizationUrl": {
                value: systemSettingsDraft.azureDevOpsOrganizationUrl.trim(),
              },
              "azureDevOps.token": {
                value: systemSettingsDraft.azureDevOpsToken.trim(),
                isSecret: true,
              },
              "bi.enabled": {
                value: systemSettingsDraft.biEnabled ? "true" : "false",
              },
              "bi.exportUrl": {
                value: systemSettingsDraft.biExportUrl.trim(),
              },
              "rag.formula.green": {
                value: systemSettingsDraft.ragGreenFormula.trim(),
              },
              "rag.formula.amber": {
                value: systemSettingsDraft.ragAmberFormula.trim(),
              },
              "rag.formula.red": {
                value: systemSettingsDraft.ragRedFormula.trim(),
              },
              "workflow.overview": {
                value: systemSettingsDraft.overviewWorkflow.trim(),
              },
              "workflow.baseline": {
                value: systemSettingsDraft.baselineWorkflow.trim(),
              },
              "workflow.projectClose": {
                value: systemSettingsDraft.projectCloseWorkflow.trim(),
              },
              "wbs.templates": {
                value: systemSettingsDraft.wbsTemplates.trim(),
              },
            },
          },
          "Не удалось сохранить системные настройки",
        );
        setSystemSettings(updated);
        setSystemSettingsDraft(systemSettingsToDraft(updated));
        await reloadAdminIntegrations();
        await reloadAuditEvents();
        setNotice("Системные настройки сохранены");
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось сохранить системные настройки",
        );
      } finally {
        setSavingSystemSettings(false);
      }
    },
    [
      reloadAdminIntegrations,
      reloadAuditEvents,
      setError,
      setNotice,
      setSavingSystemSettings,
      setSystemSettings,
      setSystemSettingsDraft,
      systemSettingsDraft,
    ],
  );

  const exportAdminConfig = useCallback(async () => {
    setError(null);
    setNotice(null);
    try {
      const data = await apiClient.get<unknown>(
        "/api/admin/config/export",
        "Не удалось экспортировать конфигурацию",
      );
      setConfigTransferText(JSON.stringify(data, null, 2));
      setNotice("Конфигурация экспортирована в поле ниже");
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Не удалось экспортировать конфигурацию",
      );
    }
  }, [setConfigTransferText, setError, setNotice]);

  const importAdminConfig = useCallback(async () => {
    setImportingConfig(true);
    setError(null);
    setNotice(null);
    try {
      const payload = JSON.parse(configTransferText);
      await apiClient.post<{ ok: boolean }>(
        "/api/admin/config/import",
        payload,
        "Не удалось импортировать конфигурацию",
      );
      await reloadAdminConfig();
      await reloadAuditEvents();
      setNotice("Конфигурация импортирована");
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Не удалось импортировать конфигурацию",
      );
    } finally {
      setImportingConfig(false);
    }
  }, [
    configTransferText,
    reloadAdminConfig,
    reloadAuditEvents,
    setError,
    setImportingConfig,
    setNotice,
  ]);

  const createUser = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setCreatingUser(true);
      setError(null);
      setNotice(null);
      try {
        await apiClient.post<SystemUser>(
          "/api/users",
          {
            ...newUserForm,
            email: newUserForm.email.trim(),
            name: newUserForm.name.trim(),
          },
          "Не удалось создать пользователя",
        );
        setNewUserForm(emptyUserForm);
        await reloadUsers();
        await reloadAuditEvents();
        setNotice("Пользователь создан");
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : "Не удалось создать пользователя",
        );
      } finally {
        setCreatingUser(false);
      }
    },
    [
      newUserForm,
      reloadAuditEvents,
      reloadUsers,
      setCreatingUser,
      setError,
      setNewUserForm,
      setNotice,
    ],
  );

  const saveUser = useCallback(
    async (userId: string) => {
      const draft = userDrafts[userId];
      if (!draft) return;
      setSavingUserId(userId);
      setError(null);
      setNotice(null);
      try {
        await apiClient.patch<SystemUser>(
          `/api/users/${userId}`,
          {
            email: draft.email.trim(),
            name: draft.name.trim(),
            role: draft.role,
            isActive: draft.isActive,
          },
          "Не удалось сохранить пользователя",
        );
        if (draft.password.trim()) {
          await apiClient.post<SystemUser>(
            `/api/users/${userId}/password`,
            { password: draft.password },
            "Не удалось сменить пароль",
          );
        }
        await reloadUsers();
        await reloadAuditEvents();
        setNotice("Пользователь обновлен");
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось сохранить пользователя",
        );
      } finally {
        setSavingUserId(null);
      }
    },
    [
      reloadAuditEvents,
      reloadUsers,
      setError,
      setNotice,
      setSavingUserId,
      userDrafts,
    ],
  );

  const createApiToken = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSavingIntegration(true);
      setCreatedApiToken(null);
      setError(null);
      setNotice(null);
      try {
        const token = await apiClient.post<ApiTokenInfo>(
          "/api/admin/api-tokens",
          {
            name: apiTokenDraft.name.trim(),
            scopes: apiTokenDraft.scopes
              .split(",")
              .map((scope) => scope.trim())
              .filter(Boolean),
            rateLimitPerMinute: Number(apiTokenDraft.rateLimitPerMinute) || 120,
            expiresAt: apiTokenDraft.expiresAt || null,
          },
          "Не удалось создать API-токен",
        );
        setCreatedApiToken(token.token ?? null);
        await reloadAdminIntegrations();
        setNotice(
          "API-токен создан. Скопируйте значение сейчас: оно больше не будет показано.",
        );
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось создать API-токен",
        );
      } finally {
        setSavingIntegration(false);
      }
    },
    [
      apiTokenDraft,
      reloadAdminIntegrations,
      setCreatedApiToken,
      setError,
      setNotice,
      setSavingIntegration,
    ],
  );

  const toggleApiToken = useCallback(
    async (token: ApiTokenInfo) => {
      setSavingIntegration(true);
      setError(null);
      try {
        await apiClient.patch<ApiTokenInfo>(
          `/api/admin/api-tokens/${token.id}`,
          { isActive: !token.isActive },
          "Не удалось обновить API-токен",
        );
        await reloadAdminIntegrations();
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось обновить API-токен",
        );
      } finally {
        setSavingIntegration(false);
      }
    },
    [reloadAdminIntegrations, setError, setSavingIntegration],
  );

  const createWebhook = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSavingIntegration(true);
      setError(null);
      setNotice(null);
      try {
        await apiClient.post<WebhookEndpointInfo>(
          "/api/admin/webhooks",
          {
            name: webhookDraft.name.trim(),
            url: webhookDraft.url.trim(),
            events: webhookDraft.events
              .split(",")
              .map((eventName) => eventName.trim())
              .filter(Boolean),
            secret: webhookDraft.secret.trim() || null,
            isActive: webhookDraft.isActive,
          },
          "Не удалось создать webhook",
        );
        setWebhookDraft({
          name: "Webhook",
          url: "",
          events: "*",
          secret: "",
          isActive: true,
        });
        await reloadAdminIntegrations();
        setNotice("Webhook сохранен");
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось создать webhook",
        );
      } finally {
        setSavingIntegration(false);
      }
    },
    [
      reloadAdminIntegrations,
      setError,
      setNotice,
      setSavingIntegration,
      setWebhookDraft,
      webhookDraft,
    ],
  );

  const toggleWebhook = useCallback(
    async (endpoint: WebhookEndpointInfo) => {
      setSavingIntegration(true);
      setError(null);
      try {
        await apiClient.patch<WebhookEndpointInfo>(
          `/api/admin/webhooks/${endpoint.id}`,
          { isActive: !endpoint.isActive },
          "Не удалось обновить webhook",
        );
        await reloadAdminIntegrations();
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось обновить webhook",
        );
      } finally {
        setSavingIntegration(false);
      }
    },
    [reloadAdminIntegrations, setError, setSavingIntegration],
  );

  const testWebhook = useCallback(
    async (endpointId: string) => {
      setSavingIntegration(true);
      setError(null);
      setNotice(null);
      try {
        await apiClient.post(
          `/api/admin/webhooks/${endpointId}/test`,
          undefined,
          "Не удалось отправить тест",
        );
        await reloadAdminIntegrations();
        setNotice("Тестовое событие отправлено");
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось отправить тест",
        );
      } finally {
        setSavingIntegration(false);
      }
    },
    [reloadAdminIntegrations, setError, setNotice, setSavingIntegration],
  );

  return {
    createApiToken,
    toggleApiToken,
    createWebhook,
    toggleWebhook,
    testWebhook,
    updateUserDraft,
    updateDictionaryDraft,
    updateProjectModuleDraft,
    saveProjectModules,
    toggleRolePermission,
    createDictionaryItem,
    saveDictionaryItem,
    deactivateDictionaryItem,
    saveSystemSettings,
    exportAdminConfig,
    importAdminConfig,
    createUser,
    saveUser,
  };
}
