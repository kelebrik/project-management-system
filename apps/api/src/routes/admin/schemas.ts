import { z } from 'zod';

export const rolePermissionSchema = z.object({
  enabled: z.boolean(),
});

export const dictionaryItemSchema = z.object({
  dictionary: z.string().trim().min(1),
  code: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const systemSettingsSchema = z.object({
  settings: z.record(
    z.string(),
    z.object({
      value: z.string(),
      isSecret: z.boolean().optional(),
    }),
  ),
});

export const projectModulesSchema = z.object({
  modules: z.array(
    z.object({
      key: z.string().trim().min(1),
      enabled: z.boolean(),
    }),
  ),
});

export const projectAccessGrantSchema = z.object({
  userIds: z.array(z.string().trim().min(1)).min(1),
  projectIds: z.array(z.string().trim().min(1)).min(1),
  level: z.enum(['VIEW', 'EDIT', 'ADMIN']),
});

export const projectAccessPatchSchema = z.object({
  level: z.enum(['VIEW', 'EDIT', 'ADMIN']),
});

export const businessUnitSchema = z.object({
  code: z.preprocess(
    (value) => typeof value === 'string' ? value.trim().toLowerCase() : value,
    z.string()
      .min(2, 'Код должен содержать минимум 2 символа')
      .max(32, 'Код должен содержать не более 32 символов')
      .regex(/^[a-z0-9-]+$/, 'Используйте латинские буквы, цифры и дефис'),
  ),
  name: z.string().trim().min(2).max(120),
});

export const businessUnitMembershipSchema = z.object({
  userId: z.string().trim().min(1),
  role: z.literal('ADMIN'),
});

export const projectBusinessUnitMoveSchema = z.object({
  businessUnitId: z.string().trim().min(1),
});

export const adminConfigImportSchema = z.object({
  rolePermissions: z
    .array(
      z.object({
        role: z.enum(['ADMIN', 'PROJECT_MANAGER', 'EXECUTIVE_VIEWER']),
        permission: z.string().trim().min(1),
        enabled: z.boolean(),
      }),
    )
    .optional(),
  businessUnitRolePermissions: z
    .array(
      z.object({
        role: z.enum(['ADMIN', 'PROJECT_MANAGER', 'VIEWER']),
        permission: z.enum(['PROJECT_VIEW', 'PROJECT_CREATE', 'PROJECT_ADMIN', 'MEMBERS_MANAGE']),
        enabled: z.boolean(),
      }),
    )
    .optional(),
  dictionaryItems: z.array(dictionaryItemSchema).optional(),
  systemSettings: z
    .array(
      z.object({
        key: z.string().trim().min(1),
        value: z.string().default(''),
        isSecret: z.boolean().optional(),
      }),
    )
    .optional(),
  projectModules: projectModulesSchema.shape.modules.optional(),
});

export const apiTokenSchema = z.object({
  name: z.string().trim().min(1),
  scopes: z.array(z.string().trim().min(1)).min(1).default(['project.read']),
  rateLimitPerMinute: z.coerce.number().int().min(10).max(10_000).default(120),
  expiresAt: z.string().trim().optional().nullable(),
});

export const apiTokenPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  scopes: z.array(z.string().trim().min(1)).min(1).optional(),
  rateLimitPerMinute: z.coerce.number().int().min(10).max(10_000).optional(),
  expiresAt: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const webhookEndpointSchema = z.object({
  name: z.string().trim().min(1),
  url: z.string().trim().url().refine((value) => value.startsWith('https://'), {
    message: 'Webhook URL должен начинаться с https://',
  }),
  secret: z.string().trim().optional().nullable(),
  events: z.array(z.string().trim().min(1)).min(1).default(['*']),
  isActive: z.boolean().default(true),
});

export const webhookEndpointPatchSchema = webhookEndpointSchema.partial();
