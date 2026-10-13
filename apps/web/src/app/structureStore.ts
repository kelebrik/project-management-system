import type { ProjectCalendarOverride, WbsCriticalPath, WbsDependency, WbsItem } from "./domainTypes";
import { browserCriticalPath } from "./structureCriticalPath";

/**
 * The browser's copy of each project's Structure at a known version. A write
 * answers with its changes only; they are applied here in version order and
 * the answer is handed on as the whole Structure at that version, so the
 * pages keep reading `wbsItems` as before. A gap in the versions (a change
 * this page never saw) is closed by reading the project again. The critical
 * path is worked out here after each change; the calendar it counts with is
 * the one read with the Structure, null when the answer did not carry it.
 */
export type StructureState = {
  version: string;
  items: WbsItem[];
  dependencies: WbsDependency[];
  criticalPath: WbsCriticalPath | null;
  calendarOverrides: ProjectCalendarOverride[] | null;
  /** The last day the server named as today, with the path it sent or for the path worked out here. */
  today: string | null;
};

export type StructureDelta = {
  projectId: string;
  baseVersion: string;
  version: string;
  items: WbsItem[];
  deletedItemIds: string[];
  dependencies: WbsDependency[];
  deletedDependencyIds: string[];
  /** Sent by a server asked for the critical path with the change (version 1 of the protocol). */
  criticalPath?: WbsCriticalPath | null;
  /** The server's day, for the critical path this page works out (version 2). */
  today?: string;
};

/** The project's Structure changed since a version this page holds, or whole, as GET /projects/:id/structure answers. */
export type StructureChanges = {
  projectId: string;
  version: string;
  baseVersion: string | null;
  full: boolean;
  today: string;
  calendarOverrides: ProjectCalendarOverride[];
  items: WbsItem[];
  dependencies: WbsDependency[];
  deletedItemIds: string[];
  deletedDependencyIds: string[];
};

/** Reads what changed in a project's Structure since a version; null when it cannot be read. */
export type ReadStructureChanges = (projectId: string, since: string) => Promise<StructureChanges | null>;

type Answer = Record<string, unknown>;

/** One row or link as a change found it and as it left it; null where it did not exist. */
export type ChangedEntry<T> = { id: string; before: T | null; after: T | null };

/**
 * A change this page applied to its copy, for the undo history: what it
 * changed, the version it left, and the request it answered. `complete` is
 * false when the copy was read again instead, so the change itself is unknown.
 */
export type StructureChange = {
  projectId: string;
  /** The version the change started from and the one it left. */
  baseVersion: string;
  version: string;
  requestPath: string;
  /** What the page said about the write when it sent it (the undo step it belongs to). */
  tag: unknown;
  complete: boolean;
  items: ChangedEntry<WbsItem>[];
  links: ChangedEntry<WbsDependency>[];
};

const listeners = new Set<(change: StructureChange) => void>();
let writeTag: () => unknown = () => null;

/** Lets the page tell, when a write leaves, what it belongs to; the change it brings back carries it. */
export function provideWriteTag(provider: () => unknown) {
  writeTag = provider;
  return () => {
    if (writeTag === provider) writeTag = () => null;
  };
}

/** The tag of a write being sent now. */
export function currentWriteTag() {
  return writeTag();
}

/** Hears every change applied to a copy; answers the function that stops listening. */
export function onStructureChange(listener: (change: StructureChange) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function announce(change: StructureChange) {
  listeners.forEach((listener) => listener(change));
}

/** What a change did to the copy, row by row, with copies the page cannot alter later. */
function describeChange(state: StructureState, delta: StructureDelta, requestPath: string, tag: unknown): StructureChange {
  const itemsBefore = new Map(state.items.map((item) => [item.id, item]));
  const linksBefore = new Map(state.dependencies.map((link) => [link.id, link]));
  const copy = <T,>(value: T | undefined | null) => (value ? structuredClone(value) : null);
  return {
    projectId: delta.projectId,
    baseVersion: delta.baseVersion,
    version: delta.version,
    requestPath,
    tag,
    complete: true,
    items: [
      ...delta.items.map((item) => ({ id: item.id, before: copy(itemsBefore.get(item.id)), after: copy(item) })),
      ...delta.deletedItemIds.map((id) => ({ id, before: copy(itemsBefore.get(id)), after: null })),
    ],
    links: [
      ...delta.dependencies.map((link) => ({ id: link.id, before: copy(linksBefore.get(link.id)), after: copy(link) })),
      ...delta.deletedDependencyIds.map((id) => ({ id, before: copy(linksBefore.get(id)), after: null })),
    ],
  };
}

/** Sent with every request: Structure writes then answer with their changes only. */
export const structureDeltaHeaders = { "X-PMS-Structure-Delta": "2" } as const;

/** How long a change waits for the one before it, sent at the same time, before the project is read again. */
const GAP_WAIT_MS = 2_000;

const states = new Map<string, StructureState>();
const waiters = new Map<string, Array<() => void>>();
/** Writes this page has sent and not yet heard back from: only they can bring a missing earlier change. */
let writesInFlight = 0;

const writeStartListeners = new Set<(operation: unknown) => void>();
let writeOperation: unknown = null;
/** Writes that can change a project's Structure, by their path: rows, links, the calendar, issues with work packages, automation, Jira, dates of the project. Layout, views and registers do not. */
const STRUCTURE_WRITE = /\/(wbs|calendar-overrides|open-issues|issues|automation|jira|target-date|close|milestones)/;
let structureWrites = 0;

/**
 * Sends the writes started inside `send` as one operation of the page: the
 * ones started then are announced with it, so the page tells its own writes
 * from others. `send` must start them before its first await.
 */
export function withStructureOperation<T>(operation: unknown, send: () => T): T {
  const outer = writeOperation;
  writeOperation = operation;
  try {
    return send();
  } finally {
    writeOperation = outer;
  }
}

/** Hears every write that can change a Structure as it leaves, with the operation it belongs to (null for none); answers the function that stops listening. */
export function onStructureWriteStart(listener: (operation: unknown) => void) {
  writeStartListeners.add(listener);
  return () => {
    writeStartListeners.delete(listener);
  };
}

/** How many writes that can change a Structure this page has sent and not yet heard back from. */
export function structureWritesInFlight() {
  return structureWrites;
}

/** The Structure of a project as the server last confirmed it here, if this page holds it. */
export function confirmedStructure(projectId: string): Readonly<StructureState> | null {
  return states.get(projectId) ?? null;
}

/** Counts a write while it is on its way; the answer is counted out before it is expanded. */
export async function trackStructureWrite<T>(method: string | undefined, send: () => Promise<T>, path = "") {
  const write = (method ?? "GET").toUpperCase() !== "GET";
  const structureWrite = write && STRUCTURE_WRITE.test(path);
  if (write) writesInFlight += 1;
  if (structureWrite) {
    structureWrites += 1;
    const operation = writeOperation;
    writeStartListeners.forEach((listener) => listener(operation));
  }
  try {
    return await send();
  } finally {
    if (write) writesInFlight -= 1;
    if (structureWrite) structureWrites -= 1;
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

/** Whether a change can be applied here: the server sent its critical path, or this page can work it out. */
export function canMergeStructureDelta(state: StructureState, delta: StructureDelta) {
  return "criticalPath" in delta || (typeof delta.today === "string" && state.calendarOverrides !== null);
}

/**
 * The Structure after a change: written rows replace or join, deleted ones
 * leave; the order is the server's. The critical path is the server's when it
 * sent one, otherwise worked out here.
 */
export function mergeStructureDelta(state: StructureState, delta: StructureDelta): StructureState {
  const deletedItems = new Set(delta.deletedItemIds);
  const items = new Map(state.items.filter((item) => !deletedItems.has(item.id)).map((item) => [item.id, item]));
  for (const item of delta.items) items.set(item.id, item);
  const deletedLinks = new Set(delta.deletedDependencyIds);
  const dependencies = new Map(state.dependencies.filter((link) => !deletedLinks.has(link.id)).map((link) => [link.id, link]));
  for (const link of delta.dependencies) dependencies.set(link.id, link);
  const nextItems = [...items.values()].sort(byPlanOrder);
  const nextDependencies = [...dependencies.values()].sort(byCreation);
  if (!canMergeStructureDelta(state, delta)) throw new Error("A change without its critical path needs the project calendar and the server's day");
  return {
    version: delta.version,
    items: nextItems,
    dependencies: nextDependencies,
    criticalPath: "criticalPath" in delta ? delta.criticalPath ?? null : browserCriticalPath(nextItems, nextDependencies, state.calendarOverrides!, delta.today!),
    calendarOverrides: state.calendarOverrides,
    today: delta.today ?? state.today,
  };
}

/**
 * The Structure after catching up with the server: the rows and links that
 * changed replace or join, the gone ones leave, or the whole Structure comes
 * anew; the calendar and the server's day are the new ones, and the critical
 * path is worked out with them. The changes hold the state at their version,
 * so they apply to any copy between the version they start from and theirs.
 */
export function mergeStructureChanges(state: StructureState | undefined, changes: StructureChanges): StructureState {
  let items: WbsItem[];
  let dependencies: WbsDependency[];
  if (changes.full || !state) {
    items = [...changes.items].sort(byPlanOrder);
    dependencies = [...changes.dependencies].sort(byCreation);
  } else {
    const deletedItems = new Set(changes.deletedItemIds);
    const itemsById = new Map(state.items.filter((item) => !deletedItems.has(item.id)).map((item) => [item.id, item]));
    for (const item of changes.items) itemsById.set(item.id, item);
    const deletedLinks = new Set(changes.deletedDependencyIds);
    const linksById = new Map(state.dependencies.filter((link) => !deletedLinks.has(link.id)).map((link) => [link.id, link]));
    for (const link of changes.dependencies) linksById.set(link.id, link);
    items = [...itemsById.values()].sort(byPlanOrder);
    dependencies = [...linksById.values()].sort(byCreation);
  }
  return {
    version: changes.version,
    items,
    dependencies,
    criticalPath: browserCriticalPath(items, dependencies, changes.calendarOverrides, changes.today),
    calendarOverrides: changes.calendarOverrides,
    today: changes.today,
  };
}

/**
 * Brings the copy of a project up to the server by reading only what changed
 * since its version. Answers whether the copy is now current; a late answer
 * never takes a newer copy back.
 */
async function catchUp(projectId: string, readChanges: ReadStructureChanges) {
  const before = states.get(projectId);
  if (!before) return false;
  const changes = await readChanges(projectId, before.version).catch(() => null);
  if (!changes || changes.projectId !== projectId) return false;
  const current = states.get(projectId);
  if (current && !newer(changes.version, current.version)) return true;
  if (!changes.full && current && changes.baseVersion !== null && newer(changes.baseVersion, current.version)) return false;
  states.set(projectId, mergeStructureChanges(current, changes));
  settle(projectId);
  return true;
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
    calendarOverrides: Array.isArray(project.calendarOverrides) ? (project.calendarOverrides as ProjectCalendarOverride[]) : null,
    today: typeof project.structureToday === "string" ? project.structureToday : null,
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
export async function expandStructureAnswer<T>(answer: T, reloadProject: (projectId: string) => Promise<unknown>, requestPath = "", tag: unknown = null, readChanges?: ReadStructureChanges): Promise<T> {
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
  if (state && state.version === delta.baseVersion && canMergeStructureDelta(state, delta)) {
    const change = describeChange(state, delta, requestPath, tag);
    state = mergeStructureDelta(state, delta);
    states.set(delta.projectId, state);
    settle(delta.projectId);
    announce(change);
  } else if (!state || !newer(state.version, delta.baseVersion)) {
    // A change this page never saw, or one it cannot work out the critical path for: the page catches up with
    // what changed since its copy, or reads the project again; either way its Structure includes this change.
    const caughtUp = readChanges ? await catchUp(delta.projectId, readChanges) : false;
    if (!caughtUp) rememberStructure(await reloadProject(delta.projectId));
    state = states.get(delta.projectId);
    announce({ projectId: delta.projectId, baseVersion: delta.baseVersion, version: delta.version, requestPath, tag, complete: false, items: [], links: [] });
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
  listeners.clear();
  writeTag = () => null;
  waiters.clear();
  writesInFlight = 0;
  writeStartListeners.clear();
  writeOperation = null;
  structureWrites = 0;
}
