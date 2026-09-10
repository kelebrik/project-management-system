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
  const requestVersion = useRef(0);
  const key = `pms:scenarios:v1:${userId}:${projectId}`;
  const [rows, setRows] = useState<EditorRow[]>([]);
  const setResult = onResult;
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [name, setName] = useState('Вариант 1');
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
      const data = await apiClient.get<ScenarioResult>(`/api/projects/${encodeURIComponent(projectId)}/automation/scenario?patches=${encodeURIComponent(JSON.stringify(patches))}`, 'Не удалось рассчитать сценарий');
      if (version !== requestVersion.current) return;
      if (!data.schedule) throw new Error('Обновите страницу после обновления сервера: полный расчёт сценария пока недоступен');
      setResult(data);
      if (savedFingerprint && savedFingerprint !== data.fingerprint) setNotice('Рабочий план изменился после сохранения варианта. Сценарий пересчитан относительно текущего плана.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Ошибка расчета'); }
    finally { setSaving(false); }
  };
  const store = (next: SavedScenario[]) => { try { localStorage.setItem(key, JSON.stringify(next)); setSaved(next); return true; } catch { setError('Не удалось сохранить сценарий в этом браузере'); return false; } };
  return <><p>Измените даты или длительность конечных работ. Вехи, зависимые работы и критический путь пересчитаются в отдельном сценарии. Рабочий план не изменяется.</p>
    <p>«Начать не раньше» переносит работу с сохранением длительности. Новое окончание меняет длительность. Зависимости и календарь могут сдвинуть результат.</p>
    <div className="automation-actions"><button disabled={saving || rows.length >= 20 || rows.length >= eligible.length} onClick={() => { const item = eligible.find((candidate) => !rows.some((row) => row.id === candidate.id)); if (item) { setRows((value) => [...value, { id: item.id, startDate: '', dueDate: '', workDays: '' }]); setResult(null); } }}>Добавить изменение</button><button disabled={saving} onClick={() => void calculate()}>{saving ? 'Рассчитываем…' : 'Сравнить с рабочим планом'}</button></div>
    {rows.map((row, index) => <div className="automation-card automation-grid" key={index}>
      <label>Работа<select disabled={saving} value={row.id} onChange={(event) => edit(index, { id: event.target.value })}>{eligible.map((item) => <option disabled={rows.some((other, otherIndex) => otherIndex !== index && other.id === item.id)} value={item.id} key={item.id}>{item.code} {item.title}</option>)}</select></label>
      <label>Начать не раньше<input disabled={saving} type="date" value={row.startDate} onChange={(event) => edit(index, { startDate: event.target.value })} /></label>
      <label>Новое окончание<input disabled={saving || Boolean(row.workDays)} type="date" value={row.dueDate} onChange={(event) => edit(index, { dueDate: event.target.value })} /></label>
      <label>Длительность, раб. дней<input disabled={saving || Boolean(row.dueDate)} type="number" min={1} max={3650} value={row.workDays} onChange={(event) => edit(index, { workDays: event.target.value })} /></label>
      <button disabled={saving} onClick={() => { setRows((value) => value.filter((_, i) => i !== index)); setResult(null); }}>Убрать изменение</button>
    </div>)}
    <AutomationError error={error} />{notice && <p role="status">{notice}</p>}
    {result && <><p><strong>Завершение графика:</strong> {displayDay(result.beforeFinish)} → {displayDay(result.afterFinish)}. Критических работ: {result.beforeCriticalIds.length} → {result.afterCriticalIds.length}.</p>
      {result.changes.length === 0 ? <p>Сроки не изменились. Проверьте зависимости и введенные значения.</p> : <div className="automation-table-wrap"><table className="automation-table"><thead><tr><th>Работа / веха</th><th>Начало: было → стало</th><th>Окончание: было → стало</th><th>Критический путь</th></tr></thead><tbody>{result.changes.map((row) => <tr key={row.id}><td><a href={row.href}>{row.code} {row.title}</a>{row.checkpoint && <strong> · Веха</strong>}</td><td>{displayDay(row.beforeStart)} → {displayDay(row.afterStart)}</td><td>{displayDay(row.beforeFinish)} → {displayDay(row.afterFinish)}</td><td>{result.beforeCriticalIds.includes(row.id) ? 'Да' : 'Нет'} → {result.afterCriticalIds.includes(row.id) ? 'Да' : 'Нет'}</td></tr>)}</tbody></table></div>}
      <div className="automation-actions"><label>Название варианта<input maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label><button disabled={!name.trim()} onClick={() => { if (store([{ version: 1 as const, name: name.trim(), fingerprint: result.fingerprint, rows }, ...saved.filter((value) => value.name !== name.trim())].slice(0, 10))) setNotice('Вариант сохранен в этом браузере'); }}>Сохранить вариант</button></div>
    </>}
    {saved.length > 0 && <><h4>Сохраненные варианты в этом браузере</h4>{saved.map((variant) => <div className="automation-row" key={variant.name}><span>{variant.name}</span><button disabled={saving} onClick={() => { setRows(variant.rows); setName(variant.name); setSavedFingerprint(variant.fingerprint); setResult(null); setNotice('Нажмите «Сравнить», чтобы пересчитать вариант'); }}>Загрузить</button><button onClick={() => store(saved.filter((value) => value.name !== variant.name))}>Удалить вариант</button></div>)}</>}
  </>;
}
export function ScenarioPanel(props: ScenarioPanelProps) { return <AutomationPanel title="Сценарии «Что будет, если…»"><ScenarioContent key={`${props.userId}:${props.projectId}`} {...props} /></AutomationPanel>; }
