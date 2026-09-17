import { useI18n as useInterfaceTranslation } from "../../i18n/I18nProvider";
import { intlLocale } from "../../i18n/locale";
import { useI18n as useLocaleTranslation } from "../../i18n/I18nProvider";
import { useAutomationData } from './useAutomationData';
import { useState } from 'react';
import type { AutomationInsight } from '@pms/shared';
import { apiClient } from '../../api/client';
import { wbsStatusLabel } from '../../app/labels';
import type { WbsItemStatus } from '../../app/domainTypes';
import { AutomationError } from './AutomationPanel';

export function ReconciliationContent({ projectId, readOnly, refresh }: { projectId: string; readOnly: boolean; refresh?: () => Promise<unknown> }) {
  const { t: uiText } = useInterfaceTranslation();
  const { locale: uiLocale } = useLocaleTranslation();
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
      await apiClient.patch(`/api/projects/${encodeURIComponent(projectId)}/wbs-items/bulk`, { items }, uiText('ui.automation.reconciliationApplyFailed'));
      setSelected({}); setMessage(uiText('ui.automation.reconciliationUpdated', { count: items.length })); setRevision((value) => value + 1);
      await refresh?.().catch(() => setMessage(uiText('ui.automation.reconciliationSavedRefresh')));
    } catch { setSaveError(uiText('ui.automation.reconciliationApplyFailed')); setSelected({}); setRevision((value) => value + 1); }
    finally { setSaving(false); }
  };
  return <><p>{uiText("ui.automation.reconciliationDescription")}</p>
    <div className="automation-actions"><button disabled={saving} onClick={() => { setSelected({}); setRevision((value) => value + 1); }}>{uiText("ui.automation.rerunReconciliation")}</button>
      <button disabled={readOnly || saving || !Object.values(selected).some((value) => value.status || value.owner)} onClick={() => void apply()}>{saving ? uiText("ui.automation.applying") : uiText("ui.automation.applySelectionToWbs")}</button></div>
    <AutomationError error={error || saveError} />{message && <p role="status">{message}</p>}
    {!data && !error && <p role="status">{uiText("ui.automation.reconcilingData")}</p>}
    {data && rows.length === 0 && <p>{uiText("ui.automation.noDiscrepanciesFound")}</p>}
    {rows.map((row) => <article className="automation-card" key={row.id}><a href={row.href}>{row.code} {row.title}</a>
      <p>{row.jiraKey} {uiText("ui.automation.jiraStatusInline")} {row.jiraStatus ?? uiText("ui.automation.noData")} {uiText("ui.automation.snapshotLoadedInline")} {row.syncedAt ? new Date(row.syncedAt).toLocaleString(intlLocale(uiLocale)) : '—'}</p>
      {row.warnings.map((warning) => <p className="automation-warning" key={warning}>{warning}</p>)}
      {row.proposedStatus && <label className="automation-check"><input type="checkbox" disabled={readOnly || saving || !row.actionable} checked={Boolean(selected[row.id]?.status)} onChange={(event) => setSelected((value) => ({ ...value, [row.id]: { ...value[row.id], status: event.target.checked } }))} />{uiText("ui.common.statusLabel")} {wbsStatusLabel(row.currentStatus as WbsItemStatus)} → {wbsStatusLabel(row.proposedStatus as WbsItemStatus)}</label>}
      {row.proposedOwner && <label className="automation-check"><input type="checkbox" disabled={readOnly || saving || !row.actionable} checked={Boolean(selected[row.id]?.owner)} onChange={(event) => setSelected((value) => ({ ...value, [row.id]: { ...value[row.id], owner: event.target.checked } }))} />{uiText("ui.automation.ownerLabel")} {row.currentOwner || uiText("ui.automation.notAssigned")} → {row.proposedOwner}</label>}
    </article>)}
  </>;
}
