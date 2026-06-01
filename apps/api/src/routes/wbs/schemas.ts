import { wbsItemSchema } from '@pms/shared';
import { z } from 'zod';

export const wbsInsertAfterSchema = z.object({
  afterItemId: z.string().trim().min(1),
  beforeItemId: z.string().trim().optional().nullable(),
});

export const wbsReorderSchema = z.object({
  orderedIds: z.array(z.string().trim().min(1)).min(1),
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
