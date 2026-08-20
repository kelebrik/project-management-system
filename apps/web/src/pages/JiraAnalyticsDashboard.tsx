import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  TableProperties,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { apiClient } from "../api/client";
import type { JiraIssueSnapshot, SavedView } from "../app/domainTypes";
import {
  JIRA_ANALYTICS_FILTER_LABELS,
  JIRA_ANALYTICS_DEFAULT_TEMPLATE,
  JIRA_ANALYTICS_GROUP_LABELS,
  JIRA_ANALYTICS_METRIC_LABELS,
  JIRA_ANALYTICS_OPERATOR_LABELS,
  JIRA_ANALYTICS_SOURCE_LABELS,
  JIRA_ANALYTICS_TEMPLATES,
  JIRA_ANALYTICS_VIEW_TYPE,
  JIRA_CRITICAL_BUG_SLA_HOURS,
  cloneJiraAnalyticsConfig,
  createJiraAnalyticsFilter,
  createJiraAnalyticsWidget,
  evaluateJiraAnalyticsWidget,
  formatJiraAnalyticsMetric,
  jiraAnalyticsCsv,
  normalizeJiraAnalyticsConfig,
  type JiraAnalyticsDashboardConfig,
  type JiraAnalyticsFilter,
  type JiraAnalyticsFilterField,
  type JiraAnalyticsFilterOperator,
  type JiraAnalyticsGroupBy,
  type JiraAnalyticsMetric,
  type JiraAnalyticsRecord,
  type JiraAnalyticsSource,
  type JiraAnalyticsVisualization,
  type JiraAnalyticsWidget,
} from "../app/jiraAnalytics";
import { usePageContext } from "./PageContext";

const METRICS_BY_SOURCE: Record<JiraAnalyticsSource, JiraAnalyticsMetric[]> = {
  issues: ["count", "commits", "mergeRequests"],
  transitions: [
    "count",
    "averageDuration",
    "p50Duration",
    "p85Duration",
    "p95Duration",
  ],
  development: ["count", "commits", "mergeRequests"],
  criticalBugs: [
    "count",
    "averageDuration",
    "p50Duration",
    "p85Duration",
    "p95Duration",
  ],
};

const GROUPS_BY_SOURCE: Record<JiraAnalyticsSource, JiraAnalyticsGroupBy[]> = {
  issues: ["none", "status", "assignee", "priority", "sprint", "issueType"],
  transitions: [
    "none",
    "status",
    "assignee",
    "fromStatus",
    "toStatus",
    "week",
  ],
  development: ["none", "status", "assignee", "sprint", "week"],
  criticalBugs: ["none", "priority", "assignee", "status", "resolution"],
};

const FIELDS_BY_SOURCE: Record<JiraAnalyticsSource, JiraAnalyticsFilterField[]> = {
  issues: [
    "status",
    "assignee",
    "priority",
    "sprint",
    "issueType",
    "resolution",
    "hasDevelopment",
    "commitCount",
    "mergeRequestCount",
  ],
  transitions: [
    "status",
    "assignee",
    "fromStatus",
    "toStatus",
    "durationHours",
  ],
  development: [
    "status",
    "assignee",
    "sprint",
    "commitCount",
    "mergeRequestCount",
  ],
  criticalBugs: [
    "status",
    "assignee",
    "priority",
    "resolution",
    "durationHours",
  ],
};

const NUMERIC_FIELDS = new Set<JiraAnalyticsFilterField>([
  "durationHours",
  "commitCount",
  "mergeRequestCount",
]);

function operatorsFor(field: JiraAnalyticsFilterField): JiraAnalyticsFilterOperator[] {
  if (NUMERIC_FIELDS.has(field)) return ["greaterThan", "atLeast", "equals"];
  if (field === "hasDevelopment") return ["equals"];
  return ["equals", "notEquals", "contains", "empty", "notEmpty"];
}

function downloadRecords(name: string, records: JiraAnalyticsRecord[]) {
  const blob = new Blob(["\ufeff", jiraAnalyticsCsv(records)], {
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
  records: JiraAnalyticsRecord[];
  limit?: number;
}) {
  const ordered = [...records].sort((left, right) => {
    const duration = (right.durationHours ?? -1) - (left.durationHours ?? -1);
    if (duration !== 0) return duration;
    return (right.eventAt?.getTime() ?? 0) - (left.eventAt?.getTime() ?? 0);
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
              const deadline = record.eventAt
                ? new Date(
                    record.eventAt.getTime() + JIRA_CRITICAL_BUG_SLA_HOURS * 3_600_000,
                  )
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
  dashboardName,
  editing,
  index,
  onDrilldown,
  onMove,
  onRemove,
  onSelect,
  result,
  selected,
  total,
  widget,
}: {
  dashboardName: string;
  editing: boolean;
  index: number;
  onDrilldown: (title: string, records: JiraAnalyticsRecord[]) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onSelect: () => void;
  result: ReturnType<typeof evaluateJiraAnalyticsWidget>;
  selected: boolean;
  total: number;
  widget: JiraAnalyticsWidget;
}) {
  const maxGroupValue = Math.max(1, ...result.groups.map((group) => group.value));
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
          {result.records.length > 0 && (
            <button
              type="button"
              className="icon-button"
              onClick={() => downloadRecords(`${dashboardName}-${widget.title}`, result.records)}
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
              <button type="button" className="icon-button danger" onClick={onRemove} aria-label="Удалить виджет" title="Удалить"><Trash2 size={16} /></button>
            </>
          )}
        </div>
      </header>

      {widget.visualization === "number" && (
        <button
          type="button"
          className="jira-analytics-number"
          onClick={() => onDrilldown(widget.title, result.records)}
          disabled={result.records.length === 0}
        >
          <strong>{result.formattedValue}</strong>
          <span>{recordCountLabel}: {result.records.length.toLocaleString("ru-RU")}</span>
        </button>
      )}

      {widget.visualization === "bar" && (
        <div className="jira-analytics-bars">
          {result.groups.length > 0 ? (
            result.groups.slice(0, 12).map((group) => (
              <button
                type="button"
                className="jira-analytics-bar-row"
                key={group.key}
                onClick={() => onDrilldown(`${widget.title}: ${group.label}`, group.records)}
              >
                <span className="jira-analytics-bar-label">{group.label}</span>
                <span className="jira-analytics-bar-track">
                  <span style={{ width: `${Math.max(2, (group.value / maxGroupValue) * 100)}%` }} />
                </span>
                <b>{group.formattedValue}</b>
              </button>
            ))
          ) : (
            <div className="jira-analytics-empty">Нет данных для группировки</div>
          )}
        </div>
      )}

      {widget.visualization === "table" && (
        <>
          <JiraAnalyticsTable records={result.records} limit={12} />
          {result.records.length > 12 && (
            <button
              type="button"
              className="jira-analytics-more"
              onClick={() => onDrilldown(widget.title, result.records)}
            >
              Показать все ({result.records.length})
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
    const metric = METRICS_BY_SOURCE[source].includes(widget.metric)
      ? widget.metric
      : METRICS_BY_SOURCE[source][0];
    const groupBy = GROUPS_BY_SOURCE[source].includes(widget.groupBy)
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
        <input value={widget.title} onChange={(event) => patchWidget({ title: event.target.value })} />
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
          {METRICS_BY_SOURCE[widget.source].map((value) => <option key={value} value={value}>{JIRA_ANALYTICS_METRIC_LABELS[value]}</option>)}
        </select>
      </label>
      <label>
        Группировка
        <select value={widget.groupBy} onChange={(event) => patchWidget({ groupBy: event.target.value as JiraAnalyticsGroupBy })}>
          {GROUPS_BY_SOURCE[widget.source].map((value) => <option key={value} value={value}>{JIRA_ANALYTICS_GROUP_LABELS[value]}</option>)}
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
                updateFilter(condition.id, { field, operator: operatorsFor(field)[0], value: field === "hasDevelopment" ? "true" : "" });
              }}>
                {FIELDS_BY_SOURCE[widget.source].map((field) => <option value={field} key={field}>{JIRA_ANALYTICS_FILTER_LABELS[field]}</option>)}
              </select>
              <select value={condition.operator} onChange={(event) => updateFilter(condition.id, { operator: event.target.value as JiraAnalyticsFilterOperator })}>
                {operatorsFor(condition.field).map((operator) => <option value={operator} key={operator}>{JIRA_ANALYTICS_OPERATOR_LABELS[operator]}</option>)}
              </select>
              {needsValue && (condition.field === "hasDevelopment" ? (
                <select value={condition.value} onChange={(event) => updateFilter(condition.id, { value: event.target.value })}>
                  <option value="true">Да</option>
                  <option value="false">Нет</option>
                </select>
              ) : (
                <input type={NUMERIC_FIELDS.has(condition.field) ? "number" : "text"} value={condition.value} onChange={(event) => updateFilter(condition.id, { value: event.target.value })} />
              ))}
              <button type="button" className="icon-button danger" onClick={() => patchWidget({ filters: widget.filters.filter((item) => item.id !== condition.id) })} aria-label="Удалить условие"><Trash2 size={15} /></button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="button jira-widget-add-filter"
        onClick={() => {
          const field = FIELDS_BY_SOURCE[widget.source][0];
          patchWidget({ filters: [...widget.filters, createJiraAnalyticsFilter(field)] });
        }}
      >
        <Plus size={16} /> Условие
      </button>
    </aside>
  );
}

export function JiraAnalyticsDashboard() {
  const {
    currentUser,
    project,
    setError,
    setNotice,
    syncJira,
    syncing,
  } = usePageContext();
  const [savedDashboards, setSavedDashboards] = useState<SavedView[]>([]);
  const [selectedDashboard, setSelectedDashboard] = useState(
    `template:${JIRA_ANALYTICS_DEFAULT_TEMPLATE.id}`,
  );
  const [config, setConfig] = useState<JiraAnalyticsDashboardConfig>(() =>
    cloneJiraAnalyticsConfig(JIRA_ANALYTICS_DEFAULT_TEMPLATE.config),
  );
  const [baseline, setBaseline] = useState<JiraAnalyticsDashboardConfig>(() =>
    cloneJiraAnalyticsConfig(JIRA_ANALYTICS_DEFAULT_TEMPLATE.config),
  );
  const [dashboardName, setDashboardName] = useState(
    JIRA_ANALYTICS_DEFAULT_TEMPLATE.name,
  );
  const [isShared, setIsShared] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<{ title: string; records: JiraAnalyticsRecord[] } | null>(null);
  const issues = project.jiraSnapshots as JiraIssueSnapshot[];
  const assignees = useMemo(
    () => [...new Set(issues.map((issue) => issue.assignee).filter(Boolean) as string[])].sort((left, right) => left.localeCompare(right, "ru")),
    [issues],
  );
  const transitionCoverage = issues.filter(
    (issue) => issue.transitionHistoryComplete,
  ).length;
  const developmentCoverage = issues.filter(
    (issue) => issue.developmentDataAvailable,
  ).length;
  const criticalBugs = issues.filter((issue) => issue.criticalSlaTracked);
  const criticalPriorityCoverage = criticalBugs.filter(
    (issue) => issue.criticalPriorityAt && !Number.isNaN(new Date(issue.criticalPriorityAt).getTime()),
  ).length;
  const slaScopeConfigured = Boolean(
    project.jiraIntegration?.projectKey?.trim() ||
    issues.some((issue) => /^[A-Z][A-Z0-9_]*-\d+$/i.test(issue.issueKey)),
  );
  const latestSync = issues
    .map((issue) => new Date(issue.syncedAt))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<SavedView[]>(
        `/api/saved-views?viewType=${encodeURIComponent(JIRA_ANALYTICS_VIEW_TYPE)}&projectId=${encodeURIComponent(project.id)}`,
        "Не удалось загрузить дашборды",
      )
      .then((views) => {
        if (!cancelled) setSavedDashboards(views);
      })
      .catch(() => {
        if (!cancelled) setSavedDashboards([]);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const results = useMemo(
    () =>
      config.widgets.map((widget) =>
        evaluateJiraAnalyticsWidget(widget, issues, {
          periodDays: config.periodDays,
          assignee: config.assignee,
        }),
      ),
    [config, issues],
  );
  const hasEventWidgets = config.widgets.some((widget) =>
    ["transitions", "development"].includes(widget.source),
  );
  const selectedWidget = config.widgets.find((widget) => widget.id === selectedWidgetId) ?? null;

  const applySelection = (value: string) => {
    setSelectedDashboard(value);
    setEditing(false);
    setSelectedWidgetId(null);
    setDrilldown(null);
    if (value.startsWith("template:")) {
      const template = JIRA_ANALYTICS_TEMPLATES.find(
        (item) => `template:${item.id}` === value,
      ) ?? JIRA_ANALYTICS_DEFAULT_TEMPLATE;
      const next = cloneJiraAnalyticsConfig(template.config);
      setConfig(next);
      setBaseline(cloneJiraAnalyticsConfig(next));
      setDashboardName(template.name);
      setIsShared(false);
      return;
    }
    const saved = savedDashboards.find((item) => `saved:${item.id}` === value);
    if (!saved) return;
    const next = normalizeJiraAnalyticsConfig(saved.config);
    setConfig(next);
    setBaseline(cloneJiraAnalyticsConfig(next));
    setDashboardName(saved.name);
    setIsShared(saved.isShared);
    void apiClient.post(`/api/saved-views/${saved.id}/use`).catch(() => undefined);
  };

  const beginNewDashboard = () => {
    setSelectedDashboard("draft");
    setDashboardName(`${dashboardName} — копия`);
    setBaseline(cloneJiraAnalyticsConfig(config));
    setIsShared(false);
    setEditing(true);
    setSelectedWidgetId(config.widgets[0]?.id ?? null);
  };

  const updateWidget = (next: JiraAnalyticsWidget) =>
    setConfig((current) => ({
      ...current,
      widgets: current.widgets.map((widget) => (widget.id === next.id ? next : widget)),
    }));

  const moveWidget = (index: number, direction: -1 | 1) => {
    setConfig((current) => {
      const widgets = [...current.widgets];
      const target = index + direction;
      if (target < 0 || target >= widgets.length) return current;
      [widgets[index], widgets[target]] = [widgets[target], widgets[index]];
      return { ...current, widgets };
    });
  };

  const saveDashboard = async () => {
    if (!dashboardName.trim() || !currentUser) return;
    setSaving(true);
    setError(null);
    try {
      const selectedSaved = selectedDashboard.startsWith("saved:")
        ? savedDashboards.find((item) => `saved:${item.id}` === selectedDashboard)
        : null;
      const payload = {
        projectId: project.id,
        viewType: JIRA_ANALYTICS_VIEW_TYPE,
        name: dashboardName.trim(),
        config,
        isShared,
        sortOrder: 0,
      };
      const saved =
        selectedSaved?.ownerId === currentUser.id
          ? await apiClient.patch<SavedView>(`/api/saved-views/${selectedSaved.id}`, payload, "Не удалось сохранить дашборд")
          : await apiClient.post<SavedView>("/api/saved-views", payload, "Не удалось создать дашборд");
      setSavedDashboards((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSelectedDashboard(`saved:${saved.id}`);
      setBaseline(cloneJiraAnalyticsConfig(config));
      setDashboardName(saved.name);
      setEditing(false);
      setSelectedWidgetId(null);
      setNotice("Аналитический дашборд сохранен");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось сохранить дашборд");
    } finally {
      setSaving(false);
    }
  };

  const exportAll = () => {
    const unique = new Map<string, JiraAnalyticsRecord>();
    results.flatMap((result) => result.records).forEach((record) => unique.set(record.id, record));
    downloadRecords(dashboardName, [...unique.values()]);
  };

  return (
    <div className="jira-analytics-workspace">
      <div className="jira-analytics-toolbar">
        <label className="jira-analytics-dashboard-select">
          <span>Дашборд</span>
          <select value={selectedDashboard} onChange={(event) => applySelection(event.target.value)}>
            {selectedDashboard === "draft" && <option value="draft">Новый дашборд</option>}
            <optgroup label="Системные шаблоны">
              {JIRA_ANALYTICS_TEMPLATES.map((template) => <option key={template.id} value={`template:${template.id}`}>{template.name}</option>)}
            </optgroup>
            {savedDashboards.map((dashboard) => (
              <option key={dashboard.id} value={`saved:${dashboard.id}`}>
                {dashboard.isShared ? "Командный" : "Личный"} · {dashboard.name}
              </option>
            ))}
          </select>
        </label>
        <label title={hasEventWidgets ? "Период переходов и активности разработки" : "На текущие тикеты и SLA-отчет период событий не влияет"}>
          <span>Период событий</span>
          <select aria-label="Период событий" disabled={!hasEventWidgets} value={config.periodDays} onChange={(event) => setConfig({ ...config, periodDays: Number(event.target.value) as JiraAnalyticsDashboardConfig["periodDays"] })}>
            <option value={30}>30 дней</option>
            <option value={90}>90 дней</option>
            <option value={180}>180 дней</option>
            <option value={365}>365 дней</option>
          </select>
        </label>
        <label>
          <span>Исполнитель</span>
          <select value={config.assignee} onChange={(event) => setConfig({ ...config, assignee: event.target.value })}>
            <option value="">Все</option>
            {assignees.map((assignee) => <option value={assignee} key={assignee}>{assignee}</option>)}
          </select>
        </label>
        <div className="jira-analytics-toolbar-actions">
          <button type="button" className="icon-button" onClick={beginNewDashboard} aria-label="Создать копию дашборда" title="Создать копию"><Copy size={17} /></button>
          <button type="button" className="icon-button" onClick={exportAll} aria-label="Экспортировать дашборд" title="Экспорт CSV"><Download size={17} /></button>
          <button type="button" className="button" onClick={() => syncJira({ baseUrl: "https://tasks.sberdevices.ru" })} disabled={syncing}>
            <RefreshCw size={16} className={syncing ? "spin" : ""} />
            {syncing ? "Обновляю..." : "Обновить"}
          </button>
          {!editing ? (
            <button type="button" className="button primary" onClick={() => { setBaseline(cloneJiraAnalyticsConfig(config)); setEditing(true); setSelectedWidgetId(config.widgets[0]?.id ?? null); }}>
              <Pencil size={16} /> Редактировать
            </button>
          ) : (
            <>
              <button type="button" className="button" onClick={() => { setConfig(cloneJiraAnalyticsConfig(baseline)); setEditing(false); setSelectedWidgetId(null); }}><X size={16} /> Отменить</button>
              <button type="button" className="button primary" onClick={saveDashboard} disabled={saving || !dashboardName.trim() || !currentUser}><Save size={16} /> {saving ? "Сохраняю..." : "Сохранить"}</button>
            </>
          )}
        </div>
      </div>

      {issues.length > 0 && (
        <div className="jira-analytics-data-health" aria-label="Полнота аналитических данных">
          <span className={transitionCoverage === issues.length ? "complete" : "partial"}>
            История статусов {transitionCoverage}/{issues.length}
          </span>
          <span className={developmentCoverage === issues.length ? "complete" : "partial"}>
            Development {developmentCoverage}/{issues.length}
          </span>
          {slaScopeConfigured ? (
            <span className={criticalPriorityCoverage === criticalBugs.length ? "complete" : "partial"}>
              SLA-тикеты {criticalPriorityCoverage}/{criticalBugs.length}
            </span>
          ) : (
            <span className="partial">SLA не настроен: нет Jira project key</span>
          )}
          {latestSync && (
            <small>
              Обновлено {latestSync.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
            </small>
          )}
        </div>
      )}

      {editing && (
        <div className="jira-analytics-edit-meta">
          <label>
            Название дашборда
            <input value={dashboardName} onChange={(event) => setDashboardName(event.target.value)} />
          </label>
          <label className="checkbox-line">
            <input type="checkbox" checked={isShared} onChange={(event) => setIsShared(event.target.checked)} />
            Командный доступ
          </label>
        </div>
      )}

      <div className={`jira-analytics-edit-layout ${editing && selectedWidget ? "with-editor" : ""}`}>
        <div className="jira-analytics-grid">
          {config.widgets.map((widget, index) => (
            <JiraAnalyticsWidgetCard
              dashboardName={dashboardName}
              editing={editing}
              index={index}
              key={widget.id}
              onDrilldown={(title, records) => setDrilldown({ title, records })}
              onMove={(direction) => moveWidget(index, direction)}
              onRemove={() => {
                setConfig((current) => ({ ...current, widgets: current.widgets.filter((item) => item.id !== widget.id) }));
                if (selectedWidgetId === widget.id) setSelectedWidgetId(null);
              }}
              onSelect={() => setSelectedWidgetId(widget.id)}
              result={results[index]}
              selected={editing && selectedWidgetId === widget.id}
              total={config.widgets.length}
              widget={widget}
            />
          ))}
          {editing && (
            <button
              type="button"
              className="jira-analytics-add-widget"
              onClick={() => {
                const widget = createJiraAnalyticsWidget();
                setConfig((current) => ({ ...current, widgets: [...current.widgets, widget] }));
                setSelectedWidgetId(widget.id);
              }}
            >
              <Plus size={19} /> Добавить виджет
            </button>
          )}
        </div>
        {editing && selectedWidget && (
          <JiraWidgetEditor widget={selectedWidget} onChange={updateWidget} onClose={() => setSelectedWidgetId(null)} />
        )}
      </div>

      {drilldown && (
        <section className="jira-analytics-drilldown">
          <header>
            <div><TableProperties size={18} /><h3>{drilldown.title}</h3><span>{drilldown.records.length}</span></div>
            <div>
              <button type="button" className="icon-button" onClick={() => downloadRecords(`${dashboardName}-${drilldown.title}`, drilldown.records)} aria-label="Экспортировать детализацию" title="Экспорт CSV"><Download size={16} /></button>
              <button type="button" className="icon-button" onClick={() => setDrilldown(null)} aria-label="Закрыть детализацию"><X size={17} /></button>
            </div>
          </header>
          <JiraAnalyticsTable records={drilldown.records} />
        </section>
      )}

      {issues.length === 0 && (
        <div className="jira-analytics-zero-state">
          <BarChart3 size={24} />
          <span>Нет синхронизированных тикетов Jira</span>
          <button type="button" className="button" onClick={() => syncJira({ baseUrl: "https://tasks.sberdevices.ru" })} disabled={syncing}>Синхронизировать</button>
        </div>
      )}
    </div>
  );
}
