import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../api/client";
import type { AuditEvent } from "../app/adminTypes";

export const AUDIT_PAGE_SIZE = 100;

export type AuditFilters = {
  from: string;
  to: string;
  projectId: string;
  actor: string;
  action: string;
};

export const emptyAuditFilters: AuditFilters = { from: "", to: "", projectId: "", actor: "", action: "" };

export function hasAuditFilters(filters: AuditFilters) {
  return Object.values(filters).some((value) => value.trim().length > 0);
}

function localDayStart(day: string, offsetDays = 0) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date + offsetDays).toISOString();
}

/** Days are the reader's local days; the end day is included, so `to` is the next midnight. */
export function auditEventsPath(filters: AuditFilters, before?: string) {
  const params = new URLSearchParams({ limit: String(AUDIT_PAGE_SIZE) });
  if (filters.from) params.set("from", localDayStart(filters.from));
  if (filters.to) params.set("to", localDayStart(filters.to, 1));
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.actor.trim()) params.set("actor", filters.actor.trim());
  if (filters.action) params.set("action", filters.action);
  if (before) params.set("before", before);
  return `/api/audit-events?${params.toString()}`;
}

// Filters are kept with the rows they produced, so a failed request never
// pairs one filter with another filter's cursor. `base` is the shared first
// page the rows were loaded against; a reload of it makes them stale.
type LoadedJournal = { events: AuditEvent[]; hasMore: boolean; filters: AuditFilters; base: AuditEvent[] };

/**
 * The unfiltered first page is the shared admin state; filters and further
 * pages are loaded here and refreshed whenever the shared page is reloaded.
 */
export function useAuditLog(sharedEvents: AuditEvent[], reloadSharedEvents: () => Promise<void> | void) {
  const [loaded, setLoaded] = useState<LoadedJournal | null>(null);
  const [pendingRequest, setPendingRequest] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  // The last filters the reader asked for, even while their first page is still loading.
  const requestedFiltersRef = useRef<AuditFilters>(emptyAuditFilters);

  const fetchPage = useCallback(async (filters: AuditFilters, previous: AuditEvent[], base: AuditEvent[]) => {
    const request = ++requestRef.current;
    setPendingRequest(request);
    setError(null);
    try {
      const page = await apiClient.get<AuditEvent[]>(
        auditEventsPath(filters, previous.at(-1)?.id),
        "Не удалось загрузить журнал аудита",
      );
      if (request !== requestRef.current) return;
      setLoaded({ events: [...previous, ...page], hasMore: page.length === AUDIT_PAGE_SIZE, filters, base });
    } catch (loadError) {
      if (request !== requestRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить журнал аудита");
    } finally {
      setPendingRequest((current) => (current === request ? null : current));
    }
  }, []);

  const filtered = loaded !== null && hasAuditFilters(loaded.filters);
  const stale = loaded !== null && loaded.base !== sharedEvents;
  // Unfiltered pages are dropped on a shared reload; filtered rows stay until their refetch lands.
  const current = loaded && (!stale || filtered) ? loaded : null;

  const applyFilters = useCallback(async (filters: AuditFilters) => {
    requestedFiltersRef.current = filters;
    if (hasAuditFilters(filters)) {
      await fetchPage(filters, [], sharedEvents);
      return;
    }
    requestRef.current += 1;
    setPendingRequest(null);
    setError(null);
    setLoaded(null);
    await reloadSharedEvents();
  }, [fetchPage, reloadSharedEvents, sharedEvents]);

  const refresh = useCallback(
    () => applyFilters(current?.filters ?? emptyAuditFilters),
    [applyFilters, current],
  );

  const loadMore = useCallback(async () => {
    // Stale filtered rows predate a reload; continuing them would stamp old rows as current.
    if (current && stale) {
      await fetchPage(current.filters, [], sharedEvents);
      return;
    }
    await fetchPage(current?.filters ?? emptyAuditFilters, current?.events ?? sharedEvents, sharedEvents);
  }, [current, fetchPage, sharedEvents, stale]);

  // A reload elsewhere (restoring WBS items, project actions) restarts a filtered journal.
  useEffect(() => {
    if (!loaded || !filtered || !stale) return;
    const requested = hasAuditFilters(requestedFiltersRef.current) ? requestedFiltersRef.current : loaded.filters;
    void fetchPage(requested, [], sharedEvents);
  }, [fetchPage, filtered, loaded, sharedEvents, stale]);

  const filters = current?.filters ?? emptyAuditFilters;
  return {
    events: current?.events ?? sharedEvents,
    hasMore: current ? current.hasMore : sharedEvents.length >= AUDIT_PAGE_SIZE,
    filters,
    filtered: hasAuditFilters(filters),
    loading: pendingRequest !== null,
    error,
    applyFilters,
    refresh,
    loadMore,
  };
}
