import { useEffect, useState } from "react";

import { apiClient } from "../api/client";
import type { SearchResult } from "./domainTypes";

export function useGlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset stale async search state when the query leaves searchable range.
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timeoutId = window.setTimeout(() => {
      apiClient
        .get<SearchResult[]>(
          `/api/search?q=${encodeURIComponent(normalizedQuery)}&limit=12`,
          "Не удалось выполнить поиск",
        )
        .then((nextResults) => {
          if (!cancelled) {
            setResults(nextResults);
            setOpen(true);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  function clear() {
    setQuery("");
    setOpen(false);
  }

  return {
    clear,
    loading,
    open,
    query,
    results,
    setOpen,
    setQuery,
  };
}
