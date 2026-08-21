import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
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
import { useMemo, useState } from "react";

import { apiClient } from "../api/client";
import type { JiraIssueSnapshot } from "../app/domainTypes";
import {
  JIRA_ANALYTICS_DEFAULT_CONFIG,
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  JIRA_ANALYTICS_FILTER_LABELS,
  JIRA_ANALYTICS_GROUPS_BY_SOURCE,
  JIRA_ANALYTICS_GROUP_LABELS,
  JIRA_ANALYTICS_METRICS_BY_SOURCE,
  JIRA_ANALYTICS_METRIC_LABELS,
  JIRA_ANALYTICS_OPERATOR_LABELS,
  JIRA_ANALYTICS_SOURCE_LABELS,
  JIRA_CRITICAL_BUG_SLA_HOURS,
  cloneJiraAnalyticsConfig,
  createJiraAnalyticsFilter,
  createJiraAnalyticsWidget,
  evaluateJiraAnalyticsWidget,
  formatJiraAnalyticsMetric,
  jiraAnalyticsCsv,
  jiraAnalyticsFieldIsNumeric,
  jiraAnalyticsOperatorsFor,
  normalizeJiraAnalyticsConfig,
  type JiraAnalyticsDashboardConfig,
  type JiraAnalyticsFilter,
  type JiraAnalyticsFilterField,
  type JiraAnalyticsFilterOperator,
  type JiraAnalyticsGroupBy,
  type JiraAnalyticsMetric,
  type JiraAnalyticsRecord,
  type JiraAnalyticsSection,
  type JiraAnalyticsSource,
  type JiraAnalyticsVisualization,
  type JiraAnalyticsWidget,
} from "../app/jiraAnalytics";
import { usePageContext } from "./PageContext";

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
              <button type="button" className="icon-button danger" onClick={onRemove} disabled={total === 1} aria-label="Удалить виджет" title="Удалить"><Trash2 size={16} /></button>
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
        <>
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
          {result.groups.length > 12 && (
            <button
              type="button"
              className="jira-analytics-more"
              onClick={() => onDrilldown(widget.title, result.records)}
            >
              Показано 12 из {result.groups.length} групп · Открыть все записи ({result.records.length})
            </button>
          )}
        </>
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

type JiraAnalyticsScopeType = "LABEL" | "EPIC";

function jiraScopeValueIsValid(type: JiraAnalyticsScopeType, value: string) {
  const normalized = value.trim();
  return type === "LABEL"
    ? normalized.length > 0 && /^[^\s"'\\]+$/.test(normalized)
    : /^[A-Z][A-Z0-9_]*-\d+$/i.test(normalized);
}

export function JiraAnalyticsDashboard({ section }: { section: JiraAnalyticsSection }) {
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
  const [config, setConfig] = useState<JiraAnalyticsDashboardConfig>(() =>
    normalizeJiraAnalyticsConfig(
      project.jiraAnalyticsSettings?.dashboardConfig,
      JIRA_ANALYTICS_DEFAULT_CONFIG,
    ),
  );
  const [baseline, setBaseline] = useState<JiraAnalyticsDashboardConfig>(() =>
    normalizeJiraAnalyticsConfig(
      project.jiraAnalyticsSettings?.dashboardConfig,
      JIRA_ANALYTICS_DEFAULT_CONFIG,
    ),
  );
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jiraScopeDraft, setJiraScopeDraft] = useState<{
    projectId: string;
    type: JiraAnalyticsScopeType;
    value: string;
  }>({
    projectId: project.id,
    type: project.jiraAnalyticsSettings?.jiraScopeType ?? "LABEL",
    value: project.jiraAnalyticsSettings?.jiraScopeValue ?? "",
  });
  const jiraScope = jiraScopeDraft.projectId === project.id
    ? jiraScopeDraft
    : {
        projectId: project.id,
        type: project.jiraAnalyticsSettings?.jiraScopeType ?? "LABEL" as const,
        value: project.jiraAnalyticsSettings?.jiraScopeValue ?? "",
      };
  const scopeValueValid = jiraScopeValueIsValid(jiraScope.type, jiraScope.value);
  const isSystemAdmin = currentUser?.role === "ADMIN";
  const canEditWidgets = isSystemAdmin && !isClosedProject;
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
    project.jiraAnalyticsSettings?.jiraScopeValue?.trim() ||
    project.jiraIntegration?.projectKey?.trim() ||
    issues.some((issue) => /^[A-Z][A-Z0-9_]*-\d+$/i.test(issue.issueKey)),
  );
  const latestSync = issues
    .map((issue) => new Date(issue.syncedAt))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  const visibleWidgets = useMemo(
    () => config.widgets.filter((widget) => widget.section === section),
    [config.widgets, section],
  );
  const results = useMemo(
    () =>
      visibleWidgets.map((widget) =>
        evaluateJiraAnalyticsWidget(widget, issues, {
          periodDays: config.periodDays,
          assignee: config.assignee,
        }),
      ),
    [config.assignee, config.periodDays, issues, visibleWidgets],
  );
  const hasEventWidgets = visibleWidgets.some((widget) =>
    ["transitions", "development"].includes(widget.source),
  );
  const selectedWidget = visibleWidgets.find((widget) => widget.id === selectedWidgetId) ?? null;

  const updateWidget = (next: JiraAnalyticsWidget) =>
    setConfig((current) => ({
      ...current,
      widgets: current.widgets.map((widget) => (widget.id === next.id ? next : widget)),
    }));

  const moveWidget = (widgetId: string, direction: -1 | 1) => {
    setConfig((current) => {
      const widgets = [...current.widgets];
      const sectionIndexes = widgets.flatMap((widget, index) =>
        widget.section === section ? [index] : [],
      );
      const sectionIndex = sectionIndexes.findIndex((index) => widgets[index]?.id === widgetId);
      const targetSectionIndex = sectionIndex + direction;
      if (sectionIndex < 0 || targetSectionIndex < 0 || targetSectionIndex >= sectionIndexes.length) {
        return current;
      }
      const index = sectionIndexes[sectionIndex];
      const target = sectionIndexes[targetSectionIndex];
      [widgets[index], widgets[target]] = [widgets[target], widgets[index]];
      return { ...current, widgets };
    });
  };

  const saveDashboard = async () => {
    if (!canEditWidgets) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.patch(
        `/api/projects/${project.id}/jira/analytics-dashboard`,
        { config },
        "Не удалось сохранить настройки аналитики Jira",
      );
      await refreshProject(project.id);
      setBaseline(cloneJiraAnalyticsConfig(config));
      setEditing(false);
      setSelectedWidgetId(null);
      setNotice("Настройки виджетов сохранены для проекта");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось сохранить дашборд");
    } finally {
      setSaving(false);
    }
  };

  const exportAll = () => {
    const unique = new Map<string, JiraAnalyticsRecord>();
    results.flatMap((result) => result.records).forEach((record) => unique.set(record.id, record));
    downloadRecords(`jira-analytics-${project.code}-${section}`, [...unique.values()]);
  };

  return (
    <div className="jira-analytics-workspace">
      <div className="jira-analytics-toolbar">
        <label className="jira-analytics-scope-type">
          <span>Отбор тикетов</span>
          <select
            aria-label="Способ отбора тикетов"
            disabled={!canEditWidgets}
            value={jiraScope.type}
            onChange={(event) => setJiraScopeDraft({
              projectId: project.id,
              type: event.target.value as JiraAnalyticsScopeType,
              value: "",
            })}
          >
            <option value="LABEL">Лейбл</option>
            <option value="EPIC">Код эпика</option>
          </select>
        </label>
        <label className="jira-analytics-scope-value">
          <span>{jiraScope.type === "LABEL" ? "Лейбл" : "Код эпика"}</span>
          <input
            aria-label={jiraScope.type === "LABEL" ? "Лейбл Jira" : "Код эпика Jira"}
            maxLength={100}
            disabled={!canEditWidgets}
            placeholder={jiraScope.type === "LABEL" ? "cvte968" : "CVTE-1234"}
            value={jiraScope.value}
            onChange={(event) => setJiraScopeDraft({
              projectId: project.id,
              type: jiraScope.type,
              value: event.target.value,
            })}
          />
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
          <button type="button" className="icon-button" onClick={exportAll} aria-label="Экспортировать дашборд" title="Экспорт CSV"><Download size={17} /></button>
          <button
            type="button"
            className="button"
            onClick={() => syncJira({
              baseUrl: "https://tasks.sberdevices.ru",
              scopeType: jiraScope.type,
              scopeValue: jiraScope.value.trim(),
            })}
            disabled={syncing || !scopeValueValid}
          >
            <RefreshCw size={16} className={syncing ? "spin" : ""} />
            {syncing ? "Обновляю..." : "Обновить"}
          </button>
          {canEditWidgets && (!editing ? (
            <button type="button" className="button primary" onClick={() => { setBaseline(cloneJiraAnalyticsConfig(config)); setEditing(true); setSelectedWidgetId(visibleWidgets[0]?.id ?? null); }}>
              <Pencil size={16} /> Редактировать
            </button>
          ) : (
            <>
              <button type="button" className="button" onClick={() => { setConfig(cloneJiraAnalyticsConfig(baseline)); setEditing(false); setSelectedWidgetId(null); }}><X size={16} /> Отменить</button>
              <button type="button" className="button primary" onClick={saveDashboard} disabled={saving}><Save size={16} /> {saving ? "Сохраняю..." : "Сохранить"}</button>
            </>
          ))}
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

      <div className={`jira-analytics-edit-layout ${editing && selectedWidget ? "with-editor" : ""}`}>
        <div className="jira-analytics-grid">
          {visibleWidgets.map((widget, index) => (
            <JiraAnalyticsWidgetCard
              dashboardName={`jira-analytics-${project.code}`}
              editing={editing}
              index={index}
              key={widget.id}
              onDrilldown={(title, records) => setDrilldown({ title, records })}
              onMove={(direction) => moveWidget(widget.id, direction)}
              onRemove={() => {
                setConfig((current) => ({ ...current, widgets: current.widgets.filter((item) => item.id !== widget.id) }));
                if (selectedWidgetId === widget.id) setSelectedWidgetId(null);
              }}
              onSelect={() => setSelectedWidgetId(widget.id)}
              result={results[index]}
              selected={editing && selectedWidgetId === widget.id}
              total={visibleWidgets.length}
              widget={widget}
            />
          ))}
          {editing && (
            <button
              type="button"
              className="jira-analytics-add-widget"
              disabled={config.widgets.length >= 100}
              onClick={() => {
                const widget = createJiraAnalyticsWidget("issues", section);
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
              <button type="button" className="icon-button" onClick={() => downloadRecords(`jira-analytics-${project.code}-${drilldown.title}`, drilldown.records)} aria-label="Экспортировать детализацию" title="Экспорт CSV"><Download size={16} /></button>
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
          <button
            type="button"
            className="button"
            onClick={() => syncJira({
              baseUrl: "https://tasks.sberdevices.ru",
              scopeType: jiraScope.type,
              scopeValue: jiraScope.value.trim(),
            })}
            disabled={syncing || !scopeValueValid}
          >
            Синхронизировать
          </button>
        </div>
      )}
    </div>
  );
}
