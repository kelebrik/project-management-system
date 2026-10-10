import { useCallback, useEffect, useState } from "react";
import { apiBase } from "../api/client";
import { liveClientId } from "./liveClient";

export type ProjectLiveEvent = {
  id: string;
  projectId: string;
  section: string;
  actorId: string | null;
  actorName: string | null;
  clientId: string | null;
  at: string;
};

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
    const connect = () => {
      if (stopped) return;
      source = new EventSource(`${apiBase}/api/projects/${encodeURIComponent(projectId)}/events`, { withCredentials: true });
      source.onopen = () => {
        failures = 0;
      };
      source.addEventListener("change", (message) => {
        try {
          const event = JSON.parse((message as MessageEvent<string>).data) as ProjectLiveEvent;
          if (event.projectId === projectId) setPending((current) => withLiveEvent(current, event));
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
      window.clearTimeout(retryTimer);
      source?.close();
    };
  }, [enabled, projectId]);

  const clear = useCallback(() => setPending([]), []);
  return { pending, clear };
}
