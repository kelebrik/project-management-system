import type { z } from "zod";
import { wbsItemSchema } from "@pms/shared";
import { prisma } from "../db.js";

export type WbsOrderingItem = {
  id: string;
  code: string;
  wbsLevel: number | null;
};

export type WbsOrderingDependency = {
  predecessorId: string;
  successorId: string;
};

export type WbsRenumberRow = {
  id: string;
  level: number;
  parentId: string | null;
  code: string;
};

export const wbsDependencySnapshotSchemaShape = {
  predecessorId: "",
  successorId: "",
  type: "FS" as const,
  lagDays: 0,
};

export function levelFromWbsCode(code: string) {
  return Math.max(1, code.split(".").filter(Boolean).length);
}

export function levelFromWbsItem(item: { code: string; wbsLevel: number | null }) {
  return Math.max(1, item.wbsLevel ?? levelFromWbsCode(item.code));
}

export function buildWbsRenumberPlan(
  items: WbsOrderingItem[],
  dependencies: WbsOrderingDependency[] = [],
) {
  const counters: number[] = [];
  const parentByLevel = new Map<number, string>();
  const codeById = new Map<string, string>();
  const normalizedRows: WbsRenumberRow[] = [];

  for (const item of items) {
    const requestedLevel = item.wbsLevel ?? levelFromWbsCode(item.code);
    const level = Math.max(1, requestedLevel);
    while (counters.length < level - 1) counters.push(1);
    counters[level - 1] = (counters[level - 1] ?? 0) + 1;
    counters.length = level;

    let parentId: string | null = null;
    for (let parentLevel = level - 1; parentLevel >= 1; parentLevel -= 1) {
      const candidateParentId = parentByLevel.get(parentLevel);
      if (candidateParentId) {
        parentId = candidateParentId;
        break;
      }
    }

    for (const existingLevel of [...parentByLevel.keys()]) {
      if (existingLevel >= level) parentByLevel.delete(existingLevel);
    }
    parentByLevel.set(level, item.id);

    const code = counters.join(".");
    codeById.set(item.id, code);
    normalizedRows.push({ id: item.id, level, parentId, code });
  }

  const predecessorsBySuccessor = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const predecessorCode = codeById.get(dependency.predecessorId);
    if (!predecessorCode) continue;
    predecessorsBySuccessor.set(dependency.successorId, [
      ...(predecessorsBySuccessor.get(dependency.successorId) ?? []),
      predecessorCode,
    ]);
  }

  return { normalizedRows, predecessorsBySuccessor, codeById };
}

export async function renumberProjectWbs(projectId: string) {
  const items = await prisma.wbsItem.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const dependencies = await prisma.wbsDependency.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const { normalizedRows, predecessorsBySuccessor } = buildWbsRenumberPlan(
    items,
    dependencies,
  );

  await prisma.$transaction(async (tx) => {
    for (const row of normalizedRows) {
      await tx.wbsItem.update({
        where: { id: row.id },
        data: { code: `__renumber_${row.id}` },
      });
    }

    for (const row of normalizedRows) {
      const predecessors = predecessorsBySuccessor.get(row.id) ?? [];
      await tx.wbsItem.update({
        where: { id: row.id },
        data: {
          code: row.code,
          parentId: row.parentId,
          wbsLevel: row.level,
          predecessor1: predecessors[0] ?? null,
          predecessor2: predecessors[1] ?? null,
          predecessor3: predecessors[2] ?? null,
        },
      });
    }
  });

  return normalizedRows.length;
}

export async function getProjectWbsSnapshot(projectId: string) {
  const [wbsItems, wbsDependencies] = await Promise.all([
    prisma.wbsItem.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
    prisma.wbsDependency.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      include: {
        predecessor: { select: { id: true, code: true, title: true } },
        successor: { select: { id: true, code: true, title: true } },
      },
    }),
  ]);
  return { wbsItems, wbsDependencies };
}

export function wbsItemSnapshotData(
  projectId: string,
  item: z.infer<typeof wbsItemSchema> & { id: string },
) {
  return {
    id: item.id,
    projectId,
    parentId: item.parentId || null,
    code: item.code,
    title: item.title,
    type: item.type,
    status: item.status,
    owner: item.owner,
    startDate: item.startDate ? new Date(item.startDate) : null,
    dueDate: item.dueDate ? new Date(item.dueDate) : null,
    baselineStartDate: item.baselineStartDate ? new Date(item.baselineStartDate) : null,
    baselineDueDate: item.baselineDueDate ? new Date(item.baselineDueDate) : null,
    forecastStartDate: item.forecastStartDate ? new Date(item.forecastStartDate) : null,
    forecastDueDate: item.forecastDueDate ? new Date(item.forecastDueDate) : null,
    wbsLevel: item.wbsLevel ?? null,
    predecessor1: item.predecessor1 || null,
    predecessor2: item.predecessor2 || null,
    predecessor3: item.predecessor3 || null,
    leadLagDays: item.leadLagDays,
    workDays: item.workDays ?? null,
    calendarDays: item.calendarDays ?? null,
    excelStartDate: item.excelStartDate ? new Date(item.excelStartDate) : null,
    excelEndDate: item.excelEndDate ? new Date(item.excelEndDate) : null,
    planWorkDays: item.planWorkDays ?? null,
    planCalendarDays: item.planCalendarDays ?? null,
    calendarCode: item.calendarCode,
    templateColor: item.templateColor || null,
    priority: item.priority || null,
    plannedCost: item.plannedCost,
    forecastCost: item.forecastCost,
    progress: item.progress,
    jiraTicketKey: item.jiraTicketKey || null,
    jiraTicketUrl: item.jiraTicketUrl || null,
    description: item.description || null,
    sortOrder: item.sortOrder,
  };
}
