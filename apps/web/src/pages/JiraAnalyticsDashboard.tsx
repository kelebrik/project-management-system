import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { useI18n as useJiraTranslations } from "../i18n/I18nProvider";
import { intlLocale } from "../i18n/locale";
import { useI18n as useLocaleTranslation } from "../i18n/I18nProvider";
import { JIRA_SEMANTIC_COLUMN_WIDTH_MAX, JIRA_SEMANTIC_COLUMN_WIDTH_MIN, JIRA_SEMANTIC_EMPTY_DASHBOARD, jiraAnalyticsGroupings, jiraAnalyticsMetrics, jiraCancelledStatuses, jiraSemanticDashboardSchema, type JiraAnalyticsEvaluationResult, type JiraAnalyticsFilter, type JiraAnalyticsFilterField, type JiraAnalyticsGroupBy, type JiraAnalyticsMetric, type JiraSemanticAggregatePublic, type JiraSemanticDashboard, type JiraSemanticWidget } from "@pms/shared";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Pencil, Plus, RefreshCw, RotateCcw, Save, Settings2, Trash2, X } from "lucide-react";
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from "react";

import { apiClient } from "../api/client";

import {
  jiraWidgetColumnWidth,
  jiraWidgetTableWidth,
  jiraWidgetWithColumnWidth,
  jiraWidgetWithoutColumnWidth,
  jiraWidgetWithSelectedFields,
} from "../app/jiraWidgetColumns";
import { JiraWidgetFilters } from "../components/JiraWidgetFilters";
import { JiraCurrentFreshnessNotice } from "../components/JiraCurrentFreshnessNotice";
import { useJiraCurrentFreshness } from "../hooks/useJiraCurrentFreshness";
import { usePageContext } from "./PageContext";

type JiraAnalyticsSection = "active" | "retro";
type Catalog = {
  definitions: JiraSemanticAggregatePublic[];
  dashboard: JiraSemanticDashboard;
  dashboardConfigHash: string;
  dashboardSeedRequired: boolean;
  systemAggregatesSeedRequired: boolean;
};
type SemanticResult = Omit<JiraAnalyticsEvaluationResult, "records"> & {
  records: Array<{
    id: string;
    issueUrl: string;
    values: Partial<Record<JiraAnalyticsFilterField, string | number | boolean | null>>;
  }>;
};
type QueryResponse = { aggregate: { id: string; name: string; version: number }; result: SemanticResult };
type BatchQueryResponse = { results: Array<(QueryResponse & { widgetId: string; error?: never }) | { widgetId: string; error: string }> };

const FIELD_FOR_GROUP: Partial<Record<JiraAnalyticsGroupBy, JiraAnalyticsFilterField>> = {
  goal: "goalName",
  project: "project", status: "status", assignee: "assignee", reporter: "reporter",
  priority: "priority", sprint: "sprint", issueType: "issueType", resolution: "resolution",
  fromStatus: "fromStatus", toStatus: "toStatus", week: "eventAt",
};

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function activeDefaultFilters(fields: ReadonlySet<JiraAnalyticsFilterField>): JiraAnalyticsFilter[] {
  return [
    ...(fields.has("resolution") ? [{ id: uid("filter"), field: "resolution" as const, operator: "empty" as const, value: "" }] : []),
    ...(fields.has("status") ? jiraCancelledStatuses.map((status) => ({ id: uid("filter"), field: "status" as const, operator: "notEquals" as const, value: status })) : []),
  ];
}

function defaultWidget(aggregate: JiraSemanticAggregatePublic, placement: JiraAnalyticsSection): JiraSemanticWidget {
  const published = aggregate.published ?? aggregate.draft;
  const fields = published.outputFields.map((field) => field.key);
  const selected = new Set(fields);
  const dateField = published.outputFields.find((field) => field.type === "date")?.key ?? null;
  return {
    id: uid("widget"),
    title: published.name,
    aggregateId: aggregate.id,
    aggregateVersion: aggregate.publishedVersion ?? aggregate.version,
    placement,
    selectedFields: fields,
    filterLogic: "and",
    filters: placement === "active" ? activeDefaultFilters(selected) : [],
    dateField,
    asOf: null,
    metric: "count",
    groupBy: "none",
    sortBy: "default",
    sortDirection: "desc",
    visualization: "number",
    width: "half",
  };
}

function widgetQuery(widget: JiraSemanticWidget, dashboard: JiraSemanticDashboard, groupKey?: string) {
  return {
    aggregateVersion: widget.aggregateVersion,
    selectedFields: widget.selectedFields,
    metric: widget.metric,
    groupBy: widget.groupBy,
    filters: widget.filters,
    filterLogic: widget.filterLogic,
    periodDays: widget.dateField ? dashboard.periodDays : null,
    dateField: widget.dateField,
    assignee: dashboard.assignee,
    sortBy: widget.sortBy,
    sortDirection: widget.sortDirection,
    page: 1,
    pageSize: 100,
    ...(groupKey ? { groupKey } : {}),
    asOf: widget.asOf,
  };
}

function saveDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function recordValue(record: SemanticResult["records"][number], field: JiraAnalyticsFilterField) {
  const value = record.values[field];
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  return value;
}

function RecordsTable({ widget, result }: { widget: JiraSemanticWidget; result: SemanticResult }) {
  const { jira: { JIRA_SEMANTIC_FIELD_LABELS } } = useJiraTranslations();
  const width = jiraWidgetTableWidth(widget);
  return <div className="jira-analytics-table-wrap"><table className="jira-analytics-table" style={{ width }}><colgroup>{widget.selectedFields.map((field) => <col key={field} style={{ width: jiraWidgetColumnWidth(widget, field) }} />)}</colgroup><thead><tr>{widget.selectedFields.map((field) => <th key={field}>{JIRA_SEMANTIC_FIELD_LABELS[field]}</th>)}</tr></thead><tbody>{result.records.map((record) => <tr key={record.id}>{widget.selectedFields.map((field) => <td key={field}>{field === "issueKey" || field === "commitSha" || field === "commitShortSha" ? <a href={record.issueUrl} target="_blank" rel="noreferrer">{String(recordValue(record, field) ?? "-")}</a> : String(recordValue(record, field) ?? "-")}</td>)}</tr>)}</tbody></table></div>;
}

function ColumnWidthControl({ widget, field, draft, onDraftChange, onCommit, onReset, onRevert }: {
  widget: JiraSemanticWidget;
  field: JiraAnalyticsFilterField;
  draft: string;
  onDraftChange: (value: string) => void;
  onCommit: () => void;
  onReset: () => void;
  onRevert: () => void;
}) {
  const { jira: { JIRA_SEMANTIC_FIELD_LABELS } } = useJiraTranslations();
  const inputId = useId();
  const label = JIRA_SEMANTIC_FIELD_LABELS[field];
  return <div className="jira-widget-column-width-row"><label htmlFor={inputId} title={label}>{label}</label><span><input id={inputId} type="number" inputMode="numeric" min={JIRA_SEMANTIC_COLUMN_WIDTH_MIN} max={JIRA_SEMANTIC_COLUMN_WIDTH_MAX} step="1" value={draft} data-editable-key-handler="local" aria-label={`Ширина поля «${label}», пикселей`} onChange={(event) => onDraftChange(event.target.value)} onBlur={onCommit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onCommit(); } if (event.key === "Escape") { event.preventDefault(); onRevert(); } }} /><small>px</small><button type="button" className="icon-button" title={`Сбросить ширину поля «${label}»`} disabled={widget.columnWidths?.[field] === undefined} onClick={onReset}><RotateCcw size={15} /></button></span></div>;
}

function WidgetContent({ widget, result, error, drilldown, onGroup, onBack }: {
  widget: JiraSemanticWidget;
  result: SemanticResult | null;
  error: string | null;
  drilldown: { key: string; label: string } | null;
  onGroup: (group: { key: string; label: string }) => void;
  onBack: () => void;
}) {
  const { t: uiText } = useInterfaceTranslation();
  const { jira: { formatJiraAnalyticsMetric } } = useJiraTranslations();
  const { locale: uiLocale } = useLocaleTranslation();
  if (error) return <div className="jira-widget-empty jira-widget-error">{error}</div>;
  if (!result) return <div className="jira-widget-empty">{uiText("ui.jira.loadingDots")}</div>;
  if (drilldown) {
    return <><div className="jira-analytics-drilldown"><button type="button" className="icon-button" title={uiText("ui.jira.backToGroups")} onClick={onBack}><ArrowLeft size={17} /></button><strong>{drilldown.label}</strong><span>{result.totalRecords.toLocaleString(intlLocale(uiLocale))} {uiText("ui.jira.rowsLowercase")}</span></div><RecordsTable widget={widget} result={result} /></>;
  }
  if (widget.visualization === "table") {
    return <RecordsTable widget={widget} result={result} />;
  }
  if (widget.groupBy !== "none") {
    const maximum = Math.max(1, ...result.groups.map((group) => group.value));
    return <div className="jira-analytics-bars">{result.groups.map((group) => <button type="button" className="jira-analytics-bar-row" key={group.key} onClick={() => onGroup(group)}><span className="jira-analytics-bar-label">{group.label}</span><span className="jira-analytics-bar-track"><span style={{ width: `${Math.max(2, group.value / maximum * 100)}%` }} /></span><b>{formatJiraAnalyticsMetric(widget.metric, group.value)}</b></button>)}</div>;
  }
  return <div className="jira-analytics-number"><strong>{formatJiraAnalyticsMetric(widget.metric, result.value)}</strong><span>{uiText("ui.jira.rowsCountLabel")} {result.totalRecords.toLocaleString(intlLocale(uiLocale))}</span></div>;
}

function WidgetEditor({ widget, aggregate, aggregates, onChange, onClose }: {
  widget: JiraSemanticWidget;
  aggregate: JiraSemanticAggregatePublic;
  aggregates: JiraSemanticAggregatePublic[];
  onChange: (value: JiraSemanticWidget) => void;
  onClose: () => void;
}) {
  const { t: uiText } = useInterfaceTranslation();
  const { jira: { JIRA_ANALYTICS_METRIC_LABELS, JIRA_SEMANTIC_FIELD_LABELS, JIRA_ANALYTICS_GROUP_LABELS } } = useJiraTranslations();
  const published = aggregate.published ?? aggregate.draft;
  const [columnWidthDrafts, setColumnWidthDrafts] = useState<Partial<Record<JiraAnalyticsFilterField, string>>>({});
  const availableFields = published.outputFields.map((field) => field.key);
  const selected = new Set(widget.selectedFields);
  const available = new Set(availableFields);
  const durationAvailable = available.has("durationHours");
  const metrics = jiraAnalyticsMetrics.filter((metric) => metric === "count" || (metric.endsWith("Duration") && durationAvailable) || (metric === "commits" && available.has("commitCount")) || (metric === "mergeRequests" && available.has("mergeRequestCount")));
  const groups = jiraAnalyticsGroupings.filter((group) => group === "none" || available.has(FIELD_FOR_GROUP[group]!));
  const dateFields = published.outputFields.filter((field) => field.type === "date").map((field) => field.key);
  const listMode = widget.visualization === "table" && widget.metric === "count" && widget.groupBy === "none";
  const setColumnWidthDraft = (field: JiraAnalyticsFilterField, value: string | undefined) => setColumnWidthDrafts((current) => {
    const next = { ...current };
    if (value === undefined) delete next[field];
    else next[field] = value;
    return next;
  });
  const commitColumnWidth = (field: JiraAnalyticsFilterField) => {
    const saved = jiraWidgetColumnWidth(widget, field);
    const draft = columnWidthDrafts[field];
    if (draft === undefined) return;
    if (draft.trim() === "") {
      setColumnWidthDraft(field, undefined);
      return;
    }
    const value = Number(draft);
    if (!Number.isFinite(value)) {
      setColumnWidthDraft(field, undefined);
      return;
    }
    const next = jiraWidgetWithColumnWidth(widget, field, value);
    setColumnWidthDraft(field, String(jiraWidgetColumnWidth(next, field)));
    if (jiraWidgetColumnWidth(next, field) !== saved) onChange(next);
  };
  return <aside className="jira-widget-editor" aria-label={uiText("ui.jira.widgetSettings")}><header><h3>{uiText("ui.jira.widgetSettings")}</h3><button type="button" className="icon-button" title={uiText("ui.admin.close")} onClick={onClose}><X size={21} /></button></header>
    <label>{uiText("ui.admin.name")}<input value={widget.title} onChange={(event) => onChange({ ...widget, title: event.target.value })} /></label>
    <label>{uiText("ui.jira.aggregate")}<select value={widget.aggregateId} onChange={(event) => { const next = aggregates.find((item) => item.id === event.target.value); if (next) { setColumnWidthDrafts({}); onChange({ ...defaultWidget(next, widget.placement), id: widget.id, title: widget.title }); } }}>{aggregates.map((item) => <option key={item.id} value={item.id}>{item.published?.name ?? item.draft.name} · v{item.publishedVersion}</option>)}</select></label>
    <label>{uiText("ui.jira.result")}<select value={listMode ? "list" : widget.metric} onChange={(event) => { const value = event.target.value; onChange(value === "list" ? { ...widget, metric: "count", groupBy: "none", visualization: "table" } : { ...widget, metric: value as JiraAnalyticsMetric, visualization: widget.groupBy === "none" ? "number" : "bar" }); }}><option value="list">{uiText("ui.jira.rowList")}</option>{metrics.map((metric) => <option key={metric} value={metric}>{JIRA_ANALYTICS_METRIC_LABELS[metric]}</option>)}</select></label>
    <fieldset><legend>{uiText("ui.jira.fields")}</legend><div className="jira-aggregate-field-grid">{availableFields.map((field) => <label key={field} className="jira-aggregate-field-option"><input type="checkbox" checked={selected.has(field)} disabled={widget.selectedFields.length === 1 && selected.has(field)} onChange={(event) => { const selectedFields = event.target.checked ? [...widget.selectedFields, field] : widget.selectedFields.filter((item) => item !== field); if (!event.target.checked) setColumnWidthDraft(field, undefined); onChange(jiraWidgetWithSelectedFields(widget, selectedFields)); }} />{JIRA_SEMANTIC_FIELD_LABELS[field]}</label>)}</div></fieldset>
    {widget.visualization === "table" || widget.groupBy !== "none" ? <fieldset className="jira-widget-column-widths"><legend>{uiText("ui.jira.columnWidth")}</legend><div>{widget.selectedFields.map((field) => <ColumnWidthControl key={field} widget={widget} field={field} draft={columnWidthDrafts[field] ?? String(jiraWidgetColumnWidth(widget, field))} onDraftChange={(value) => setColumnWidthDraft(field, value)} onCommit={() => commitColumnWidth(field)} onRevert={() => setColumnWidthDraft(field, undefined)} onReset={() => { const next = jiraWidgetWithoutColumnWidth(widget, field); setColumnWidthDraft(field, undefined); onChange(next); }} />)}</div></fieldset> : null}
    <label>{uiText("ui.jira.periodField")}<select value={widget.dateField ?? ""} onChange={(event) => onChange({ ...widget, dateField: event.target.value ? event.target.value as JiraAnalyticsFilterField : null })}><option value="">{uiText("ui.jira.noPeriodLimit")}</option>{dateFields.map((field) => <option key={field} value={field}>{JIRA_SEMANTIC_FIELD_LABELS[field]}</option>)}</select></label>
    {widget.placement === "retro" && published.asOfSupport === "supported" ? <label>{uiText("ui.jira.stateAsOfDate")}<input type="datetime-local" value={widget.asOf ? widget.asOf.slice(0, 16) : ""} onChange={(event) => onChange({ ...widget, asOf: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label> : null}
    <label>{uiText("ui.jira.grouping")}<select value={widget.groupBy} disabled={listMode} onChange={(event) => { const groupBy = event.target.value as JiraAnalyticsGroupBy; onChange({ ...widget, groupBy, visualization: groupBy === "none" ? "number" : "bar" }); }}>{groups.map((group) => <option key={group} value={group}>{JIRA_ANALYTICS_GROUP_LABELS[group]}</option>)}</select></label>
    <label>{uiText("ui.jira.sorting")}<select value={widget.sortBy} onChange={(event) => onChange({ ...widget, sortBy: event.target.value as JiraSemanticWidget["sortBy"] })}><option value="default">{uiText("ui.jira.defaultOption")}</option>{availableFields.filter((field) => ["goalDate", "issueKey", "eventAt", "durationHours", "commitCount", "mergeRequestCount", "sprintCount", "committedAt", "commitSha"].includes(field)).map((field) => <option key={field} value={field}>{JIRA_SEMANTIC_FIELD_LABELS[field]}</option>)}</select></label>
    <fieldset><legend>{uiText("ui.jira.direction")}</legend><div className="jira-widget-segments"><button type="button" className={widget.sortDirection === "desc" ? "active" : ""} onClick={() => onChange({ ...widget, sortDirection: "desc" })}>{uiText("ui.jira.descending")}</button><button type="button" className={widget.sortDirection === "asc" ? "active" : ""} onClick={() => onChange({ ...widget, sortDirection: "asc" })}>{uiText("ui.jira.ascending")}</button></div></fieldset>
    <JiraWidgetFilters widget={widget} fields={availableFields} onChange={onChange} />
    <fieldset><legend>{uiText("ui.jira.widgetWidth")}</legend><div className="jira-widget-segments"><button type="button" className={widget.width === "half" ? "active" : ""} onClick={() => onChange({ ...widget, width: "half" })}>1/2</button><button type="button" className={widget.width === "full" ? "active" : ""} onClick={() => onChange({ ...widget, width: "full" })}>1/1</button></div></fieldset>
  </aside>;
}

function moveWidget(widgets: JiraSemanticWidget[], id: string, direction: -1 | 1, section: JiraAnalyticsSection) {
  const next = [...widgets];
  const indexes = next.flatMap((widget, index) => widget.placement === section ? [index] : []);
  const local = indexes.findIndex((index) => next[index]?.id === id);
  if (local < 0 || local + direction < 0 || local + direction >= indexes.length) return next;
  const first = indexes[local]!;
  const second = indexes[local + direction]!;
  [next[first], next[second]] = [next[second]!, next[first]!];
  return next;
}

export function JiraAnalyticsDashboard({ editing, dataRevision, onEditingChange, onOpenAggregates, onStartEditing, section }: {
  canClear: boolean; clearing: boolean; dataRevision: number; editing: boolean; onClearData: () => void;
  onEditingChange: (editing: boolean) => void; onOpenAggregates: () => void; onStartEditing: () => void; section: JiraAnalyticsSection;
}) {
  const { t: uiText } = useInterfaceTranslation();
  const { currentUser, isClosedProject, project, setError, setNotice } = usePageContext();
  const canEdit = currentUser?.role === "ADMIN" && !isClosedProject;
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [config, setConfig] = useState<JiraSemanticDashboard>(structuredClone(JIRA_SEMANTIC_EMPTY_DASHBOARD));
  const [baseline, setBaseline] = useState<JiraSemanticDashboard>(structuredClone(JIRA_SEMANTIC_EMPTY_DASHBOARD));
  const [configHash, setConfigHash] = useState("");
  const [results, setResults] = useState<Record<string, SemanticResult | null>>({});
  const [widgetErrors, setWidgetErrors] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drilldowns, setDrilldowns] = useState<Record<string, { key: string; label: string }>>({});
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const catalogRequestRef = useRef(0);

  const loadCatalog = async () => {
    const request = ++catalogRequestRef.current;
    let response = await apiClient.get<Catalog>(`/api/projects/${project.id}/jira/semantic-aggregates`, "Не удалось загрузить агрегаты и виджеты");
    if (response.systemAggregatesSeedRequired && canEdit) {
      await apiClient.post(`/api/projects/${project.id}/jira/semantic-aggregates/bootstrap-missing`, {}, "Не удалось создать недостающие системные агрегаты");
      response = await apiClient.get<Catalog>(`/api/projects/${project.id}/jira/semantic-aggregates`, "Не удалось загрузить системные агрегаты");
    }
    if (response.dashboardSeedRequired && canEdit) {
      await apiClient.post(`/api/projects/${project.id}/jira/semantic-aggregates/bootstrap`, {}, "Не удалось создать стартовые виджеты");
      response = await apiClient.get<Catalog>(`/api/projects/${project.id}/jira/semantic-aggregates`, "Не удалось загрузить стартовые виджеты");
    }
    if (request !== catalogRequestRef.current) return null;
    setCatalog(response);
    setConfig(structuredClone(response.dashboard));
    setBaseline(structuredClone(response.dashboard));
    setConfigHash(response.dashboardConfigHash);
    return response;
  };

  const refresh = async (source?: Catalog, dashboard?: JiraSemanticDashboard) => {
    const activeCatalog = source ?? catalog;
    if (!activeCatalog) return;
    const activeDashboard = dashboard ?? config;
    const request = ++requestRef.current;
    const visible = activeDashboard.widgets.filter((widget) => widget.placement === section);
    setLoading(true);
    setResults(Object.fromEntries(visible.map((widget) => [widget.id, null])));
    setWidgetErrors({});
    try {
      if (visible.length === 0) {
        if (request === requestRef.current) setResults({});
        return;
      }
      const response = await apiClient.post<BatchQueryResponse>(`/api/projects/${project.id}/jira/semantic-aggregates/query-batch`, {
        queries: visible.map((widget) => ({
          widgetId: widget.id,
          aggregateId: widget.aggregateId,
          query: widgetQuery(widget, activeDashboard, drilldowns[widget.id]?.key),
        })),
      }, "Не удалось рассчитать виджеты");
      if (request === requestRef.current) {
        setResults(Object.fromEntries(response.results.flatMap((item) => "result" in item ? [[item.widgetId, item.result] as const] : [])));
        setWidgetErrors(Object.fromEntries(response.results.flatMap((item) => "error" in item ? [[item.widgetId, item.error] as const] : [])));
      }
    } catch (error) { if (request === requestRef.current) setError(error instanceof Error ? error.message : "Не удалось рассчитать виджеты"); }
    finally { if (request === requestRef.current) setLoading(false); }
  };

  const loadInitial = useEffectEvent(async () => {
    try {
      const response = await loadCatalog();
      if (response && !editing) await refresh(response, response.dashboard);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось загрузить виджеты");
    }
  });
  const refreshSection = useEffectEvent(async () => {
    if (catalog && !editing) await refresh();
  });
  const reloadAfterCurrentRefresh = async () => {
    if (editing) return;
    const response = await loadCatalog();
    if (response) await refresh(response, response.dashboard);
  };
  const currentFreshness = useJiraCurrentFreshness(project.id, reloadAfterCurrentRefresh);

  useEffect(() => { queueMicrotask(() => { void loadInitial(); }); }, [project.id, dataRevision]);
  useEffect(() => { queueMicrotask(() => { void refreshSection(); }); }, [section]);

  const aggregates = useMemo(() => catalog?.definitions.filter((definition) => definition.publishedVersion && definition.published) ?? [], [catalog]);
  const widgets = config.widgets.filter((widget) => widget.placement === section);
  const selectedWidget = config.widgets.find((widget) => widget.id === selectedId) ?? null;
  const selectedAggregate = selectedWidget ? aggregates.find((aggregate) => aggregate.id === selectedWidget.aggregateId) ?? null : null;

  const patchWidget = (widget: JiraSemanticWidget) => setConfig((current) => ({ ...current, widgets: current.widgets.map((item) => item.id === widget.id ? widget : item) }));
  const refreshWidget = async (widget: JiraSemanticWidget, group?: { key: string; label: string }) => {
    setResults((current) => ({ ...current, [widget.id]: null }));
    setWidgetErrors((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== widget.id)));
    try {
      const response = await apiClient.post<QueryResponse>(`/api/projects/${project.id}/jira/semantic-aggregates/${widget.aggregateId}/query`, widgetQuery(widget, config, group?.key), `Не удалось рассчитать виджет «${widget.title}»`);
      setResults((current) => ({ ...current, [widget.id]: response.result }));
      setDrilldowns((current) => group ? { ...current, [widget.id]: group } : Object.fromEntries(Object.entries(current).filter(([id]) => id !== widget.id)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось рассчитать виджет";
      setWidgetErrors((current) => ({ ...current, [widget.id]: message }));
    }
  };
  const exportWidget = async (widget: JiraSemanticWidget) => {
    try {
      const file = await apiClient.downloadPost(`/api/projects/${project.id}/jira/semantic-aggregates/${widget.aggregateId}/query.csv`, widgetQuery(widget, config, drilldowns[widget.id]?.key), `Не удалось выгрузить виджет «${widget.title}»`);
      saveDownload(file.blob, file.filename);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось выгрузить виджет");
    }
  };
  const addWidget = () => {
    const aggregate = aggregates[0];
    if (!aggregate) { onOpenAggregates(); return; }
    const widget = defaultWidget(aggregate, section);
    setConfig((current) => ({ ...current, widgets: [...current.widgets, widget] }));
    setSelectedId(widget.id);
  };
  const save = async () => {
    const parsed = jiraSemanticDashboardSchema.safeParse(config);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Некорректная конфигурация виджетов"); return; }
    setLoading(true);
    try {
      const response = await apiClient.patch<{ config: JiraSemanticDashboard; configHash: string }>(`/api/projects/${project.id}/jira/semantic-dashboard`, { config: parsed.data, expectedConfigHash: configHash }, "Не удалось сохранить виджеты");
      setConfig(response.config); setBaseline(structuredClone(response.config)); setConfigHash(response.configHash); setSelectedId(null); onEditingChange(false); setNotice("Виджеты сохранены");
      await refresh(catalog ?? undefined, response.config);
    } catch (error) { setError(error instanceof Error ? error.message : "Не удалось сохранить виджеты"); }
    finally { setLoading(false); }
  };

  if (!catalog) return <div className="jira-analytics-empty">{uiText("ui.jira.loadingWidgets")}</div>;
  return <div className="jira-analytics-workspace">
    <div className="jira-analytics-toolbar"><label><span>{uiText("ui.jira.eventPeriod")}</span><select value={config.periodDays} disabled={editing} onChange={(event) => setConfig((current) => ({ ...current, periodDays: Number(event.target.value) as JiraSemanticDashboard["periodDays"] }))}><option value="30">{uiText("ui.automation.thirtyDays")}</option><option value="90">{uiText("ui.jira.ninetyDays")}</option><option value="180">{uiText("ui.jira.oneHundredEightyDays")}</option><option value="365">{uiText("ui.jira.threeHundredSixtyFiveDays")}</option></select></label><label><span>{uiText("ui.jira.assignee")}</span><input value={config.assignee} disabled={editing} placeholder={uiText("ui.jira.all")} onChange={(event) => setConfig((current) => ({ ...current, assignee: event.target.value }))} /></label><div className="jira-analytics-toolbar-actions">{editing ? <><button type="button" className="secondary-button" onClick={addWidget}><Plus size={18} />{uiText("ui.jira.addWidget")}</button><button type="button" className="secondary-button" onClick={() => { setConfig(structuredClone(baseline)); setSelectedId(null); onEditingChange(false); }}><X size={18} />{uiText("ui.jira.cancelAction")}</button><button type="button" className="primary-button" disabled={loading} onClick={() => void save()}><Save size={18} />{uiText("ui.admin.save")}</button></> : <><button type="button" className="secondary-button" disabled={loading} onClick={() => void refresh()}><RefreshCw size={18} />{uiText("ui.admin.refresh")}</button>{canEdit ? <button type="button" className="secondary-button" onClick={onStartEditing}><Pencil size={18} />{uiText("ui.jira.editAction")}</button> : null}</>}</div></div>
    <JiraCurrentFreshnessNotice {...currentFreshness} />
    {aggregates.length === 0 ? <div className="jira-aggregate-validation">{uiText("ui.jira.noPublishedAggregates")} <button type="button" className="button" onClick={onOpenAggregates}>{uiText("ui.jira.openAggregates")}</button></div> : null}
    <div className={`jira-analytics-edit-layout ${editing && selectedWidget ? "with-editor" : ""}`}><div className="jira-analytics-grid">{widgets.map((widget, index) => <article key={widget.id} className={`jira-analytics-widget width-${widget.width} ${selectedId === widget.id ? "selected" : ""}`}><header><div><h3>{widget.title}</h3><small>{aggregates.find((aggregate) => aggregate.id === widget.aggregateId)?.published?.name ?? uiText("ui.jira.aggregateUnavailable")} · v{widget.aggregateVersion}</small></div>{editing ? <div className="jira-analytics-widget-actions"><button type="button" className="icon-button" title={uiText("ui.jira.moveLeft")} disabled={index === 0} onClick={() => setConfig((current) => ({ ...current, widgets: moveWidget(current.widgets, widget.id, -1, section) }))}><ChevronLeft size={17} /></button><button type="button" className="icon-button" title={uiText("ui.jira.moveRight")} disabled={index === widgets.length - 1} onClick={() => setConfig((current) => ({ ...current, widgets: moveWidget(current.widgets, widget.id, 1, section) }))}><ChevronRight size={17} /></button><button type="button" className="icon-button" title={uiText("ui.jira.configure")} onClick={() => setSelectedId(widget.id)}><Settings2 size={17} /></button><button type="button" className="icon-button danger" title={uiText("ui.admin.delete")} onClick={() => { setConfig((current) => ({ ...current, widgets: current.widgets.filter((item) => item.id !== widget.id) })); if (selectedId === widget.id) setSelectedId(null); }}><Trash2 size={17} /></button></div> : <div className="jira-analytics-widget-actions"><button type="button" className="icon-button" title={uiText("ui.jira.downloadCsv")} onClick={() => void exportWidget(widget)}><Download size={17} /></button></div>}</header><WidgetContent widget={widget} result={results[widget.id] ?? null} error={widgetErrors[widget.id] ?? null} drilldown={drilldowns[widget.id] ?? null} onGroup={(group) => void refreshWidget(widget, group)} onBack={() => void refreshWidget(widget)} />{results[widget.id]?.quality.warnings.length ? <footer className="jira-analytics-quality">{uiText("ui.jira.qualityLabel")} {results[widget.id]?.quality.status}{uiText("ui.jira.warningsCountSuffix")} {results[widget.id]?.quality.warnings.reduce((sum, warning) => sum + warning.count, 0)}</footer> : null}</article>)}</div>{editing && selectedWidget && selectedAggregate ? <WidgetEditor key={selectedWidget.id} widget={selectedWidget} aggregate={selectedAggregate} aggregates={aggregates} onChange={patchWidget} onClose={() => setSelectedId(null)} /> : null}</div>
  </div>;
}
