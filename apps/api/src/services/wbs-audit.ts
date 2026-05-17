import { Prisma, type WbsCommandType } from "@prisma/client";
import { prisma } from "../db.js";

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function recordWbsCommand(input: {
  projectId: string;
  type: WbsCommandType;
  payload: unknown;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
}) {
  await prisma.wbsCommand.create({
    data: {
      projectId: input.projectId,
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
