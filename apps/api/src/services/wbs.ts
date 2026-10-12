import type { z } from "zod";
import { wbsItemSchema, type WbsItemStatus, type WbsItemType } from "@pms/shared";
import { prisma } from "../db.js";
import { safeCalculateWbsCriticalPath } from "./wbs-critical-path.js";
import {
  buildWbsRenumberPlan,
  levelFromWbsCode,
  levelFromWbsItem,
  type WbsOrderingDependency,
  type WbsOrderingItem,
  type WbsRenumberRow,
} from "./wbs-ordering.js";
import { assertProjectIssueLinkedWbsPlan } from "./wbs-issue-links.js";
import { bulkUpdateWbsItems } from "./wbs-bulk-write.js";
import { lockProjectStructure, structureTransaction, type StructureDb } from "./wbs-structure-write.js";

export type { WbsOrderingDependency, WbsOrderingItem, WbsRenumberRow };
export { buildWbsRenumberPlan, levelFromWbsCode, levelFromWbsItem };

export type WbsStatusAggregationItem = {
  id: string;
  parentId: string | null;
  type: WbsItemType;
  status: WbsItemStatus;
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

function predecessorFieldPatch(predecessors: string[]) {
  return Object.fromEntries(
    WBS_PREDECESSOR_FIELDS.map((field, index) => [
      field,
      predecessors[index] ?? null,
    ]),
  ) as Record<(typeof WBS_PREDECESSOR_FIELDS)[number], string | null>;
}

function aggregateParentStatus(statuses: WbsItemStatus[]): WbsItemStatus | null {
  const activeStatuses = statuses.filter((status) => status !== "CANCELLED");
  if (activeStatuses.length === 0) return null;
  if (activeStatuses.some((status) => status === "AT_RISK")) return "AT_RISK";
  if (activeStatuses.some((status) => status === "BLOCKED")) return "BLOCKED";
  if (activeStatuses.some((status) => status === "IN_PROGRESS")) {
    return "IN_PROGRESS";
  }
  if (activeStatuses.some((status) => status === "IN_REVIEW")) {
    return "IN_REVIEW";
  }
  if (activeStatuses.every((status) => status === "DONE")) return "DONE";
  if (activeStatuses.some((status) => status === "DONE")) return "IN_PROGRESS";
  return "NOT_STARTED";
}

export function calculateWbsHierarchyStatusUpdates(
  items: WbsStatusAggregationItem[],
) {
  const childrenByParent = new Map<string, WbsStatusAggregationItem[]>();
  const itemById = new Map(items.map((item) => [item.id, item]));

  for (const item of items) {
    if (!item.parentId) continue;
    childrenByParent.set(item.parentId, [
      ...(childrenByParent.get(item.parentId) ?? []),
      item,
    ]);
  }

  const effectiveStatusesById = new Map<string, WbsItemStatus>();
  const effectiveStatusOf = (
    item: WbsStatusAggregationItem,
    seen = new Set<string>(),
  ): WbsItemStatus => {
    const knownStatus = effectiveStatusesById.get(item.id);
    if (knownStatus) return knownStatus;
    if (seen.has(item.id)) return item.status;

    const children = childrenByParent.get(item.id) ?? [];
    const nextSeen = new Set(seen);
    nextSeen.add(item.id);
    const childStatuses = children.map((child) =>
      effectiveStatusOf(child, nextSeen),
    );
    const nextStatus = aggregateParentStatus(childStatuses) ?? item.status;
    effectiveStatusesById.set(item.id, nextStatus);
    return nextStatus;
  };

  items.forEach((item) => effectiveStatusOf(item));

  return items
    .filter((item) => item.type === "PHASE" || item.type === "WORK_PACKAGE")
    .map((item) => ({
      id: item.id,
      status: effectiveStatusesById.get(item.id) ?? item.status,
    }))
    .filter((update) => update.status !== itemById.get(update.id)?.status);
}

export async function recalculateProjectWbsHierarchyStatuses(projectId: string, db?: StructureDb): Promise<number> {
  if (!db) return structureTransaction(async (tx) => {
    await lockProjectStructure(tx, projectId);
    return recalculateProjectWbsHierarchyStatuses(projectId, tx);
  });
  const items = await db.wbsItem.findMany({
    where: { projectId },
    select: {
      id: true,
      parentId: true,
      type: true,
      status: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

  const updates = calculateWbsHierarchyStatusUpdates(items);
  if (updates.length === 0) return 0;

  const closedAt = new Date();
  await bulkUpdateWbsItems(
    db,
    projectId,
    updates.map((update) => ({ id: update.id, status: update.status, closedAt: update.status === "DONE" ? closedAt : null })),
    ["status", "closedAt"],
  );

  return updates.length;
}

export async function renumberProjectWbs(projectId: string, db?: StructureDb): Promise<number> {
  if (!db) return structureTransaction(async (tx) => {
    await lockProjectStructure(tx, projectId);
    return renumberProjectWbs(projectId, tx);
  });
  const items = await db.wbsItem.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const dependencies = await db.wbsDependency.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  await assertProjectIssueLinkedWbsPlan(projectId, items, db);

  const { normalizedRows, predecessorsBySuccessor } = buildWbsRenumberPlan(
    items,
    dependencies,
  );

  // Only rows whose code, parent, level or predecessors move are written. A
  // moving code first takes a temporary one, so no two rows share a code mid-way.
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const changedRows = normalizedRows
    .map((row) => ({ id: row.id, code: row.code, parentId: row.parentId, wbsLevel: row.level, ...predecessorFieldPatch(predecessorsBySuccessor.get(row.id) ?? []) }))
    .filter((row) => {
      const item = itemsById.get(row.id);
      return !item || item.code !== row.code || item.parentId !== row.parentId || item.wbsLevel !== row.wbsLevel
        || WBS_PREDECESSOR_FIELDS.some((field) => item[field] !== row[field]);
    });
  const movingCodes = changedRows.filter((row) => itemsById.get(row.id)?.code !== row.code);
  await bulkUpdateWbsItems(db, projectId, movingCodes.map((row) => ({ id: row.id, code: `__renumber_${row.id}` })), ["code"]);
  await bulkUpdateWbsItems(db, projectId, changedRows, ["code", "parentId", "wbsLevel", ...WBS_PREDECESSOR_FIELDS]);

  return normalizedRows.length;
}

export async function syncWbsPredecessorFields(projectId: string, db?: StructureDb): Promise<void> {
  if (!db) return structureTransaction(async (tx) => {
    await lockProjectStructure(tx, projectId);
    return syncWbsPredecessorFields(projectId, tx);
  });
  const dependencies = await db.wbsDependency.findMany({
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

  const items = await db.wbsItem.findMany({
    where: { projectId },
    select: { id: true, predecessor1: true, predecessor2: true, predecessor3: true, predecessor4: true, predecessor5: true, predecessor6: true },
  });

  const changedRows = items
    .map((item) => ({ item, row: { id: item.id, ...predecessorFieldPatch(predecessorsBySuccessor.get(item.id) ?? []) } }))
    .filter(({ item, row }) => WBS_PREDECESSOR_FIELDS.some((field) => item[field] !== row[field]))
    .map(({ row }) => row);
  await bulkUpdateWbsItems(db, projectId, changedRows, [...WBS_PREDECESSOR_FIELDS]);
}

export async function getProjectWbsSnapshot(projectId: string, db: StructureDb = prisma) {
  const [wbsItems, wbsDependencies, calendarOverrides] = await Promise.all([
    db.wbsItem.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
    db.wbsDependency.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        predecessor: { select: { id: true, code: true, title: true } },
        successor: { select: { id: true, code: true, title: true } },
      },
    }),
    db.projectCalendarOverride.findMany({
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
    criticalPath: safeCalculateWbsCriticalPath(
      wbsItems.map((item) => ({
        id: item.id,
        code: item.code,
        title: item.title,
        type: item.type,
        status: item.status,
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
  item: z.infer<typeof wbsItemSchema> & {
    id: string;
    closedAt?: string | Date | null;
  },
) {
  const closedAt =
    item.closedAt === undefined
      ? item.status === "DONE" && item.dueDate
        ? new Date(item.dueDate)
        : null
      : item.closedAt
        ? new Date(item.closedAt)
        : null;

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
    effortPercent: item.effortPercent,
    plannedCost: item.plannedCost,
    forecastCost: item.forecastCost,
    progress: item.progress,
    jiraTicketKey: item.jiraTicketKey || null,
    jiraTicketUrl: item.jiraTicketUrl || null,
    mattermostUrl: item.mattermostUrl?.trim() || null,
    description: item.description || null,
    comment: item.comment?.trim() || null,
    closedAt,
    sortOrder: item.sortOrder,
  };
}
