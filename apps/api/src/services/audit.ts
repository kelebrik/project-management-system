import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { prisma } from "../db.js";

type AuditActor = {
  id: string;
  email: string;
  name: string;
} | null;

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
}) {
  await prisma.auditEvent
    .create({
      data: {
        actorId: input.actor?.id ?? null,
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
      },
    })
    .catch((error) => {
      console.error("Не удалось записать audit event", error);
    });
}
