import type { WbsSnapshot, WbsTreeItem, WbsItem } from "./domainTypes";
import type { WbsFormState } from "./formState";
import { startOfDay } from "./dateUtils";

export function flattenWbsDescendants(item: WbsTreeItem): WbsTreeItem[] {
  return item.children.flatMap((child) => [
    child,
    ...flattenWbsDescendants(child),
  ]);
}

export function wbsToneClass(
  item: Pick<WbsItem, "dueDate" | "status" | "type">,
) {
  if (item.type === "MILESTONE" || item.type === "GOAL") return "tone-o";
  if (item.status === "DONE") return "tone-g";
  if (item.status === "AT_RISK" || item.status === "BLOCKED") return "tone-r";
  if (item.dueDate && new Date(item.dueDate) < startOfDay(new Date())) {
    return "tone-p";
  }
  if (item.status === "IN_PROGRESS" || item.status === "IN_REVIEW") return "tone-b";
  return "tone-x";
}

export function summaryToneClass(item: WbsTreeItem) {
  const descendants = flattenWbsDescendants(item);
  if (
    descendants.length > 0 &&
    descendants.every((descendant) => descendant.status === "DONE")
  ) {
    return "tone-g";
  }
  if (
    item.status === "IN_PROGRESS" ||
    item.status === "IN_REVIEW" ||
    descendants.some(
      (descendant) =>
        descendant.status === "IN_PROGRESS" || descendant.status === "IN_REVIEW",
    )
  ) {
    return "tone-b";
  }
  if (
    item.status === "AT_RISK" ||
    item.status === "BLOCKED" ||
    descendants.some(
      (descendant) =>
        descendant.status === "AT_RISK" || descendant.status === "BLOCKED",
    )
  ) {
    return "tone-r";
  }
  return wbsToneClass(item);
}

export function buildWbsTree(items: WbsItem[]) {
  const byId = new Map<string, WbsTreeItem>();
  const roots: WbsTreeItem[] = [];

  items.forEach((item) => {
    byId.set(item.id, { ...item, children: [], level: 0 });
  });

  items.forEach((item) => {
    const treeItem = byId.get(item.id);
    if (!treeItem) return;
    const parent = item.parentId ? byId.get(item.parentId) : null;
    if (parent) {
      parent.children.push(treeItem);
    } else {
      roots.push(treeItem);
    }
  });

  const flatten = (nodes: WbsTreeItem[], level = 0): WbsTreeItem[] =>
    nodes.flatMap((node) => {
      node.level = level;
      return [node, ...flatten(node.children, level + 1)];
    });

  return flatten(roots);
}

export function wbsDisplayLevel(item: Pick<WbsTreeItem, "level" | "wbsLevel">) {
  return Math.max(0, (item.wbsLevel ?? item.level + 1) - 1);
}

export function wbsDraftDisplayLevel(
  item: Pick<WbsTreeItem, "level" | "wbsLevel">,
  draft: Pick<WbsFormState, "wbsLevel">,
) {
  const draftLevel = draft.wbsLevel ? Number(draft.wbsLevel) : null;
  return Math.max(0, (draftLevel ?? item.wbsLevel ?? item.level + 1) - 1);
}

export function collapsedWbsIdsForLevel(items: WbsTreeItem[], level: number) {
  const deepestVisibleLevel = Math.max(1, level);
  return new Set(
    items
      .filter(
        (item) =>
          item.children.length > 0 &&
          wbsDisplayLevel(item) >= deepestVisibleLevel - 1,
      )
      .map((item) => item.id),
  );
}

export function focusedWbsBranchState(items: WbsItem[], targetItemId: string) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const target = itemsById.get(targetItemId);
  if (!target) return null;

  const expandedIds = new Set<string>();
  const visitedIds = new Set<string>([target.id]);
  let parentId = target.parentId;
  while (parentId && !visitedIds.has(parentId)) {
    visitedIds.add(parentId);
    const parent = itemsById.get(parentId);
    if (!parent) break;
    expandedIds.add(parent.id);
    parentId = parent.parentId;
  }

  const parentIds = new Set(
    items.map((item) => item.parentId).filter((id): id is string => Boolean(id)),
  );
  return {
    activeItemId: target.id,
    collapsedIds: new Set(
      items
        .filter((item) => parentIds.has(item.id) && !expandedIds.has(item.id))
        .map((item) => item.id),
    ),
    scrollItemId: target.id,
  };
}

export function setsAreEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

export function buildRenumberedWbsCodes(
  items: WbsTreeItem[],
  drafts: Record<string, WbsFormState>,
) {
  const counters: number[] = [];
  const codes = new Map<string, string>();

  for (const item of items) {
    const draft = drafts[item.id];
    const requestedLevel = draft?.wbsLevel
      ? Number(draft.wbsLevel)
      : item.wbsLevel ?? item.level + 1;
    const level = Math.max(1, requestedLevel);
    while (counters.length < level - 1) {
      counters.push(1);
    }
    counters[level - 1] = (counters[level - 1] ?? 0) + 1;
    counters.length = level;
    codes.set(item.id, counters.join("."));
  }

  return codes;
}

export function resolveDraftPredecessorCode(
  code: string,
  items: WbsTreeItem[],
  drafts: Record<string, WbsFormState>,
  renumberedCodes: Map<string, string>,
) {
  const normalizedCode = code.trim();
  if (!normalizedCode) return "";

  const currentItem = items.find((item) => item.code === normalizedCode);
  if (currentItem) {
    return renumberedCodes.get(currentItem.id) ?? currentItem.code;
  }

  const draftItem = items.find(
    (item) => (drafts[item.id]?.code ?? item.code) === normalizedCode,
  );
  if (draftItem) {
    return renumberedCodes.get(draftItem.id) ?? draftItem.code;
  }

  return normalizedCode;
}

export function wbsSnapshotsEqual(left: WbsSnapshot, right: WbsSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function parentIdFromWbsLevel(
  itemId: string,
  nextLevel: number | null,
  items: WbsTreeItem[],
  drafts: Record<string, WbsFormState>,
) {
  if (!nextLevel || nextLevel <= 1) return null;
  const itemIndex = items.findIndex((item) => item.id === itemId);
  if (itemIndex <= 0) return null;

  for (let index = itemIndex - 1; index >= 0; index -= 1) {
    const candidate = items[index];
    const candidateDraft = drafts[candidate.id];
    const candidateLevel = candidateDraft?.wbsLevel
      ? Number(candidateDraft.wbsLevel)
      : candidate.wbsLevel ?? candidate.level + 1;
    if (candidateLevel < nextLevel) return candidate.id;
  }

  return null;
}
