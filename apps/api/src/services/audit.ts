import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { PUBLIC_DEMO_USER_ID } from "@pms/shared";
import { prisma } from "../db.js";

type AuditActor = {
  id: string;
  email: string;
  name: string;
} | null;

export type AuditFieldChangeInput = {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  oldText?: string | null;
  newText?: string | null;
};

type AuditSource = Record<string, unknown> | null | undefined;

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizeAuditValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeAuditValue(item));
  }
  if (value && typeof value === "object") {
    if (
      "toJSON" in value &&
      typeof (value as { toJSON: () => unknown }).toJSON === "function"
    ) {
      return normalizeAuditValue((value as { toJSON: () => unknown }).toJSON());
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        normalizeAuditValue(item),
      ]),
    );
  }
  return value ?? null;
}

function auditValuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(normalizeAuditValue(left)) === JSON.stringify(normalizeAuditValue(right));
}

function auditValueText(value: unknown) {
  const normalized = normalizeAuditValue(value);
  if (normalized === null || normalized === undefined) return null;
  if (typeof normalized === "string") return normalized;
  if (typeof normalized === "number" || typeof normalized === "boolean") {
    return String(normalized);
  }
  return JSON.stringify(normalized);
}

export function buildAuditFieldChanges(
  beforeValue: AuditSource,
  afterValue: AuditSource,
  fields: string[],
): AuditFieldChangeInput[] {
  const changes: AuditFieldChangeInput[] = [];

  for (const field of fields) {
    const oldValue = beforeValue?.[field];
    const newValue = afterValue?.[field];
    if (auditValuesEqual(oldValue, newValue)) continue;

    changes.push({
      field,
      oldValue: normalizeAuditValue(oldValue),
      newValue: normalizeAuditValue(newValue),
      oldText: auditValueText(oldValue),
      newText: auditValueText(newValue),
    });
  }

  return changes;
}

export async function recordAuditEvent(input: {
  req?: Request;
  actor?: AuditActor;
  action: string;
  objectType: string;
  objectId?: string | null;
  projectId?: string | null;
  beforeValue?: unknown;
  afterValue?: unknown;
  metadata?: unknown;
  changes?: AuditFieldChangeInput[];
}) {
  // The public demo identity is not a row in User, so it cannot be the actor's
  // foreign key; its name and e-mail still say who acted.
  const actorId = input.actor && input.actor.id !== PUBLIC_DEMO_USER_ID ? input.actor.id : null;
  return prisma.auditEvent
    .create({
      data: {
        actorId,
        actorEmail: input.actor?.email ?? null,
        actorName: input.actor?.name ?? null,
        action: input.action,
        objectType: input.objectType,
        objectId: input.objectId ?? null,
        projectId: input.projectId ?? null,
        ipAddress: input.req?.ip ?? null,
        userAgent: input.req?.get("user-agent") ?? null,
        beforeValue:
          input.beforeValue === undefined ? undefined : toJsonValue(input.beforeValue),
        afterValue:
          input.afterValue === undefined ? undefined : toJsonValue(input.afterValue),
        metadata: input.metadata === undefined ? undefined : toJsonValue(input.metadata),
        changes:
          input.changes && input.changes.length > 0
            ? {
                create: input.changes.map((change) => ({
                  actorId,
                  projectId: input.projectId ?? null,
                  objectType: input.objectType,
                  objectId: input.objectId ?? null,
                  field: change.field,
                  oldValue:
                    change.oldValue === undefined
                      ? undefined
                      : toJsonValue(change.oldValue),
                  newValue:
                    change.newValue === undefined
                      ? undefined
                      : toJsonValue(change.newValue),
                  oldText: change.oldText ?? auditValueText(change.oldValue),
                  newText: change.newText ?? auditValueText(change.newValue),
                })),
              }
            : undefined,
      },
    })
    .catch((error) => {
      console.error("Не удалось записать audit event", error);
      return null;
    });
}
