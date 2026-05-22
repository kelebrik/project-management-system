import type { z } from "zod";
import { wbsItemSchema } from "@pms/shared";
import { prisma } from "../db.js";
import { calculateWbsCriticalPath } from "./wbs-critical-path.js";

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

const WBS_PREDECESSOR_FIELDS = [
  "predecessor1",
  "predecessor2",
  "predecessor3",
  "predecessor4",
  "predecessor5",
  "predecessor6",
] as const;

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

function predecessorFieldPatch(predecessors: string[]) {
  return Object.fromEntries(
    WBS_PREDECESSOR_FIELDS.map((field, index) => [
      field,
      predecessors[index] ?? null,
    ]),
  );
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
          ...predecessorFieldPatch(predecessors),
        },
      });
    }
  });

  return normalizedRows.length;
}

export async function syncWbsPredecessorFields(projectId: string) {
  const dependencies = await prisma.wbsDependency.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      predecessor: { select: { code: true } },
    },
  });
  const predecessorsBySuccessor = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const current = predecessorsBySuccessor.get(dependency.successorId) ?? [];
    if (!current.includes(dependency.predecessor.code)) {
      current.push(dependency.predecessor.code);
    }
    predecessorsBySuccessor.set(dependency.successorId, current.slice(0, 6));
  }

  const items = await prisma.wbsItem.findMany({
    where: { projectId },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      await tx.wbsItem.update({
        where: { id: item.id },
        data: predecessorFieldPatch(predecessorsBySuccessor.get(item.id) ?? []),
      });
    }
  });
}

export async function getProjectWbsSnapshot(projectId: string) {
  const [wbsItems, wbsDependencies, calendarOverrides] = await Promise.all([
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
    prisma.projectCalendarOverride.findMany({
      where: { projectId },
      select: {
        calendarCode: true,
        date: true,
        isWorkingDay: true,
      },
    }),
  ]);
  return {
    wbsItems,
    wbsDependencies,
    criticalPath: calculateWbsCriticalPath(
      wbsItems.map((item) => ({
        id: item.id,
        code: item.code,
        title: item.title,
        type: item.type,
        startDate: item.startDate,
        dueDate: item.dueDate,
        workDays: item.workDays,
        calendarCode: item.calendarCode,
        sortOrder: item.sortOrder,
        predecessor1: item.predecessor1,
        predecessor2: item.predecessor2,
        predecessor3: item.predecessor3,
        predecessor4: item.predecessor4,
        predecessor5: item.predecessor5,
        predecessor6: item.predecessor6,
        leadLagDays: item.leadLagDays,
      })),
      wbsDependencies.map((dependency) => ({
        id: dependency.id,
        predecessorId: dependency.predecessorId,
        successorId: dependency.successorId,
        type: dependency.type,
        lagDays: dependency.lagDays,
      })),
      calendarOverrides,
    ),
  };
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
    predecessor4: item.predecessor4 || null,
    predecessor5: item.predecessor5 || null,
    predecessor6: item.predecessor6 || null,
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
