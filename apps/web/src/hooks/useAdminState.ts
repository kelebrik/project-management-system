import { useCallback, useState } from "react";
import type {
  AdminHealth,
  AdminIntegrations,
  ApiTokenDraft,
  AuditEvent,
  BackupStatus,
  DictionaryItem,
  DictionaryItemDraft,
  RolePermission,
  SystemSetting,
  SystemSettingsDraft,
  SystemUser,
  UserDraftState,
  UserFormState,
  WebhookDraft,
} from "../app/adminTypes";
import {
  defaultProjectModules,
  projectModulesToDraft,
  type ProjectModule,
  type ProjectModuleKey,
} from "../app/projectModules";
import {
  emptyDictionaryDraft,
  emptySystemSettingsDraft,
  emptyUserForm,
} from "../app/formState";

export function useAdminState() {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [userDrafts, setUserDrafts] = useState<Record<string, UserDraftState>>({});
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [newUserForm, setNewUserForm] = useState<UserFormState>(emptyUserForm);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [dictionaryItems, setDictionaryItems] = useState<DictionaryItem[]>([]);
  const [dictionaryDrafts, setDictionaryDrafts] = useState<
    Record<string, DictionaryItemDraft>
  >({});
  const [selectedDictionary, setSelectedDictionary] = useState("wbs_type");
  const [newDictionaryDraft, setNewDictionaryDraft] =
    useState<DictionaryItemDraft>(emptyDictionaryDraft);
  const [savingDictionaryItemId, setSavingDictionaryItemId] =
    useState<string | null>(null);
  const [creatingDictionaryItem, setCreatingDictionaryItem] = useState(false);
  const [systemSettings, setSystemSettings] = useState<SystemSetting[]>([]);
  const [systemSettingsDraft, setSystemSettingsDraft] =
    useState<SystemSettingsDraft>(emptySystemSettingsDraft);
  const [savingSystemSettings, setSavingSystemSettings] = useState(false);
  const [projectModules, setProjectModules] = useState<ProjectModule[]>(
    () => defaultProjectModules,
  );
  const [projectModuleDrafts, setProjectModuleDrafts] = useState<
    Record<ProjectModuleKey, boolean>
  >(() => projectModulesToDraft(defaultProjectModules));
  const [savingProjectModules, setSavingProjectModules] = useState(false);
  const [adminHealth, setAdminHealth] = useState<AdminHealth | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [adminIntegrations, setAdminIntegrations] =
    useState<AdminIntegrations | null>(null);
  const [apiTokenDraft, setApiTokenDraft] = useState<ApiTokenDraft>({
    name: "Внешняя интеграция",
    scopes: "project.read,wbs.read,issue.read,raid.read",
    rateLimitPerMinute: "120",
    expiresAt: "",
  });
  const [webhookDraft, setWebhookDraft] = useState<WebhookDraft>({
    name: "Webhook",
    url: "",
    events: "*",
    secret: "",
    isActive: true,
  });
  const [createdApiToken, setCreatedApiToken] = useState<string | null>(null);
  const [savingIntegration, setSavingIntegration] = useState(false);
  const [configTransferText, setConfigTransferText] = useState("");
  const [importingConfig, setImportingConfig] = useState(false);
  const [savingRolePermissionId, setSavingRolePermissionId] =
    useState<string | null>(null);
  const resetAdminState = useCallback(() => {
    setUsers([]);
    setAuditEvents([]);
    setRolePermissions([]);
    setDictionaryItems([]);
    setDictionaryDrafts({});
    setSystemSettings([]);
    setSystemSettingsDraft(emptySystemSettingsDraft);
    setAdminHealth(null);
    setBackupStatus(null);
    setAdminIntegrations(null);
    setCreatedApiToken(null);
    setConfigTransferText("");
  }, []);

  return {
    users,
    setUsers,
    userDrafts,
    setUserDrafts,
    auditEvents,
    setAuditEvents,
    newUserForm,
    setNewUserForm,
    savingUserId,
    setSavingUserId,
    creatingUser,
    setCreatingUser,
    rolePermissions,
    setRolePermissions,
    dictionaryItems,
    setDictionaryItems,
    dictionaryDrafts,
    setDictionaryDrafts,
    selectedDictionary,
    setSelectedDictionary,
    newDictionaryDraft,
    setNewDictionaryDraft,
    savingDictionaryItemId,
    setSavingDictionaryItemId,
    creatingDictionaryItem,
    setCreatingDictionaryItem,
    systemSettings,
    setSystemSettings,
    systemSettingsDraft,
    setSystemSettingsDraft,
    savingSystemSettings,
    setSavingSystemSettings,
    projectModules,
    setProjectModules,
    projectModuleDrafts,
    setProjectModuleDrafts,
    savingProjectModules,
    setSavingProjectModules,
    adminHealth,
    setAdminHealth,
    backupStatus,
    setBackupStatus,
    adminIntegrations,
    setAdminIntegrations,
    apiTokenDraft,
    setApiTokenDraft,
    webhookDraft,
    setWebhookDraft,
    createdApiToken,
    setCreatedApiToken,
    savingIntegration,
    setSavingIntegration,
    configTransferText,
    setConfigTransferText,
    importingConfig,
    setImportingConfig,
    savingRolePermissionId,
    setSavingRolePermissionId,
    resetAdminState,
  };
}
