import { Plus, Save, Table2, Trash2, Paperclip } from 'lucide-react';
import { useEffect, useEffectEvent, useState, type CSSProperties } from 'react';
import { apiClient, ApiError } from '../api/client';
import { useI18n } from '../i18n/I18nProvider';
import { usePageContext } from './PageContext';
import { useConfirm } from '../hooks/useConfirm';
import { SaveStateIndicator } from '../components/SaveStateIndicator';
import { artifactId, artifactLinks, emptyArtifactRow, type ArtifactFile, type ArtifactRow, type ArtifactTable } from '../app/artifactTable';

export function ProjectArtifactsPage() {
  const { project } = usePageContext();
  return <ArtifactTableEditor key={project.id} />;
}

function ArtifactTableEditor() {
  const { t, tCount } = useI18n();
  const tEffect = useEffectEvent(t);
  const { project, isReadOnly, setError, setNotice } = usePageContext();
  const confirm = useConfirm();
  const defaults = (): ArtifactTable => ({ revision: 0, columns: [
    { id: 'date', title: t('artifacts.date') }, { id: 'title', title: t('artifacts.artifact') },
    { id: 'details', title: t('artifacts.details') }, { id: 'links', title: t('artifacts.links') },
  ], rows: [emptyArtifactRow()] });
  const loadDefaults = useEffectEvent(defaults);
  const [table, setTable] = useState<ArtifactTable>(defaults);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reload, setReload] = useState(0);
  const endpoint = `/api/projects/${project.id}/artifact-table`;
  const canEdit = !isReadOnly && !loading && !failed && !saving && !uploading;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    apiClient.get<(ArtifactTable & { defaultTitles?: boolean }) | null>(endpoint, tEffect('artifacts.loadError')).then(data => {
      if (cancelled) return;
      if (data) setTable({ ...data, columns: data.defaultTitles ? data.columns.map(column => ({ ...column, title: tEffect(column.id === 'date' ? 'artifacts.date' : column.id === 'title' ? 'artifacts.artifact' : column.id === 'details' ? 'artifacts.details' : 'artifacts.links') })) : data.columns });
      else setTable(loadDefaults());
      setDirty(false);
      setConflict(false);
    }).catch(() => {
      if (!cancelled) { setFailed(true); setError(tEffect('artifacts.loadError')); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [endpoint, reload, setError]);

  useEffect(() => {
    const state = window as Window & { __pmsUnsaved?: boolean };
    state.__pmsUnsaved = dirty || uploading;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    if (dirty || uploading) window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); state.__pmsUnsaved = false; };
  }, [dirty, uploading]);

  function change(edit: (current: ArtifactTable) => ArtifactTable) {
    setTable(edit);
    setDirty(true);
  }
  function updateRow(id: string, edit: (row: ArtifactRow) => ArtifactRow) {
    change(current => ({ ...current, rows: current.rows.map(row => row.id === id ? edit(row) : row) }));
  }
  async function save() {
    if (!canEdit || conflict) return;
    if (new Blob([JSON.stringify(table)]).size > 4 * 1024 * 1024) { setError(t('artifacts.payloadLimit')); return; }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await apiClient.put<ArtifactTable>(endpoint, table, t('artifacts.saveError'));
      setTable(saved);
      setDirty(false);
      setNotice(t('artifacts.saved'));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) { setConflict(true); setError(t('artifacts.conflict')); }
      else setError(t('artifacts.saveError'));
    } finally { setSaving(false); }
  }
  async function attach(rowId: string, columnId: string, file: File) {
    if (!file.size || file.size > 3 * 1024 * 1024) { setError(t('artifacts.tooLarge')); return; }
    setUploading(true);
    try {
      const uploaded = await apiClient.upload<ArtifactFile>(`${endpoint}/files`, file, t('artifacts.fileError'));
      updateRow(rowId, row => ({ ...row, files: { ...row.files, [columnId]: [...(row.files[columnId] ?? []), uploaded] } }));
    } catch (error) { setError(t(error instanceof ApiError && error.status === 413 ? 'artifacts.quota' : 'artifacts.fileError')); }
    finally { setUploading(false); }
  }
  async function download(file: ArtifactFile) {
    try {
      const result = await apiClient.download(`${endpoint}/files/${file.id}`, t('artifacts.downloadError'));
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url; link.download = result.filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError(t('artifacts.downloadError')); }
  }
  async function reloadTable() {
    if (dirty && !await confirm({ title: t('artifacts.reloadConfirm'), confirmLabel: t('artifacts.reload') })) return;
    setReload(value => value + 1);
  }
  const template = table.columns.map(column => column.id === 'date' ? '190px' : `minmax(${Math.max(180, Math.min(480, column.title.length * 8 + 48))}px, 1fr)`).join(' ');

  return <article className="panel project-card project-module-page business-requirements-page artifact-table-page">
    <div className="panel-title"><div><h2>{t('artifacts.title')}</h2><p>{t('artifacts.tableDescription')}</p></div>
      <div className="business-requirements-actions">
        <button type="button" disabled={!canEdit || table.rows.length >= 1000} onClick={() => change(current => ({ ...current, rows: [emptyArtifactRow(), ...current.rows] }))}><Plus size={16} />{t('requirements.addRow')}</button>
        <button type="button" disabled={!canEdit || table.columns.length >= 50} onClick={() => change(current => ({ ...current, columns: [...current.columns, { id: artifactId(), title: t('requirements.column', { count: current.columns.length + 1 }) }] }))}><Table2 size={16} />{t('requirements.addColumn')}</button>
        <button type="button" disabled={!canEdit || !dirty || conflict} onClick={() => void save()}><Save size={16} />{saving ? t('fields.saving') : t('fields.save')}</button>
        {(conflict || failed) && <button type="button" disabled={loading || saving || uploading} onClick={() => void reloadTable()}>{t('artifacts.reload')}</button>}
      </div>
    </div>
    <div className="business-requirements-status"><span>{loading ? t('requirements.loading') : `${tCount('table.rows', table.rows.length)}, ${tCount('table.columns', table.columns.length)}`}</span><SaveStateIndicator saving={saving || uploading} dirty={dirty} /></div>
    <p>{t('artifacts.fileLimit')}</p>
    <div className="business-requirements-table-shell"><div className="business-requirements-table" style={{ '--requirements-template': template } as CSSProperties}>
      <div className="requirements-row requirements-head">
        {table.columns.map(column => <div className="requirements-column-title" key={column.id}>
          <textarea rows={2} maxLength={500} value={column.title} disabled={!canEdit} aria-label={t('requirements.columnName', { title: column.title })} onChange={event => change(current => ({ ...current, columns: current.columns.map(item => item.id === column.id ? { ...item, title: event.target.value } : item) }))} />
          {column.id !== 'date' && <button type="button" disabled={!canEdit} aria-label={t('requirements.deleteColumnName', { title: column.title })} onClick={async () => {
            if (!await confirm({ title: t('requirements.deleteColumnConfirm'), message: t('requirements.deleteColumnMessage'), confirmLabel: t('fields.delete') })) return;
            change(current => ({ ...current, columns: current.columns.filter(item => item.id !== column.id), rows: current.rows.map(row => ({ ...row, cells: Object.fromEntries(Object.entries(row.cells).filter(([id]) => id !== column.id)), files: Object.fromEntries(Object.entries(row.files).filter(([id]) => id !== column.id)) })) }));
          }}><Trash2 size={14} /></button>}
        </div>)}
      </div>
      {table.rows.map((row, index) => <div className="requirements-row" key={row.id} data-testid="artifact-table-row">
        <div className="requirements-row-number artifact-table-date"><input type="date" value={row.date} disabled={!canEdit} aria-label={`${t('artifacts.date')} ${index + 1}`} onChange={event => updateRow(row.id, item => ({ ...item, date: event.target.value }))} />
          <button type="button" disabled={!canEdit || table.rows.length <= 1} aria-label={t('requirements.deleteRowNumber', { count: index + 1 })} onClick={async () => {
            if (await confirm({ title: t('requirements.deleteRowConfirm'), confirmLabel: t('fields.delete') })) change(current => ({ ...current, rows: current.rows.filter(item => item.id !== row.id) }));
          }}><Trash2 size={14} /></button>
        </div>
        {table.columns.filter(column => column.id !== 'date').map(column => <div className="artifact-table-cell" key={column.id}>
          <textarea value={row.cells[column.id] ?? ''} maxLength={20000} disabled={!canEdit} aria-label={t('requirements.cell', { count: index + 1, title: column.title })} onChange={event => updateRow(row.id, item => ({ ...item, cells: { ...item.cells, [column.id]: event.target.value } }))} />
          {artifactLinks(row.cells[column.id] ?? '').map(url => <a key={url} href={url} target="_blank" rel="noopener noreferrer">{url}</a>)}
          {(row.files[column.id] ?? []).map(file => <div className="artifact-table-file" key={file.id}><button type="button" onClick={() => void download(file)}>{file.name}</button><button type="button" disabled={!canEdit} aria-label={`${t('artifacts.removeFile')}: ${file.name}`} onClick={() => updateRow(row.id, item => ({ ...item, files: { ...item.files, [column.id]: item.files[column.id].filter(value => value.id !== file.id) } }))}><Trash2 size={14} /></button></div>)}
          <label className="artifact-table-upload"><Paperclip size={14} />{t('artifacts.attach')}<input type="file" disabled={!canEdit || (row.files[column.id]?.length ?? 0) >= 20} aria-label={`${t('artifacts.attach')}: ${column.title}, ${index + 1}`} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void attach(row.id, column.id, file); }} /></label>
        </div>)}
      </div>)}
    </div></div>
  </article>;
}
