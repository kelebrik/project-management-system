export type RenumberItem = { id: string; code: string; wbsLevel: number | null };
export type RenumberDependency = { predecessorId: string; successorId: string };
export type RenumberRow = { id: string; level: number; parentId: string | null; code: string };

export function levelFromWbsCode(code: string) {
  return Math.max(1, code.split(".").filter(Boolean).length);
}

export function levelFromWbsItem(item: { code: string; wbsLevel: number | null }) {
  return Math.max(1, item.wbsLevel ?? levelFromWbsCode(item.code));
}

/**
 * Codes and parents of rows in plan order from their levels alone: each row
 * is numbered under the nearest row above it one level up, and the links
 * name predecessors by the new codes.
 */
export function buildRenumberPlan(items: RenumberItem[], dependencies: RenumberDependency[] = []) {
  const counters: number[] = [];
  const parentByLevel = new Map<number, string>();
  const codeById = new Map<string, string>();
  const normalizedRows: RenumberRow[] = [];

  for (const item of items) {
    const level = Math.max(1, item.wbsLevel ?? levelFromWbsCode(item.code));
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
    predecessorsBySuccessor.set(dependency.successorId, [...(predecessorsBySuccessor.get(dependency.successorId) ?? []), predecessorCode]);
  }

  return { normalizedRows, predecessorsBySuccessor, codeById };
}
