import { useState } from 'react';
import { parseMeetingNotes, type MeetingDraft } from '@pms/shared';
import { ApiError, apiClient } from '../../api/client';
import { usePageContext } from '../../pages/PageContext';
import type { ProjectDetails } from '../../app/domainTypes';
import { AutomationError, AutomationPanel } from './AutomationPanel';

type DraftRow = MeetingDraft & { selected: boolean; parentId: string; state?: 'saved' | 'unknown' | 'error'; message?: string };
const normalized = (value: string) => value.toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function MeetingNotesContent() {
  const { project: rawProject, isReadOnly, isClosedProject, refreshProject, isProjectModuleEnabled } = usePageContext();
  const project = rawProject as ProjectDetails;
  const kindEnabled = (kind: MeetingDraft['kind']) => isProjectModuleEnabled(kind === 'TASK' ? 'structure' : kind === 'RISK' ? 'raid' : 'issues');
  const [text, setText] = useState(''); const [rows, setRows] = useState<DraftRow[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const titles = new Set([...project.wbsItems, ...project.issues, ...(project.closedIssues ?? []), ...project.raidItems].map((item) => normalized(item.title)));
  const edit = (id: string, patch: Partial<DraftRow>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch, state: undefined, message: undefined } : row));
  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    let count = 0;
    let sequence = Math.max(0, ...project.wbsItems.map((item) => Number(item.code.split('.')[0]) || 0)) + 1;
    let sortOrder = Math.max(0, ...project.wbsItems.map((item) => item.sortOrder)) + 10;
    const savedTitles = new Set(titles);
    // Existing create handlers own the WBS queue; keep requests sequential and don't retry unknown outcomes.
    for (const row of rows.filter((item) => item.selected && kindEnabled(item.kind) && item.state !== 'saved' && item.state !== 'unknown')) {
      if (row.title.trim().length < 3 || savedTitles.has(normalized(row.title))) {
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, selected: false, state: 'error', message: row.title.trim().length < 3 ? 'Название должно содержать минимум 3 символа' : 'Похожая запись уже существует. Уточните название или пропустите строку.' } : item));
        continue;
      }
      try {
        if (row.kind === 'TASK') {
          await apiClient.post(`/api/projects/${project.id}/wbs-items`, {
            code: String(sequence++), title: row.title.trim(), type: 'TASK', status: 'NOT_STARTED', owner: row.owner.trim(),
            parentId: null, wbsLevel: 1,
            startDate: null, dueDate: row.dueDate || null, description: row.source, sortOrder,
          }, 'Не удалось создать работу');
          sortOrder += 10;
        } else if (row.kind === 'ISSUE') {
          await apiClient.post(`/api/projects/${project.id}/open-issues`, { title: row.title.trim(), owner: row.owner.trim(), dueDate: row.dueDate || null, impact: row.source, severity: 'MEDIUM', phaseId: null }, 'Не удалось создать вопрос');
        } else {
          await apiClient.post(`/api/projects/${project.id}/raid-items`, { type: 'RISK', title: row.title.trim(), description: row.source || row.title, owner: row.owner.trim(), dueDate: row.dueDate || null, probability: 0, impact: 0 }, 'Не удалось создать риск');
        }
        count++; savedTitles.add(normalized(row.title));
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, selected: false, state: 'saved', message: 'Создано' } : item));
      } catch (failure) {
        const knownFailure = failure instanceof ApiError && failure.status >= 400 && failure.status < 500;
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, selected: false, state: knownFailure ? 'error' : 'unknown', message: knownFailure ? failure.message : 'Результат сохранения неизвестен. Проверьте реестр; автоматического повтора не будет.' } : item));
        if (!knownFailure) break;
      }
    }
    setNotice(`Создано записей: ${count}`);
    try { await refreshProject(); } catch { setError('Обновите страницу, чтобы увидеть созданные записи'); }
    setBusy(false);
  };
  return <><p>Вставьте текст встречи, проверьте черновики и отметьте записи для создания. Неуказанные сроки и ответственные останутся пустыми.</p>
    <p>Разбор по правилам: одна строка — один черновик. Метки: «Задача:», «Вопрос:», «Риск:», «Ответственный:», «Срок:». До 20 строк. Текст не отправляется внешнему ИИ.</p>
    <label>Текст протокола<textarea className="automation-textarea" maxLength={30000} disabled={busy} value={text} onChange={(event) => setText(event.target.value)} placeholder={'Задача: Проверить образцы; Ответственный: Иванов; Срок: 2026-09-20\nВопрос: Согласовать дату поставки\nРиск: Задержка компонентов'} /></label>
    <div className="automation-actions"><button disabled={busy || !text.trim()} onClick={() => { setRows(parseMeetingNotes(text).map((row) => ({ ...row, selected: false, parentId: '' }))); setNotice('Проверьте тип, название, сроки и отметьте нужные строки'); setError(''); }}>Подготовить черновики</button>
      <button disabled={busy || isReadOnly || isClosedProject || !rows.some((row) => row.selected && !['saved', 'unknown'].includes(row.state ?? ''))} onClick={() => void save()}>{busy ? 'Создаем записи…' : 'Создать проверенные записи'}</button></div>
    {text.split(/\r?\n/).filter((line) => line.trim()).length > 20 && <p className="automation-warning">Обрабатываются первые 20 непустых строк. Остальные обработайте следующей порцией.</p>}
    <AutomationError error={error} />{notice && <p role="status">{notice}</p>}
    {rows.map((row, index) => {
      const locked = busy || row.state === 'saved' || row.state === 'unknown';
      const duplicate = titles.has(normalized(row.title)) || rows.slice(0, index).some((other) => normalized(other.title) === normalized(row.title));
      return <article className="automation-card" key={row.id}>
        <label className="automation-check"><input type="checkbox" disabled={locked || duplicate || !kindEnabled(row.kind) || isReadOnly || isClosedProject} checked={row.selected} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, selected: event.target.checked } : item))} />Создать запись {index + 1}</label>
        <div className="automation-grid">
          <label>Тип записи<select disabled={locked} value={row.kind} onChange={(event) => edit(row.id, { kind: event.target.value as MeetingDraft['kind'] })}><option disabled={!kindEnabled('TASK')} value="TASK">Работа WBS</option><option disabled={!kindEnabled('ISSUE')} value="ISSUE">Открытый вопрос</option><option disabled={!kindEnabled('RISK')} value="RISK">Риск</option></select></label>
          <label>Название<input disabled={locked} value={row.title} onChange={(event) => edit(row.id, { title: event.target.value })} /></label>
          <label>Ответственный<input disabled={locked} value={row.owner} onChange={(event) => edit(row.id, { owner: event.target.value })} /></label>
          <label>Срок<input type="date" disabled={locked} value={row.dueDate} onChange={(event) => edit(row.id, { dueDate: event.target.value })} /></label>
        </div>
        <details><summary>Исходная строка</summary><p>{row.source}</p></details>
        {duplicate && row.state !== 'saved' && <p className="automation-warning">Похожее название уже существует. Уточните запись перед созданием.</p>}
        {row.kind === 'TASK' && <p>Работа создается на верхнем уровне. Разместите ее в нужном пакете в Структуре.</p>}
        {row.kind === 'RISK' && <p>После создания оцените вероятность и влияние риска в реестре.</p>}
        {!kindEnabled(row.kind) && <p className="automation-warning">Модуль отключен. Выберите другой тип записи.</p>}
        {row.message && <p role="status">{row.message}</p>}
        <button disabled={locked} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}>Убрать черновик</button>
      </article>;
    })}
  </>;
}
export function MeetingNotesPanel({ projectId }: { projectId: string }) { return <AutomationPanel title="Из протокола — в поручения"><MeetingNotesContent key={projectId} /></AutomationPanel>; }
