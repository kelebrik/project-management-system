import { projectSchema } from '@pms/shared';
import { z } from 'zod';

export const createProjectSchema = projectSchema.extend({
  copyBaselineFromProjectId: z.string().trim().optional().nullable(),
});

export const updateProjectSchema = projectSchema.partial();

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
