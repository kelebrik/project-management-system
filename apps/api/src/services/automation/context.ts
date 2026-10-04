import { randomUUID } from 'node:crypto';
import { normalizePersonName, type AutomationTemplate, type NotificationParams } from '@pms/shared';
import { Prisma } from '@prisma/client';
import { usersWhoCanReadProject } from '../../server/business-units.js';

/** What every rule handler works with, and the two ways it acts: firing once per key, and telling people. */
export type Tx = Prisma.TransactionClient;
/** What a rule keeps between runs: when it was switched on, how far its event sources were read, and the float set it last saw. */
export type RuleState = { since?: string; cursor?: string; floatIds?: string[]; riskIds?: string[] };

/** Late commits of a source row are caught by reading this far back on every run; repeats are dropped by the firing key. */
export const OVERLAP_MS = 10 * 60_000;
export const SOURCE_BATCH = 2000;
export const DAY_MS = 86_400_000;

export type RunContext = {
  tx: Tx;
  rule: { id: string; projectId: string; template: AutomationTemplate; params: Prisma.JsonValue; recipientIds: string[] };
  project: { id: string; code: string; projectManager: string };
  state: RuleState;
  now: Date;
  zone: string;
  recipients: string[];
  /** Rows read per page of an event source. */
  batch: number;
};

/** Claims a firing; null when this key already fired, which is how repeats and overlapping reads are dropped. */
export async function fire(ctx: RunContext, dedupeKey: string, summary: Record<string, unknown>) {
  const rows = await ctx.tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "AutomationFiring" ("id", "ruleId", "projectId", "template", "dedupeKey", "summary", "firedAt")
    VALUES (${randomUUID()}, ${ctx.rule.id}, ${ctx.project.id}, ${ctx.rule.template}, ${dedupeKey}, ${JSON.stringify(summary)}::jsonb, ${ctx.now})
    ON CONFLICT ("ruleId", "dedupeKey") DO NOTHING
    RETURNING "id"`;
  return rows[0]?.id ?? null;
}

export async function notify(ctx: RunContext, firingId: string, userIds: string[], params: NotificationParams, href: string) {
  // Nobody hears about a project they may not see.
  const unique = await usersWhoCanReadProject([...new Set(userIds)], ctx.project.id);
  if (unique.length === 0) return;
  await ctx.tx.notification.createMany({
    data: unique.map((userId) => ({ userId, projectId: ctx.project.id, firingId, kind: params.kind, params: params as unknown as Prisma.InputJsonValue, href })),
    skipDuplicates: true,
  });
}

/** Active users linked to people of the leave schedule, by normalized name. */
export async function linkedUsers(tx: Tx) {
  const people = await tx.leaveEmployee.findMany({ where: { isActive: true, userId: { not: null }, user: { isActive: true } }, select: { name: true, userId: true } });
  return new Map(people.map((person) => [normalizePersonName(person.name), person.userId!]));
}

