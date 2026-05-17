import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../api/client";

export function useApiResource<T>(
  path: string | null,
  options: {
    fallback: string;
    onLoaded?: (data: T) => void;
  },
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextPath: string, fallback: string) => {
    setLoading(true);
    setError(null);
    try {
      const nextData = await apiClient.get<T>(nextPath, fallback);
      setData(nextData);
      options.onLoaded?.(nextData);
      return nextData;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : fallback);
      return null;
    } finally {
      setLoading(false);
    }
  }, [options]);

  const reload = useCallback(async () => {
    if (!path) return null;
    return load(path, options.fallback);
  }, [load, options.fallback, path]);

  useEffect(() => {
    if (!path) return;
    const timeoutId = window.setTimeout(() => {
      void load(path, options.fallback);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load, options.fallback, path]);

  return { data, setData, loading, error, reload };
}
