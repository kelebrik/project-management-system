import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';

export function useAutomationData<T>(url: string, revision = 0): { url: string; revision: number; data?: T; error?: string } {
  const { t } = useI18n();
  const [state, setState] = useState<{ url: string; revision: number; data?: T; error?: string }>({ url: '', revision: -1 });
  useEffect(() => {
    let cancelled = false;
    void apiClient.get<T>(url, t('ui.automation.dataLoadFailed')).then((data) => {
      if (!cancelled) setState({ url, revision, data });
    }).catch(() => { if (!cancelled) setState({ url, revision, error: t('ui.automation.dataLoadFailed') }); });
    return () => { cancelled = true; };
  }, [t, url, revision]);
  return state.url === url && state.revision === revision ? state : { url, revision };
}

export const displayDay = (value: string | null) => value ? value.slice(0, 10).split('-').reverse().join('.') : '—';
