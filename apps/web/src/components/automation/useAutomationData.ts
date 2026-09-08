import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';

export function useAutomationData<T>(url: string, revision = 0): { url: string; revision: number; data?: T; error?: string } {
  const [state, setState] = useState<{ url: string; revision: number; data?: T; error?: string }>({ url: '', revision: -1 });
  useEffect(() => {
    let cancelled = false;
    void apiClient.get<T>(url, 'Не удалось загрузить данные').then((data) => {
      if (!cancelled) setState({ url, revision, data });
    }).catch((error: unknown) => { if (!cancelled) setState({ url, revision, error: error instanceof Error ? error.message : 'Ошибка загрузки' }); });
    return () => { cancelled = true; };
  }, [url, revision]);
  return state.url === url && state.revision === revision ? state : { url, revision };
}

export const displayDay = (value: string | null) => value ? value.slice(0, 10).split('-').reverse().join('.') : '—';
