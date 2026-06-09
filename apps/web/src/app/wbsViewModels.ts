import type { WbsFormState } from "./formState";
import type {
  WbsCriticalPath,
  WbsItem,
  WbsItemStatus,
  WbsItemType,
  WbsTreeItem,
} from "./domainTypes";
import { wbsStatusLabel, wbsTypeLabel } from "./labels";
import {
  buildRenumberedWbsCodes,
  buildWbsTree,
  collapsedWbsIdsForLevel,
  setsAreEqual,
} from "./wbsTree";
import { sortWbsTreeForDisplay, type WbsSortState } from "./wbsTable";
import { GANTT_HIERARCHY_LEVELS } from "./ganttConfig";

type CollapsibleTreeItem = {
  id: string;
  level: number;
};

export function createWbsTree(wbsItems: WbsItem[]) {
  return buildWbsTree(wbsItems);
}

export function createVisibleWbsTree<TItem extends CollapsibleTreeItem>(
  wbsTree: TItem[],
  collapsedWbsIds: ReadonlySet<string>,
) {
  const hiddenLevels: number[] = [];
  return wbsTree.filter((item) => {
    while (
      hiddenLevels.length > 0 &&
      item.level <= hiddenLevels[hiddenLevels.length - 1]
    ) {
      hiddenLevels.pop();
    }
    if (hiddenLevels.length > 0) return false;
    if (collapsedWbsIds.has(item.id)) {
      hiddenLevels.push(item.level);
    }
    return true;
  });
}

export function createSortedStructureWbsTree(
  wbsTree: WbsTreeItem[],
  wbsDrafts: Record<string, WbsFormState>,
  wbsSort: WbsSortState | null,
) {
  return sortWbsTreeForDisplay(wbsTree, wbsDrafts, wbsSort, {
    typeLabel: (type) => wbsTypeLabel(type as WbsItemType),
    statusLabel: (status) => wbsStatusLabel(status as WbsItemStatus),
  });
}

export function createCriticalPathIdSet(
  criticalPath: WbsCriticalPath | null | undefined,
) {
  return new Set(criticalPath?.criticalItemIds ?? []);
}

export function filterStructureWbsTreeByCriticalPath<TItem extends { id: string }>(
  visibleStructureBaseWbsTree: TItem[],
  structureCriticalPathIds: ReadonlySet<string>,
  showStructureCriticalPath: boolean,
) {
  if (!showStructureCriticalPath) return visibleStructureBaseWbsTree;
  return visibleStructureBaseWbsTree.filter((item) =>
    structureCriticalPathIds.has(item.id),
  );
}

export function createActiveWbsHierarchyLevel(
  collapsedWbsIds: Set<string>,
  wbsTree: WbsTreeItem[],
) {
  if (collapsedWbsIds.size === 0) return null;
  for (const level of GANTT_HIERARCHY_LEVELS) {
    if (setsAreEqual(collapsedWbsIds, collapsedWbsIdsForLevel(wbsTree, level))) {
      return level;
    }
  }
  return null;
}

export function createDraftWbsCodes(
  wbsTree: WbsTreeItem[],
  wbsDrafts: Record<string, WbsFormState>,
) {
  return buildRenumberedWbsCodes(wbsTree, wbsDrafts);
}
