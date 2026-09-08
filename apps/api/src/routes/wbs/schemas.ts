import { wbsItemBaseSchema, wbsItemSchema, wbsItemTypes } from '@pms/shared';
import { z } from 'zod';

export const wbsInsertAfterSchema = z.object({
  afterItemId: z.string().trim().min(1),
  beforeItemId: z.string().trim().optional().nullable(),
});

export const wbsReorderSchema = z.object({
  orderedIds: z.array(z.string().trim().min(1)).min(1),
  levelsById: z.record(z.string().trim().min(1), z.coerce.number().int().min(1).max(12)).optional(),
  typesById: z.record(z.string().trim().min(1), z.enum(wbsItemTypes)).optional(),
});

export const wbsBulkDeleteSchema = z.object({
  itemIds: z.array(z.string().trim().min(1)).min(1).max(500),
});

export const wbsBaselineSchema = z.object({
  itemIds: z.array(z.string().trim().min(1)).min(1).max(500).optional(),
});

export const wbsBulkUpdateSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        patch: wbsItemBaseSchema.partial(),
        expectedUpdatedAt: z.string().datetime().optional(),
        expectedJira: z.object({ key: z.string().min(1), updatedAt: z.string().datetime() }).optional(),
      }),
    )
    .min(1)
    .max(500),
  renumber: z.boolean().default(false),
});

export const wbsDependencySchema = z.object({
  predecessorId: z.string().trim().min(1),
  successorId: z.string().trim().min(1),
  type: z.enum(['FS', 'SS', 'FF', 'SF']).default('FS'),
  lagDays: z.coerce.number().int().default(0),
});

export const wbsDependencySnapshotSchema = wbsDependencySchema;

export const wbsSnapshotSchema = z.object({
  wbsItems: z.array(
    wbsItemSchema.extend({
      id: z.string().trim().min(1),
      closedAt: z.string().trim().optional().nullable(),
    }),
  ),
  wbsDependencies: z.array(wbsDependencySnapshotSchema).default([]),
});
