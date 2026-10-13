import { WBS_FIELDS_OUTSIDE_SCHEDULE } from "@pms/shared";
import type { WbsItem } from "../domainTypes";
import { previewRowEdit } from "../structurePreview";
import { supersedes, type BaseRecord, type OutboxEntry, type StructureLocalStorage } from "./storage";

/** What the server answered a write: its status, the body read and the version it named. */
export type SendResult = { status: number; body: unknown; structureVersion: string | null };

/** Things the queue tells the page: refused writes (with why), a sign-in needed, a change of what it holds. */
export type OutboxNotice =
  | { kind: "rejected"; entries: OutboxEntry[] }
  | { kind: "session-required" }
  | { kind: "changed" };

/** An entry older than this is not sent without the person: the server keeps receipts of writes for 30 days. */
export const OUTBOX_EXPIRY_MS = 29 * 86_400_000;
const BACKOFF_MS = [1_000, 3_000, 10_000, 30_000, 60_000];
/** Refusals that stay refusals: the same write would be refused again. */
const TERMINAL = new Set([400, 403, 404, 409, 422, 423]);

export type OutboxDeps = {
  storage: StructureLocalStorage;
  /** Sends a write with its mutation id; throws when no answer came (the network) or when cancelled. */
  send: (entry: OutboxEntry, signal: AbortSignal) => Promise<SendResult>;
  /** Reads the project's Structure as the server holds it now; null when it cannot. */
  readBase: (projectId: string, signal: AbortSignal) => Promise<BaseRecord | null>;
  notify: (notice: OutboxNotice) => void;
  now?: () => number;
  /** Waits, or ends early when the queue stops. */
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
};

function code(body: unknown) {
  return body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string" ? (body as { code: string }).code : null;
}

function message(body: unknown, status: number) {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  return typeof error === "string" ? error : `HTTP ${status}`;
}

const newer = (left: string, right: string) => BigInt(left) > BigInt(right);

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/** What a write's dependencies allow: sending, waiting for them, or refusing it with them. */
function dependencyState(entry: OutboxEntry, all: OutboxEntry[]): "ready" | "blocked" | "refused" {
  const byId = new Map(all.map((item) => [item.mutationId, item]));
  let blocked = false;
  for (const id of entry.dependsOn) {
    const dependency = byId.get(id);
    // Gone from the queue: the server took it and the base caught up.
    if (!dependency || dependency.state === "acked") continue;
    if (dependency.state === "rejected") return "refused";
    // Expired, or not yet sent: this write waits for the person or for it.
    blocked = true;
  }
  return blocked ? "blocked" : "ready";
}

/**
 * Sends the writes kept on this device, one at a time and in the order made,
 * from the one tab that leads. A write the server took is kept until the base
 * caught up with it (tried again later, without holding sending back), then
 * the base and its removal are stored together; a refused one takes the
 * writes that need it along; a sign-in needed pauses everything; anything
 * else is tried again later. Once stopped, nothing more is sent or stored.
 */
export function createOutbox(deps: OutboxDeps) {
  const now = deps.now ?? (() => Date.now());
  const wait = deps.wait ?? sleep;
  const lifetime = new AbortController();
  const signal = lifetime.signal;
  let leading = false;
  let paused = false;
  let running: Promise<void> | null = null;
  let again = false;
  let failures = 0;
  let settling: Promise<void> | null = null;
  let settleFailures = 0;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  const live = () => !signal.aborted;
  /** Work begun outside the sending loop (taking the lead, keeping a write): stopping waits for it too. */
  const begun = new Set<Promise<unknown>>();
  function track<T>(work: Promise<T>) {
    begun.add(work);
    void work.catch(() => undefined).finally(() => begun.delete(work));
    return work;
  }

  /** Refuses the given write and every write that needs it, as the queue stands now; answers the ones refused. */
  async function reject(entry: OutboxEntry, reason: NonNullable<OutboxEntry["error"]>) {
    const all = await deps.storage.listOutbox();
    if (!live()) return [];
    const refused = new Map([[entry.mutationId, entry]]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const item of all) {
        if (refused.has(item.mutationId) || item.state === "acked") continue;
        if (item.dependsOn.some((id) => refused.has(id))) {
          refused.set(item.mutationId, item);
          grew = true;
        }
      }
    }
    const done: OutboxEntry[] = [];
    for (const item of refused.values()) {
      if (!live()) break;
      const updated = await deps.storage.updateOutbox(item.mutationId, {
        state: "rejected",
        error: item.mutationId === entry.mutationId ? reason : { status: 0, code: "DEPENDENCY_REJECTED", message: reason.message },
      });
      if (updated) done.push(updated);
    }
    return done;
  }

  /** Brings the base up to the writes the server took; the ones it cannot reach yet are tried again later. */
  async function settleAcked() {
    const acked = (await deps.storage.listOutbox()).filter((entry) => entry.state === "acked" && entry.ackVersion);
    if (!live() || acked.length === 0) return;
    let left = 0;
    const read = new Map<string, BaseRecord | null>();
    for (const entry of acked) {
      if (!live()) return;
      const kept = await deps.storage.readBase(entry.projectId);
      let base = kept && !newer(entry.ackVersion!, kept.version) ? kept : null;
      if (!base) {
        if (!read.has(entry.projectId)) read.set(entry.projectId, await deps.readBase(entry.projectId, signal).catch(() => null));
        const fresh = read.get(entry.projectId) ?? null;
        base = fresh && !newer(entry.ackVersion!, fresh.version) ? fresh : null;
      }
      if (!live()) return;
      if (!base) {
        left += 1;
        continue;
      }
      await deps.storage.ackAndAdvance(entry.mutationId, base);
      if (live()) deps.notify({ kind: "changed" });
    }
    if (left > 0 && live()) {
      const delay = BACKOFF_MS[Math.min(settleFailures, BACKOFF_MS.length - 1)]!;
      settleFailures += 1;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = null;
        void settle();
      }, delay);
    } else {
      settleFailures = 0;
    }
  }

  let settleAgain = false;
  /** Settles the writes the server took; one asked for while a round runs gets a round of its own. */
  function settle() {
    if (!live() || !leading) return Promise.resolve();
    if (settling) {
      settleAgain = true;
      return settling;
    }
    settling = (async () => {
      try {
        do {
          settleAgain = false;
          await settleAcked().catch(() => undefined);
        } while (settleAgain && live());
      } finally {
        settling = null;
      }
    })();
    return settling;
  }

  async function pass() {
    for (;;) {
      if (!live() || !leading || paused) return;
      const all = await deps.storage.listOutbox();
      if (!live()) return;
      const next = all.find((entry) => entry.state === "pending" || entry.state === "sending");
      if (!next) return;
      if (now() - Date.parse(next.createdAt) > OUTBOX_EXPIRY_MS) {
        await deps.storage.updateOutbox(next.mutationId, { state: "expired" });
        if (live()) deps.notify({ kind: "changed" });
        continue;
      }
      const dependencies = dependencyState(next, all);
      if (dependencies === "refused") {
        const refused = await reject(next, { status: 0, code: "DEPENDENCY_REJECTED", message: "Не отправлено: отклонено изменение, от которого оно зависит" });
        if (live()) deps.notify({ kind: "rejected", entries: refused });
        continue;
      }
      // Waiting for a write before it that cannot go (expired, held by the person): nothing after it goes either.
      if (dependencies === "blocked") return;
      await deps.storage.updateOutbox(next.mutationId, { state: "sending", attempts: next.attempts + 1 });
      if (!live()) return;
      // No answer at all (the network) counts as one to try again.
      const result = await deps.send({ ...next, state: "sending" }, signal).catch(() => null);
      if (!live()) return;
      if (!result || result.status >= 500 || result.status === 429) {
        // The same write is sent again with the same id; the server answers a repeat with its first outcome.
        await deps.storage.updateOutbox(next.mutationId, { state: "pending" });
        const delay = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)]!;
        failures += 1;
        await wait(delay, signal);
        continue;
      }
      failures = 0;
      if (result.status === 401) {
        await deps.storage.updateOutbox(next.mutationId, { state: "pending" });
        paused = true;
        if (live()) deps.notify({ kind: "session-required" });
        return;
      }
      if (result.status < 300) {
        const bodyVersion = (result.body as { structureVersion?: unknown } | null)?.structureVersion;
        const version = result.structureVersion ?? (typeof bodyVersion === "string" ? bodyVersion : null);
        await deps.storage.updateOutbox(next.mutationId, { state: "acked", ackVersion: version, error: null });
        if (!live()) return;
        deps.notify({ kind: "changed" });
        void settle();
        continue;
      }
      if (TERMINAL.has(result.status) && code(result.body) !== "MUTATION_IN_PROGRESS") {
        // The queue as it stands after the answer: writes added meanwhile that need this one go with it.
        const refused = await reject(next, { status: result.status, code: code(result.body), message: message(result.body, result.status) });
        if (live()) deps.notify({ kind: "rejected", entries: refused });
        continue;
      }
      // Anything else (a mutation still under way, an unknown answer) is tried again later.
      await deps.storage.updateOutbox(next.mutationId, { state: "pending" });
      await wait(BACKOFF_MS[0]!, signal);
    }
  }

  function kick() {
    if (!live()) return Promise.resolve();
    void settle();
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await pass();
        } while (again && live());
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    /** Keeps a write to send, numbered in the order made across tabs; the leading tab sends it. */
    enqueue(entry: Omit<OutboxEntry, "seq" | "state" | "attempts" | "createdAt" | "ackVersion" | "error">) {
      return track((async () => {
        if (!live()) return;
        await deps.storage.appendOutbox({ ...entry, state: "pending", attempts: 0, createdAt: new Date(now()).toISOString(), ackVersion: null, error: null });
        if (!live()) return;
        deps.notify({ kind: "changed" });
        await kick();
      })());
    },
    /** This tab leads now: writes a leader before it left mid-way are sent again (the server answers a repeat). */
    lead() {
      return track((async () => {
        if (!live()) return;
        leading = true;
        for (const entry of await deps.storage.listOutbox()) {
          if (!live()) return;
          if (entry.state === "sending") await deps.storage.updateOutbox(entry.mutationId, { state: "pending" });
        }
        await kick();
      })());
    },
    /** Signed in again: sending goes on. */
    resume() {
      paused = false;
      return kick();
    },
    /** Something may be ready to send or to settle (a write kept by another tab, the network back). */
    kick,
    /** Stops for good: a request on its way is cancelled, nothing more is sent, stored or told. Answers when the work under way has ended. */
    async stop() {
      lifetime.abort();
      leading = false;
      if (settleTimer) clearTimeout(settleTimer);
      await Promise.all([running, settling, ...begun].map((work) => work?.catch(() => undefined)));
    },
    get leading() {
      return leading;
    },
    get paused() {
      return paused;
    },
  };
}

/**
 * The Structure as this device shows it: the base, with the row edits not
 * yet confirmed applied over it in the order made, recalculated as the server
 * would. Writes it cannot repeat (other than row edits) are shown once synced;
 * an acked write the base already includes is not applied again.
 */
export function projectStructure(base: BaseRecord, entries: OutboxEntry[]) {
  let items: WbsItem[] = base.items;
  const unshown: string[] = [];
  for (const entry of entries) {
    if (entry.projectId !== base.projectId) continue;
    if (entry.state === "rejected" || entry.state === "expired") continue;
    if (entry.state === "acked" && entry.ackVersion && !newer(entry.ackVersion, base.version)) continue;
    const row = entry.method.toUpperCase() === "PATCH" ? entry.path.match(/\/wbs-items\/([^/?]+)$/)?.[1] : undefined;
    const patch = entry.body && typeof entry.body === "object" ? (entry.body as Record<string, unknown>) : null;
    const itemId = row ? decodeURIComponent(row) : null;
    if (!itemId || !patch || !items.some((item) => item.id === itemId)) {
      unshown.push(entry.mutationId);
      continue;
    }
    // Text, people and links of a row move nothing else: they show as sent.
    if (Object.entries(patch).every(([field, value]) => value === undefined || WBS_FIELDS_OUTSIDE_SCHEDULE.has(field))) {
      items = items.map((item) => (item.id === itemId ? ({ ...item, ...patch } as WbsItem) : item));
      continue;
    }
    const preview = base.calendarOverrides && base.today
      ? previewRowEdit({ items, dependencies: base.dependencies, calendarOverrides: base.calendarOverrides, today: base.today as never }, itemId, patch as Record<string, never>)
      : null;
    if (preview) items = preview.items;
    else unshown.push(entry.mutationId);
  }
  return { items, unshown };
}

/** Keeps the bases a page confirms, a second after the last change of each project, never over a newer one. */
export function createBaseCache(storage: StructureLocalStorage, delayMs = 1_000) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const latest = new Map<string, BaseRecord>();
  let closed = false;
  return {
    remember(record: BaseRecord) {
      if (closed) return;
      if (!supersedes(record, latest.get(record.projectId))) return;
      latest.set(record.projectId, record);
      const timer = timers.get(record.projectId);
      if (timer) clearTimeout(timer);
      timers.set(record.projectId, setTimeout(() => {
        timers.delete(record.projectId);
        if (!closed) void storage.writeBaseIfNewer(record).catch(() => undefined);
      }, delayMs));
    },
    /** Stops keeping anything: the saves not yet made are dropped. */
    close() {
      closed = true;
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}
