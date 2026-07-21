import type { Prisma } from '@prisma/client';

import { buildWbsRenumberPlan } from './wbs-ordering.js';

export type CurrentStructureCopySelection = {
  projectId: string;
  phaseIds: string[] | null;
};

type SelectableStructureItem = {
  id: string;
  parentId: string | null;
  type: string;
};

export function selectCurrentStructureItems<T extends SelectableStructureItem>(
  items: T[],
  phaseIds: string[] | null,
) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const childrenByParentId = new Map<string | null, T[]>();
  for (const item of items) {
    const children = childrenByParentId.get(item.parentId) ?? [];
    children.push(item);
    childrenByParentId.set(item.parentId, children);
  }

  let rootIds: string[];
  if (phaseIds === null) {
    rootIds = items
      .filter((item) => !item.parentId || !itemById.has(item.parentId))
      .map((item) => item.id);
  } else {
    const uniquePhaseIds = [...new Set(phaseIds)];
    if (uniquePhaseIds.length !== phaseIds.length) {
      throw new Error('Выбранная фаза указана несколько раз');
    }
    for (const phaseId of uniquePhaseIds) {
      const phase = itemById.get(phaseId);
      if (!phase || phase.type !== 'PHASE') {
        throw new Error('Выбранная фаза не найдена в текущей Структуре проекта');
      }
    }
    const selectedPhaseIds = new Set(uniquePhaseIds);
    rootIds = uniquePhaseIds.filter((phaseId) => {
      let parentId = itemById.get(phaseId)?.parentId ?? null;
      const visited = new Set<string>();
      while (parentId && !visited.has(parentId)) {
        if (selectedPhaseIds.has(parentId)) return false;
        visited.add(parentId);
        parentId = itemById.get(parentId)?.parentId ?? null;
      }
      return true;
    });
  }

  const selected: Array<{ item: T; level: number }> = [];
  const visited = new Set<string>();
  const appendSubtree = (itemId: string, level: number) => {
    if (visited.has(itemId)) return;
    const item = itemById.get(itemId);
    if (!item) return;
    visited.add(itemId);
    selected.push({ item, level });
    for (const child of childrenByParentId.get(itemId) ?? []) {
      appendSubtree(child.id, level + 1);
    }
  };

  rootIds.forEach((rootId) => appendSubtree(rootId, 1));
  // Preserve corrupt or cyclic orphaned rows as roots instead of silently dropping them.
  if (phaseIds === null) items.forEach((item) => appendSubtree(item.id, 1));
  return selected;
}

const predecessorFields = [
  'predecessor1',
  'predecessor2',
  'predecessor3',
  'predecessor4',
  'predecessor5',
  'predecessor6',
] as const;

function predecessorPatch(predecessors: string[]) {
  return Object.fromEntries(
    predecessorFields.map((field, index) => [field, predecessors[index] ?? null]),
  );
}

export async function copyCurrentStructuresToProject(
  tx: Prisma.TransactionClient,
  input: {
    targetProjectId: string;
    selections: CurrentStructureCopySelection[];
  },
) {
  const projectIds = input.selections.map((selection) => selection.projectId);
  if (new Set(projectIds).size !== projectIds.length) {
    throw new Error('Каждый проект-источник можно выбрать только один раз');
  }

  const createdItems: Array<{ id: string; code: string; wbsLevel: number }> = [];
  const targetIdBySourceId = new Map<string, string>();
  const sourceDependencies: Array<{
    predecessorId: string;
    successorId: string;
    type: 'FS' | 'SS' | 'FF' | 'SF';
    lagDays: number;
  }> = [];
  const sources: Array<{
    projectId: string;
    code: string;
    name: string;
    phaseIds: string[] | null;
    itemCount: number;
  }> = [];
  let sortOrder = 0;

  for (const selection of input.selections) {
    const sourceProject = await tx.project.findUnique({
      where: { id: selection.projectId },
      select: {
        id: true,
        code: true,
        name: true,
        wbsItems: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] },
        wbsDependencies: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!sourceProject) {
      throw new Error('Проект-источник текущей Структуры не найден');
    }

    const selected = selectCurrentStructureItems(
      sourceProject.wbsItems,
      selection.phaseIds,
    );
    if (selected.length === 0) {
      throw new Error('В выбранном проекте нет элементов Структуры для копирования');
    }

    for (const { item, level } of selected) {
      sortOrder += 1;
      const created = await tx.wbsItem.create({
        data: {
          projectId: input.targetProjectId,
          parentId: null,
          code: `__copy_${sortOrder}_${item.id}`,
          title: item.title,
          type: item.type,
          status: item.status,
          owner: item.owner,
          startDate: item.startDate,
          dueDate: item.dueDate,
          baselineStartDate: null,
          baselineDueDate: null,
          forecastStartDate: item.forecastStartDate,
          forecastDueDate: item.forecastDueDate,
          wbsLevel: level,
          predecessor1: null,
          predecessor2: null,
          predecessor3: null,
          predecessor4: null,
          predecessor5: null,
          predecessor6: null,
          leadLagDays: item.leadLagDays,
          workDays: item.workDays,
          calendarDays: item.calendarDays,
          excelStartDate: item.excelStartDate,
          excelEndDate: item.excelEndDate,
          planWorkDays: null,
          planCalendarDays: null,
          calendarCode: item.calendarCode,
          templateColor: item.templateColor,
          priority: item.priority,
          effortPercent: item.effortPercent,
          plannedCost: item.plannedCost,
          forecastCost: item.forecastCost,
          progress: item.progress,
          jiraTicketKey: item.jiraTicketKey,
          jiraTicketUrl: item.jiraTicketUrl,
          mattermostUrl: item.mattermostUrl,
          description: item.description,
          comment: item.comment,
          closedAt: item.closedAt,
          sortOrder,
        },
        select: { id: true, code: true, wbsLevel: true },
      });
      createdItems.push({
        id: created.id,
        code: created.code,
        wbsLevel: created.wbsLevel ?? level,
      });
      targetIdBySourceId.set(item.id, created.id);
    }

    const selectedInProject = new Set(selected.map(({ item }) => item.id));
    sourceDependencies.push(
      ...sourceProject.wbsDependencies.filter(
        (dependency) =>
          selectedInProject.has(dependency.predecessorId) &&
          selectedInProject.has(dependency.successorId),
      ),
    );
    sources.push({
      projectId: sourceProject.id,
      code: sourceProject.code,
      name: sourceProject.name,
      phaseIds: selection.phaseIds,
      itemCount: selected.length,
    });
  }

  const createdDependencies: Array<{
    predecessorId: string;
    successorId: string;
  }> = [];
  for (const dependency of sourceDependencies) {
    const predecessorId = targetIdBySourceId.get(dependency.predecessorId);
    const successorId = targetIdBySourceId.get(dependency.successorId);
    if (!predecessorId || !successorId || predecessorId === successorId) continue;
    const created = await tx.wbsDependency.create({
      data: {
        projectId: input.targetProjectId,
        predecessorId,
        successorId,
        type: dependency.type,
        lagDays: dependency.lagDays,
      },
      select: { predecessorId: true, successorId: true },
    });
    createdDependencies.push(created);
  }

  const { normalizedRows, predecessorsBySuccessor } = buildWbsRenumberPlan(
    createdItems,
    createdDependencies,
  );
  for (const row of normalizedRows) {
    await tx.wbsItem.update({
      where: { id: row.id },
      data: {
        code: row.code,
        parentId: row.parentId,
        wbsLevel: row.level,
        ...predecessorPatch(predecessorsBySuccessor.get(row.id) ?? []),
      },
    });
  }

  return {
    sources,
    itemCount: createdItems.length,
    dependencyCount: createdDependencies.length,
  };
}
