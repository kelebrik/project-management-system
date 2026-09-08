import { weeklyValue } from './weeklyValue';
import { displayDay, useAutomationData } from './useAutomationData';
import { useState } from 'react';
import type { WeeklyBrief } from '@pms/shared';
import type { ProjectListItem } from '../../app/domainTypes';
import { usePageContext } from '../../pages/PageContext';
import { printSectionAsPdf } from '../../app/pdfPrint';
import { AutomationError } from './AutomationPanel';

export function WeeklyBriefPanel() {
  const { projects, selectedProjectId } = usePageContext();
  const [projectId, setProjectId] = useState<string>(selectedProjectId ?? '');
  const [days, setDays] = useState(7); const [revision, setRevision] = useState(0);
  const [copied, setCopied] = useState(false); const [copyError, setCopyError] = useState('');
  const { data, error } = useAutomationData<WeeklyBrief>(`/api/reports/weekly-brief?days=${days}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ''}`, revision);
  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText([`Что изменилось: ${displayDay(data.from)} — ${displayDay(data.to)}`,
        ...data.warnings, ...(['wbs', 'journal'] as const).flatMap((source) => [source === 'wbs' ? 'Структура и график' : 'Вопросы, риски и проект',
          ...data.changes.filter((row) => row.source === source).map((row) => `${row.projectCode} · ${row.title}: ${row.field}: ${weeklyValue(row, row.before)} → ${weeklyValue(row, row.after)} (${displayDay(row.at)}, ${row.actor})`)]),
      ].join('\n')); setCopied(true); setCopyError('');
    } catch { setCopyError('Не удалось скопировать. Используйте PDF или выделите текст отчета.'); }
  };
  return <section className="panel automation-body automation-page">
    <header className="automation-heading"><h1>Что изменилось за неделю</h1><p>Сводка по записанной истории для выбранного проекта или доступных вам проектов портфеля.</p></header>
    <div className="automation-actions">
      <label className="automation-project-field">Область отчета<select value={projectId} onChange={(event) => { setProjectId(event.target.value); setCopied(false); }}><option value="">Все доступные проекты портфеля</option>{(projects as ProjectListItem[]).map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label>
      <label>Период<select value={days} onChange={(event) => { setDays(Number(event.target.value)); setCopied(false); }}><option value={7}>7 дней</option><option value={14}>14 дней</option><option value={30}>30 дней</option></select></label>
      <button onClick={() => { setRevision((value) => value + 1); setCopied(false); }}>Обновить сводку</button>
      <button disabled={!data} onClick={() => void copy()}>{copied ? 'Скопировано' : 'Копировать сводку'}</button>
      <button disabled={!data} onClick={() => printSectionAsPdf('weekly-automation-brief', 'Сводка изменений')}>PDF</button>
    </div>
    <AutomationError error={error || copyError} />{!data && !error && <p role="status">Собираем изменения…</p>}
    {data && <div id="weekly-automation-brief"><h2>{displayDay(data.from)} — {displayDay(data.to)}</h2>
      <p>Проектов в области отчета: {data.projectCount}. Проектов с изменениями: {new Set(data.changes.map((row) => row.projectId)).size}.</p>
      {data.warnings.map((warning) => <p className="automation-warning" key={warning}>{warning}</p>)}
      {(['wbs', 'journal'] as const).map((source) => <section key={source}><h3>{source === 'wbs' ? 'Структура и график — история WBS' : 'Вопросы, риски и проект — журнал изменений'}</h3>
        {!data.changes.some((row) => row.source === source) ? <p>За период записанных изменений нет.</p> : <div className="automation-table-wrap"><table className="automation-table"><thead><tr><th>Проект / объект</th><th>Изменение</th><th>Было</th><th>Стало</th><th>Когда / кто</th></tr></thead><tbody>
          {data.changes.filter((row) => row.source === source).map((row) => <tr key={row.id}><td>{row.projectCode}<br /><a href={row.href}>{row.title}</a></td><td>{row.field}</td><td>{weeklyValue(row, row.before)}</td><td>{weeklyValue(row, row.after)}</td><td>{displayDay(row.at)}<br />{row.actor}</td></tr>)}
        </tbody></table></div>}
      </section>)}
    </div>}
  </section>;
}
