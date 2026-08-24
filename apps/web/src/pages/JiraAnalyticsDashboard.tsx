import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Pencil,
  RefreshCw,
  Save,
  Settings2,
  TableProperties,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1,
  jiraAnalyticsDashboardV1Schema,
  jiraAnalyticsDashboardV2Schema,
  normalizeJiraAnalyticsDashboardV1,
  type JiraAnalyticsDashboardConfig,
  type JiraAnalyticsEvaluationResult,
  type JiraAnalyticsReferencedWidget,
  type JiraAnalyticsResultRecord,
} from "@pms/shared";

import { apiClient } from "../api/client";
import type { JiraAnalyticsFacets } from "../app/domainTypes";
import {
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  JIRA_ANALYTICS_FILTER_LABELS,
  JIRA_ANALYTICS_GROUPS_BY_SOURCE,
  JIRA_ANALYTICS_GROUP_LABELS,
  JIRA_ANALYTICS_METRICS_BY_SOURCE,
  JIRA_ANALYTICS_METRIC_LABELS,
  JIRA_ANALYTICS_OPERATOR_LABELS,
  JIRA_ANALYTICS_SOURCE_LABELS,
  JIRA_CRITICAL_BUG_SLA_HOURS,
  createJiraAnalyticsFilter,
  createJiraAnalyticsWidget,
  formatJiraAnalyticsMetric,
  jiraAnalyticsFieldIsNumeric,
  jiraAnalyticsOperatorsFor,
  type JiraAnalyticsFilter,
  type JiraAnalyticsFilterField,
  type JiraAnalyticsFilterOperator,
  type JiraAnalyticsGroupBy,
  type JiraAnalyticsMetric,
  type JiraAnalyticsSection,
  type JiraAnalyticsSource,
  type JiraAnalyticsVisualization,
  type JiraAnalyticsWidget,
} from "../app/jiraAnalytics";
import { usePageContext } from "./PageContext";

type ServerWidgetResult = {
  widgetId: string;
  title: string;
  visualization: JiraAnalyticsVisualization;
  width: "half" | "full";
  placement: JiraAnalyticsSection;
  aggregateId: string | null;
  aggregateName: string;
  source: JiraAnalyticsSource;
  metric: JiraAnalyticsMetric;
  groupBy: JiraAnalyticsGroupBy;
  status: "OK" | "UNAVAILABLE";
  error?: string;
  result?: JiraAnalyticsEvaluationResult;
};

type DashboardResults = {
  configVersion: 1 | 2;
  configHash: string;
  widgets: ServerWidgetResult[];
};

type AggregateDefinitionOption = {
  id: string;
  name: string;
  source: JiraAnalyticsSource;
  metric: JiraAnalyticsMetric;
  groupBy: JiraAnalyticsGroupBy;
  scope: JiraAnalyticsSection;
};

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function recordsCsv(records: JiraAnalyticsResultRecord[]) {
  const header = ["Key", "Summary", "Assignee", "Status", "Priority", "Issue type", "Resolution", "Sprint", "From status", "To status", "Duration hours", "Commits", "Merge requests", "Event at", "Jira URL"];
  return [
    header.map(csvCell).join(","),
    ...records.map((record) => [
      record.issue.issueKey,
      record.issue.summary,
      record.issue.assignee,
      record.issue.status,
      record.issue.priority,
      record.issue.issueType,
      record.issue.resolution,
      record.sprint,
      record.fromStatus,
      record.toStatus,
      record.durationHours,
      record.commitCount,
      record.mergeRequestCount,
      record.eventAt,
      record.issue.issueUrl,
    ].map(csvCell).join(",")),
  ].join("\n");
}

function downloadRecords(name: string, records: JiraAnalyticsResultRecord[]) {
  const blob = new Blob(["\ufeff", recordsCsv(records)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.trim().replaceAll(/[^\p{L}\p{N}]+/gu, "-") || "jira-analytics"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function durationText(hours: number | null) {
  return hours === null ? "-" : formatJiraAnalyticsMetric("averageDuration", hours);
}

function dateText(value: Date | string | null | undefined) {
  if (!value) return "-";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function JiraAnalyticsTable({
  records,
  limit,
}: {
  records: JiraAnalyticsResultRecord[];
  limit?: number;
}) {
  const ordered = [...records].sort((left, right) => {
    const duration = (right.durationHours ?? -1) - (left.durationHours ?? -1);
    if (duration !== 0) return duration;
    return (right.eventAt ? new Date(right.eventAt).getTime() : 0) -
      (left.eventAt ? new Date(left.eventAt).getTime() : 0);
  });
  const visible = limit ? ordered.slice(0, limit) : ordered;
  if (visible.length === 0) return <div className="jira-analytics-empty">Нет данных</div>;
  if (visible.every((record) => record.source === "criticalBugs")) {
    return (
      <div className="jira-analytics-table-wrap">
        <table className="jira-analytics-table critical-sla">
          <thead>
            <tr>
              <th>Тикет</th>
              <th>Название</th>
              <th>Приоритет</th>
              <th>Исполнитель</th>
              <th>Статус</th>
              <th>Начало SLA</th>
              <th>Resolution</th>
              <th>Дедлайн</th>
              <th>Просрочка</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((record) => {
              const startedAt = record.eventAt ? new Date(record.eventAt) : null;
              const deadline = startedAt && !Number.isNaN(startedAt.getTime())
                ? new Date(startedAt.getTime() + JIRA_CRITICAL_BUG_SLA_HOURS * 3_600_000)
                : null;
              const overdueHours = Math.max(
                0,
                (record.durationHours ?? 0) - JIRA_CRITICAL_BUG_SLA_HOURS,
              );
              return (
                <tr key={record.id}>
                  <td>
                    <a href={record.issue.issueUrl} target="_blank" rel="noreferrer">
                      {record.issue.issueKey}
                    </a>
                  </td>
                  <td title={record.issue.summary}>{record.issue.summary}</td>
                  <td><strong>{record.issue.priority}</strong></td>
                  <td>{record.issue.assignee || "Не назначен"}</td>
                  <td>{record.issue.status}</td>
                  <td>{dateText(record.eventAt)}</td>
                  <td>{record.issue.resolutionAt ? dateText(record.issue.resolutionAt) : "Не решен"}</td>
                  <td>{dateText(deadline)}</td>
                  <td>{durationText(overdueHours)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="jira-analytics-table-wrap">
      <table className="jira-analytics-table">
        <thead>
          <tr>
            <th>Тикет</th>
            <th>Название</th>
            <th>Исполнитель</th>
            <th>Статус / этап</th>
            <th>Sprint</th>
            <th>Код</th>
            <th>Длительность</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((record) => (
            <tr key={record.id}>
              <td>
                <a href={record.issue.issueUrl} target="_blank" rel="noreferrer">
                  {record.issue.issueKey}
                </a>
              </td>
              <td title={record.issue.summary}>{record.issue.summary}</td>
              <td>{record.issue.assignee || "Не назначен"}</td>
              <td>
                {record.fromStatus || record.toStatus
                  ? `${record.fromStatus || "-"} -> ${record.toStatus || "-"}`
                  : record.issue.status}
              </td>
              <td>{record.sprint || "-"}</td>
              <td>
                {record.commitCount > 0 || record.mergeRequestCount > 0
                  ? `${record.commitCount} / ${record.mergeRequestCount}`
                  : "-"}
              </td>
              <td>{durationText(record.durationHours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JiraAnalyticsWidgetCard({
  editing,
  index,
  onDrilldown,
  onExport,
  onMove,
  onRemove,
  onSelect,
  result,
  selected,
  total,
  widget,
}: {
  editing: boolean;
  index: number;
  onDrilldown: (title: string, groupKey?: string) => void;
  onExport: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onSelect: () => void;
  result: JiraAnalyticsEvaluationResult | null;
  selected: boolean;
  total: number;
  widget: ServerWidgetResult;
}) {
  const maxGroupValue = Math.max(1, ...(result?.groups ?? []).map((group) => group.value));
  const transitionPercentile = widget.metric === "p50Duration"
    ? 50
    : widget.metric === "p85Duration"
      ? 85
      : widget.metric === "p95Duration"
        ? 95
        : null;
  const subtitle = widget.source === "transitions" && transitionPercentile
    ? `${transitionPercentile}% завершённых периодов в статусах не дольше`
    : widget.source === "criticalBugs"
      ? `От первого Critical/Blocker до Resolution · ${JIRA_ANALYTICS_METRIC_LABELS[widget.metric]}`
      : `${JIRA_ANALYTICS_SOURCE_LABELS[widget.source]} · ${JIRA_ANALYTICS_METRIC_LABELS[widget.metric]}`;
  const recordCountLabel = widget.source === "transitions"
    ? "Периодов в статусах"
    : widget.source === "development"
      ? "Событий разработки"
      : "Тикетов";
  if (widget.status === "UNAVAILABLE" || !result) {
    return (
      <section className={`jira-analytics-widget width-${widget.width} unavailable`}>
        <header><div><h3>{widget.title}</h3><small>Агрегат недоступен</small></div></header>
        <div className="jira-analytics-empty">{widget.error ?? "Не удалось рассчитать агрегат"}</div>
      </section>
    );
  }
  return (
    <section
      className={`jira-analytics-widget width-${widget.width} ${selected ? "selected" : ""}`}
    >
      <header>
        <div>
          <h3>{widget.title}</h3>
          <small>{subtitle}</small>
        </div>
        <div className="jira-analytics-widget-actions">
          {result.totalRecords > 0 && (
            <button
              type="button"
              className="icon-button"
              onClick={onExport}
              aria-label={`Экспортировать ${widget.title}`}
              title="Экспорт CSV"
            >
              <Download size={16} />
            </button>
          )}
          {editing && (
            <>
              <button type="button" className="icon-button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Переместить влево" title="Переместить влево"><ChevronLeft size={16} /></button>
              <button type="button" className="icon-button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Переместить вправо" title="Переместить вправо"><ChevronRight size={16} /></button>
              <button type="button" className="icon-button" onClick={onSelect} aria-label="Настроить виджет" title="Настроить"><Settings2 size={16} /></button>
              <button type="button" className="icon-button danger" onClick={onRemove} disabled={total === 1} aria-label="Удалить виджет" title="Удалить"><Trash2 size={16} /></button>
            </>
          )}
        </div>
      </header>

      {widget.visualization === "number" && (
        <button
          type="button"
          className="jira-analytics-number"
          onClick={() => onDrilldown(widget.title)}
          disabled={result.totalRecords === 0}
        >
          <strong>{formatJiraAnalyticsMetric(widget.metric, result.value)}</strong>
          <span>{recordCountLabel}: {result.totalRecords.toLocaleString("ru-RU")}</span>
        </button>
      )}

      {widget.visualization === "bar" && (
        <>
          <div className="jira-analytics-bars">
            {result.groups.length > 0 ? (
              result.groups.slice(0, 12).map((group) => (
                <button
                  type="button"
                  className="jira-analytics-bar-row"
                  key={group.key}
                  onClick={() => onDrilldown(`${widget.title}: ${group.label}`, group.key)}
                >
                  <span className="jira-analytics-bar-label">{group.label}</span>
                  <span className="jira-analytics-bar-track">
                    <span style={{ width: `${Math.max(2, (group.value / maxGroupValue) * 100)}%` }} />
                  </span>
                  <b>{formatJiraAnalyticsMetric(widget.metric, group.value)}</b>
                </button>
              ))
            ) : (
              <div className="jira-analytics-empty">Нет данных для группировки</div>
            )}
          </div>
          {result.groups.length > 12 && (
            <button
              type="button"
              className="jira-analytics-more"
              onClick={() => onDrilldown(widget.title)}
            >
              Показано 12 из {result.groups.length} групп · Открыть все записи ({result.totalRecords})
            </button>
          )}
        </>
      )}

      {widget.visualization === "table" && (
        <>
          <JiraAnalyticsTable records={result.records} limit={12} />
          {result.totalRecords > result.records.length && (
            <button
              type="button"
              className="jira-analytics-more"
              onClick={() => onDrilldown(widget.title)}
            >
              Показать все ({result.totalRecords})
            </button>
          )}
        </>
      )}
    </section>
  );
}

function JiraWidgetEditor({
  onChange,
  onClose,
  widget,
}: {
  onChange: (next: JiraAnalyticsWidget) => void;
  onClose: () => void;
  widget: JiraAnalyticsWidget;
}) {
  const patchWidget = (patch: Partial<JiraAnalyticsWidget>) =>
    onChange({ ...widget, ...patch });
  const updateFilter = (id: string, patch: Partial<JiraAnalyticsFilter>) =>
    patchWidget({
      filters: widget.filters.map((condition) =>
        condition.id === id ? { ...condition, ...patch } : condition,
      ),
    });
  const changeSource = (source: JiraAnalyticsSource) => {
    const metric = JIRA_ANALYTICS_METRICS_BY_SOURCE[source].includes(widget.metric)
      ? widget.metric
      : JIRA_ANALYTICS_METRICS_BY_SOURCE[source][0];
    const groupBy = JIRA_ANALYTICS_GROUPS_BY_SOURCE[source].includes(widget.groupBy)
      ? widget.groupBy
      : "none";
    patchWidget({ source, metric, groupBy, filters: [] });
  };

  return (
    <aside className="jira-widget-editor" aria-label="Настройки виджета">
      <header>
        <h3>Настройки виджета</h3>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть настройки"><X size={17} /></button>
      </header>
      <label>
        Название
        <input maxLength={200} value={widget.title} onChange={(event) => patchWidget({ title: event.target.value })} />
      </label>
      <label>
        Раздел
        <select value={widget.section} onChange={(event) => patchWidget({ section: event.target.value as JiraAnalyticsSection })}>
          <option value="active">В работе</option>
          <option value="retro">Ретро</option>
        </select>
      </label>
      <label>
        Источник
        <select value={widget.source} onChange={(event) => changeSource(event.target.value as JiraAnalyticsSource)}>
          {Object.entries(JIRA_ANALYTICS_SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>
        Метрика
        <select value={widget.metric} onChange={(event) => patchWidget({ metric: event.target.value as JiraAnalyticsMetric })}>
          {JIRA_ANALYTICS_METRICS_BY_SOURCE[widget.source].map((value) => <option key={value} value={value}>{JIRA_ANALYTICS_METRIC_LABELS[value]}</option>)}
        </select>
      </label>
      <label>
        Группировка
        <select value={widget.groupBy} onChange={(event) => patchWidget({ groupBy: event.target.value as JiraAnalyticsGroupBy })}>
          {JIRA_ANALYTICS_GROUPS_BY_SOURCE[widget.source].map((value) => <option key={value} value={value}>{JIRA_ANALYTICS_GROUP_LABELS[value]}</option>)}
        </select>
      </label>
      <fieldset>
        <legend>Визуализация</legend>
        <div className="jira-widget-segments">
          {([
            ["number", "Число"],
            ["bar", "Столбцы"],
            ["table", "Таблица"],
          ] as Array<[JiraAnalyticsVisualization, string]>).map(([value, label]) => (
            <button type="button" className={widget.visualization === value ? "active" : ""} key={value} onClick={() => patchWidget({ visualization: value })}>{label}</button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Ширина</legend>
        <div className="jira-widget-segments">
          <button type="button" className={widget.width === "half" ? "active" : ""} onClick={() => patchWidget({ width: "half" })}>1/2</button>
          <button type="button" className={widget.width === "full" ? "active" : ""} onClick={() => patchWidget({ width: "full" })}>1/1</button>
        </div>
      </fieldset>

      <div className="jira-widget-filter-head">
        <span>Условия</span>
        <div className="jira-widget-logic" aria-label="Логика условий">
          <button type="button" className={widget.filterLogic === "and" ? "active" : ""} onClick={() => patchWidget({ filterLogic: "and" })}>И</button>
          <button type="button" className={widget.filterLogic === "or" ? "active" : ""} onClick={() => patchWidget({ filterLogic: "or" })}>ИЛИ</button>
        </div>
      </div>
      <div className="jira-widget-filters">
        {widget.filters.map((condition) => {
          const needsValue = !["empty", "notEmpty"].includes(condition.operator);
          return (
            <div className="jira-widget-filter" key={condition.id}>
              <select value={condition.field} onChange={(event) => {
                const field = event.target.value as JiraAnalyticsFilterField;
                updateFilter(condition.id, { field, operator: jiraAnalyticsOperatorsFor(field)[0], value: field === "hasDevelopment" ? "true" : "" });
              }}>
                {JIRA_ANALYTICS_FIELDS_BY_SOURCE[widget.source].map((field) => <option value={field} key={field}>{JIRA_ANALYTICS_FILTER_LABELS[field]}</option>)}
              </select>
              <select value={condition.operator} onChange={(event) => updateFilter(condition.id, { operator: event.target.value as JiraAnalyticsFilterOperator })}>
                {jiraAnalyticsOperatorsFor(condition.field).map((operator) => <option value={operator} key={operator}>{JIRA_ANALYTICS_OPERATOR_LABELS[operator]}</option>)}
              </select>
              {needsValue && (condition.field === "hasDevelopment" ? (
                <select value={condition.value} onChange={(event) => updateFilter(condition.id, { value: event.target.value })}>
                  <option value="true">Да</option>
                  <option value="false">Нет</option>
                </select>
              ) : (
                <input type={jiraAnalyticsFieldIsNumeric(condition.field) ? "number" : "text"} value={condition.value} onChange={(event) => updateFilter(condition.id, { value: event.target.value })} />
              ))}
              <button type="button" className="icon-button danger" onClick={() => patchWidget({ filters: widget.filters.filter((item) => item.id !== condition.id) })} aria-label="Удалить условие"><Trash2 size={15} /></button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="button jira-widget-add-filter"
        disabled={widget.filters.length >= 20}
        onClick={() => {
          const field = JIRA_ANALYTICS_FIELDS_BY_SOURCE[widget.source][0];
          patchWidget({ filters: [...widget.filters, createJiraAnalyticsFilter(field)] });
        }}
      >
        <Plus size={16} /> Условие
      </button>
    </aside>
  );
}

function JiraReferencedWidgetEditor({
  definitions,
  onChange,
  onClose,
  widget,
}: {
  definitions: AggregateDefinitionOption[];
  onChange: (next: JiraAnalyticsReferencedWidget) => void;
  onClose: () => void;
  widget: JiraAnalyticsReferencedWidget;
}) {
  const availableDefinitions = definitions.filter((definition) => definition.scope === widget.placement);
  const patchWidget = (patch: Partial<JiraAnalyticsReferencedWidget>) =>
    onChange({ ...widget, ...patch });

  return (
    <aside className="jira-widget-editor" aria-label="Настройки виджета">
      <header>
        <h3>Настройки виджета</h3>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть настройки"><X size={17} /></button>
      </header>
      <label>
        Название
        <input maxLength={200} value={widget.title} onChange={(event) => patchWidget({ title: event.target.value })} />
      </label>
      <label>
        Раздел
        <select value={widget.placement} onChange={(event) => {
          const placement = event.target.value as JiraAnalyticsSection;
          const aggregateId = definitions.find((definition) => definition.scope === placement)?.id;
          if (!aggregateId) return;
          patchWidget({ placement, aggregateId });
        }}>
          <option value="active" disabled={!definitions.some((definition) => definition.scope === "active")}>В работе</option>
          <option value="retro" disabled={!definitions.some((definition) => definition.scope === "retro")}>Ретро</option>
        </select>
      </label>
      <label>
        Агрегат
        <select value={widget.aggregateId} onChange={(event) => patchWidget({ aggregateId: event.target.value })}>
          {availableDefinitions.map((definition) => (
            <option value={definition.id} key={definition.id}>{definition.name}</option>
          ))}
        </select>
      </label>
      {availableDefinitions.length === 0 && (
        <div className="jira-aggregate-validation">Для этого раздела нет сохранённых агрегатов</div>
      )}
      <fieldset>
        <legend>Визуализация</legend>
        <div className="jira-widget-segments">
          {([
            ["number", "Число"],
            ["bar", "Столбцы"],
            ["table", "Таблица"],
          ] as Array<[JiraAnalyticsVisualization, string]>).map(([value, label]) => (
            <button type="button" className={widget.visualization === value ? "active" : ""} key={value} onClick={() => patchWidget({ visualization: value })}>{label}</button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Ширина</legend>
        <div className="jira-widget-segments">
          <button type="button" className={widget.width === "half" ? "active" : ""} onClick={() => patchWidget({ width: "half" })}>1/2</button>
          <button type="button" className={widget.width === "full" ? "active" : ""} onClick={() => patchWidget({ width: "full" })}>1/1</button>
        </div>
      </fieldset>
    </aside>
  );
}

function parseDashboardConfig(value: unknown): JiraAnalyticsDashboardConfig | null {
  if (value === null || value === undefined) {
    return structuredClone(JIRA_ANALYTICS_DEFAULT_DASHBOARD_V1);
  }
  const v2 = jiraAnalyticsDashboardV2Schema.safeParse(value);
  if (v2.success) return structuredClone(v2.data);
  const v1 = normalizeJiraAnalyticsDashboardV1(value);
  return v1 ? structuredClone(v1) : null;
}

function widgetPlacement(widget: JiraAnalyticsDashboardConfig["widgets"][number]) {
  return "placement" in widget ? widget.placement : widget.section;
}

function newReferencedWidget(
  aggregate: AggregateDefinitionOption,
  placement: JiraAnalyticsSection,
): JiraAnalyticsReferencedWidget {
  return {
    id: `widget-${crypto.randomUUID()}`,
    title: aggregate.name,
    aggregateId: aggregate.id,
    visualization: aggregate.groupBy === "none" ? "number" : "bar",
    width: aggregate.groupBy === "none" ? "half" : "full",
    placement,
  };
}

type JiraAnalyticsScopeType = "LABEL" | "EPIC";

function jiraScopeValueIsValid(type: JiraAnalyticsScopeType, value: string) {
  const normalized = value.trim();
  return type === "LABEL"
    ? normalized.length > 0 && /^[^\s"'\\]+$/.test(normalized)
    : /^[A-Z][A-Z0-9_]*-\d+$/i.test(normalized);
}

export function JiraAnalyticsDashboard({
  canClear,
  clearing,
  dataRevision,
  editing,
  onClearData,
  onEditingChange,
  onStartEditing,
  section,
}: {
  canClear: boolean;
  clearing: boolean;
  dataRevision: number;
  editing: boolean;
  onClearData: () => void;
  onEditingChange: (editing: boolean) => void;
  onStartEditing: () => void;
  section: JiraAnalyticsSection;
}) {
  const {
    currentUser,
    isClosedProject,
    project,
    refreshProject,
    setError,
    setNotice,
    syncJira,
    syncing,
  } = usePageContext();
  const storedDashboardConfig = project.jiraAnalyticsSettings?.dashboardConfig ?? null;
  const storedDashboardConfigKey = JSON.stringify(storedDashboardConfig);
  const initialConfig = parseDashboardConfig(storedDashboardConfig);
  const [config, setConfig] = useState<JiraAnalyticsDashboardConfig | null>(initialConfig);
  const [baseline, setBaseline] = useState<JiraAnalyticsDashboardConfig | null>(initialConfig);
  const [dashboardResults, setDashboardResults] = useState<DashboardResults | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [definitions, setDefinitions] = useState<AggregateDefinitionOption[]>([]);
  const [facetState, setFacetState] = useState<{
    projectId: string;
    data: JiraAnalyticsFacets;
  } | null>(null);
  const dashboardProjectIdRef = useRef(project.id);
  const [saving, setSaving] = useState(false);
  const jiraScope = {
    type: project.jiraAnalyticsSettings?.jiraScopeType ?? "LABEL" as JiraAnalyticsScopeType,
    value: project.jiraAnalyticsSettings?.jiraScopeValue ?? "",
  };
  const scopeValueValid = jiraScopeValueIsValid(jiraScope.type, jiraScope.value);
  const isSystemAdmin = currentUser?.role === "ADMIN";
  const canEditWidgets = isSystemAdmin && !isClosedProject;
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<{ title: string; records: JiraAnalyticsResultRecord[] } | null>(null);
  useEffect(() => {
    const projectChanged = dashboardProjectIdRef.current !== project.id;
    if (editing && !projectChanged) return;
    dashboardProjectIdRef.current = project.id;
    const next = parseDashboardConfig(JSON.parse(storedDashboardConfigKey) as unknown);
    // Stored changes are applied only when they cannot replace an active draft.
    setConfig(next);
    setBaseline(next ? structuredClone(next) : null);
    setSelectedWidgetId(null);
  }, [editing, project.id, storedDashboardConfigKey]);

  useEffect(() => {
    let active = true;
    void apiClient.get<{ definitions: AggregateDefinitionOption[] }>(
      `/api/projects/${project.id}/jira/aggregates`,
      "Не удалось загрузить каталог агрегатов",
    ).then((response) => {
      if (active) setDefinitions(response.definitions);
    }).catch((error) => {
      if (active) setError(error instanceof Error ? error.message : "Не удалось загрузить агрегаты");
    });
    return () => { active = false; };
  }, [project.id, setError]);

  useEffect(() => {
    let active = true;
    void apiClient.get<JiraAnalyticsFacets>(
      `/api/projects/${project.id}/jira/analytics-facets`,
      "Не удалось загрузить сводку данных Jira",
    ).then((response) => {
      if (active) setFacetState({ projectId: project.id, data: response });
    }).catch((error) => {
      if (active) {
        setError(error instanceof Error ? error.message : "Не удалось загрузить сводку Jira");
      }
    });
    return () => { active = false; };
  }, [
    dataRevision,
    project.id,
    project.jiraAnalyticsSettings?.lastSyncedAt,
    project.jiraIntegration?.lastSyncedAt,
    setError,
  ]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setDashboardLoading(true);
    });
    const params = new URLSearchParams({
      periodDays: String(config?.periodDays ?? 90),
      assignee: config?.assignee ?? "",
      page: "1",
      pageSize: "12",
    });
    void apiClient.get<DashboardResults>(
      `/api/projects/${project.id}/jira/aggregate-dashboard-results?${params}`,
      "Не удалось рассчитать дашборд Jira",
    ).then((response) => {
      if (active) setDashboardResults(response);
    }).catch((error) => {
      if (active) {
        setDashboardResults(null);
        setError(error instanceof Error ? error.message : "Не удалось рассчитать дашборд");
      }
    }).finally(() => {
      if (active) setDashboardLoading(false);
    });
    return () => { active = false; };
  }, [
    config?.assignee,
    config?.periodDays,
    dataRevision,
    project.id,
    project.jiraAnalyticsSettings?.lastSyncedAt,
    project.jiraIntegration?.lastSyncedAt,
    storedDashboardConfigKey,
    setError,
  ]);

  const facets = facetState?.projectId === project.id ? facetState.data : null;
  const assignees = facets?.assignees ?? [];
  const issueCount = facets?.issueCount ?? 0;
  const transitionCoverage = facets?.transitionHistoryCompleteCount ?? 0;
  const developmentCoverage = facets?.developmentDataAvailableCount ?? 0;
  const criticalBugsCount = facets?.criticalSlaTrackedCount ?? 0;
  const criticalPriorityCoverage = facets?.criticalSlaReadyCount ?? 0;
  const slaScopeConfigured = Boolean(
    project.jiraAnalyticsSettings?.jiraScopeValue?.trim() ||
    project.jiraIntegration?.projectKey?.trim() ||
    issueCount > 0,
  );
  const latestSync = facets?.latestSyncedAt ? new Date(facets.latestSyncedAt) : null;

  const visibleWidgets = useMemo(() => {
    const resultsById = new Map(
      (dashboardResults?.widgets ?? []).map((widget) => [widget.widgetId, widget]),
    );
    if (!config) {
      return (dashboardResults?.widgets ?? []).filter((widget) => widget.placement === section);
    }
    return config.widgets
      .filter((widget) => widgetPlacement(widget) === section)
      .map((layout): ServerWidgetResult => {
        const result = resultsById.get(layout.id);
        const placement = widgetPlacement(layout);
        const savedLayout = baseline?.widgets.find((widget) => widget.id === layout.id);
        const draftChanged = editing && JSON.stringify(savedLayout) !== JSON.stringify(layout);
        if (result && !draftChanged) {
          return {
            ...result,
            title: layout.title,
            visualization: layout.visualization,
            width: layout.width,
            placement,
          };
        }
        if ("source" in layout) {
          return {
            widgetId: layout.id,
            title: layout.title,
            visualization: layout.visualization,
            width: layout.width,
            placement,
            aggregateId: null,
            aggregateName: layout.title,
            source: layout.source,
            metric: layout.metric,
            groupBy: layout.groupBy,
            status: "UNAVAILABLE",
            error: "Сохраните дашборд, чтобы рассчитать новый виджет",
          };
        }
        const definition = definitions.find((item) => item.id === layout.aggregateId);
        return {
          widgetId: layout.id,
          title: layout.title,
          visualization: layout.visualization,
          width: layout.width,
          placement,
          aggregateId: layout.aggregateId,
          aggregateName: definition?.name ?? "",
          source: definition?.source ?? "issues",
          metric: definition?.metric ?? "count",
          groupBy: definition?.groupBy ?? "none",
          status: "UNAVAILABLE",
          error: "Сохраните дашборд, чтобы рассчитать новый виджет",
        };
      });
  }, [baseline, config, dashboardResults, definitions, editing, section]);
  const hasEventWidgets = visibleWidgets.some((widget) =>
    ["transitions", "development"].includes(widget.source),
  );
  const activeSelectedWidgetId = editing
    ? selectedWidgetId ?? visibleWidgets[0]?.widgetId ?? null
    : null;
  const selectedWidget = config?.widgets.find((widget) => widget.id === activeSelectedWidgetId) ?? null;

  const patchDashboardFilters = (
    patch: Partial<Pick<JiraAnalyticsDashboardConfig, "assignee" | "periodDays">>,
  ) => {
    setConfig((current) => current ? ({ ...current, ...patch }) : current);
    if (!editing) {
      setBaseline((current) => current ? ({ ...current, ...patch }) : current);
    }
  };

  const updateWidget = (next: JiraAnalyticsWidget) =>
    setConfig((current) => current?.version === 1 ? ({
      ...current,
      widgets: current.widgets.map((widget) => (widget.id === next.id ? next : widget)),
    }) : current);

  const updateReferencedWidget = (next: JiraAnalyticsReferencedWidget) =>
    setConfig((current) => current?.version === 2 ? ({
      ...current,
      widgets: current.widgets.map((widget) => (widget.id === next.id ? next : widget)),
    }) : current);

  const moveWidget = (widgetId: string, direction: -1 | 1) => {
    setConfig((current) => {
      if (!current) return current;
      if (current.version === 1) {
        const widgets = [...current.widgets];
        const sectionIndexes = widgets.flatMap((widget, index) => widget.section === section ? [index] : []);
        const sectionIndex = sectionIndexes.findIndex((index) => widgets[index]?.id === widgetId);
        const targetSectionIndex = sectionIndex + direction;
        if (sectionIndex < 0 || targetSectionIndex < 0 || targetSectionIndex >= sectionIndexes.length) return current;
        const index = sectionIndexes[sectionIndex];
        const target = sectionIndexes[targetSectionIndex];
        [widgets[index], widgets[target]] = [widgets[target], widgets[index]];
        return { ...current, widgets };
      }
      const widgets = [...current.widgets];
      const sectionIndexes = widgets.flatMap((widget, index) => widget.placement === section ? [index] : []);
      const sectionIndex = sectionIndexes.findIndex((index) => widgets[index]?.id === widgetId);
      const targetSectionIndex = sectionIndex + direction;
      if (sectionIndex < 0 || targetSectionIndex < 0 || targetSectionIndex >= sectionIndexes.length) return current;
      const index = sectionIndexes[sectionIndex];
      const target = sectionIndexes[targetSectionIndex];
      [widgets[index], widgets[target]] = [widgets[target], widgets[index]];
      return { ...current, widgets };
    });
  };

  const saveDashboard = async () => {
    if (!canEditWidgets || !config) return;
    if (config.version === 2 && config.widgets.some((widget) => !widget.aggregateId)) {
      setError("Для каждого виджета нужно выбрать сохранённый агрегат");
      return;
    }
    const validation = config.version === 2
      ? jiraAnalyticsDashboardV2Schema.safeParse(config)
      : jiraAnalyticsDashboardV1Schema.safeParse(config);
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Некорректная конфигурация дашборда");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiClient.patch(
        `/api/projects/${project.id}/jira/analytics-dashboard`,
        { config: validation.data },
        "Не удалось сохранить настройки аналитики Jira",
      );
      await refreshProject(project.id);
      setBaseline(structuredClone(validation.data));
      onEditingChange(false);
      setSelectedWidgetId(null);
      setNotice("Настройки виджетов сохранены для проекта");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось сохранить дашборд");
    } finally {
      setSaving(false);
    }
  };

  const fetchWidgetRecords = async (
    widgetId: string,
    groupKey?: string,
    initialWidget?: ServerWidgetResult,
  ) => {
    const records = new Map<string, JiraAnalyticsResultRecord>();
    const initialResult = initialWidget?.status === "OK" ? initialWidget.result : undefined;
    initialResult?.records.forEach((record) => records.set(record.id, record));
    let evaluatedAt = initialResult?.evaluatedAt;
    let page = initialResult ? 2 : 1;
    if (initialResult && initialResult.records.length >= initialResult.totalRecords) {
      return [...records.values()];
    }
    let totalRecords = Number.POSITIVE_INFINITY;
    if (initialResult) totalRecords = initialResult.totalRecords;
    while (records.size < totalRecords) {
      const params = new URLSearchParams({
        periodDays: String(config?.periodDays ?? 90),
        assignee: config?.assignee ?? "",
        page: String(page),
        pageSize: "100",
      });
      if (groupKey) params.set("groupKey", groupKey);
      params.set("widgetId", widgetId);
      if (evaluatedAt) params.set("evaluatedAt", evaluatedAt);
      const response = await apiClient.get<DashboardResults>(
        `/api/projects/${project.id}/jira/aggregate-dashboard-results?${params}`,
        "Не удалось загрузить детализацию",
      );
      const widget = response.widgets.find((item) => item.widgetId === widgetId);
      if (!widget || widget.status !== "OK" || !widget.result) {
        throw new Error(widget?.error ?? "Виджет отсутствует в сохранённом дашборде");
      }
      evaluatedAt ??= widget.result.evaluatedAt;
      totalRecords = widget.result.totalRecords;
      widget.result.records.forEach((record) => records.set(record.id, record));
      if (widget.result.records.length === 0 || page >= Math.ceil(totalRecords / 100)) break;
      page += 1;
    }
    return [...records.values()];
  };

  const openDrilldown = async (widgetId: string, title: string, groupKey?: string) => {
    try {
      const records = await fetchWidgetRecords(widgetId, groupKey);
      setDrilldown({ title, records });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось открыть детализацию");
    }
  };

  const exportWidget = async (widget: ServerWidgetResult) => {
    try {
      const records = await fetchWidgetRecords(widget.widgetId);
      downloadRecords(`jira-analytics-${project.code}-${widget.title}`, records);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось экспортировать виджет");
    }
  };

  const exportAll = async () => {
    try {
      const unique = new Map<string, JiraAnalyticsResultRecord>();
      const params = new URLSearchParams({
        periodDays: String(config?.periodDays ?? 90),
        assignee: config?.assignee ?? "",
        page: "1",
        pageSize: "100",
      });
      const initial = await apiClient.get<DashboardResults>(
        `/api/projects/${project.id}/jira/aggregate-dashboard-results?${params}`,
        "Не удалось подготовить экспорт дашборда",
      );
      const visibleIds = new Set(visibleWidgets.map((widget) => widget.widgetId));
      const widgets = initial.widgets
        .filter((widget) => visibleIds.has(widget.widgetId) && widget.status === "OK");
      for (const widget of widgets) {
        const records = await fetchWidgetRecords(widget.widgetId, undefined, widget);
        records.forEach((record) => unique.set(record.id, record));
      }
      downloadRecords(`jira-analytics-${project.code}-${section}`, [...unique.values()]);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось экспортировать дашборд");
    }
  };

  return (
    <div className="jira-analytics-workspace">
      <div className="jira-analytics-toolbar">
        <label title={hasEventWidgets ? "Период переходов и активности разработки" : "На текущие тикеты и SLA-отчет период событий не влияет"}>
          <span>Период событий</span>
          <select aria-label="Период событий" disabled={!hasEventWidgets || !config} value={config?.periodDays ?? 90} onChange={(event) => patchDashboardFilters({ periodDays: Number(event.target.value) as JiraAnalyticsDashboardConfig["periodDays"] })}>
            <option value={30}>30 дней</option>
            <option value={90}>90 дней</option>
            <option value={180}>180 дней</option>
            <option value={365}>365 дней</option>
          </select>
        </label>
        <label>
          <span>Исполнитель</span>
          <select disabled={!config} value={config?.assignee ?? ""} onChange={(event) => patchDashboardFilters({ assignee: event.target.value })}>
            <option value="">Все</option>
            {assignees.map((assignee) => <option value={assignee} key={assignee}>{assignee}</option>)}
          </select>
        </label>
        <div className="jira-analytics-toolbar-actions">
          <button type="button" className="icon-button" onClick={() => void exportAll()} disabled={dashboardLoading || visibleWidgets.length === 0} aria-label="Экспортировать дашборд" title="Экспорт CSV"><Download size={17} /></button>
          <button
            type="button"
            className="button"
            onClick={() => syncJira({
              baseUrl: "https://tasks.sberdevices.ru",
              scopeType: jiraScope.type,
              scopeValue: jiraScope.value.trim(),
            })}
            disabled={syncing || clearing || !scopeValueValid}
          >
            <RefreshCw size={16} className={syncing ? "spin" : ""} />
            {syncing ? "Обновляю..." : "Обновить"}
          </button>
          {canClear && !editing && (
            <button
              type="button"
              className="button"
              onClick={onClearData}
              disabled={syncing || clearing}
            >
              <Trash2 size={16} /> {clearing ? "Очищаю..." : "Очистить"}
            </button>
          )}
          {canEditWidgets && config && !editing && (
            <button type="button" className="button" onClick={onStartEditing}>
              <Pencil size={16} /> Редактировать
            </button>
          )}
          {canEditWidgets && config && editing && (
            <>
              <button type="button" className="button" onClick={() => { setConfig(baseline ? structuredClone(baseline) : null); onEditingChange(false); setSelectedWidgetId(null); }}><X size={16} /> Отменить</button>
              <button type="button" className="button primary" onClick={saveDashboard} disabled={saving}><Save size={16} /> {saving ? "Сохраняю..." : "Сохранить"}</button>
            </>
          )}
        </div>
      </div>

      {!config && (
        <div className="jira-aggregate-validation">
          Сохранённая конфигурация дашборда некорректна. Она не заменена шаблоном автоматически; исправьте её через миграцию или восстановление.
        </div>
      )}

      {issueCount > 0 && (
        <div className="jira-analytics-data-health" aria-label="Полнота аналитических данных">
          <span className={transitionCoverage === issueCount ? "complete" : "partial"}>
            История статусов {transitionCoverage}/{issueCount}
          </span>
          <span className={developmentCoverage === issueCount ? "complete" : "partial"}>
            Development {developmentCoverage}/{issueCount}
          </span>
          {slaScopeConfigured ? (
            <span className={criticalPriorityCoverage === criticalBugsCount ? "complete" : "partial"}>
              SLA-тикеты {criticalPriorityCoverage}/{criticalBugsCount}
            </span>
          ) : (
            <span className="partial">SLA не настроен: нет Jira project key</span>
          )}
          {latestSync && !Number.isNaN(latestSync.getTime()) && (
            <small>
              Обновлено {latestSync.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
            </small>
          )}
        </div>
      )}

      <div className={`jira-analytics-edit-layout ${editing && selectedWidget ? "with-editor" : ""}`}>
        <div className="jira-analytics-grid">
          {dashboardLoading && visibleWidgets.length === 0 && (
            <div className="jira-analytics-empty">Расчёт агрегатов...</div>
          )}
          {visibleWidgets.map((widget, index) => (
            <JiraAnalyticsWidgetCard
              editing={editing}
              index={index}
              key={widget.widgetId}
              onDrilldown={(title, groupKey) => void openDrilldown(widget.widgetId, title, groupKey)}
              onExport={() => void exportWidget(widget)}
              onMove={(direction) => moveWidget(widget.widgetId, direction)}
              onRemove={() => {
                setConfig((current) => current ? ({ ...current, widgets: current.widgets.filter((item) => item.id !== widget.widgetId) } as JiraAnalyticsDashboardConfig) : current);
                if (activeSelectedWidgetId === widget.widgetId) setSelectedWidgetId(null);
              }}
              onSelect={() => setSelectedWidgetId(widget.widgetId)}
              result={widget.result ?? null}
              selected={editing && activeSelectedWidgetId === widget.widgetId}
              total={visibleWidgets.length}
              widget={widget}
            />
          ))}
          {editing && config && (
            <button
              type="button"
              className="jira-analytics-add-widget"
              disabled={config.widgets.length >= 100 || (config.version === 2 && !definitions.some((definition) => definition.scope === section))}
              onClick={() => {
                const widget = config.version === 1
                  ? createJiraAnalyticsWidget("issues", section)
                  : newReferencedWidget(definitions.find((definition) => definition.scope === section)!, section);
                setConfig((current) => current ? ({ ...current, widgets: [...current.widgets, widget] } as JiraAnalyticsDashboardConfig) : current);
                setSelectedWidgetId(widget.id);
              }}
            >
              <Plus size={19} /> Добавить виджет
            </button>
          )}
        </div>
        {editing && selectedWidget && config?.version === 1 && "source" in selectedWidget && (
          <JiraWidgetEditor widget={selectedWidget} onChange={updateWidget} onClose={() => setSelectedWidgetId(null)} />
        )}
        {editing && selectedWidget && config?.version === 2 && "aggregateId" in selectedWidget && (
          <JiraReferencedWidgetEditor definitions={definitions} widget={selectedWidget} onChange={updateReferencedWidget} onClose={() => setSelectedWidgetId(null)} />
        )}
      </div>

      {drilldown && (
        <section className="jira-analytics-drilldown">
          <header>
            <div><TableProperties size={18} /><h3>{drilldown.title}</h3><span>{drilldown.records.length}</span></div>
            <div>
              <button type="button" className="icon-button" onClick={() => downloadRecords(`jira-analytics-${project.code}-${drilldown.title}`, drilldown.records)} aria-label="Экспортировать детализацию" title="Экспорт CSV"><Download size={16} /></button>
              <button type="button" className="icon-button" onClick={() => setDrilldown(null)} aria-label="Закрыть детализацию"><X size={17} /></button>
            </div>
          </header>
          <JiraAnalyticsTable records={drilldown.records} />
        </section>
      )}

      {facets && issueCount === 0 && (
        <div className="jira-analytics-zero-state">
          <BarChart3 size={24} />
          <span>Нет синхронизированных тикетов Jira</span>
          <button
            type="button"
            className="button"
            onClick={() => syncJira({
              baseUrl: "https://tasks.sberdevices.ru",
              scopeType: jiraScope.type,
              scopeValue: jiraScope.value.trim(),
            })}
            disabled={syncing || clearing || !scopeValueValid}
          >
            Синхронизировать
          </button>
        </div>
      )}
    </div>
  );
}
