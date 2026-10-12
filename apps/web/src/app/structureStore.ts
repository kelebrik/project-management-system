import type { WbsCriticalPath, WbsDependency, WbsItem } from "./domainTypes";

/**
 * The browser's copy of each project's Structure at a known version. A write
 * answers with its changes only; they are applied here in version order and
 * the answer is handed on as the whole Structure at that version, so the
 * pages keep reading `wbsItems` as before. A gap in the versions (a change
 * this page never saw) is closed by reading the project again.
 */
export type StructureState = {
  version: string;
  items: WbsItem[];
  dependencies: WbsDependency[];
  criticalPath: WbsCriticalPath | null;
};

export type StructureDelta = {
  projectId: string;
  baseVersion: string;
  version: string;
  items: WbsItem[];
  deletedItemIds: string[];
  dependencies: WbsDependency[];
  deletedDependencyIds: string[];
  criticalPath: WbsCriticalPath | null;
};

type Answer = Record<string, unknown>;

/** Sent with every request: Structure writes then answer with their changes only. */
export const structureDeltaHeaders = { "X-PMS-Structure-Delta": "1" } as const;

/** How long a change waits for the one before it, sent at the same time, before the project is read again. */
const GAP_WAIT_MS = 2_000;

const states = new Map<string, StructureState>();
const waiters = new Map<string, Array<() => void>>();
/** Writes this page has sent and not yet heard back from: only they can bring a missing earlier change. */
let writesInFlight = 0;

/** Counts a write while it is on its way; the answer is counted out before it is expanded. */
export async function trackStructureWrite<T>(method: string | undefined, send: () => Promise<T>) {
  const write = (method ?? "GET").toUpperCase() !== "GET";
  if (write) writesInFlight += 1;
  try {
    return await send();
  } finally {
    if (write) writesInFlight -= 1;
  }
}

function newer(left: string, right: string) {
  return BigInt(left) > BigInt(right);
}

function byPlanOrder(left: WbsItem, right: WbsItem) {
  return left.sortOrder - right.sortOrder || (left.code < right.code ? -1 : left.code > right.code ? 1 : 0);
}

function byCreation(left: WbsDependency, right: WbsDependency) {
  const leftAt = String((left as { createdAt?: string }).createdAt ?? "");
  const rightAt = String((right as { createdAt?: string }).createdAt ?? "");
  return leftAt < rightAt ? -1 : leftAt > rightAt ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/** The Structure after a change: written rows replace or join, deleted ones leave; the order is the server's. */
export function mergeStructureDelta(state: StructureState, delta: StructureDelta): StructureState {
  const deletedItems = new Set(delta.deletedItemIds);
  const items = new Map(state.items.filter((item) => !deletedItems.has(item.id)).map((item) => [item.id, item]));
  for (const item of delta.items) items.set(item.id, item);
  const deletedLinks = new Set(delta.deletedDependencyIds);
  const dependencies = new Map(state.dependencies.filter((link) => !deletedLinks.has(link.id)).map((link) => [link.id, link]));
  for (const link of delta.dependencies) dependencies.set(link.id, link);
  return {
    version: delta.version,
    items: [...items.values()].sort(byPlanOrder),
    dependencies: [...dependencies.values()].sort(byCreation),
    criticalPath: delta.criticalPath,
  };
}

function settle(projectId: string) {
  const pending = waiters.get(projectId) ?? [];
  waiters.delete(projectId);
  pending.forEach((wake) => wake());
}

/** Keeps a whole Structure an answer brought (the project page), unless this page already knows a newer one. */
export function rememberStructure(answer: unknown) {
  if (!answer || typeof answer !== "object") return;
  const project = answer as Answer;
  if (typeof project.id !== "string" || typeof project.structureVersion !== "string" || !Array.isArray(project.wbsItems)) return;
  const known = states.get(project.id);
  if (known && newer(known.version, project.structureVersion)) return;
  states.set(project.id, {
    version: project.structureVersion,
    items: project.wbsItems as WbsItem[],
    dependencies: (project.wbsDependencies as WbsDependency[] | undefined) ?? [],
    criticalPath: (project.criticalPath as WbsCriticalPath | null | undefined) ?? null,
  });
  settle(project.id);
}

function waitForVersion(projectId: string, version: string) {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), GAP_WAIT_MS);
    const check = () => {
      const state = states.get(projectId);
      if (state && !newer(version, state.version)) {
        clearTimeout(timer);
        resolve(true);
        return;
      }
      waiters.set(projectId, [...(waiters.get(projectId) ?? []), check]);
    };
    check();
  });
}

/**
 * An answer as the pages expect it: a change is applied to the project's copy
 * and replaced by the whole Structure at its version; other answers pass,
 * and a whole Structure in them is remembered.
 */
export async function expandStructureAnswer<T>(answer: T, reloadProject: (projectId: string) => Promise<unknown>): Promise<T> {
  if (!answer || typeof answer !== "object" || !("structureDelta" in answer)) {
    rememberStructure(answer);
    return answer;
  }
  const { structureDelta, ...rest } = answer as Answer & { structureDelta: StructureDelta };
  const delta = structureDelta;
  let state = states.get(delta.projectId);
  if (state && newer(delta.baseVersion, state.version) && writesInFlight > 0) {
    // An earlier change this page sent may still be on its way; otherwise someone else wrote, and waiting is useless.
    await waitForVersion(delta.projectId, delta.baseVersion);
    state = states.get(delta.projectId);
  }
  if (state && state.version === delta.baseVersion) {
    state = mergeStructureDelta(state, delta);
    states.set(delta.projectId, state);
    settle(delta.projectId);
  } else if (!state || newer(delta.baseVersion, state.version)) {
    // A change this page never saw: the project is read again, and its Structure includes this one.
    rememberStructure(await reloadProject(delta.projectId));
    state = states.get(delta.projectId);
  }
  // Otherwise the copy is already past this change, which it includes.
  if (!state) return answer;
  return {
    ...rest,
    wbsItems: state.items,
    wbsDependencies: state.dependencies,
    criticalPath: state.criticalPath,
    structureVersion: state.version,
  } as T;
}

/** Forgets every copy, for a sign-out or a test. */
export function forgetStructures() {
  states.clear();
  waiters.clear();
  writesInFlight = 0;
}
