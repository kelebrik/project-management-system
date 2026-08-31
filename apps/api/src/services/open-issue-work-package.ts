import { Prisma, type WbsItem, type WbsItemType } from '@prisma/client';

import { buildWbsRenumberPlan, levelFromWbsItem } from './wbs-ordering.js';

type PlacementItem = Pick<
  WbsItem,
  'id' | 'parentId' | 'code' | 'wbsLevel' | 'type' | 'sortOrder' | 'createdAt'
>;

export type IssueWorkPackagePlacement = {
  insertIndex: number;
  level: number;
  orderedItems: PlacementItem[];
  movingSubtree: PlacementItem[];
};

function byStructureOrder(left: PlacementItem, right: PlacementItem) {
  return left.sortOrder - right.sortOrder
    || left.createdAt.getTime() - right.createdAt.getTime()
    || left.id.localeCompare(right.id);
}

function extractMovingSubtree(
  orderedItems: PlacementItem[],
  movingItemId?: string | null,
) {
  if (!movingItemId) {
    return { orderedItems, movingSubtree: [] as PlacementItem[] };
  }
  const movingIndex = orderedItems.findIndex((item) => item.id === movingItemId);
  if (movingIndex === -1) {
    throw new Error('Связанный пакет работ не найден в Структуре проекта');
  }
  const movingLevel = levelFromWbsItem(orderedItems[movingIndex]);
  let movingEndIndex = orderedItems.length;
  for (let index = movingIndex + 1; index < orderedItems.length; index += 1) {
    if (levelFromWbsItem(orderedItems[index]) <= movingLevel) {
      movingEndIndex = index;
      break;
    }
  }
  return {
    orderedItems: [
      ...orderedItems.slice(0, movingIndex),
      ...orderedItems.slice(movingEndIndex),
    ],
    movingSubtree: orderedItems.slice(movingIndex, movingEndIndex),
  };
}

export function planIssueWorkPackagePlacement(
  items: PlacementItem[],
  phaseId: string,
  movingItemId?: string | null,
): IssueWorkPackagePlacement {
  const extracted = extractMovingSubtree([...items].sort(byStructureOrder), movingItemId);
  const orderedItems = extracted.orderedItems;
  const phaseIndex = orderedItems.findIndex((item) => item.id === phaseId);
  if (phaseIndex === -1) {
    throw new Error('Выбранная фаза не найдена в Структуре проекта');
  }

  const phase = orderedItems[phaseIndex];
  if (phase.type !== 'PHASE') {
    throw new Error('Для открытого вопроса можно выбрать только фазу проекта');
  }

  const phaseLevel = levelFromWbsItem(phase);
  let phaseEndIndex = orderedItems.length;
  for (let index = phaseIndex + 1; index < orderedItems.length; index += 1) {
    if (levelFromWbsItem(orderedItems[index]) <= phaseLevel) {
      phaseEndIndex = index;
      break;
    }
  }

  let lastBoundaryIndex: number | null = null;
  for (let index = phaseIndex + 1; index < phaseEndIndex; index += 1) {
    const item = orderedItems[index];
    if (
      item.parentId === phaseId
      && (item.type === 'MILESTONE' || item.type === 'GOAL')
    ) {
      lastBoundaryIndex = index;
    }
  }

  return {
    insertIndex: lastBoundaryIndex ?? phaseEndIndex,
    level: phaseLevel + 1,
    orderedItems,
    movingSubtree: extracted.movingSubtree,
  };
}

type UpsertIssueWorkPackageInput = {
  projectId: string;
  phaseId: string;
  workPackageId?: string | null;
  title: string;
  owner: string;
  dueDate: Date | null;
};

export type IssueWorkPackageMutation = {
  workPackageId: string;
  kind: 'created' | 'moved' | 'updated' | 'unchanged';
};

export function buildIssueWorkPackageOrder(
  placement: IssueWorkPackagePlacement,
  phaseId: string,
  workPackage: PlacementItem,
) {
  const previousLevel = placement.movingSubtree.length > 0
    ? levelFromWbsItem(placement.movingSubtree[0])
    : placement.level;
  const levelDelta = placement.level - previousLevel;
  const movedSubtree = placement.movingSubtree.length > 0
    ? placement.movingSubtree.map((item, index) => ({
        ...item,
        parentId: index === 0 ? phaseId : item.parentId,
        wbsLevel: levelFromWbsItem(item) + levelDelta,
      }))
    : [{ ...workPackage, parentId: phaseId, wbsLevel: placement.level }];
  return [
    ...placement.orderedItems.slice(0, placement.insertIndex),
    ...movedSubtree,
    ...placement.orderedItems.slice(placement.insertIndex),
  ];
}

function sameDate(left: Date | null, right: Date | null) {
  return left?.getTime() === right?.getTime();
}

async function persistStructureOrder(
  tx: Prisma.TransactionClient,
  projectId: string,
  orderedItems: PlacementItem[],
) {
  const dependencies = await tx.wbsDependency.findMany({
    where: { projectId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const { normalizedRows, predecessorsBySuccessor } = buildWbsRenumberPlan(
    orderedItems,
    dependencies,
  );
  if (normalizedRows.length === 0) return;

  await tx.$executeRaw(Prisma.sql`
    UPDATE "WbsItem"
    SET "code" = '__renumber_' || "id"
    WHERE "projectId" = ${projectId}
  `);

  const rowsJson = JSON.stringify(normalizedRows.map((row, index) => {
    const predecessors = predecessorsBySuccessor.get(row.id) ?? [];
    const paddedPredecessors = Array.from(
      { length: 6 },
      (_, predecessorIndex) => predecessors[predecessorIndex] ?? null,
    );
    return {
      id: row.id,
      code: row.code,
      parentId: row.parentId,
      wbsLevel: row.level,
      sortOrder: (index + 1) * 10,
      predecessor1: paddedPredecessors[0],
      predecessor2: paddedPredecessors[1],
      predecessor3: paddedPredecessors[2],
      predecessor4: paddedPredecessors[3],
      predecessor5: paddedPredecessors[4],
      predecessor6: paddedPredecessors[5],
    };
  }));
  await tx.$executeRaw(Prisma.sql`
    UPDATE "WbsItem" AS item
    SET
      "code" = next."code",
      "parentId" = next."parentId",
      "wbsLevel" = next."wbsLevel",
      "sortOrder" = next."sortOrder",
      "predecessor1" = next."predecessor1",
      "predecessor2" = next."predecessor2",
      "predecessor3" = next."predecessor3",
      "predecessor4" = next."predecessor4",
      "predecessor5" = next."predecessor5",
      "predecessor6" = next."predecessor6",
      "updatedAt" = CURRENT_TIMESTAMP
    FROM jsonb_to_recordset(CAST(${rowsJson} AS jsonb)) AS next(
      "id" text,
      "code" text,
      "parentId" text,
      "wbsLevel" integer,
      "sortOrder" integer,
      "predecessor1" text,
      "predecessor2" text,
      "predecessor3" text,
      "predecessor4" text,
      "predecessor5" text,
      "predecessor6" text
    )
    WHERE item."id" = next."id"
  `);
}

export async function upsertIssueWorkPackage(
  tx: Prisma.TransactionClient,
  input: UpsertIssueWorkPackageInput,
): Promise<IssueWorkPackageMutation> {
  const items = await tx.wbsItem.findMany({
    where: { projectId: input.projectId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  const phase = items.find((item) => item.id === input.phaseId);
  if (!phase || phase.type !== 'PHASE') {
    throw new Error('Выбранная фаза не найдена в Структуре проекта');
  }

  const currentWorkPackage = input.workPackageId
    ? items.find((item) => item.id === input.workPackageId)
    : null;
  if (input.workPackageId && (!currentWorkPackage || currentWorkPackage.type !== 'WORK_PACKAGE')) {
    throw new Error('Связанный пакет работ не найден в Структуре проекта');
  }

  const metadataChanged = Boolean(currentWorkPackage && (
    currentWorkPackage.title !== input.title
    || currentWorkPackage.owner !== input.owner
    || !sameDate(currentWorkPackage.dueDate, input.dueDate)
  ));
  if (currentWorkPackage?.parentId === input.phaseId) {
    if (metadataChanged) {
      await tx.wbsItem.update({
        where: { id: currentWorkPackage.id },
        data: {
          title: input.title,
          owner: input.owner,
          dueDate: input.dueDate,
          forecastDueDate: input.dueDate,
        },
      });
    }
    return {
      workPackageId: currentWorkPackage.id,
      kind: metadataChanged ? 'updated' : 'unchanged',
    };
  }

  const placement = planIssueWorkPackagePlacement(
    items,
    input.phaseId,
    currentWorkPackage?.id,
  );

  let workPackage: WbsItem;
  if (currentWorkPackage) {
    workPackage = await tx.wbsItem.update({
      where: { id: currentWorkPackage.id },
      data: {
        parentId: input.phaseId,
        title: input.title,
        owner: input.owner,
        dueDate: input.dueDate,
        forecastDueDate: input.dueDate,
      },
    });
  } else {
    const temporaryCode = `__issue_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    workPackage = await tx.wbsItem.create({
      data: {
        projectId: input.projectId,
        parentId: input.phaseId,
        code: temporaryCode,
        title: input.title,
        type: 'WORK_PACKAGE' satisfies WbsItemType,
        status: 'NOT_STARTED',
        owner: input.owner,
        dueDate: input.dueDate,
        baselineDueDate: input.dueDate,
        forecastDueDate: input.dueDate,
        wbsLevel: placement.level,
        effortPercent: 0,
        sortOrder: 0,
      },
    });
  }

  const nextOrder = buildIssueWorkPackageOrder(
    placement,
    input.phaseId,
    workPackage,
  );
  await persistStructureOrder(tx, input.projectId, nextOrder);

  return {
    workPackageId: workPackage.id,
    kind: currentWorkPackage ? 'moved' : 'created',
  };
}
