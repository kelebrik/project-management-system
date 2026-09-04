import type { Dispatch, SetStateAction } from "react";

import type {
  ApiTokenDraft,
  DictionaryItem,
  DictionaryItemDraft,
  ProjectAccessDraft,
  ProjectAccessRecord,
  RolePermission,
  SystemSetting,
  SystemSettingsDraft,
  SystemUser,
  UserDraftState,
  UserFormState,
  WebhookDraft,
} from "../app/adminTypes";
import type { ProjectModule, ProjectModuleKey } from "../app/projectModules";

export type UseAdminActionsControllerOptions = {
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
  projectAccessDraft: ProjectAccessDraft;
  setProjectAccessDraft: Dispatch<SetStateAction<ProjectAccessDraft>>;
  setProjectAccesses: Dispatch<SetStateAction<ProjectAccessRecord[]>>;
  setSavingProjectAccess: Dispatch<SetStateAction<boolean>>;
  dictionaryItems: DictionaryItem[];
  dictionaryDrafts: Record<string, DictionaryItemDraft>;
  setDictionaryDrafts: Dispatch<SetStateAction<Record<string, DictionaryItemDraft>>>;
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
  setProjectModuleDrafts: Dispatch<SetStateAction<Record<ProjectModuleKey, boolean>>>;
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
  reloadProjectAccesses: () => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
};
