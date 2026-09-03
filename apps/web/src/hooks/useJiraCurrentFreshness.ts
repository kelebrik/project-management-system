import type { JiraCurrentFreshness } from "@pms/shared";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { apiClient } from "../api/client";
import { shouldNotifyJiraProjectionRefresh } from "../app/jiraCurrentFreshness";

type CurrentRefreshResponse = {
  freshness: JiraCurrentFreshness;
  queued: boolean;
};

const NETWORK_RETRY_MS = 60_000;

export function useJiraCurrentFreshness(
  projectId: string | null | undefined,
  onProjectionRefreshed?: () => void | Promise<void>,
) {
  const [freshness, setFreshness] = useState<JiraCurrentFreshness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshedAtRef = useRef<string | null>(null);
  const freshnessInitializedRef = useRef(false);
  const notifyProjectionRefreshed = useEffectEvent(async () => {
    await onProjectionRefreshed?.();
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    refreshedAtRef.current = null;
    freshnessInitializedRef.current = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setFreshness(null);
        setError(null);
      }
    });
    if (!projectId) return () => { cancelled = true; };

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = null;
      if (document.visibilityState !== "visible") return;
      timer = setTimeout(() => { void check(); }, Math.max(1_000, delayMs));
    };
    const check = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const response = await apiClient.post<CurrentRefreshResponse>(
          `/api/projects/${projectId}/jira/current-refresh`,
          {},
          "Не удалось проверить актуальность Jira",
        );
        if (cancelled) return;
        setFreshness(response.freshness);
        setError(null);
        const previous = refreshedAtRef.current;
        const current = response.freshness.refreshedAt;
        const initialized = freshnessInitializedRef.current;
        refreshedAtRef.current = current;
        freshnessInitializedRef.current = true;
        if (shouldNotifyJiraProjectionRefresh(initialized, previous, current)) {
          await notifyProjectionRefreshed();
          if (cancelled) return;
        }
        if (response.freshness.pollAfterMs !== null) {
          schedule(response.freshness.pollAfterMs);
        }
      } catch (reason) {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Не удалось проверить актуальность Jira");
        schedule(NETWORK_RETRY_MS);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        if (timer) clearTimeout(timer);
        timer = null;
        return;
      }
      void check();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (document.visibilityState === "visible") void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [projectId]);

  return { freshness, error };
}
