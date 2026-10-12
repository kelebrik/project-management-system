import type { PrismaClient } from "@prisma/client";
import { lockProjectStructure, structureTransaction } from "./wbs-structure-write.js";

const SYSTEM_GOAL_LABELS = [
  { title: "Релиз заводской прошивки", labels: ["MP"] },
  { title: "Первая ОТА готова", labels: ["ota"] },
] as const;

/**
 * The labels the system aggregates look for on the project's two system
 * goals, set once when empty. A Structure write of its own, opened only when
 * there is something to set, so the browser learns of it like of any edit.
 */
export async function ensureSystemGoalLabels(client: PrismaClient, projectId: string) {
  const pending = await client.wbsItem.count({
    where: { projectId, type: "GOAL", title: { in: SYSTEM_GOAL_LABELS.map((goal) => goal.title) }, jiraGoalLabels: { isEmpty: true } },
  });
  if (pending === 0) return;
  await structureTransaction(async (transaction) => {
    await lockProjectStructure(transaction, projectId);
    for (const goal of SYSTEM_GOAL_LABELS) {
      await transaction.wbsItem.updateMany({
        where: { projectId, type: "GOAL", title: goal.title, jiraGoalLabels: { isEmpty: true } },
        data: { jiraGoalLabels: [...goal.labels] },
      });
    }
  }, { client });
}
