import type { ProjectCalendarOverride, WbsDependency, WbsItem } from "../domainTypes";

/** A project's Structure as the server last confirmed it to this device. */
export type BaseRecord = {
  projectId: string;
  version: string;
  items: WbsItem[];
  dependencies: WbsDependency[];
  calendarOverrides: ProjectCalendarOverride[] | null;
  today: string | null;
  savedAt: string;
};

/**
 * A Structure write kept on this device until the server took it: pending
 * (not sent), sending, acked (the server took it at ackVersion; the base has
 * not caught up yet), rejected (refused for good, with why) or expired (too
 * old to send without the person deciding).
 */
export type OutboxState = "pending" | "sending" | "acked" | "rejected" | "expired";

export type OutboxEntry = {
  mutationId: string;
  /** Order of the writes as they were made. */
  seq: number;
  projectId: string;
  method: string;
  path: string;
  body: unknown;
  baseVersion: string | null;
  /** Writes this one needs: refused with them, never sent before them. */
  dependsOn: string[];
  state: OutboxState;
  attempts: number;
  createdAt: string;
  ackVersion: string | null;
  error: { status: number; code: string | null; message: string } | null;
};

/** Where a device keeps its Structures and the writes still to send; one per person. */
export interface StructureLocalStorage {
  readBase(projectId: string): Promise<BaseRecord | null>;
  /** Keeps a base unless the one kept is newer: a later version, or the same one on a later day. */
  writeBaseIfNewer(record: BaseRecord): Promise<boolean>;
  listOutbox(): Promise<OutboxEntry[]>;
  /** Keeps a new write with the next number in order, taken and used in one transaction: tabs adding at once never share a number. */
  appendOutbox(entry: Omit<OutboxEntry, "seq">): Promise<OutboxEntry>;
  putOutbox(entry: OutboxEntry): Promise<void>;
  updateOutbox(mutationId: string, patch: Partial<OutboxEntry>): Promise<OutboxEntry | null>;
  /** One transaction: the base the server confirmed for a write (unless an newer one is kept) and the write's removal. */
  ackAndAdvance(mutationId: string, base: BaseRecord): Promise<void>;
  close(): void;
}

function versionNumber(value: string) {
  return /^\d{1,19}$/.test(value) ? BigInt(value) : -1n;
}

/** Whether a base should replace the one kept. */
export function supersedes(next: BaseRecord, kept: BaseRecord | null | undefined) {
  if (!kept) return true;
  const nextVersion = versionNumber(next.version);
  const keptVersion = versionNumber(kept.version);
  if (nextVersion !== keptVersion) return nextVersion > keptVersion;
  return (next.today ?? "") > (kept.today ?? "");
}

/** For tests and for browsers without IndexedDB: the same rules, in memory. */
export function createMemoryStorage(): StructureLocalStorage & { bases: Map<string, BaseRecord>; outbox: Map<string, OutboxEntry> } {
  const bases = new Map<string, BaseRecord>();
  const outbox = new Map<string, OutboxEntry>();
  let lastSeq = 0;
  const copy = <T,>(value: T): T => structuredClone(value);
  return {
    bases,
    outbox,
    async readBase(projectId) {
      const base = bases.get(projectId);
      return base ? copy(base) : null;
    },
    async writeBaseIfNewer(record) {
      if (!supersedes(record, bases.get(record.projectId))) return false;
      bases.set(record.projectId, copy(record));
      return true;
    },
    async listOutbox() {
      return [...outbox.values()].sort((left, right) => left.seq - right.seq).map(copy);
    },
    async appendOutbox(entry) {
      lastSeq = Math.max(lastSeq, ...[...outbox.values()].map((item) => item.seq)) + 1;
      const kept = { ...copy(entry), seq: lastSeq } as OutboxEntry;
      outbox.set(entry.mutationId, kept);
      return copy(kept);
    },
    async putOutbox(entry) {
      outbox.set(entry.mutationId, copy(entry));
    },
    async updateOutbox(mutationId, patch) {
      const entry = outbox.get(mutationId);
      if (!entry) return null;
      const next = { ...entry, ...copy(patch) };
      outbox.set(mutationId, next);
      return copy(next);
    },
    async ackAndAdvance(mutationId, base) {
      if (supersedes(base, bases.get(base.projectId))) bases.set(base.projectId, copy(base));
      outbox.delete(mutationId);
    },
    close() {},
  };
}

const DB_VERSION = 2;

/** The database of one person on this device. */
export function structureDatabaseName(userId: string) {
  return `pms-structure-${userId}`;
}

function promised<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** Opens (or makes) the person's database in this browser. */
export async function openIndexedDbStorage(userId: string, factory: IDBFactory = indexedDB, onInvalidated?: () => void): Promise<StructureLocalStorage> {
  const opening = factory.open(structureDatabaseName(userId), DB_VERSION);
  opening.onupgradeneeded = () => {
    const db = opening.result;
    if (!db.objectStoreNames.contains("base")) db.createObjectStore("base", { keyPath: "projectId" });
    if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "mutationId" }).createIndex("seq", "seq");
    if (!db.objectStoreNames.contains("meta")) {
      const meta = db.createObjectStore("meta");
      // Numbers go on from the writes a database of the first version already keeps.
      const last = opening.transaction!.objectStore("outbox").index("seq").openCursor(null, "prev");
      last.onsuccess = () => meta.put((last.result?.value as OutboxEntry | undefined)?.seq ?? 0, "seq");
    }
  };
  const db = await promised(opening);
  // Another tab deleting the database (a sign-out) must not wait for this one; its owner stops using it.
  db.onversionchange = () => {
    db.close();
    onInvalidated?.();
  };
  return {
    async readBase(projectId) {
      const transaction = db.transaction("base", "readonly");
      return ((await promised(transaction.objectStore("base").get(projectId))) as BaseRecord | undefined) ?? null;
    },
    async writeBaseIfNewer(record) {
      const transaction = db.transaction("base", "readwrite");
      const store = transaction.objectStore("base");
      const done = finished(transaction);
      // Read and write in one transaction: a tab with an older copy cannot overwrite a newer one between them.
      const kept = (await promised(store.get(record.projectId))) as BaseRecord | undefined;
      const replace = supersedes(record, kept);
      if (replace) store.put(record);
      await done;
      return replace;
    },
    async listOutbox() {
      const transaction = db.transaction("outbox", "readonly");
      return (await promised(transaction.objectStore("outbox").index("seq").getAll())) as OutboxEntry[];
    },
    appendOutbox(entry) {
      // Held shared while keeping a write: removing the database (a sign-out) waits for it, and then finds it.
      return withDatabaseLock(userId, "shared", () => append(entry));
    },
    async putOutbox(entry) {
      const transaction = db.transaction("outbox", "readwrite");
      const done = finished(transaction);
      transaction.objectStore("outbox").put(entry);
      await done;
    },
    async updateOutbox(mutationId, patch) {
      const transaction = db.transaction("outbox", "readwrite");
      const store = transaction.objectStore("outbox");
      const done = finished(transaction);
      const entry = (await promised(store.get(mutationId))) as OutboxEntry | undefined;
      const next = entry ? { ...entry, ...patch } : null;
      if (next) store.put(next);
      await done;
      return next;
    },
    async ackAndAdvance(mutationId, base) {
      const transaction = db.transaction(["base", "outbox"], "readwrite");
      const bases = transaction.objectStore("base");
      const done = finished(transaction);
      const kept = (await promised(bases.get(base.projectId))) as BaseRecord | undefined;
      if (supersedes(base, kept)) bases.put(base);
      transaction.objectStore("outbox").delete(mutationId);
      await done;
    },
    close() {
      db.close();
    },
  };

  /** The next number and the write, in one transaction: tabs adding at once never share a number. */
  async function append(entry: Omit<OutboxEntry, "seq">) {
    const transaction = db.transaction(["outbox", "meta"], "readwrite");
    const meta = transaction.objectStore("meta");
    const done = finished(transaction);
    const last = ((await promised(meta.get("seq"))) as number | undefined) ?? 0;
    const kept = { ...entry, seq: last + 1 } as OutboxEntry;
    meta.put(kept.seq, "seq");
    transaction.objectStore("outbox").put(kept);
    await done;
    return kept;
  }
}

/**
 * Runs work under the lock of the person's database, across tabs: writes are
 * kept under it shared, the database is removed under it alone. Without Web
 * Locks the work runs as it is.
 */
export function withDatabaseLock<T>(userId: string, mode: LockMode, work: () => Promise<T>, locks: LockManager | undefined = typeof navigator !== "undefined" ? navigator.locks : undefined): Promise<T> {
  if (!locks) return work();
  return locks.request(`pms-structure-db-${userId}`, { mode }, work) as Promise<T>;
}

/**
 * Removes the person's database on sign-out unless it still keeps writes to
 * send: checked and removed under the database lock alone, so a write another
 * tab keeps meanwhile is either found (and the database stays) or waits and
 * fails to be kept (and its tab knows).
 */
export function removeStructureDatabaseIfEmpty(userId: string, factory: IDBFactory = indexedDB) {
  return withDatabaseLock(userId, "exclusive", async () => {
    const storage = await openIndexedDbStorage(userId, factory).catch(() => null);
    const left = storage ? await storage.listOutbox().catch(() => null) : null;
    storage?.close();
    if (left === null || left.length > 0) return false;
    await deleteStructureDatabase(userId, factory);
    return true;
  });
}

/** Removes the person's database from this browser (a sign-out). */
export function deleteStructureDatabase(userId: string, factory: IDBFactory = indexedDB) {
  return new Promise<void>((resolve, reject) => {
    const deleting = factory.deleteDatabase(structureDatabaseName(userId));
    deleting.onsuccess = () => resolve();
    deleting.onerror = () => reject(deleting.error);
    // Open connections of other tabs close on versionchange; until then the deletion waits.
    deleting.onblocked = () => undefined;
  });
}
