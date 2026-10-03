import { projectSchema, wbsImportRowSchema, WBS_IMPORT_LIMITS } from '@pms/shared';
import { z } from 'zod';
import { patchSchema } from '../patch-schema.js';

const isoDay = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

// A new project needs a name, a manager and dates; the sponsor and the summary can come later.
export const createProjectSchema = projectSchema.extend({
  portfolio: z.string().trim().optional().default(''),
  sponsor: z.string().trim().optional().default(''),
  summary: z.string().trim().optional().default(''),
  productOwner: z.string().trim().max(200).optional().default(''),
  hwTpm: z.string().trim().max(200).optional().default(''),
  swTpm: z.string().trim().max(200).optional().default(''),
  // Where the first Structure comes from: the standard one, copies of other projects, or a table (Excel, Google Sheets).
  structureSource: z.enum(['standard', 'copy', 'table']).optional(),
  importRows: z.array(wbsImportRowSchema).min(1).max(WBS_IMPORT_LIMITS.rows).optional(),
  importKey: z.string().trim().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  startDate: isoDay,
  targetDate: isoDay,
  copyCurrentStructureFrom: z
    .array(
      z.object({
        projectId: z.string().trim().min(1),
        phaseIds: z.array(z.string().trim().min(1)).min(1).max(100).nullable(),
      }),
    )
    .max(100)
    .optional()
    .default([]),
}).superRefine((value, context) => {
  const source = value.structureSource ?? (value.copyCurrentStructureFrom.length > 0 ? 'copy' : 'standard');
  if (source === 'copy' && value.copyCurrentStructureFrom.length === 0) {
    context.addIssue({ code: 'custom', path: ['copyCurrentStructureFrom'], message: 'Выберите проекты или фазы для копирования' });
  }
  if (source === 'table' && (!value.importRows || !value.importKey)) {
    context.addIssue({ code: 'custom', path: ['importRows'], message: 'Загрузите таблицу Структуры' });
  }
  if (value.startDate > value.targetDate) {
    context.addIssue({ code: 'custom', path: ['targetDate'], message: 'Окончание не может быть раньше начала' });
  }
  const projectIds = value.copyCurrentStructureFrom.map((item) => item.projectId);
  if (new Set(projectIds).size !== projectIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['copyCurrentStructureFrom'],
      message: 'Каждый проект-источник можно выбрать только один раз',
    });
  }
});

// A change sends only the fields it changes; see patchSchema.
export const updateProjectSchema = patchSchema(projectSchema);

export const projectTargetDateChangeSchema = z.object({
  targetDate: z.string().trim().min(1),
  reason: z.string().trim().min(3),
  approvedBy: z.string().trim().optional().nullable(),
});

const milestoneLabelOffsetSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const milestoneLabelLayoutSchema = z.object({
  fingerprint: z.string().min(1).max(100000),
  offsets: z.record(z.string(), milestoneLabelOffsetSchema),
  updatedAt: z.string().trim().optional().nullable(),
});

export const projectUiStatePatchSchema = z.object({
  milestoneLabelLayout: milestoneLabelLayoutSchema.nullable().optional(),
});

export const overviewTransitionSchema = z.object({
  status: z.enum(['PM_REVIEW', 'APPROVED']),
  approvedBy: z.string().trim().optional().nullable(),
});

export const calendarOverrideSchema = z.object({
  calendarCode: z.enum(['RU', 'CN']),
  date: z.string().trim().min(1),
  isWorkingDay: z.boolean(),
  description: z.string().trim().optional().nullable(),
});

export const deleteCalendarOverrideSchema = z.object({
  calendarCode: z.enum(['RU', 'CN']),
  date: z.string().trim().min(1),
});

export const artifactSchema = z.object({
  title: z.string().trim().min(3),
  type: z.string().trim().min(1),
  owner: z.string().trim().optional().default(''),
  status: z.enum(['Draft', 'In Review', 'Approved', 'Baseline', 'Archived']).default('Draft'),
  url: z.string().trim().url().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
});

export const reorderArtifactsSchema = z.object({
  orderedIds: z.array(z.string().trim().min(1)).min(1),
});

export const milestoneSchema = z.object({
  code: z.string().trim().optional().nullable(),
  title: z.string().trim().min(3),
  dueDate: z.string().trim().min(1),
  status: z.enum(['Planned', 'In Progress', 'At Risk', 'Done', 'Cancelled']).default('Planned'),
  owner: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
});

export const businessRequirementsSchema = z.object({
  columns: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        title: z.string().trim().max(120),
      }),
    )
    .min(1)
    .max(80),
  rows: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        cells: z.record(z.string().trim().min(1).max(80), z.string().max(5000)),
      }),
    )
    .max(2000),
});
