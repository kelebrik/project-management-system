import { useAutomationData } from './useAutomationData';
import { useState } from 'react';
import type { AutomationInsight } from '@pms/shared';
import { apiClient } from '../../api/client';
import { wbsStatusLabel } from '../../app/labels';
import type { WbsItemStatus } from '../../app/domainTypes';
import { AutomationError } from './AutomationPanel';

export function ReconciliationContent({ projectId, readOnly, refresh }: { projectId: string; readOnly: boolean; refresh?: () => Promise<unknown> }) {
  const [revision, setRevision] = useState(0);
  const { data, error } = useAutomationData<AutomationInsight>(`/api/projects/${encodeURIComponent(projectId)}/automation/insights`, revision);
  const [selected, setSelected] = useState<Record<string, { status?: boolean; owner?: boolean }>>({});
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const rows = data?.reconciliation ?? [];
  const apply = async () => {
    const items = rows.filter((row) => row.actionable && (selected[row.id]?.status || selected[row.id]?.owner)).map((row) => ({
      id: row.id, expectedUpdatedAt: row.expectedUpdatedAt,
      expectedJira: { key: row.jiraKey, updatedAt: row.expectedJiraUpdatedAt },
      patch: { ...(selected[row.id]?.status && row.proposedStatus ? { status: row.proposedStatus } : {}), ...(selected[row.id]?.owner && row.proposedOwner ? { owner: row.proposedOwner } : {}) },
    }));
    if (!items.length) return;
    setSaving(true); setSaveError(''); setMessage('');
    try {
      await apiClient.patch(`/api/projects/${encodeURIComponent(projectId)}/wbs-items/bulk`, { items }, 'Не удалось применить сверку');
      setSelected({}); setMessage(`Обновлено работ: ${items.length}`); setRevision((value) => value + 1);
      await refresh?.().catch(() => setMessage('Изменения сохранены. Обновите страницу проекта для загрузки актуальной Структуры.'));
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Не удалось применить сверку'); setSelected({}); setRevision((value) => value + 1); }
    finally { setSaving(false); }
  };
  return <><p>Сравнение связанных работ с последним загруженным снимком Jira. Выберите поля для изменения в WBS. Jira не изменяется.</p>
    <div className="automation-actions"><button disabled={saving} onClick={() => { setSelected({}); setRevision((value) => value + 1); }}>Повторить сверку</button>
      <button disabled={readOnly || saving || !Object.values(selected).some((value) => value.status || value.owner)} onClick={() => void apply()}>{saving ? 'Применяем…' : 'Применить выбранное к WBS'}</button></div>
    <AutomationError error={error || saveError} />{message && <p role="status">{message}</p>}
    {!data && !error && <p role="status">Сверяем данные…</p>}
    {data && rows.length === 0 && <p>Расхождения не найдены. Проверяются только работы с указанным ключом Jira.</p>}
    {rows.map((row) => <article className="automation-card" key={row.id}><a href={row.href}>{row.code} {row.title}</a>
      <p>{row.jiraKey} · Статус Jira: {row.jiraStatus ?? 'Нет данных'} · Снимок загружен: {row.syncedAt ? new Date(row.syncedAt).toLocaleString('ru-RU') : '—'}</p>
      {row.warnings.map((warning) => <p className="automation-warning" key={warning}>{warning}</p>)}
      {row.proposedStatus && <label className="automation-check"><input type="checkbox" disabled={readOnly || saving || !row.actionable} checked={Boolean(selected[row.id]?.status)} onChange={(event) => setSelected((value) => ({ ...value, [row.id]: { ...value[row.id], status: event.target.checked } }))} />Статус: {wbsStatusLabel(row.currentStatus as WbsItemStatus)} → {wbsStatusLabel(row.proposedStatus as WbsItemStatus)}</label>}
      {row.proposedOwner && <label className="automation-check"><input type="checkbox" disabled={readOnly || saving || !row.actionable} checked={Boolean(selected[row.id]?.owner)} onChange={(event) => setSelected((value) => ({ ...value, [row.id]: { ...value[row.id], owner: event.target.checked } }))} />Ответственный: {row.currentOwner || 'Не назначен'} → {row.proposedOwner}</label>}
    </article>)}
  </>;
}
