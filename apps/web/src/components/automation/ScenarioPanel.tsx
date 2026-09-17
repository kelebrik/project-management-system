import { useI18n as useInterfaceTranslation } from "../../i18n/I18nProvider";
import { displayDay } from './useAutomationData';
import { useEffect, useRef, useState } from 'react';
import type { ScenarioPatch, ScenarioResult } from '@pms/shared';
import { apiClient } from '../../api/client';
import type { WbsItem } from '../../app/domainTypes';
import { AutomationError, AutomationPanel } from './AutomationPanel';

type EditorRow = { id: string; startDate: string; dueDate: string; workDays: string };
type SavedScenario = { version: 1; name: string; fingerprint: string; rows: EditorRow[] };
type ScenarioPanelProps = { projectId: string; userId: string; items: WbsItem[]; sourceKey: string; result: ScenarioResult | null; onResult: (result: ScenarioResult | null) => void };
function ScenarioContent({ projectId, userId, items, sourceKey, result, onResult }: ScenarioPanelProps) {
  const { t: uiText } = useInterfaceTranslation();
  const requestVersion = useRef(0);
  const key = `pms:scenarios:v1:${userId}:${projectId}`;
  const [rows, setRows] = useState<EditorRow[]>([]);
  const setResult = onResult;
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [name, setName] = useState(() => uiText('ui.automation.defaultVariantName'));
  const [saved, setSaved] = useState<SavedScenario[]>(() => {
    try { const data: unknown = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(data) ? data.filter((value): value is SavedScenario => value?.version === 1 && typeof value.name === 'string' && typeof value.fingerprint === 'string' && Array.isArray(value.rows) && value.rows.length <= 20 && value.rows.every((row: EditorRow) => typeof row.id === 'string' && typeof row.startDate === 'string' && typeof row.dueDate === 'string' && typeof row.workDays === 'string')) : []; } catch { return []; }
  });
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);
  useEffect(() => {
    requestVersion.current++;
    // Invalidate the calculation after a working-plan refresh, preserving the draft.
    onResult(null);
    // This is a request generation counter, not a DOM ref: invalidate the latest request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { requestVersion.current++; };
  }, [sourceKey, onResult]);
  const eligible = items.filter((item) => !['PHASE', 'GOAL', 'MILESTONE'].includes(item.type) && item.status !== 'CANCELLED' && !items.some((child) => child.parentId === item.id));
  const edit = (index: number, patch: Partial<EditorRow>) => { setRows((value) => value.map((row, i) => i === index ? { ...row, ...patch } : row)); setResult(null); };
  const calculate = async () => {
    const version = ++requestVersion.current;
    setSaving(true); setError(''); setNotice(''); setResult(null);
    const patches: ScenarioPatch[] = rows.map((row) => ({ id: row.id, ...(row.startDate ? { startDate: row.startDate } : {}), ...(row.dueDate ? { dueDate: row.dueDate } : {}), ...(row.workDays ? { workDays: Number(row.workDays) } : {}) }));
    try {
      const data = await apiClient.get<ScenarioResult>(`/api/projects/${encodeURIComponent(projectId)}/automation/scenario?patches=${encodeURIComponent(JSON.stringify(patches))}`, uiText('ui.automation.scenarioCalculationFailed'));
      if (version !== requestVersion.current) return;
      if (!data.schedule) throw new Error(uiText('ui.automation.scenarioServerOutdated'));
      setResult(data);
      if (savedFingerprint && savedFingerprint !== data.fingerprint) setNotice(uiText('ui.automation.scenarioPlanChanged'));
    } catch { setError(uiText('ui.automation.scenarioCalculationFailed')); }
    finally { setSaving(false); }
  };
  const store = (next: SavedScenario[]) => { try { localStorage.setItem(key, JSON.stringify(next)); setSaved(next); return true; } catch { setError(uiText('ui.automation.scenarioStoreFailed')); return false; } };
  return <><p>{uiText("ui.automation.scenarioPanelDescription")}</p>
    <p>{uiText("ui.automation.scenarioPanelHint")}</p>
    <div className="automation-actions"><button disabled={saving || rows.length >= 20 || rows.length >= eligible.length} onClick={() => { const item = eligible.find((candidate) => !rows.some((row) => row.id === candidate.id)); if (item) { setRows((value) => [...value, { id: item.id, startDate: '', dueDate: '', workDays: '' }]); setResult(null); } }}>{uiText("ui.automation.addChange")}</button><button disabled={saving} onClick={() => void calculate()}>{saving ? uiText("ui.automation.calculating") : uiText("ui.automation.compareWithWorkingPlan")}</button></div>
    {rows.map((row, index) => <div className="automation-card automation-grid" key={index}>
      <label>{uiText("ui.automation.workItem")}<select disabled={saving} value={row.id} onChange={(event) => edit(index, { id: event.target.value })}>{eligible.map((item) => <option disabled={rows.some((other, otherIndex) => otherIndex !== index && other.id === item.id)} value={item.id} key={item.id}>{item.code} {item.title}</option>)}</select></label>
      <label>{uiText("ui.automation.startNoEarlierThan")}<input disabled={saving} type="date" value={row.startDate} onChange={(event) => edit(index, { startDate: event.target.value })} /></label>
      <label>{uiText("ui.automation.newFinish")}<input disabled={saving || Boolean(row.workDays)} type="date" value={row.dueDate} onChange={(event) => edit(index, { dueDate: event.target.value })} /></label>
      <label>{uiText("ui.automation.durationWorkingDays")}<input disabled={saving || Boolean(row.dueDate)} type="number" min={1} max={3650} value={row.workDays} onChange={(event) => edit(index, { workDays: event.target.value })} /></label>
      <button disabled={saving} onClick={() => { setRows((value) => value.filter((_, i) => i !== index)); setResult(null); }}>{uiText("ui.automation.removeChange")}</button>
    </div>)}
    <AutomationError error={error} />{notice && <p role="status">{notice}</p>}
    {result && <><p><strong>{uiText("ui.automation.scheduleFinishLabel")}</strong> {displayDay(result.beforeFinish)} → {displayDay(result.afterFinish)}{uiText("ui.automation.criticalWorkItemsCount")} {result.beforeCriticalIds.length} → {result.afterCriticalIds.length}.</p>
      {result.changes.length === 0 ? <p>{uiText("ui.automation.datesUnchanged")}</p> : <div className="automation-table-wrap"><table className="automation-table"><thead><tr><th>{uiText("ui.automation.workItemOrMilestone")}</th><th>{uiText("ui.automation.startBeforeAfter")}</th><th>{uiText("ui.automation.finishBeforeAfter")}</th><th>{uiText("ui.automation.criticalPath")}</th></tr></thead><tbody>{result.changes.map((row) => <tr key={row.id}><td><a href={row.href}>{row.code} {row.title}</a>{row.checkpoint && <strong> {uiText("ui.automation.milestoneInline")}</strong>}</td><td>{displayDay(row.beforeStart)} → {displayDay(row.afterStart)}</td><td>{displayDay(row.beforeFinish)} → {displayDay(row.afterFinish)}</td><td>{result.beforeCriticalIds.includes(row.id) ? uiText("ui.automation.yes") : uiText("ui.automation.no")} → {result.afterCriticalIds.includes(row.id) ? uiText("ui.automation.yes") : uiText("ui.automation.no")}</td></tr>)}</tbody></table></div>}
      <div className="automation-actions"><label>{uiText("ui.automation.variantName")}<input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label><button disabled={!name.trim()} onClick={() => { if (store([{ version: 1 as const, name: name.trim(), fingerprint: result.fingerprint, rows }, ...saved.filter((value) => value.name !== name.trim())].slice(0, 10))) setNotice(uiText('ui.automation.scenarioVariantStored')); }}>{uiText("ui.automation.saveVariant")}</button></div>
    </>}
    {saved.length > 0 && <><h4>{uiText("ui.automation.savedVariantsInBrowser")}</h4>{saved.map((variant) => <div className="automation-row" key={variant.name}><span>{variant.name}</span><button disabled={saving} onClick={() => { setRows(variant.rows); setName(variant.name); setSavedFingerprint(variant.fingerprint); setResult(null); setNotice(uiText('ui.automation.scenarioPressCompare')); }}>{uiText("ui.automation.load")}</button><button onClick={() => store(saved.filter((value) => value.name !== variant.name))}>{uiText("ui.automation.deleteVariant")}</button></div>)}</>}
  </>;
}
export function ScenarioPanel(props: ScenarioPanelProps) {
  const { t: uiText } = useInterfaceTranslation(); return <AutomationPanel title={uiText("ui.automation.whatIfScenarios")}><ScenarioContent key={`${props.userId}:${props.projectId}`} {...props} /></AutomationPanel>; }
