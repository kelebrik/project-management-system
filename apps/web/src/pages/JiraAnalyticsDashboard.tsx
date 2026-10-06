import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { useI18n as useJiraTranslations } from "../i18n/I18nProvider";
import { intlLocale } from "../i18n/locale";
import { useI18n as useLocaleTranslation } from "../i18n/I18nProvider";
import { JIRA_SEMANTIC_COLUMN_WIDTH_MAX, JIRA_SEMANTIC_COLUMN_WIDTH_MIN, JIRA_SEMANTIC_EMPTY_DASHBOARD, jiraAnalyticsGroupings, jiraAnalyticsMetrics, jiraCancelledStatuses, jiraSemanticDashboardSchema, type JiraAnalyticsEvaluationResult, type JiraAnalyticsFilter, type JiraAnalyticsFilterField, type JiraAnalyticsGroupBy, type JiraAnalyticsMetric, type JiraSemanticAggregatePublic, type JiraSemanticDashboard, type JiraSemanticWidget, jiraSliceIsEmpty, type JiraAnalyticsSlice, applyJiraPersonalDashboard, JIRA_EMPTY_PERSONAL_DASHBOARD, type JiraPersonalDashboard } from "@pms/shared";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Eye, EyeOff, Pencil, Plus, RefreshCw, RotateCcw, Save, Settings2, Trash2, UserRound, X } from "lucide-react";
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
import { JiraSliceBar } from "../components/jira/JiraSliceBar";
import { useJiraSlice } from "../hooks/useJiraSlice";
import { effectiveProjectView } from "../app/projectView";
import { addToLayer, hideInLayer, moveInLayer, patchInLayer, removeFromLayer, showInLayer } from "../app/jiraPersonalLayer";

type JiraAnalyticsSection = "active" | "retro";
type Catalog = {
  definitions: JiraSemanticAggregatePublic[];
  dashboard: JiraSemanticDashboard;
  dashboardConfigHash: string;
  dashboardSeedRequired: boolean;
  systemAggregatesSeedRequired: boolean;
  /** Whether this person may change the shared dashboard (an administrator or anyone who may change the project). */
  canEditDashboard?: boolean;
};
/** Where a widget is drilled to: a group, maybe a cell of its second grouping, and a page of records. */
type Drill = { key: string; label: string; key2?: string; label2?: string; page: number };
type SemanticResult = Omit<JiraAnalyticsEvaluationResult, "records"> & {
  /** The KPI of the period before, when the widget compares. */
  previousValue?: number;
  records: Array<{
    id: string;
    issueUrl: string;
    values: Partial<Record<JiraAnalyticsFilterField, string | number | boolean | null>>;
  }>;
};
type QueryResponse = { aggregate: { id: string; name: string; version: number }; result: SemanticResult & { previousValue?: number } };
type BatchQueryResponse = { results: Array<(QueryResponse & { widgetId: string; error?: never }) | { widgetId: string; error: string }> };

const FIELD_FOR_GROUP: Partial<Record<JiraAnalyticsGroupBy, JiraAnalyticsFilterField>> = {
  goal: "goalName",
  project: "project", status: "status", assignee: "assignee", reporter: "reporter",
  priority: "priority", sprint: "sprint", issueType: "issueType", resolution: "resolution",
  fromStatus: "fromStatus", toStatus: "toStatus", week: "eventAt", month: "eventAt",
  statusCategory: "statusCategory", epic: "epic", component: "components", fixVersion: "fixVersions", ageBucket: "ageDays",
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

function widgetQuery(widget: JiraSemanticWidget, dashboard: JiraSemanticDashboard, drill?: Drill | null, slice?: JiraAnalyticsSlice) {
  return {
    aggregateVersion: widget.aggregateVersion,
    selectedFields: widget.selectedFields,
    metric: widget.metric,
    groupBy: widget.groupBy,
    groupBy2: widget.groupBy === "none" ? "none" : widget.groupBy2 ?? "none",
    filters: widget.filters,
    filterLogic: widget.filterLogic,
    periodDays: widget.dateField ? dashboard.periodDays : null,
    dateField: widget.dateField,
    // The slice bar replaced the single assignee box; a slice narrows every widget.
    assignee: "",
    ...(slice && !jiraSliceIsEmpty(slice) ? { slice } : {}),
    sortBy: widget.sortBy,
    sortDirection: widget.sortDirection,
    page: drill?.page ?? 1,
    pageSize: 100,
    ...(drill ? { groupKey: drill.key } : {}),
    ...(drill?.key2 ? { groupKey2: drill.key2 } : {}),
    visualization: widget.visualization,
    ...(widget.visualization === "kpi" ? { compare: "previousPeriod" } : {}),
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

function WidgetContent({ widget, result, error, drilldown, onDrill, onBack }: {
  widget: JiraSemanticWidget;
  result: SemanticResult | null;
  error: string | null;
  drilldown: Drill | null;
  onDrill: (drill: Drill) => void;
  onBack: () => void;
}) {
  const { t: uiText } = useInterfaceTranslation();
  const { jira: { formatJiraAnalyticsMetric } } = useJiraTranslations();
  const { locale: uiLocale } = useLocaleTranslation();
  if (error) return <div className="jira-widget-empty jira-widget-error">{error}</div>;
  if (!result) return <div className="jira-widget-empty">{uiText("ui.jira.loadingDots")}</div>;
  const toGroup = (group: { key: string; label: string }) => onDrill({ key: group.key, label: group.label, page: 1 });
  const toCell = (group: { key: string; label: string }, cell: { key: string; label: string }) => onDrill({ key: group.key, label: group.label, key2: cell.key, label2: cell.label, page: 1 });
  if (drilldown) {
    const from = result.totalRecords === 0 ? 0 : (drilldown.page - 1) * result.pageSize + 1;
    const to = Math.min(result.totalRecords, drilldown.page * result.pageSize);
    return <>
      <div className="jira-analytics-drilldown"><button type="button" className="icon-button" title={uiText("ui.jira.backToGroups")} onClick={onBack}><ArrowLeft size={17} /></button><strong>{drilldown.label}{drilldown.label2 ? ` · ${drilldown.label2}` : ""}</strong><span>{result.totalRecords.toLocaleString(intlLocale(uiLocale))} {uiText("ui.jira.rowsLowercase")}</span></div>
      <RecordsTable widget={widget} result={result} />
      {result.totalRecords > result.pageSize ? <div className="jira-analytics-pager"><button type="button" className="secondary-button" disabled={drilldown.page <= 1} onClick={() => onDrill({ ...drilldown, page: drilldown.page - 1 })}>{uiText("ui.jira.pagePrevious")}</button><span>{uiText("ui.jira.page", { from, to, total: result.totalRecords })}</span><button type="button" className="secondary-button" disabled={to >= result.totalRecords} onClick={() => onDrill({ ...drilldown, page: drilldown.page + 1 })}>{uiText("ui.jira.pageNext")}</button></div> : null}
    </>;
  }
  if (widget.visualization === "table") return <RecordsTable widget={widget} result={result} />;
  if (widget.visualization === "kpi") {
    const previous = result.previousValue;
    const change = previous === undefined ? null : result.value - previous;
    const percent = previous ? Math.round((change! / previous) * 100) : null;
    return <div className="jira-analytics-number jira-analytics-kpi"><strong>{formatJiraAnalyticsMetric(widget.metric, result.value)}</strong>
      {change === null ? null : <span className={change > 0 ? "up" : change < 0 ? "down" : ""}>{change > 0 ? "+" : ""}{formatJiraAnalyticsMetric(widget.metric, change)}{percent === null ? "" : ` (${percent > 0 ? "+" : ""}${percent}%)`}</span>}
      <small>{previous === undefined || previous === 0 ? uiText("ui.jira.kpiNoPrevious") : uiText("ui.jira.kpiPrevious", { value: formatJiraAnalyticsMetric(widget.metric, previous) })}</small>
    </div>;
  }
  if (widget.groupBy !== "none" && widget.visualization === "columns") {
    // Columns along time: every week or month of the period, empty ones too, in order.
    const steps = [...result.groups].sort((left, right) => left.key.localeCompare(right.key));
    const maximum = Math.max(1, ...steps.map((step) => step.value));
    return <div className="jira-analytics-columns" role="group" aria-label={widget.title}>
      <div className="jira-analytics-columns-plot">{steps.map((step) => <button type="button" key={step.key} title={`${step.label}: ${formatJiraAnalyticsMetric(widget.metric, step.value)}`} aria-label={`${step.label}: ${formatJiraAnalyticsMetric(widget.metric, step.value)}`} disabled={step.value === 0} onClick={() => toGroup(step)}><span className="jira-analytics-column-value">{step.value > 0 ? formatJiraAnalyticsMetric(widget.metric, step.value) : ""}</span><span className="jira-analytics-column" style={{ height: `${(step.value / maximum) * 100}%` }} /></button>)}</div>
      <div className="jira-analytics-columns-axis">{steps.map((step, index) => <span key={step.key}>{index % Math.max(1, Math.ceil(steps.length / 9)) === 0 ? step.label : ""}</span>)}</div>
    </div>;
  }
  if (widget.groupBy !== "none" && widget.visualization === "line") {
    // A line runs through time: weeks and months in their order, not by value.
    const points = [...result.groups].sort((left, right) => left.key.localeCompare(right.key));
    const maximum = Math.max(1, ...points.map((point) => point.value));
    const x = (index: number) => (points.length <= 1 ? 0 : (index / (points.length - 1)) * 100);
    return <div className="jira-analytics-line"><svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={widget.title}><polyline fill="none" stroke="currentColor" strokeWidth={0.8} points={points.map((point, index) => `${x(index)},${38 - (point.value / maximum) * 36}`).join(" ")} /></svg><div className="jira-analytics-line-labels">{points.map((point) => <button type="button" key={point.key} onClick={() => toGroup(point)} title={`${point.label}: ${formatJiraAnalyticsMetric(widget.metric, point.value)}`}>{point.label}<b>{formatJiraAnalyticsMetric(widget.metric, point.value)}</b></button>)}</div></div>;
  }
  if (widget.groupBy !== "none" && widget.visualization === "stacked" && result.breakdownKeys) {
    const maximum = Math.max(1, ...result.groups.map((group) => (group.breakdown ?? []).reduce((sum, cell) => sum + cell.value, 0)));
    const colorOf = (key: string) => STACK_COLORS[(result.breakdownKeys ?? []).findIndex((entry) => entry.key === key) % STACK_COLORS.length];
    return <div className="jira-analytics-stacked">
      {result.groups.map((group) => <div className="jira-analytics-bar-row" key={group.key}><button type="button" className="jira-analytics-bar-label link-button" onClick={() => toGroup(group)}>{group.label}</button><span className="jira-analytics-bar-track">{(group.breakdown ?? []).map((cell) => <button type="button" key={cell.key} title={`${cell.label}: ${formatJiraAnalyticsMetric(widget.metric, cell.value)}`} aria-label={`${group.label} · ${cell.label}: ${formatJiraAnalyticsMetric(widget.metric, cell.value)}`} style={{ width: `${(cell.value / maximum) * 100}%`, background: colorOf(cell.key) }} onClick={() => toCell(group, cell)} />)}</span><b>{formatJiraAnalyticsMetric(widget.metric, group.value)}</b></div>)}
      <ul className="jira-flow-legend">{(result.breakdownKeys ?? []).map((entry) => <li key={entry.key}><span style={{ background: colorOf(entry.key) }} />{entry.label}</li>)}</ul>
      {result.multiValued ? <p className="jira-analytics-quality">{uiText("ui.jira.multiValuedNote")}</p> : null}
    </div>;
  }
  if (widget.groupBy !== "none" && result.breakdownKeys) {
    return <BreakdownTable metric={widget.metric} result={result} onGroup={toGroup} onCell={toCell} />;
  }
  if (widget.groupBy !== "none") {
    const maximum = Math.max(1, ...result.groups.map((group) => group.value));
    return <div className="jira-analytics-bars">{result.groups.map((group) => <button type="button" className="jira-analytics-bar-row" key={group.key} onClick={() => toGroup(group)}><span className="jira-analytics-bar-label">{group.label}</span><span className="jira-analytics-bar-track"><span style={{ width: `${Math.max(2, group.value / maximum * 100)}%` }} /></span><b>{formatJiraAnalyticsMetric(widget.metric, group.value)}</b></button>)}</div>;
  }
  return <div className="jira-analytics-number"><strong>{formatJiraAnalyticsMetric(widget.metric, result.value)}</strong><span>{uiText("ui.jira.rowsCountLabel")} {result.totalRecords.toLocaleString(intlLocale(uiLocale))}</span></div>;
}

const STACK_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#14b8a6", "#eab308", "#ef4444", "#64748b"];

/** Groups by rows and the second grouping by columns, with a total per row. */
function BreakdownTable({ metric, result, onGroup, onCell }: { metric: JiraSemanticWidget["metric"]; result: SemanticResult; onGroup: (group: { key: string; label: string }) => void; onCell: (group: { key: string; label: string }, cell: { key: string; label: string }) => void }) {
  const { t: uiText } = useInterfaceTranslation();
  const { jira: { formatJiraAnalyticsMetric } } = useJiraTranslations();
  const columns = result.breakdownKeys ?? [];
  return <div className="jira-analytics-pivot"><table><thead><tr><th />{columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>{uiText("ui.jira.pivotTotal")}</th></tr></thead><tbody>{result.groups.map((group) => {
    const cells = new Map((group.breakdown ?? []).map((cell) => [cell.key, cell.value]));
    return <tr key={group.key}><th><button type="button" className="link-button" onClick={() => onGroup(group)}>{group.label}</button></th>{columns.map((column) => <td key={column.key}>{cells.has(column.key) ? <button type="button" className="link-button" onClick={() => onCell(group, column)}>{formatJiraAnalyticsMetric(metric, cells.get(column.key)!)}</button> : ""}</td>)}<td><b>{formatJiraAnalyticsMetric(metric, group.value)}</b></td></tr>;
  })}</tbody></table>{result.multiValued ? <p className="jira-analytics-quality">{uiText("ui.jira.multiValuedNote")}</p> : null}</div>;
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
  const metrics = jiraAnalyticsMetrics.filter((metric) => metric === "count" || (metric.endsWith("Duration") && durationAvailable) || (metric === "commits" && available.has("commitCount")) || (metric === "mergeRequests" && available.has("mergeRequestCount")) || (metric === "storyPoints" && available.has("storyPoints")));
  // Weeks and months run along the widget's period field when it has one.
  const groups = jiraAnalyticsGroupings.filter((group) => group === "none" || ((group === "week" || group === "month") && widget.dateField) || available.has(FIELD_FOR_GROUP[group]!));
  const dateFields = published.outputFields.filter((field) => field.type === "date").map((field) => field.key);
  const listMode = widget.visualization === "table" && widget.metric === "count" && widget.groupBy === "none";
  // Which ways to show fit the groupings: a line needs weeks or months, stacked bars and a table two groupings, a comparison a period.
  const twoGroupings = widget.groupBy !== "none" && (widget.groupBy2 ?? "none") !== "none";
  const visualizations: Array<Exclude<JiraSemanticWidget["visualization"], "table">> = widget.groupBy === "none"
    ? ["number", ...(widget.dateField ? (["kpi"] as const) : [])]
    : twoGroupings ? ["pivot", "stacked"] : widget.groupBy === "week" || widget.groupBy === "month" ? ["columns", "line", "bar"] : ["bar"];
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
    <label>{uiText("ui.jira.section")}<select value={widget.placement} onChange={(event) => { const placement = event.target.value as JiraSemanticWidget["placement"]; onChange({ ...widget, placement, asOf: placement === "retro" ? widget.asOf : null }); onClose(); }}><option value="active">{uiText("ui.projects.statusInProgress")}</option><option value="retro">{uiText("ui.jira.jiraWorkRetroTab")}</option></select></label>
    {widget.placement === "retro" && published.asOfSupport === "supported" ? <label>{uiText("ui.jira.stateAsOfDate")}<input type="datetime-local" value={widget.asOf ? widget.asOf.slice(0, 16) : ""} onChange={(event) => onChange({ ...widget, asOf: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label> : null}
    <label>{uiText("ui.jira.grouping")}<select value={widget.groupBy} disabled={listMode} onChange={(event) => { const groupBy = event.target.value as JiraAnalyticsGroupBy; onChange({ ...widget, groupBy, groupBy2: groupBy === "none" || widget.groupBy2 === groupBy ? undefined : widget.groupBy2, visualization: groupBy === "none" ? "number" : "bar" }); }}>{groups.map((group) => <option key={group} value={group}>{JIRA_ANALYTICS_GROUP_LABELS[group]}</option>)}</select></label>
    {widget.groupBy !== "none" && !listMode ? <label>{uiText("ui.jira.secondGrouping")}<select value={widget.groupBy2 ?? "none"} onChange={(event) => { const groupBy2 = event.target.value as JiraAnalyticsGroupBy; const two = groupBy2 !== "none"; onChange({ ...widget, groupBy2: two ? groupBy2 : undefined, visualization: two && (widget.visualization === "bar" || widget.visualization === "line") ? "pivot" : !two && (widget.visualization === "stacked" || widget.visualization === "pivot") ? "bar" : widget.visualization }); }}>{groups.filter((group) => group !== widget.groupBy).map((group) => <option key={group} value={group}>{JIRA_ANALYTICS_GROUP_LABELS[group]}</option>)}</select></label> : null}
    {!listMode && visualizations.length > 1 ? <label>{uiText("ui.jira.visualization")}<select value={widget.visualization} onChange={(event) => onChange({ ...widget, visualization: event.target.value as JiraSemanticWidget["visualization"] })}>{visualizations.map((visualization) => <option key={visualization} value={visualization}>{uiText(`ui.jira.visualization.${visualization}`)}</option>)}</select></label> : null}
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
  const { currentUser, isClosedProject, project, saveProjectUiState, setError, setNotice } = usePageContext();
  // Only a system administrator sets up aggregates; the shared dashboard is also open to those who may change the project.
  const isSystemAdmin = currentUser?.role === "ADMIN" && !isClosedProject;
  const sliceState = useJiraSlice(project.id);
  const sliceKey = JSON.stringify(sliceState.slice);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [config, setConfig] = useState<JiraSemanticDashboard>(structuredClone(JIRA_SEMANTIC_EMPTY_DASHBOARD));
  const [baseline, setBaseline] = useState<JiraSemanticDashboard>(structuredClone(JIRA_SEMANTIC_EMPTY_DASHBOARD));
  const [configHash, setConfigHash] = useState("");
  const [results, setResults] = useState<Record<string, SemanticResult | null>>({});
  const [widgetErrors, setWidgetErrors] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drilldowns, setDrilldowns] = useState<Record<string, Drill>>({});
  const canEdit = Boolean(catalog?.canEditDashboard) && !isClosedProject;
  // The person's own layer: as saved, or the draft while they arrange it.
  const savedLayer = effectiveProjectView(project, currentUser?.id).jiraDashboard ?? null;
  const [myDraft, setMyDraft] = useState<JiraPersonalDashboard | null>(null);
  const layer = myDraft ?? savedLayer;
  const layerKey = JSON.stringify(layer);
  const viewDashboard = (dashboard: JiraSemanticDashboard) => (editing ? dashboard : applyJiraPersonalDashboard(dashboard, layer));
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const catalogRequestRef = useRef(0);

  const loadCatalog = async () => {
    const request = ++catalogRequestRef.current;
    let response = await apiClient.get<Catalog>(`/api/projects/${project.id}/jira/semantic-aggregates`, "Не удалось загрузить агрегаты и виджеты");
    if (response.systemAggregatesSeedRequired && isSystemAdmin) {
      await apiClient.post(`/api/projects/${project.id}/jira/semantic-aggregates/bootstrap-missing`, {}, "Не удалось создать недостающие системные агрегаты");
      response = await apiClient.get<Catalog>(`/api/projects/${project.id}/jira/semantic-aggregates`, "Не удалось загрузить системные агрегаты");
    }
    if (response.dashboardSeedRequired && isSystemAdmin) {
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
    // Nothing is counted before a linked saved slice is known.
    if (!activeCatalog || !sliceState.ready) return;
    const activeDashboard = dashboard ?? config;
    const request = ++requestRef.current;
    const visible = viewDashboard(activeDashboard).widgets.filter((widget) => widget.placement === section);
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
          query: widgetQuery(widget, activeDashboard, drilldowns[widget.id], sliceState.slice),
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
  // Counted once the catalog and a linked slice are both known, whichever comes last.
  const catalogLoaded = catalog !== null;
  useEffect(() => { queueMicrotask(() => { void refreshSection(); }); }, [section, sliceKey, sliceState.ready, catalogLoaded, layerKey]);

  const aggregates = useMemo(() => catalog?.definitions.filter((definition) => definition.publishedVersion && definition.published) ?? [], [catalog]);
  const shownDashboard = viewDashboard(config);
  const widgets = shownDashboard.widgets.filter((widget) => widget.placement === section);
  const hiddenShared = myDraft ? config.widgets.filter((widget) => widget.placement === section && myDraft.hidden.includes(widget.id)) : [];
  const isOwn = (widgetId: string) => Boolean(layer?.widgets.some((widget) => widget.id === widgetId));
  const selectedWidget = (myDraft ? shownDashboard.widgets : config.widgets).find((widget) => widget.id === selectedId) ?? null;
  const selectedAggregate = selectedWidget ? aggregates.find((aggregate) => aggregate.id === selectedWidget.aggregateId) ?? null : null;

  const patchWidget = (widget: JiraSemanticWidget) => (myDraft
    ? setMyDraft((current) => current && patchInLayer(current, widget))
    : setConfig((current) => ({ ...current, widgets: current.widgets.map((item) => item.id === widget.id ? widget : item) })));
  const refreshWidget = async (widget: JiraSemanticWidget, drill?: Drill) => {
    if (!sliceState.ready) return;
    setResults((current) => ({ ...current, [widget.id]: null }));
    setWidgetErrors((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== widget.id)));
    try {
      const response = await apiClient.post<QueryResponse>(`/api/projects/${project.id}/jira/semantic-aggregates/${widget.aggregateId}/query`, widgetQuery(widget, config, drill, sliceState.slice), `Не удалось рассчитать виджет «${widget.title}»`);
      setResults((current) => ({ ...current, [widget.id]: response.result }));
      setDrilldowns((current) => drill ? { ...current, [widget.id]: drill } : Object.fromEntries(Object.entries(current).filter(([id]) => id !== widget.id)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось рассчитать виджет";
      setWidgetErrors((current) => ({ ...current, [widget.id]: message }));
    }
  };
  const exportWidget = async (widget: JiraSemanticWidget) => {
    if (!sliceState.ready) return;
    try {
      const file = await apiClient.downloadPost(`/api/projects/${project.id}/jira/semantic-aggregates/${widget.aggregateId}/query.csv`, widgetQuery(widget, config, drilldowns[widget.id], sliceState.slice), `Не удалось выгрузить виджет «${widget.title}»`);
      saveDownload(file.blob, file.filename);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось выгрузить виджет");
    }
  };
  const addWidget = () => {
    const aggregate = aggregates[0];
    if (!aggregate) { onOpenAggregates(); return; }
    const widget = defaultWidget(aggregate, section);
    if (myDraft) {
      const own = addToLayer(myDraft, widget);
      setMyDraft(own);
      setSelectedId(own.widgets.at(-1)!.id);
      return;
    }
    setConfig((current) => ({ ...current, widgets: [...current.widgets, widget] }));
    setSelectedId(widget.id);
  };
  /** The person's layer is kept in their own view of the project; nothing changes for others. */
  const saveLayer = async (next: JiraPersonalDashboard) => {
    try {
      await saveProjectUiState({ jiraDashboard: next } as never);
      setMyDraft(null);
      setSelectedId(null);
      setNotice(uiText("ui.jiraMine.saved"));
    } catch (error) { setError(error instanceof Error ? error.message : uiText("ui.jiraMine.failed")); }
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
  const arranging = editing || myDraft !== null;
  const sharedActions = (widget: JiraSemanticWidget, index: number) => <div className="jira-analytics-widget-actions">
    <button type="button" className="icon-button" title={uiText("ui.jira.moveLeft")} disabled={index === 0} onClick={() => setConfig((current) => ({ ...current, widgets: moveWidget(current.widgets, widget.id, -1, section) }))}><ChevronLeft size={17} /></button>
    <button type="button" className="icon-button" title={uiText("ui.jira.moveRight")} disabled={index === widgets.length - 1} onClick={() => setConfig((current) => ({ ...current, widgets: moveWidget(current.widgets, widget.id, 1, section) }))}><ChevronRight size={17} /></button>
    <button type="button" className="icon-button" title={uiText("ui.jira.configure")} onClick={() => setSelectedId(widget.id)}><Settings2 size={17} /></button>
    <button type="button" className="icon-button danger" title={uiText("ui.admin.delete")} onClick={() => { setConfig((current) => ({ ...current, widgets: current.widgets.filter((item) => item.id !== widget.id) })); if (selectedId === widget.id) setSelectedId(null); }}><Trash2 size={17} /></button>
  </div>;
  const personalActions = (widget: JiraSemanticWidget, index: number) => <div className="jira-analytics-widget-actions">
    <button type="button" className="icon-button" title={uiText("ui.jira.moveLeft")} disabled={index === 0} onClick={() => setMyDraft((current) => current && moveInLayer(current, widgets.map((item) => item.id), widget.id, -1))}><ChevronLeft size={17} /></button>
    <button type="button" className="icon-button" title={uiText("ui.jira.moveRight")} disabled={index === widgets.length - 1} onClick={() => setMyDraft((current) => current && moveInLayer(current, widgets.map((item) => item.id), widget.id, 1))}><ChevronRight size={17} /></button>
    {isOwn(widget.id) ? <>
      <button type="button" className="icon-button" title={uiText("ui.jira.configure")} onClick={() => setSelectedId(widget.id)}><Settings2 size={17} /></button>
      <button type="button" className="icon-button danger" title={uiText("ui.admin.delete")} onClick={() => { setMyDraft((current) => current && removeFromLayer(current, widget.id)); if (selectedId === widget.id) setSelectedId(null); }}><Trash2 size={17} /></button>
    </> : <button type="button" className="icon-button" title={uiText("ui.jiraMine.hide")} aria-label={`${uiText("ui.jiraMine.hide")}: ${widget.title}`} onClick={() => setMyDraft((current) => current && hideInLayer(current, widget.id))}><EyeOff size={17} /></button>}
  </div>;
  const viewActions = (widget: JiraSemanticWidget) => <div className="jira-analytics-widget-actions"><button type="button" className="icon-button" title={uiText("ui.jira.downloadCsv")} onClick={() => void exportWidget(widget)}><Download size={17} /></button></div>;
  return <div className="jira-analytics-workspace">
    <div className="jira-analytics-toolbar">
      <label><span>{uiText("ui.jira.eventPeriod")}</span><select value={config.periodDays} disabled={arranging} onChange={(event) => setConfig((current) => ({ ...current, periodDays: Number(event.target.value) as JiraSemanticDashboard["periodDays"] }))}><option value="30">{uiText("ui.automation.thirtyDays")}</option><option value="90">{uiText("ui.jira.ninetyDays")}</option><option value="180">{uiText("ui.jira.oneHundredEightyDays")}</option><option value="365">{uiText("ui.jira.threeHundredSixtyFiveDays")}</option></select></label>
      <div className="jira-analytics-toolbar-actions">
        {editing ? <>
          <button type="button" className="secondary-button" onClick={addWidget}><Plus size={18} />{uiText("ui.jira.addWidget")}</button>
          <button type="button" className="secondary-button" onClick={() => { setConfig(structuredClone(baseline)); setSelectedId(null); onEditingChange(false); }}><X size={18} />{uiText("ui.jira.cancelAction")}</button>
          <button type="button" className="primary-button" disabled={loading} onClick={() => void save()}><Save size={18} />{uiText("ui.admin.save")}</button>
        </> : myDraft ? <>
          <span className="jira-mine-mark">{uiText("ui.jiraMine.arranging")}</span>
          <button type="button" className="secondary-button" onClick={addWidget}><Plus size={18} />{uiText("ui.jiraMine.addWidget")}</button>
          <button type="button" className="secondary-button" onClick={() => void saveLayer(JIRA_EMPTY_PERSONAL_DASHBOARD)}><RotateCcw size={18} />{uiText("ui.jiraMine.reset")}</button>
          <button type="button" className="secondary-button" onClick={() => { setMyDraft(null); setSelectedId(null); }}><X size={18} />{uiText("ui.jira.cancelAction")}</button>
          <button type="button" className="primary-button" onClick={() => void saveLayer(myDraft)}><Save size={18} />{uiText("ui.jiraMine.save")}</button>
        </> : <>
          <button type="button" className="secondary-button" disabled={loading} onClick={() => void refresh()}><RefreshCw size={18} />{uiText("ui.admin.refresh")}</button>
          {currentUser ? <button type="button" className="secondary-button" onClick={() => setMyDraft(savedLayer ?? JIRA_EMPTY_PERSONAL_DASHBOARD)}><UserRound size={18} />{uiText("ui.jiraMine.arrange")}</button> : null}
          {canEdit ? <button type="button" className="secondary-button" onClick={onStartEditing}><Pencil size={18} />{uiText("ui.jira.editShared")}</button> : null}
        </>}
      </div>
    </div>
    {!arranging ? <JiraSliceBar isAdmin={currentUser?.role === "ADMIN"} projectId={project.id} revision={dataRevision} state={sliceState} userId={currentUser?.id ?? null} /> : null}
    <JiraCurrentFreshnessNotice {...currentFreshness} />
    {aggregates.length === 0 ? <div className="jira-aggregate-validation">{uiText("ui.jira.noPublishedAggregates")} <button type="button" className="button" onClick={onOpenAggregates}>{uiText("ui.jira.openAggregates")}</button></div> : null}
    {hiddenShared.length > 0 ? <div className="jira-mine-hidden"><span>{uiText("ui.jiraMine.hidden")}</span>{hiddenShared.map((widget) => <button key={widget.id} type="button" className="secondary-button" onClick={() => setMyDraft((current) => current && showInLayer(current, widget.id))}><Eye size={16} />{widget.title}</button>)}</div> : null}
    <div className={`jira-analytics-edit-layout ${arranging && selectedWidget ? "with-editor" : ""}`}>
      <div className="jira-analytics-grid">{widgets.map((widget, index) => <article key={widget.id} className={`jira-analytics-widget width-${widget.width} ${selectedId === widget.id ? "selected" : ""}`}>
        <header>
          <div><h3>{widget.title}{isOwn(widget.id) ? <small className="jira-mine-badge">{uiText("ui.jiraMine.badge")}</small> : null}</h3><small>{aggregates.find((aggregate) => aggregate.id === widget.aggregateId)?.published?.name ?? uiText("ui.jira.aggregateUnavailable")} · v{widget.aggregateVersion}</small></div>
          {editing ? sharedActions(widget, index) : myDraft ? personalActions(widget, index) : viewActions(widget)}
        </header>
        <WidgetContent widget={widget} result={results[widget.id] ?? null} error={widgetErrors[widget.id] ?? null} drilldown={drilldowns[widget.id] ?? null} onDrill={(drill) => void refreshWidget(widget, drill)} onBack={() => { const drill = drilldowns[widget.id]; void refreshWidget(widget, drill?.key2 ? { key: drill.key, label: drill.label, page: 1 } : undefined); }} />
        {!jiraSliceIsEmpty(sliceState.slice) && aggregates.find((aggregate) => aggregate.id === widget.aggregateId)?.published?.rowConfig.kind === "gitlabBranchCommit" ? <footer className="jira-analytics-quality">{uiText("ui.jiraSlice.notForGitlab")}</footer> : null}
        {results[widget.id]?.quality.warnings.length ? <footer className="jira-analytics-quality">{uiText("ui.jira.qualityLabel")} {results[widget.id]?.quality.status}{uiText("ui.jira.warningsCountSuffix")} {results[widget.id]?.quality.warnings.reduce((sum, warning) => sum + warning.count, 0)}</footer> : null}
      </article>)}</div>
      {arranging && selectedWidget && selectedAggregate ? <WidgetEditor key={selectedWidget.id} widget={selectedWidget} aggregate={selectedAggregate} aggregates={aggregates} onChange={patchWidget} onClose={() => setSelectedId(null)} /> : null}
    </div>
  </div>;
}
