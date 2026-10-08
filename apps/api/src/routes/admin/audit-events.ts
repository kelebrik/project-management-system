import type { Prisma } from '@prisma/client';
import { z } from 'zod';

const optionalText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((value) => (value ? value : undefined));

// The journal reads newest first; `before` is the oldest event already shown.
export const auditEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  before: optionalText,
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  projectId: optionalText,
  actor: optionalText,
  action: optionalText,
});

export type AuditEventsQuery = z.infer<typeof auditEventsQuerySchema>;

export const auditEventsOrderBy: Prisma.AuditEventOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

/** Filters of the journal; `to` is exclusive, the cursor continues after the given event. */
export function auditEventsWhere(
  query: AuditEventsQuery,
  cursor: { id: string; createdAt: Date } | null,
): Prisma.AuditEventWhereInput {
  const and: Prisma.AuditEventWhereInput[] = [];
  if (query.from || query.to) {
    and.push({
      createdAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(query.to) } : {}),
      },
    });
  }
  if (query.projectId) and.push({ projectId: query.projectId });
  if (query.action) and.push({ action: query.action });
  if (query.actor) {
    and.push({
      OR: [
        { actorName: { contains: query.actor, mode: 'insensitive' } },
        { actorEmail: { contains: query.actor, mode: 'insensitive' } },
      ],
    });
  }
  if (cursor) {
    and.push({
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ],
    });
  }
  return and.length > 0 ? { AND: and } : {};
}
