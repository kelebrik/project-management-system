import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../api/client";
import type { PageVisitAnalyticsReport } from "../app/pageVisitAnalytics";

function loadPageVisitAnalytics() {
  const timezoneOffsetMinutes = new Date().getTimezoneOffset();
  return apiClient.get<PageVisitAnalyticsReport>(
    `/api/admin/page-visits?timezoneOffsetMinutes=${timezoneOffsetMinutes}`,
    "Не удалось загрузить посещаемость",
  );
}

export function usePageVisitAnalytics() {
  const [report, setReport] = useState<PageVisitAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadPageVisitAnalytics();
      setReport(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Не удалось загрузить посещаемость",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadPageVisitAnalytics()
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не удалось загрузить посещаемость",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { report, loading, error, reload };
}
