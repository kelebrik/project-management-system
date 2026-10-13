import { useEffect, useState } from "react";
import { apiBase } from "../../api/client";
import { businessUnitHeaders } from "../businessUnitContext";
import { liveClientHeaders } from "../liveClient";
import { requestHeaders } from "../structureMutations";
import { confirmedStructure, forgetStructureCopies, mergeStructureChanges, onStructureStored, structureDeltaHeaders, type StructureChanges, type StructureState } from "../structureStore";
import { requestLeadership } from "./leader";
import { createBaseCache, createOutbox, type OutboxNotice } from "./outbox";
import { openIndexedDbStorage, removeStructureDatabaseIfEmpty, type BaseRecord, type OutboxEntry, type StructureLocalStorage } from "./storage";

const CHANNEL = "pms-structure";

function baseOf(projectId: string, state: StructureState): BaseRecord {
  return {
    projectId,
    version: state.version,
    items: state.items,
    dependencies: state.dependencies,
    calendarOverrides: state.calendarOverrides,
    today: state.today,
    savedAt: new Date().toISOString(),
  };
}

/**
 * Sends a kept write as the page would, with the id it was kept under, and
 * names the person it was made by: the server refuses it under anyone else's
 * session (another person signed in in another tab).
 */
async function sendKept(entry: OutboxEntry, userId: string, signal: AbortSignal) {
  const response = await fetch(`${apiBase}/api${entry.path}`, {
    method: entry.method,
    credentials: "include",
    signal,
    headers: requestHeaders(
      { "Content-Type": "application/json", ...businessUnitHeaders(), ...liveClientHeaders(), ...structureDeltaHeaders },
      { "X-PMS-Mutation-Id": entry.mutationId, "X-PMS-Expected-User": userId, ...(entry.baseVersion ? { "X-PMS-Base-Version": entry.baseVersion } : {}) },
      entry.method,
      `/api${entry.path}`,
    ),
    body: entry.body === undefined ? undefined : JSON.stringify(entry.body),
  });
  const text = await response.text();
  return { status: response.status, body: parseAnswer(text), structureVersion: response.headers.get("X-PMS-Structure-Version") };
}

function parseAnswer(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * The project's Structure now: the changes since a copy, applied to that very
 * copy (the one kept here, or the page's), or the whole Structure when there
 * is none. Changes are never applied to a copy they did not start from.
 */
export async function readCurrentBase(storage: StructureLocalStorage, projectId: string, signal: AbortSignal): Promise<BaseRecord | null> {
  const kept = await storage.readBase(projectId);
  const confirmed = confirmedStructure(projectId);
  const from: StructureState | null = kept
    ? { version: kept.version, items: kept.items, dependencies: kept.dependencies, criticalPath: null, calendarOverrides: kept.calendarOverrides, today: kept.today }
    : confirmed
      ? { ...confirmed }
      : null;
  const query = from ? `?since=${encodeURIComponent(from.version)}` : "";
  const response = await fetch(`${apiBase}/api/projects/${encodeURIComponent(projectId)}/structure${query}`, {
    credentials: "include",
    signal,
    headers: { ...businessUnitHeaders(), ...liveClientHeaders() },
  });
  if (!response.ok) return null;
  const changes = (await response.json()) as StructureChanges;
  if (!changes.full && (!from || changes.baseVersion !== from.version)) return null;
  return baseOf(projectId, mergeStructureChanges(changes.full ? undefined : from!, changes));
}

/** Whether the person is still the one signed in, after another tab removed their database. */
async function stillSignedIn(userId: string) {
  const response = await fetch(`${apiBase}/api/auth/me`, { credentials: "include" }).catch(() => null);
  if (!response?.ok) return false;
  const me = (await response.json().catch(() => null)) as { id?: string; user?: { id?: string } } | null;
  return (me?.user?.id ?? me?.id) === userId;
}

/**
 * Keeps the signed-in person's Structures on this device: every copy the
 * server confirms is stored (never over a newer one), and the one leading tab
 * sends the writes kept to send. Signing out (or another person signing in)
 * stops all of it, forgets the copies and removes the person's database when
 * nothing is left to send.
 */
const ignoreNotice = () => undefined;

export function useStructureLocal(userId: string | null, onNotice: (notice: OutboxNotice) => void = ignoreNotice) {
  // Moves when another tab removed the database: everything here stops, and opens again if the person is still signed in.
  const [opening, setOpening] = useState(0);
  useEffect(() => {
    if (!userId || typeof indexedDB === "undefined") return;
    let stopped = false;
    let storage: StructureLocalStorage | null = null;
    let shutdown: () => Promise<void> = async () => undefined;
    void (async () => {
      const opened = await openIndexedDbStorage(userId, indexedDB, () => {
        // Removed under this tab (a sign-out elsewhere): stop, then look whether this person still works here.
        if (stopped) return;
        stopped = true;
        void shutdown().then(async () => {
          if (await stillSignedIn(userId)) setOpening((value) => value + 1);
        });
      }).catch(() => null);
      if (!opened) return;
      if (stopped) {
        opened.close();
        return;
      }
      storage = opened;
      const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(`${CHANNEL}-${userId}`);
      const cache = createBaseCache(opened);
      const outbox = createOutbox({
        storage: opened,
        send: (entry, signal) => sendKept(entry, userId, signal),
        readBase: (projectId, signal) => readCurrentBase(opened, projectId, signal),
        notify: (notice) => {
          // Other tabs only learn to read the database again; it is the one source.
          if (notice.kind === "changed") channel?.postMessage("changed");
          onNotice(notice);
        },
      });
      if (channel) channel.onmessage = () => void outbox.kick();
      const onOnline = () => void outbox.kick();
      window.addEventListener("online", onOnline);
      const stopStored = onStructureStored((projectId, state) => cache.remember(baseOf(projectId, state)));
      const release = requestLeadership(`pms-outbox-${userId}`, () => void outbox.lead());
      shutdown = async () => {
        stopStored();
        cache.close();
        window.removeEventListener("online", onOnline);
        channel?.close();
        // The lock goes once nothing more is sent from here.
        await outbox.stop();
        release();
        opened.close();
      };
    })();
    return () => {
      const wasStopped = stopped;
      stopped = true;
      forgetStructureCopies();
      const closing = storage;
      void (async () => {
        if (!wasStopped) await shutdown();
        if (!closing || wasStopped) return;
        // A database with writes still to send stays for the person to come back to.
        await removeStructureDatabaseIfEmpty(userId).catch(() => undefined);
      })();
    };
  }, [onNotice, opening, userId]);
}
