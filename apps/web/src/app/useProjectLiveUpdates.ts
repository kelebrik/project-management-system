import { useCallback, useEffect, useState } from "react";
import { apiBase, apiClient } from "../api/client";
import { liveClientId } from "./liveClient";
import { catchUpWithServer, confirmedStructure, onStructureIdle, type CatchUpOutcome, type ReadStructureChanges, type StructureChanges } from "./structureStore";

export type ProjectLiveEvent = {
  id: string;
  projectId: string;
  section: string;
  actorId: string | null;
  actorName: string | null;
  clientId: string | null;
  at: string;
  /** The Structure's version after the change, at least; absent from older servers. */
  structureVersion?: string | null;
  /** The Structure's journal holds every change it made: catching up shows it all. */
  structureOnly?: boolean;
};

/** Fresh Jira data: nobody's edit and nothing to lose, so the page takes it without asking. */
export function isQuietLiveEvent(event: Pick<ProjectLiveEvent, "section">) {
  return event.section === "jira";
}

/** The window event a page showing Jira data listens to, with the project in its detail. */
export const JIRA_DATA_UPDATED_EVENT = "pms-jira-data-updated";

/** Who changed what, the events in arrival order, names and sections once each. */
export function summarizeLiveEvents(events: ProjectLiveEvent[]) {
  const people = [...new Set(events.map((event) => event.actorName).filter((name): name is string => Boolean(name)))];
  const sections = [...new Set(events.map((event) => event.section))];
  return { people, sections, count: events.length };
}

const RETRY_MIN_MS = 5_000;
const RETRY_MAX_MS = 60_000;

/** Waiting time before the next attempt after this many failed ones in a row. */
export function liveRetryDelay(failures: number) {
  return Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** Math.max(0, failures - 1));
}

/** Adds an event unless it is this tab's own or already counted. */
export function withLiveEvent(pending: ProjectLiveEvent[], event: ProjectLiveEvent, ownClientId = liveClientId) {
  if (event.clientId && event.clientId === ownClientId) return pending;
  if (pending.some((item) => item.id === event.id)) return pending;
  return [...pending, event];
}

const readChanges: ReadStructureChanges = (projectId, since) =>
  apiClient.get<StructureChanges>(`/api/projects/${encodeURIComponent(projectId)}/structure?since=${encodeURIComponent(since)}`);

/** How long a catch-up held back by the page's own saves waits before it looks again. */
const DEFERRED_RETRY_MS = 1_000;

/**
 * Keeps the open project's Structure up with changes others make: each event
 * naming a newer version is caught up with quietly, once the page's own writes
 * are done. An event whose every change the catch-up shows needs no word; the
 * others, and any the page could not take in, are offered as before.
 */
export function createStructureLiveSync(
  projectId: string,
  offer: (event: ProjectLiveEvent) => void,
  options: { catchUp?: (projectId: string, hint: string | null, isCurrent: () => boolean) => Promise<CatchUpOutcome>; retryMs?: number } = {},
) {
  const catchUp = options.catchUp ?? ((id: string, hint: string | null, isCurrent: () => boolean) => catchUpWithServer(id, hint, readChanges, isCurrent));
  const retryMs = options.retryMs ?? DEFERRED_RETRY_MS;
  let held: ProjectLiveEvent[] = [];
  let wanted: string | null = null;
  /** Readings asked for whatever the events said (the stream opened, the page shown again), and how many of them a finished reading answered: one asked during a reading is not answered by it. */
  let dueAsked = 0;
  let dueAnswered = 0;
  /** A due reading that failed is tried once more later, not forever. */
  let dueRetried = false;
  let running = false;
  let again = false;
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const isCurrent = () => !stopped;
  const pendingWork = () => dueAsked > dueAnswered || wanted !== null || held.length > 0;
  const stopIdle = onStructureIdle(() => {
    if (pendingWork()) void run();
  });
  const newer = (left: string, right: string) => BigInt(left) > BigInt(right);
  const later = (ms: number) => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (pendingWork()) void run();
    }, ms);
  };
  /** Said when the page cannot take a change in and no event of it is held: someone changed the Structure. */
  const offerUnseen = () =>
    offer({ id: `catch-up-${Date.now()}`, projectId, section: "structure", actorId: null, actorName: null, clientId: null, at: new Date().toISOString() });
  /** Applies how a catch-up ended; answers whether a later attempt was set for it. */
  const settle = (outcome: CatchUpOutcome, dueTaken: number): boolean => {
    if (outcome === "deferred") return true;
    if (outcome === "conflict" || outcome === "failed") {
      const unseen = held.length === 0 && (outcome === "conflict" || wanted !== null);
      held.forEach(offer);
      if (unseen) offerUnseen();
      held = [];
      wanted = null;
      if (outcome === "failed" && dueTaken > dueAnswered && !dueRetried) {
        // A reading that could not be made (the network) is tried once more before giving up.
        dueRetried = true;
        later(retryMs * 5);
        return true;
      }
      dueAnswered = Math.max(dueAnswered, dueTaken);
      return false;
    }
    dueAnswered = Math.max(dueAnswered, dueTaken);
    dueRetried = false;
    const version = confirmedStructure(projectId)?.version;
    // Events up to the version shown are seen; a later one waits for the next round.
    const seen = (event: ProjectLiveEvent) => version !== undefined && !newer(event.structureVersion ?? "0", version);
    held = held.filter((event) => !seen(event));
    if (wanted !== null && version !== undefined && !newer(wanted, version)) wanted = null;
    return false;
  };
  const run = async (): Promise<void> => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        const dueTaken = dueAsked;
        const outcome = await catchUp(projectId, wanted, isCurrent);
        if (stopped) return;
        if (settle(outcome, dueTaken)) {
          if (outcome === "deferred") later(retryMs);
          // The later attempt reads; only a reading asked for meanwhile goes now.
          if (dueAsked === dueTaken) return;
        }
        if (pendingWork()) again = true;
      } while (again && !stopped && pendingWork());
    } finally {
      running = false;
    }
  };
  return {
    /** A change someone else made: caught up with, and offered unless the catch-up shows all of it. */
    receive(event: ProjectLiveEvent) {
      if (stopped) return;
      const version = event.structureVersion ?? null;
      if (version !== null && /^\d{1,19}$/.test(version)) {
        if (wanted === null || newer(version, wanted)) wanted = version;
        if (event.structureOnly) held.push(event);
        else offer(event);
        void run();
        return;
      }
      offer(event);
    },
    /** Catches up with whatever changed meanwhile (the stream opened, the page shown again), even with no event to say so. */
    refresh() {
      if (stopped) return;
      dueAsked += 1;
      dueRetried = false;
      void run();
    },
    stop() {
      stopped = true;
      stopIdle();
      if (retryTimer) clearTimeout(retryTimer);
    },
  };
}

/**
 * Listens to the changes others make in the open project. The browser
 * reconnects a dropped stream itself; a refused one (no longer signed in, no
 * access) is closed, and then this tries again with a growing pause.
 */
export function useProjectLiveUpdates(projectId: string | null, enabled: boolean) {
  const [pending, setPending] = useState<ProjectLiveEvent[]>([]);
  const [connectedProjectId, setConnectedProjectId] = useState(projectId);
  if (connectedProjectId !== projectId) {
    // A change of project starts with nothing pending.
    setConnectedProjectId(projectId);
    setPending([]);
  }

  useEffect(() => {
    if (!projectId || !enabled || typeof EventSource === "undefined") return;
    let source: EventSource | null = null;
    let failures = 0;
    let retryTimer = 0;
    let stopped = false;
    const sync = createStructureLiveSync(projectId, (event) => setPending((current) => withLiveEvent(current, event)));
    // A page shown again may have missed changes while its stream slept.
    const onVisible = () => {
      if (document.visibilityState === "visible") sync.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const connect = () => {
      if (stopped) return;
      source = new EventSource(`${apiBase}/api/projects/${encodeURIComponent(projectId)}/events`, { withCredentials: true });
      source.onopen = () => {
        failures = 0;
        // Events sent before the stream opened (since the project was read, or while it was down) are lost: the journal tells them instead.
        sync.refresh();
      };
      source.addEventListener("change", (message) => {
        try {
          const event = JSON.parse((message as MessageEvent<string>).data) as ProjectLiveEvent;
          if (event.projectId !== projectId || (event.clientId && event.clientId === liveClientId)) return;
          if (isQuietLiveEvent(event)) {
            window.dispatchEvent(new CustomEvent(JIRA_DATA_UPDATED_EVENT, { detail: { projectId } }));
            return;
          }
          sync.receive(event);
        } catch {
          // A malformed event is skipped.
        }
      });
      source.onerror = () => {
        if (source?.readyState !== EventSource.CLOSED) return;
        failures += 1;
        retryTimer = window.setTimeout(connect, liveRetryDelay(failures));
      };
    };
    connect();
    return () => {
      stopped = true;
      sync.stop();
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(retryTimer);
      source?.close();
    };
  }, [enabled, projectId]);

  const clear = useCallback(() => setPending([]), []);
  return { pending, clear };
}
