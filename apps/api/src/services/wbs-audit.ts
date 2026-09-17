import { Prisma, type WbsCommandType } from "@prisma/client";
import { PUBLIC_DEMO_USER_ID } from "@pms/shared";
import { prisma } from "../db.js";

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function recordWbsCommand(input: {
  projectId: string;
  userId?: string;
  type: WbsCommandType;
  payload: unknown;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
}) {
  // The public demo identity is intentionally virtual and has no User row.
  // Keep the audit entry, but leave the nullable FK empty instead of causing
  // every demo WBS save to fail with PostgreSQL P2003.
  const userId = input.userId === PUBLIC_DEMO_USER_ID ? undefined : input.userId;
  await prisma.wbsCommand.create({
    data: {
      projectId: input.projectId,
      userId,
      type: input.type,
      payload: toJsonValue(input.payload),
      beforeSnapshot:
        input.beforeSnapshot === undefined
          ? undefined
          : toJsonValue(input.beforeSnapshot),
      afterSnapshot:
        input.afterSnapshot === undefined ? undefined : toJsonValue(input.afterSnapshot),
    },
  });
}
