import {
  Prisma,
  type ProjectCalendarCode,
  type WbsDependency,
  type WbsDependencyType,
  type WbsItem,
  type WbsItemStatus,
  type WbsItemType,
} from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../db.js';
import { recordAuditEvent } from './audit.js';
import {
  getProjectWbsSnapshot,
  recalculateProjectWbsHierarchyStatuses,
  renumberProjectWbs,
} from './wbs.js';
import { recalculateProjectWbsSchedule } from './wbs-schedule.js';

const tombstoneRetentionDays = 30;
const dayMs = 24 * 60 * 60 * 1000;

type AuditActor = {
  id: string;
  email: string;
  name: string;
} | null;

type SerializedWbsItem = Record<string, unknown> & {
  id: string;
  parentId?: string | null;
  code?: string;
  title?: string;
  sortOrder?: number;
  wbsLevel?: number | null;
};

type SerializedWbsDependency = Record<string, unknown> & {
  predecessorId: string;
  successorId: string;
  type?: string;
  lagDays?: number;
};

export class WbsTombstoneRestoreError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function nullableDate(value: unknown) {
  return typeof value === 'string' || value instanceof Date ? new Date(value) : null;
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function decimalValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return value;
  return 0;
}

function wbsType(value: unknown): WbsItemType {
  const allowed = new Set(['PHASE', 'WORK_PACKAGE', 'DELIVERABLE', 'MILESTONE', 'GOAL', 'TASK']);
  return (typeof value === 'string' && allowed.has(value) ? value : 'TASK') as WbsItemType;
}

function wbsStatus(value: unknown): WbsItemStatus {
  const allowed = new Set([
    'NOT_STARTED',
    'IN_PROGRESS',
    'IN_REVIEW',
    'AT_RISK',
    'BLOCKED',
    'DONE',
    'CANCELLED',
  ]);
  return (typeof value === 'string' && allowed.has(value) ? value : 'NOT_STARTED') as WbsItemStatus;
}

export function normalizeWbsTombstoneCalendarCode(
  value: unknown,
): ProjectCalendarCode {
  return value === 'CN' || value === 'RU_CN' ? value : 'RU';
}

function dependencyType(value: unknown): WbsDependencyType {
  const allowed = new Set(['FS', 'SS', 'FF', 'SF']);
  return (typeof value === 'string' && allowed.has(value) ? value : 'FS') as WbsDependencyType;
}

function originalLevel(item: SerializedWbsItem) {
  if (typeof item.wbsLevel === 'number' && Number.isFinite(item.wbsLevel)) {
    return Math.max(1, item.wbsLevel);
  }
  return Math.max(1, stringValue(item.code).split('.').filter(Boolean).length);
}

function sortDeletedItems(items: SerializedWbsItem[]) {
  return [...items].sort((left, right) => {
    const sortDelta = numberValue(left.sortOrder) - numberValue(right.sortOrder);
    if (sortDelta !== 0) return sortDelta;
    const levelDelta = originalLevel(left) - originalLevel(right);
    if (levelDelta !== 0) return levelDelta;
    return stringValue(left.code).localeCompare(stringValue(right.code));
  });
}

function restoreItemData(
  item: SerializedWbsItem,
  projectId: string,
  parentId: string,
  level: number,
  sortOrder: number,
) {
  return {
    projectId,
    parentId,
    code: `__restore_${item.id}_${Date.now()}`,
    title: stringValue(item.title, 'Восстановленный элемент'),
    type: wbsType(item.type),
    status: wbsStatus(item.status),
    owner: stringValue(item.owner),
    startDate: nullableDate(item.startDate),
    dueDate: nullableDate(item.dueDate),
    baselineStartDate: nullableDate(item.baselineStartDate),
    baselineDueDate: nullableDate(item.baselineDueDate),
    forecastStartDate: nullableDate(item.forecastStartDate),
    forecastDueDate: nullableDate(item.forecastDueDate),
    wbsLevel: level,
    predecessor1: null,
    predecessor2: null,
    predecessor3: null,
    predecessor4: null,
    predecessor5: null,
    predecessor6: null,
    leadLagDays: numberValue(item.leadLagDays),
    workDays: nullableNumber(item.workDays),
    calendarDays: nullableNumber(item.calendarDays),
    excelStartDate: nullableDate(item.excelStartDate),
    excelEndDate: nullableDate(item.excelEndDate),
    planWorkDays: nullableNumber(item.planWorkDays),
    planCalendarDays: nullableNumber(item.planCalendarDays),
    calendarCode: normalizeWbsTombstoneCalendarCode(item.calendarCode),
    templateColor: nullableString(item.templateColor),
    priority: nullableString(item.priority),
    effortPercent: numberValue(item.effortPercent),
    plannedCost: decimalValue(item.plannedCost),
    forecastCost: decimalValue(item.forecastCost),
    progress: numberValue(item.progress),
    jiraTicketKey: nullableString(item.jiraTicketKey),
    jiraTicketUrl: nullableString(item.jiraTicketUrl),
    description: nullableString(item.description),
    closedAt: nullableDate(item.closedAt),
    sortOrder,
  };
}

export function wbsTombstoneExpiresAt(now = new Date()) {
  return new Date(now.getTime() + tombstoneRetentionDays * dayMs);
}

export async function pruneExpiredWbsTombstones(now = new Date()) {
  await prisma.wbsTombstone.deleteMany({
    where: { expiresAt: { lt: now } },
  });
}

export async function createWbsTombstone(input: {
  projectId: string;
  deletedById?: string | null;
  items: WbsItem[];
  dependencies?: WbsDependency[];
}) {
  await pruneExpiredWbsTombstones();
  const sortedItems = sortDeletedItems(input.items as unknown as SerializedWbsItem[]);
  const itemIds = sortedItems.map((item) => item.id);
  return prisma.wbsTombstone.create({
    data: {
      projectId: input.projectId,
      deletedById: input.deletedById ?? null,
      itemIds: toJsonValue(itemIds),
      itemCount: sortedItems.length,
      items: toJsonValue(sortedItems),
      dependencies:
        input.dependencies && input.dependencies.length > 0
          ? toJsonValue(input.dependencies)
          : undefined,
      expiresAt: wbsTombstoneExpiresAt(),
    },
  });
}

export async function attachAuditEventToWbsTombstone(
  tombstoneId: string,
  auditEventId: string,
) {
  await prisma.wbsTombstone
    .update({
      where: { id: tombstoneId },
      data: { auditEventId },
    })
    .catch((error) => {
      console.error('Не удалось связать WBS tombstone с audit event', error);
    });
}

export async function restoreWbsTombstone(input: {
  tombstoneId: string;
  actor: AuditActor;
  req?: Request;
}) {
  await pruneExpiredWbsTombstones();
  const tombstone = await prisma.wbsTombstone.findUnique({
    where: { id: input.tombstoneId },
  });
  if (!tombstone) {
    throw new WbsTombstoneRestoreError('Удаленный элемент уже недоступен для восстановления', 404);
  }
  if (tombstone.restoredAt) {
    throw new WbsTombstoneRestoreError('Удаленный элемент уже восстановлен', 409);
  }
  if (tombstone.expiresAt.getTime() < Date.now()) {
    await prisma.wbsTombstone.delete({ where: { id: tombstone.id } }).catch(() => undefined);
    throw new WbsTombstoneRestoreError('Срок хранения удаленного элемента истек', 410);
  }

  const items = sortDeletedItems(asArray<SerializedWbsItem>(tombstone.items));
  if (items.length === 0) {
    throw new WbsTombstoneRestoreError('В tombstone нет элементов для восстановления', 400);
  }

  const project = await prisma.project.findUnique({
    where: { id: tombstone.projectId },
    select: { id: true, code: true },
  });
  if (!project) {
    throw new WbsTombstoneRestoreError('Проект для восстановления не найден', 404);
  }

  const maxSort = await prisma.wbsItem.aggregate({
    where: { projectId: tombstone.projectId },
    _max: { sortOrder: true },
  });
  const restoredAt = new Date();
  const itemIds = new Set(items.map((item) => item.id));
  const restoredIdByOriginalId = new Map<string, string>();
  const restoredLevelByOriginalId = new Map<string, number>();
  let nextSortOrder = (maxSort._max.sortOrder ?? 0) + 10;

  const restoreResult = await prisma.$transaction(async (tx) => {
    const claim = await tx.wbsTombstone.updateMany({
      where: {
        id: tombstone.id,
        restoredAt: null,
        expiresAt: { gt: restoredAt },
      },
      data: {
        restoredAt,
        restoredById: input.actor?.id ?? null,
      },
    });
    if (claim.count === 0) {
      throw new WbsTombstoneRestoreError('Удаленный элемент уже восстановлен или недоступен', 409);
    }

    const restoredRoot = await tx.wbsItem.create({
      data: {
        projectId: tombstone.projectId,
        parentId: null,
        code: `__restore_root_${tombstone.id}`,
        title: `Восстановленные элементы ${restoredAt.toISOString().slice(0, 16).replace('T', ' ')}`,
        type: 'PHASE',
        status: 'NOT_STARTED',
        owner: input.actor?.name ?? '',
        wbsLevel: 1,
        effortPercent: 0,
        sortOrder: nextSortOrder,
      },
    });

    const remaining = [...items];
    while (remaining.length > 0) {
      let restoredInPass = 0;

      for (let index = 0; index < remaining.length; index += 1) {
        const item = remaining[index];
        const parentOriginalId = typeof item.parentId === 'string' ? item.parentId : null;
        if (
          parentOriginalId &&
          itemIds.has(parentOriginalId) &&
          !restoredIdByOriginalId.has(parentOriginalId)
        ) {
          continue;
        }

        const parentId =
          parentOriginalId && restoredIdByOriginalId.has(parentOriginalId)
            ? restoredIdByOriginalId.get(parentOriginalId)!
            : restoredRoot.id;
        const parentLevel =
          parentOriginalId && restoredLevelByOriginalId.has(parentOriginalId)
            ? restoredLevelByOriginalId.get(parentOriginalId)!
            : 1;
        nextSortOrder += 10;
        const restoredItem = await tx.wbsItem.create({
          data: restoreItemData(
            item,
            tombstone.projectId,
            parentId,
            parentLevel + 1,
            nextSortOrder,
          ),
        });
        restoredIdByOriginalId.set(item.id, restoredItem.id);
        restoredLevelByOriginalId.set(item.id, parentLevel + 1);
        remaining.splice(index, 1);
        index -= 1;
        restoredInPass += 1;
      }

      if (restoredInPass === 0) {
        const item = remaining.shift();
        if (!item) break;
        nextSortOrder += 10;
        const restoredItem = await tx.wbsItem.create({
          data: restoreItemData(item, tombstone.projectId, restoredRoot.id, 2, nextSortOrder),
        });
        restoredIdByOriginalId.set(item.id, restoredItem.id);
        restoredLevelByOriginalId.set(item.id, 2);
      }
    }

    const dependencies = asArray<SerializedWbsDependency>(tombstone.dependencies);
    for (const dependency of dependencies) {
      const predecessorId = restoredIdByOriginalId.get(dependency.predecessorId);
      const successorId = restoredIdByOriginalId.get(dependency.successorId);
      if (!predecessorId || !successorId) continue;
      await tx.wbsDependency.create({
        data: {
          projectId: tombstone.projectId,
          predecessorId,
          successorId,
          type: dependencyType(dependency.type),
          lagDays: numberValue(dependency.lagDays),
        },
      });
    }

    await tx.wbsTombstone.update({
      where: { id: tombstone.id },
      data: {
        restoredRootId: restoredRoot.id,
      },
    });

    return {
      restoredRoot,
      restoredItemCount: restoredIdByOriginalId.size,
      restoredIds: [...restoredIdByOriginalId.values()],
    };
  });

  await renumberProjectWbs(tombstone.projectId);
  await recalculateProjectWbsSchedule(tombstone.projectId);
  await recalculateProjectWbsHierarchyStatuses(tombstone.projectId);
  const snapshot = await getProjectWbsSnapshot(tombstone.projectId);

  await recordAuditEvent({
    req: input.req,
    actor: input.actor,
    action: 'wbs_item.restore',
    objectType: 'WbsTombstone',
    objectId: tombstone.id,
    projectId: tombstone.projectId,
    beforeValue: tombstone,
    afterValue: {
      restoredRootId: restoreResult.restoredRoot.id,
      restoredItemCount: restoreResult.restoredItemCount,
      restoredIds: restoreResult.restoredIds,
    },
    metadata: {
      sourceAuditEventId: tombstone.auditEventId,
      itemCount: tombstone.itemCount,
    },
  });

  return {
    projectId: tombstone.projectId,
    restoredRootId: restoreResult.restoredRoot.id,
    restoredItemCount: restoreResult.restoredItemCount,
    snapshot,
  };
}
