import type { ProjectModule } from "./projectModules";
import type { ProjectAccessLevel } from "./domainTypes";

export type AuthMode = "checking" | "setup" | "login" | "ready";

export type UserRole =
  | "ADMIN"
  | "PROJECT_MANAGER"
  | "TEAM_MEMBER"
  | "EXECUTIVE_VIEWER";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
};

export type SystemUser = CurrentUser & {
  createdAt: string;
  updatedAt: string;
  hasPassword: boolean;
};

export type ProjectAccessRecord = {
  id: string;
  projectId: string;
  userId: string;
  level: ProjectAccessLevel;
  grantedById: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    isActive: boolean;
  };
  project: {
    id: string;
    code: string;
    name: string;
    status: string;
  };
};

export type ProjectAccessDraft = {
  userIds: string[];
  projectIds: string[];
  level: ProjectAccessLevel;
};

export type AuditEvent = {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  projectId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  beforeValue: unknown;
  afterValue: unknown;
  metadata: unknown;
  createdAt: string;
};

export type RolePermission = {
  id: string;
  role: UserRole;
  permission: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DictionaryItem = {
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

export type SystemSetting = {
  key: string;
  value: string;
  isSecret: boolean;
  hasValue: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminHealth = {
  ok: boolean;
  database: string;
  databaseLatencyMs: number;
  uptimeSeconds: number;
  startedAt: string;
  nodeEnv: string;
};

export type BackupStatus = {
  ok: boolean;
  backupDir: string;
  retentionDays: number;
  totalBackups: number;
  latestBackup: {
    file: string;
    path: string;
    sizeBytes: number;
    updatedAt: string;
  } | null;
  latestChecksum: string | null;
  message: string;
};

export type AdminConfig = {
  rolePermissions: RolePermission[];
  dictionaryItems: DictionaryItem[];
  systemSettings: SystemSetting[];
  projectModules: ProjectModule[];
  managedPermissions: string[];
  health: AdminHealth;
  backupStatus: BackupStatus;
};

export type ApiTokenInfo = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  isActive: boolean;
  rateLimitPerMinute: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  token?: string;
};

export type WebhookEndpointInfo = {
  id: string;
  name: string;
  url: string;
  hasSecret: boolean;
  events: string[];
  isActive: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebhookDeliveryInfo = {
  id: string;
  endpointId: string;
  eventType: string;
  status: string;
  statusCode: number | null;
  responseBody: string | null;
  error: string | null;
  attemptedAt: string | null;
  createdAt: string;
  endpoint?: { name: string };
};

export type AdminIntegrations = {
  apiTokens: ApiTokenInfo[];
  webhookEndpoints: WebhookEndpointInfo[];
  webhookDeliveries: WebhookDeliveryInfo[];
  integrationSettings: SystemSetting[];
};

export type ApiTokenDraft = {
  name: string;
  scopes: string;
  rateLimitPerMinute: string;
  expiresAt: string;
};

export type WebhookDraft = {
  name: string;
  url: string;
  events: string;
  secret: string;
  isActive: boolean;
};

export type AuthFormState = {
  email: string;
  name: string;
  password: string;
};

export type UserFormState = {
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  password: string;
};

export type UserDraftState = {
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  password: string;
};

export type DictionaryItemDraft = {
  dictionary: string;
  code: string;
  label: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
};

export type SystemSettingsDraft = {
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
