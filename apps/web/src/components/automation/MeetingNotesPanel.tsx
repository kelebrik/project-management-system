import { useI18n as useInterfaceTranslation } from "../../i18n/I18nProvider";
import { useState } from 'react';
import { parseMeetingNotes, type MeetingDraft } from '@pms/shared';
import { ApiError, apiClient } from '../../api/client';
import { usePageContext } from '../../pages/PageContext';
import type { ProjectDetails } from '../../app/domainTypes';
import { AutomationError, AutomationPanel } from './AutomationPanel';

type DraftRow = MeetingDraft & { selected: boolean; parentId: string; state?: 'saved' | 'unknown' | 'error'; message?: string };
const normalized = (value: string) => value.toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function MeetingNotesContent() {
  const { t: uiText } = useInterfaceTranslation();
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
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, selected: false, state: 'error', message: row.title.trim().length < 3 ? uiText("meeting.shortTitle") : uiText("meeting.duplicate") } : item));
        continue;
      }
      try {
        if (row.kind === 'TASK') {
          await apiClient.post(`/api/projects/${project.id}/wbs-items`, {
            code: String(sequence++), title: row.title.trim(), type: 'TASK', status: 'NOT_STARTED', owner: row.owner.trim(),
            parentId: null, wbsLevel: 1,
            startDate: null, dueDate: row.dueDate || null, description: row.source, sortOrder,
          }, uiText("meeting.createWorkError"));
          sortOrder += 10;
        } else if (row.kind === 'ISSUE') {
          await apiClient.post(`/api/projects/${project.id}/open-issues`, { title: row.title.trim(), owner: row.owner.trim(), dueDate: row.dueDate || null, impact: row.source, severity: 'MEDIUM', phaseId: null }, uiText("meeting.createIssueError"));
        } else {
          await apiClient.post(`/api/projects/${project.id}/raid-items`, { type: 'RISK', title: row.title.trim(), description: row.source || row.title, owner: row.owner.trim(), dueDate: row.dueDate || null, probability: 0, impact: 0 }, uiText("meeting.createRiskError"));
        }
        count++; savedTitles.add(normalized(row.title));
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, selected: false, state: 'saved', message: uiText("meeting.created") } : item));
      } catch (failure) {
        const knownFailure = failure instanceof ApiError && failure.status >= 400 && failure.status < 500;
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, selected: false, state: knownFailure ? 'error' : 'unknown', message: knownFailure ? failure.message : uiText("meeting.unknown") } : item));
        if (!knownFailure) break;
      }
    }
    setNotice(uiText("meeting.createdCount", { count }));
    try { await refreshProject(); } catch { setError(uiText("meeting.reload")); }
    setBusy(false);
  };
  return <><p>{uiText("ui.automation.meetingNotesIntro")}</p>
    <p>{uiText("ui.automation.meetingNotesParsingRules")}</p>
    <label>{uiText("ui.automation.meetingNotesText")}<textarea className="automation-textarea" maxLength={30000} disabled={busy} value={text} onChange={(event) => setText(event.target.value)} placeholder={uiText("ui.automation.meetingNotesPlaceholder")} /></label>
    <div className="automation-actions"><button disabled={busy || !text.trim()} onClick={() => { setRows(parseMeetingNotes(text).map((row) => ({ ...row, selected: false, parentId: '' }))); setNotice(uiText("meeting.review")); setError(''); }}>{uiText("ui.automation.prepareDrafts")}</button>
      <button disabled={busy || isReadOnly || isClosedProject || !rows.some((row) => row.selected && !['saved', 'unknown'].includes(row.state ?? ''))} onClick={() => void save()}>{busy ? uiText("ui.automation.creatingRecords") : uiText("ui.automation.createReviewedRecords")}</button></div>
    {text.split(/\r?\n/).filter((line) => line.trim()).length > 20 && <p className="automation-warning">{uiText("ui.automation.firstTwentyLinesProcessed")}</p>}
    <AutomationError error={error} />{notice && <p role="status">{notice}</p>}
    {rows.map((row, index) => {
      const locked = busy || row.state === 'saved' || row.state === 'unknown';
      const duplicate = titles.has(normalized(row.title)) || rows.slice(0, index).some((other) => normalized(other.title) === normalized(row.title));
      return <article className="automation-card" key={row.id}>
        <label className="automation-check"><input type="checkbox" disabled={locked || duplicate || !kindEnabled(row.kind) || isReadOnly || isClosedProject} checked={row.selected} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, selected: event.target.checked } : item))} />{uiText("ui.automation.createRecord")} {index + 1}</label>
        <div className="automation-grid">
          <label>{uiText("ui.automation.recordType")}<select disabled={locked} value={row.kind} onChange={(event) => edit(row.id, { kind: event.target.value as MeetingDraft['kind'] })}><option disabled={!kindEnabled('TASK')} value="TASK">{uiText("ui.automation.wbsWork")}</option><option disabled={!kindEnabled('ISSUE')} value="ISSUE">{uiText("ui.automation.openIssue")}</option><option disabled={!kindEnabled('RISK')} value="RISK">{uiText("ui.automation.risk")}</option></select></label>
          <label>{uiText("ui.admin.name")}<input disabled={locked} value={row.title} onChange={(event) => edit(row.id, { title: event.target.value })} /></label>
          <label>{uiText("ui.automation.owner")}<input disabled={locked} value={row.owner} onChange={(event) => edit(row.id, { owner: event.target.value })} /></label>
          <label>{uiText("ui.automation.dueDate")}<input type="date" disabled={locked} value={row.dueDate} onChange={(event) => edit(row.id, { dueDate: event.target.value })} /></label>
        </div>
        <details><summary>{uiText("ui.automation.sourceLine")}</summary><p>{row.source}</p></details>
        {duplicate && row.state !== 'saved' && <p className="automation-warning">{uiText("ui.automation.similarNameExists")}</p>}
        {row.kind === 'TASK' && <p>{uiText("ui.automation.workCreatedAtTopLevel")}</p>}
        {row.kind === 'RISK' && <p>{uiText("ui.automation.rateRiskAfterCreation")}</p>}
        {!kindEnabled(row.kind) && <p className="automation-warning">{uiText("ui.automation.moduleDisabledChooseAnotherType")}</p>}
        {row.message && <p role="status">{row.message}</p>}
        <button disabled={locked} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}>{uiText("ui.automation.removeDraft")}</button>
      </article>;
    })}
  </>;
}
export function MeetingNotesPanel({ projectId }: { projectId: string }) {
  const { t: uiText } = useInterfaceTranslation(); return <AutomationPanel title={uiText("ui.automation.meetingNotesToActionItems")}><MeetingNotesContent key={projectId} /></AutomationPanel>; }
