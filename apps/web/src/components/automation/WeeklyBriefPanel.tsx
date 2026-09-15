import { useI18n as useInterfaceTranslation } from "../../i18n/I18nProvider";
import { weeklyValue } from './weeklyValue';
import { displayDay, useAutomationData } from './useAutomationData';
import { useState } from 'react';
import type { WeeklyBrief } from '@pms/shared';
import type { ProjectListItem } from '../../app/domainTypes';
import { usePageContext } from '../../pages/PageContext';
import { printSectionAsPdf } from '../../app/pdfPrint';
import { AutomationError } from './AutomationPanel';

export function WeeklyBriefPanel() {
  const { t: uiText } = useInterfaceTranslation();
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
    <header className="automation-heading"><h1>{uiText("ui.automation.whatChangedThisWeek")}</h1><p>{uiText("ui.automation.weeklyBriefDescription")}</p></header>
    <div className="automation-actions">
      <label className="automation-project-field">{uiText("ui.automation.reportScope")}<select value={projectId} onChange={(event) => { setProjectId(event.target.value); setCopied(false); }}><option value="">{uiText("ui.automation.allAvailablePortfolioProjects")}</option>{(projects as ProjectListItem[]).map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label>
      <label>{uiText("ui.automation.period")}<select value={days} onChange={(event) => { setDays(Number(event.target.value)); setCopied(false); }}><option value={7}>{uiText("ui.automation.sevenDays")}</option><option value={14}>{uiText("ui.automation.fourteenDays")}</option><option value={30}>{uiText("ui.automation.thirtyDays")}</option></select></label>
      <button onClick={() => { setRevision((value) => value + 1); setCopied(false); }}>{uiText("ui.automation.refreshSummary")}</button>
      <button disabled={!data} onClick={() => void copy()}>{copied ? uiText("ui.automation.copied") : uiText("ui.automation.copySummary")}</button>
      <button disabled={!data} onClick={() => printSectionAsPdf('weekly-automation-brief', 'Сводка изменений')}>PDF</button>
    </div>
    <AutomationError error={error || copyError} />{!data && !error && <p role="status">{uiText("ui.automation.collectingChanges")}</p>}
    {data && <div id="weekly-automation-brief"><h2>{displayDay(data.from)} — {displayDay(data.to)}</h2>
      <p>{uiText("ui.automation.projectsInScopeLabel")} {data.projectCount}{uiText("ui.automation.projectsWithChangesLabel")} {new Set(data.changes.map((row) => row.projectId)).size}.</p>
      {data.warnings.map((warning) => <p className="automation-warning" key={warning}>{warning}</p>)}
      {(['wbs', 'journal'] as const).map((source) => <section key={source}><h3>{source === 'wbs' ? uiText("ui.automation.structureAndScheduleWbsHistory") : uiText("ui.automation.issuesRisksProjectChangeLog")}</h3>
        {!data.changes.some((row) => row.source === source) ? <p>{uiText("ui.automation.noRecordedChangesForPeriod")}</p> : <div className="automation-table-wrap"><table className="automation-table"><thead><tr><th>{uiText("ui.automation.projectOrObject")}</th><th>{uiText("ui.automation.changeColumn")}</th><th>{uiText("ui.automation.before")}</th><th>{uiText("ui.automation.after")}</th><th>{uiText("ui.automation.whenWho")}</th></tr></thead><tbody>
          {data.changes.filter((row) => row.source === source).map((row) => <tr key={row.id}><td>{row.projectCode}<br /><a href={row.href}>{row.title}</a></td><td>{row.field}</td><td>{weeklyValue(row, row.before)}</td><td>{weeklyValue(row, row.after)}</td><td>{displayDay(row.at)}<br />{row.actor}</td></tr>)}
        </tbody></table></div>}
      </section>)}
    </div>}
  </section>;
}
