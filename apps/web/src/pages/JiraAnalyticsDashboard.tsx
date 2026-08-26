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
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  jiraAnalyticsDashboardV2Schema,
  jiraAnalyticsDashboardV3Schema,
  jiraAnalyticsDashboardV4Schema,
  jiraAnalyticsScopeValueIsValid,
  jiraAnalyticsSourcePeriodSupport,
  jiraAnalyticsWidgetDatasetError,
  normalizeJiraAnalyticsDashboardV1,
  normalizeJiraAnalyticsScopeValue,
  type JiraAnalyticsDashboardConfig,
  type JiraAnalyticsDashboardV4,
  type JiraAnalyticsDatasetDraft,
  type JiraAnalyticsEvaluationResult,
  type JiraAnalyticsManagedWidget,
  type JiraAnalyticsResultRecord,
} from "@pms/shared";

import { apiClient } from "../api/client";
import type { JiraAnalyticsFacets } from "../app/domainTypes";
import { useConfirm } from "../hooks/useConfirm";
import {
  JIRA_ANALYTICS_AGGREGATE_TYPE_LABELS,
  JIRA_ANALYTICS_FILTER_LABELS,
  JIRA_ANALYTICS_GROUPS_BY_SOURCE,
  JIRA_ANALYTICS_GROUP_LABELS,
  JIRA_ANALYTICS_LIST_RESULT,
  JIRA_ANALYTICS_METRICS_BY_SOURCE,
  JIRA_ANALYTICS_METRIC_LABELS,
  JIRA_ANALYTICS_OPERATOR_LABELS,
  JIRA_CRITICAL_BUG_SLA_HOURS,
  createJiraAnalyticsFilter,
  formatJiraAnalyticsMetric,
  jiraAnalyticsEffectiveVisualization,
  jiraAnalyticsFieldIsNumeric,
  jiraAnalyticsOperatorsFor,
  jiraAnalyticsPinnedRevisionUpdate,
  jiraAnalyticsWidgetGroupingPatch,
  jiraAnalyticsWidgetResultMode,
  jiraAnalyticsWidgetResultPatch,
  type JiraAnalyticsFilter,
  type JiraAnalyticsFilterField,
  type JiraAnalyticsFilterOperator,
  type JiraAnalyticsGroupBy,
  type JiraAnalyticsMetric,
  type JiraAnalyticsSection,
  type JiraAnalyticsSource,
  type JiraAnalyticsVisualization,
  type JiraAnalyticsWidgetResultMode,
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
  configVersion: 1 | 2 | 3 | 4;
  configHash: string;
  widgets: ServerWidgetResult[];
};

type AggregateDefinitionOption = JiraAnalyticsDatasetDraft & {
  id: string;
  version: number;
};

type AggregateCatalogResponse = {
  definitions: AggregateDefinitionOption[];
  invalidDefinitionCount: number;
  revisionContracts: Array<{
    aggregateId: string;
    version: number;
    definition: JiraAnalyticsDatasetDraft;
  }>;
  dashboard: {
    configHash: string;
    version: 1 | 2 | 3 | 4 | null;
    editableConfig: JiraAnalyticsDashboardV4 | null;
    editableConfigError: string | null;
  };
};

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function recordsCsv(records: JiraAnalyticsResultRecord[]) {
  const header = ["Key", "Summary", "Assignee", "Status", "Priority", "Issue type", "Resolution", "Sprint", "From status", "To status", "Interval start from status", "Interval start to status", "Interval end from status", "Interval end to status", "Interval start", "Interval end", "Duration hours", "Commits", "Merge requests", "Event at", "Jira URL"];
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
      record.intervalStartFromStatus,
      record.intervalStartToStatus,
      record.intervalEndFromStatus,
      record.intervalEndToStatus,
      record.intervalStartAt,
      record.intervalEndAt,
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
  const visible = limit ? records.slice(0, limit) : records;
  if (visible.length === 0) return <div className="jira-analytics-empty">Нет данных</div>;
  if (visible.every((record) => record.source === "statusIntervals")) {
    return (
      <div className="jira-analytics-table-wrap">
        <table className="jira-analytics-table">
          <thead><tr><th>Тикет</th><th>Название</th><th>Исполнитель</th><th>Текущий статус</th><th>Начало</th><th>Переход начала</th><th>Конец</th><th>Переход конца</th><th>Длительность</th></tr></thead>
          <tbody>{visible.map((record) => (
            <tr key={record.id}>
              <td><a href={record.issue.issueUrl} target="_blank" rel="noreferrer">{record.issue.issueKey}</a></td>
              <td title={record.issue.summary}>{record.issue.summary}</td>
              <td>{record.issue.assignee || "Не назначен"}</td>
              <td>{record.issue.status}</td>
              <td>{dateText(record.intervalStartAt)}</td>
              <td>{`${record.intervalStartFromStatus || "-"} -> ${record.intervalStartToStatus || "-"}`}</td>
              <td>{record.intervalEndAt ? dateText(record.intervalEndAt) : "Не достигнут"}</td>
              <td>{record.intervalEndAt
                ? `${record.intervalEndFromStatus || "-"} -> ${record.intervalEndToStatus || "-"}`
                : "Ожидание"}</td>
              <td>{durationText(record.durationHours)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    );
  }
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
  const effectiveVisualization = jiraAnalyticsEffectiveVisualization(widget);
  const resultMode = jiraAnalyticsWidgetResultMode(widget);
  const aggregateLabel = widget.aggregateName.trim() || JIRA_ANALYTICS_AGGREGATE_TYPE_LABELS[widget.source];
  const resultLabel = resultMode === JIRA_ANALYTICS_LIST_RESULT
    ? "Список тикетов"
    : JIRA_ANALYTICS_METRIC_LABELS[resultMode];
  const subtitle = `${aggregateLabel} · ${resultLabel}`;
  const recordCountLabel = widget.source === "transitions"
    ? "Периодов в статусах"
    : widget.source === "development"
      ? "Событий разработки"
      : "Тикетов";
  const actions = (
    <div className="jira-analytics-widget-actions">
      {result && result.totalRecords > 0 && (
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
          <button type="button" className="icon-button danger" onClick={onRemove} aria-label="Удалить виджет" title="Удалить"><Trash2 size={16} /></button>
        </>
      )}
    </div>
  );
  if (widget.status === "UNAVAILABLE" || !result) {
    return (
      <section className={`jira-analytics-widget width-${widget.width} unavailable`}>
        <header><div><h3>{widget.title}</h3><small>Агрегат недоступен</small></div>{actions}</header>
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
        {actions}
      </header>

      {effectiveVisualization === "number" && (
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

      {effectiveVisualization === "bar" && (
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

      {effectiveVisualization === "table" && (
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

function JiraManagedWidgetEditor({
  definitions,
  revisionContracts,
  onChange,
  onClose,
  widget,
}: {
  definitions: AggregateDefinitionOption[];
  revisionContracts: AggregateCatalogResponse["revisionContracts"];
  onChange: (next: JiraAnalyticsManagedWidget) => void;
  onClose: () => void;
  widget: JiraAnalyticsManagedWidget;
}) {
  const currentDefinition = definitions.find((definition) => definition.id === widget.aggregateId) ?? null;
  const pinnedDefinition = widget.placement === "retro" && widget.aggregateVersion
    ? revisionContracts.find((contract) =>
        contract.aggregateId === widget.aggregateId && contract.version === widget.aggregateVersion
      )?.definition ?? null
    : null;
  const selectedDefinition = widget.placement === "retro"
    ? pinnedDefinition ?? (widget.aggregateVersion === currentDefinition?.version ? currentDefinition : null)
    : currentDefinition;
  const source = selectedDefinition?.source ?? "issues";
  const periodSupport = jiraAnalyticsSourcePeriodSupport(source);
  const availableFields = selectedDefinition ? JIRA_ANALYTICS_FIELDS_BY_SOURCE[source] : [];
  const fields = widget.selectedFields.filter((field) => availableFields.includes(field));
  const compatibilityError = selectedDefinition
    ? jiraAnalyticsWidgetDatasetError(widget, selectedDefinition)
    : widget.placement === "retro"
      ? "Закреплённая ревизия агрегата недоступна"
      : null;
  const resultMode = jiraAnalyticsWidgetResultMode(widget);
  const isTicketList = resultMode === JIRA_ANALYTICS_LIST_RESULT;
  const isLegacyMetricTable = widget.visualization === "table" && !isTicketList;
  const effectiveVisualization = jiraAnalyticsEffectiveVisualization(widget);
  const latestPinnedRevision = jiraAnalyticsPinnedRevisionUpdate(
    widget.placement,
    widget.aggregateVersion,
    currentDefinition?.version,
  );
  const patchWidget = (patch: Partial<JiraAnalyticsManagedWidget>) =>
    onChange({ ...widget, ...patch });
  const patchFilterGroup = (
    group: "baseFilters" | "filters",
    filters: JiraAnalyticsFilter[],
  ) => patchWidget(group === "baseFilters" ? { baseFilters: filters } : { filters });
  const patchFilterLogic = (
    logic: "baseFilterLogic" | "filterLogic",
    value: "and" | "or",
  ) => patchWidget(logic === "baseFilterLogic" ? { baseFilterLogic: value } : { filterLogic: value });

  const updateFilter = (
    group: "baseFilters" | "filters",
    id: string,
    patch: Partial<JiraAnalyticsFilter>,
  ) => patchFilterGroup(
    group,
    widget[group].map((filter) => filter.id === id ? { ...filter, ...patch } : filter),
  );

  const filterGroup = (
    title: string,
    group: "baseFilters" | "filters",
    logic: "baseFilterLogic" | "filterLogic",
  ) => (
    <>
      <div className="jira-widget-filter-head"><span>{title}</span><div className="jira-widget-logic"><button type="button" className={widget[logic] === "and" ? "active" : ""} onClick={() => patchFilterLogic(logic, "and")}>И</button><button type="button" className={widget[logic] === "or" ? "active" : ""} onClick={() => patchFilterLogic(logic, "or")}>ИЛИ</button></div></div>
      <div className="jira-widget-filters">{widget[group].map((condition) => <div className="jira-widget-filter" key={condition.id}>
        <select value={condition.field} onChange={(event) => { const field = event.target.value as JiraAnalyticsFilterField; updateFilter(group, condition.id, { field, operator: jiraAnalyticsOperatorsFor(field)[0], value: field === "hasDevelopment" ? "true" : "" }); }}>{!fields.includes(condition.field) && <option value={condition.field} disabled>{JIRA_ANALYTICS_FILTER_LABELS[condition.field]} · поле не выбрано</option>}{fields.map((field) => <option value={field} key={field}>{JIRA_ANALYTICS_FILTER_LABELS[field]}</option>)}</select>
        <select value={condition.operator} onChange={(event) => updateFilter(group, condition.id, { operator: event.target.value as JiraAnalyticsFilterOperator })}>{jiraAnalyticsOperatorsFor(condition.field).map((operator) => <option value={operator} key={operator}>{JIRA_ANALYTICS_OPERATOR_LABELS[operator]}</option>)}</select>
        {!['empty', 'notEmpty'].includes(condition.operator) && (condition.field === "hasDevelopment" ? <select value={condition.value} onChange={(event) => updateFilter(group, condition.id, { value: event.target.value })}><option value="true">Да</option><option value="false">Нет</option></select> : <input type={jiraAnalyticsFieldIsNumeric(condition.field) ? "number" : "text"} value={condition.value} onChange={(event) => updateFilter(group, condition.id, { value: event.target.value })} />)}
        <button type="button" className="icon-button danger" onClick={() => patchFilterGroup(group, widget[group].filter((item) => item.id !== condition.id))} aria-label={`Удалить условие из группы «${title}»`}><Trash2 size={15} /></button>
      </div>)}</div>
      <button type="button" className="button jira-widget-add-filter" disabled={widget[group].length >= 20 || fields.length === 0} onClick={() => patchFilterGroup(group, [...widget[group], createJiraAnalyticsFilter(fields[0])])}><Plus size={16} /> Условие</button>
    </>
  );

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
        Агрегат
        <select value={widget.aggregateId} onChange={(event) => {
          const definition = definitions.find((item) => item.id === event.target.value);
          if (!definition) return;
          patchWidget({
            aggregateId: definition.id,
            aggregateVersion: widget.placement === "retro" ? definition.version : null,
            selectedFields: [...JIRA_ANALYTICS_FIELDS_BY_SOURCE[definition.source]],
            baseFilterLogic: "and",
            baseFilters: [],
            metric: JIRA_ANALYTICS_METRICS_BY_SOURCE[definition.source][0],
            groupBy: "none",
            filters: [],
            periodMode: jiraAnalyticsSourcePeriodSupport(definition.source) === "required" ? "DASHBOARD" : "NONE",
            periodDays: null,
            sortBy: "default",
            sortDirection: "desc",
            visualization: widget.visualization === "table" ? "table" : "number",
          });
        }}>
          {definitions.map((definition) => (
            <option value={definition.id} key={definition.id}>{definition.name}</option>
          ))}
        </select>
      </label>
      {latestPinnedRevision !== null && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => patchWidget({ aggregateVersion: latestPinnedRevision })}
        >
          <RefreshCw size={16} /> Обновить ревизию до v{latestPinnedRevision}
        </button>
      )}
      {definitions.length === 0 && (
        <div className="jira-aggregate-validation">Нет сохранённых агрегатов</div>
      )}
      <fieldset>
        <legend>Доступные поля запроса</legend>
        <div className="jira-aggregate-field-grid">{availableFields.map((field) => <label key={field} className="jira-aggregate-field-option"><input type="checkbox" aria-label={`Поле: ${JIRA_ANALYTICS_FILTER_LABELS[field]}`} checked={widget.selectedFields.includes(field)} disabled={widget.selectedFields.length === 1 && widget.selectedFields.includes(field)} onChange={(event) => patchWidget({ selectedFields: event.target.checked ? [...widget.selectedFields, field] : widget.selectedFields.filter((item) => item !== field) })} /><span>{JIRA_ANALYTICS_FILTER_LABELS[field]}</span></label>)}</div>
      </fieldset>
      <label>Результат<select value={resultMode} onChange={(event) => patchWidget(jiraAnalyticsWidgetResultPatch(event.target.value as JiraAnalyticsWidgetResultMode, widget))}><option value={JIRA_ANALYTICS_LIST_RESULT}>Список тикетов</option>{JIRA_ANALYTICS_METRICS_BY_SOURCE[source].map((metric) => <option key={metric} value={metric}>{JIRA_ANALYTICS_METRIC_LABELS[metric]}</option>)}</select></label>
      {!isTicketList && <label>Группировка<select value={widget.groupBy} onChange={(event) => patchWidget(jiraAnalyticsWidgetGroupingPatch(event.target.value as JiraAnalyticsGroupBy))}>{!JIRA_ANALYTICS_GROUPS_BY_SOURCE[source].filter((group) => group === "none" || fields.includes(group === "week" ? "eventAt" : group as JiraAnalyticsFilterField)).includes(widget.groupBy) && <option value={widget.groupBy} disabled>{JIRA_ANALYTICS_GROUP_LABELS[widget.groupBy]} · поле не выбрано</option>}{JIRA_ANALYTICS_GROUPS_BY_SOURCE[source].filter((group) => group === "none" || fields.includes(group === "week" ? "eventAt" : group as JiraAnalyticsFilterField)).map((group) => <option key={group} value={group}>{JIRA_ANALYTICS_GROUP_LABELS[group]}</option>)}</select></label>}
      {isLegacyMetricTable && widget.groupBy !== "none" && <div className="jira-aggregate-validation">Группировка не применяется к сохранённой таблице. Измените результат или группировку.</div>}
      {periodSupport !== "none" && <label>Период<select value={widget.periodMode} onChange={(event) => { const periodMode = event.target.value as JiraAnalyticsManagedWidget["periodMode"]; patchWidget({ periodMode, periodDays: periodMode === "FIXED" ? 90 : null }); }}>{periodSupport === "optional" && <option value="NONE">Без ограничения</option>}<option value="DASHBOARD">Из фильтра страницы</option><option value="FIXED">Фиксированный: 90 дней</option></select></label>}
      <label>Сортировка<select value={widget.sortBy} onChange={(event) => patchWidget({ sortBy: event.target.value as JiraAnalyticsManagedWidget["sortBy"] })}>{widget.sortBy !== "default" && !fields.includes(widget.sortBy) && <option value={widget.sortBy} disabled>{JIRA_ANALYTICS_FILTER_LABELS[widget.sortBy]} · поле не выбрано</option>}<option value="default">По значению</option>{fields.filter((field) => ["issueKey", "eventAt", "durationHours", "commitCount", "mergeRequestCount"].includes(field)).map((field) => <option key={field} value={field}>{JIRA_ANALYTICS_FILTER_LABELS[field]}</option>)}</select></label>
      <fieldset>
        <legend>Направление сортировки</legend>
        <div className="jira-widget-segments">
          <button type="button" className={widget.sortDirection === "desc" ? "active" : ""} onClick={() => patchWidget({ sortDirection: "desc" })}>По убыванию</button>
          <button type="button" className={widget.sortDirection === "asc" ? "active" : ""} onClick={() => patchWidget({ sortDirection: "asc" })}>По возрастанию</button>
        </div>
      </fieldset>
      {filterGroup("Основной отбор", "baseFilters", "baseFilterLogic")}
      {filterGroup("Дополнительный отбор", "filters", "filterLogic")}
      {compatibilityError && <div className="jira-aggregate-validation">{compatibilityError}</div>}
      <fieldset>
        <legend>Визуализация</legend>
        <div className="jira-widget-segments">
          <button type="button" className="active" disabled title={isLegacyMetricTable ? "Сохранённый формат предыдущей версии" : undefined}>
            {effectiveVisualization === "table" ? "Таблица" : effectiveVisualization === "bar" ? "Столбцы" : "Число"}
          </button>
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
  const v4 = jiraAnalyticsDashboardV4Schema.safeParse(value);
  if (v4.success) return structuredClone(v4.data);
  const v3 = jiraAnalyticsDashboardV3Schema.safeParse(value);
  if (v3.success) return structuredClone(v3.data);
  const v2 = jiraAnalyticsDashboardV2Schema.safeParse(value);
  if (v2.success) return structuredClone(v2.data);
  const v1 = normalizeJiraAnalyticsDashboardV1(value);
  return v1 ? structuredClone(v1) : null;
}

function widgetPlacement(widget: JiraAnalyticsDashboardConfig["widgets"][number]) {
  return "placement" in widget ? widget.placement : widget.section;
}

function movePlacedWidget<T extends { id: string; placement: JiraAnalyticsSection }>(
  widgets: readonly T[],
  widgetId: string,
  direction: -1 | 1,
  section: JiraAnalyticsSection,
) {
  const next = [...widgets];
  const sectionIndexes = next.flatMap((widget, index) => widget.placement === section ? [index] : []);
  const sectionIndex = sectionIndexes.findIndex((index) => next[index]?.id === widgetId);
  const targetSectionIndex = sectionIndex + direction;
  if (sectionIndex < 0 || targetSectionIndex < 0 || targetSectionIndex >= sectionIndexes.length) return next;
  const index = sectionIndexes[sectionIndex];
  const target = sectionIndexes[targetSectionIndex];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function newManagedWidget(
  aggregate: AggregateDefinitionOption,
  placement: JiraAnalyticsSection,
): JiraAnalyticsManagedWidget {
  const sourceRequiresPeriod = jiraAnalyticsSourcePeriodSupport(aggregate.source) === "required";
  return {
    id: `widget-${crypto.randomUUID()}`,
    title: aggregate.name,
    aggregateId: aggregate.id,
    aggregateVersion: placement === "retro" ? aggregate.version : null,
    placement,
    selectedFields: [...JIRA_ANALYTICS_FIELDS_BY_SOURCE[aggregate.source]],
    baseFilterLogic: "and",
    baseFilters: [],
    metric: JIRA_ANALYTICS_METRICS_BY_SOURCE[aggregate.source][0],
    groupBy: "none",
    filterLogic: "and",
    filters: [],
    periodMode: sourceRequiresPeriod ? "DASHBOARD" : "NONE",
    periodDays: null,
    sortBy: "default",
    sortDirection: "desc",
    visualization: "number",
    width: "half",
  };
}

export function JiraAnalyticsDashboard({
  canClear,
  clearing,
  dataRevision,
  editing,
  onClearData,
  onEditingChange,
  onOpenAggregates,
  onStartEditing,
  section,
}: {
  canClear: boolean;
  clearing: boolean;
  dataRevision: number;
  editing: boolean;
  onClearData: () => void;
  onEditingChange: (editing: boolean) => void;
  onOpenAggregates: () => void;
  onStartEditing: () => void;
  section: JiraAnalyticsSection;
}) {
  const confirm = useConfirm();
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
  const [revisionContracts, setRevisionContracts] = useState<AggregateCatalogResponse["revisionContracts"]>([]);
  const [catalogDashboard, setCatalogDashboard] = useState<AggregateCatalogResponse["dashboard"] | null>(null);
  const [facetState, setFacetState] = useState<{
    projectId: string;
    data: JiraAnalyticsFacets;
  } | null>(null);
  const dashboardProjectIdRef = useRef(project.id);
  const catalogRequestIdRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const jiraScope = {
    type: project.jiraAnalyticsSettings?.jiraScopeType ?? "LABEL",
    value: project.jiraAnalyticsSettings?.jiraScopeValue ?? "",
  };
  const scopeValueValid = jiraAnalyticsScopeValueIsValid(jiraScope.type, jiraScope.value);
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
    const requestId = ++catalogRequestIdRef.current;
    void apiClient.get<AggregateCatalogResponse>(
      `/api/projects/${project.id}/jira/aggregates`,
      "Не удалось загрузить каталог агрегатов",
    ).then((response) => {
      if (active && requestId === catalogRequestIdRef.current) {
        setDefinitions(response.definitions);
        setRevisionContracts(response.revisionContracts ?? []);
        setCatalogDashboard(response.dashboard);
        if (response.dashboard.editableConfig) {
          const next = structuredClone(response.dashboard.editableConfig);
          setConfig((current) => editing && current?.version === 4 ? current : next);
          setBaseline((current) => editing && current?.version === 4 ? current : structuredClone(next));
        }
        if (response.dashboard.editableConfigError) {
          setError(response.dashboard.editableConfig
            ? `Конфигурация v4 подготовлена частично: ${response.dashboard.editableConfigError}`
            : `Не удалось подготовить редактируемую конфигурацию: ${response.dashboard.editableConfigError}`);
        }
        if (response.invalidDefinitionCount > 0) {
          setError(`Повреждено определений агрегатов: ${response.invalidDefinitionCount}. Обратитесь к системному администратору.`);
        }
      }
    }).catch((error) => {
      if (active) setError(error instanceof Error ? error.message : "Не удалось загрузить агрегаты");
    });
    return () => { active = false; };
  }, [editing, project.id, setError, storedDashboardConfigKey]);

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
        const query = "metric" in layout ? layout : null;
        return {
          widgetId: layout.id,
          title: layout.title,
          visualization: layout.visualization,
          width: layout.width,
          placement,
          aggregateId: layout.aggregateId,
          aggregateName: definition?.name ?? "",
          source: definition?.source ?? "issues",
          metric: query?.metric ?? "count",
          groupBy: query?.groupBy ?? "none",
          status: "UNAVAILABLE",
          error: "Сохраните дашборд, чтобы рассчитать новый виджет",
        };
      });
  }, [baseline, config, dashboardResults, definitions, editing, section]);
  const hasEventWidgets = visibleWidgets.some((widget) => {
    const layout = config?.widgets.find((item) => item.id === widget.widgetId);
    if (layout && "periodMode" in layout) return layout.periodMode === "DASHBOARD";
    return jiraAnalyticsSourcePeriodSupport(widget.source) === "required";
  });
  const activeSelectedWidgetId = editing
    ? selectedWidgetId ?? visibleWidgets[0]?.widgetId ?? null
    : null;
  const selectedWidget = config?.widgets.find((widget) => widget.id === activeSelectedWidgetId) ?? null;
  const sectionDefinitions = definitions;

  const addWidget = () => {
    if (!config || config.version !== 4 || config.widgets.length >= 100) return;
    const widget = sectionDefinitions[0]
      ? newManagedWidget(sectionDefinitions[0], section)
      : null;
    if (!widget) return;
    setConfig((current) => current
      ? ({ ...current, widgets: [...current.widgets, widget] } as JiraAnalyticsDashboardConfig)
      : current);
    setSelectedWidgetId(widget.id);
  };

  const startEmptyV4 = () => {
    setConfig({
      version: 4,
      periodDays: config?.periodDays ?? 90,
      assignee: config?.assignee ?? "",
      widgets: [],
    });
    setSelectedWidgetId(null);
    onStartEditing();
  };

  const patchDashboardFilters = (
    patch: Partial<Pick<JiraAnalyticsDashboardConfig, "assignee" | "periodDays">>,
  ) => {
    setConfig((current) => current ? ({ ...current, ...patch }) : current);
    if (!editing) {
      setBaseline((current) => current ? ({ ...current, ...patch }) : current);
    }
  };

  const updateManagedWidget = (next: JiraAnalyticsManagedWidget) =>
    setConfig((current) => {
      if (!current || current.version !== 4) return current;
      return { ...current, widgets: current.widgets.map((widget) => widget.id === next.id ? next : widget) };
    });

  const moveWidget = (widgetId: string, direction: -1 | 1) => {
    setConfig((current) => {
      if (!current || current.version !== 4) return current;
      return { ...current, widgets: movePlacedWidget(current.widgets, widgetId, direction, section) };
    });
  };

  const saveDashboard = async () => {
    if (!canEditWidgets || !config) return;
    if (config.version !== 4) {
      setError("Редактирование доступно только после перевода дашборда на v4");
      return;
    }
    if (!catalogDashboard?.configHash) {
      setError("Не удалось определить актуальную версию дашборда; обновите страницу");
      return;
    }
    if (config.widgets.some((widget) => !widget.aggregateId)) {
      setError("Для каждого виджета нужно выбрать сохранённый агрегат");
      return;
    }
    const incompatible = config.widgets.flatMap((widget) => {
      const currentDefinition = definitions.find((item) => item.id === widget.aggregateId);
      const definition = widget.placement === "retro" && widget.aggregateVersion
        ? revisionContracts.find((contract) =>
            contract.aggregateId === widget.aggregateId && contract.version === widget.aggregateVersion
          )?.definition
            ?? (widget.aggregateVersion === currentDefinition?.version ? currentDefinition : null)
        : currentDefinition;
      if (!definition) return [`${widget.title}: агрегат недоступен`];
      const contractError = jiraAnalyticsWidgetDatasetError(widget, definition);
      return contractError ? [`${widget.title}: ${contractError}`] : [];
    });
    if (incompatible.length > 0) {
      setError(`Исправьте настройки виджетов: ${incompatible.join("; ")}`);
      return;
    }
    const configToSave: JiraAnalyticsDashboardV4 = {
      ...config,
      widgets: config.widgets.map((widget) => {
        const definition = definitions.find((item) => item.id === widget.aggregateId);
        return {
          ...widget,
          aggregateVersion: widget.placement === "retro"
            ? widget.aggregateVersion ?? definition?.version ?? null
            : null,
        };
      }),
    };
    const validation = jiraAnalyticsDashboardV4Schema.safeParse(configToSave);
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Некорректная конфигурация дашборда");
      return;
    }
    const nextWidgetIds = new Set(validation.data.widgets.map((widget) => widget.id));
    const omittedLegacyWidgetIds = catalogDashboard.version === 3 && catalogDashboard.editableConfig
      ? catalogDashboard.editableConfig.widgets
          .filter((widget) => !nextWidgetIds.has(widget.id))
          .map((widget) => widget.id)
      : [];
    const partialMigration = (catalogDashboard.editableConfigError !== null &&
      catalogDashboard.editableConfig !== null) || omittedLegacyWidgetIds.length > 0;
    const partialMigrationMessage = catalogDashboard.editableConfigError ??
      `Будут удалены виджеты: ${omittedLegacyWidgetIds.join(", ")}`;
    if (partialMigration && !(await confirm({
      title: "Сохранить неполную конфигурацию?",
      message: `${partialMigrationMessage}. Пропущенные виджеты будут удалены из дашборда.`,
      confirmLabel: "Сохранить без виджетов",
      cancelLabel: "Отмена",
      tone: "danger",
    }))) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await apiClient.patch<{ configHash: string }>(
        `/api/projects/${project.id}/jira/analytics-dashboard`,
        {
          config: validation.data,
          expectedConfigHash: catalogDashboard.configHash,
          acceptPartialMigration: partialMigration,
        },
        "Не удалось сохранить настройки аналитики Jira",
      );
      setCatalogDashboard((current) => current ? { ...current, configHash: saved.configHash, version: 4, editableConfig: validation.data, editableConfigError: null } : current);
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
        <label title={hasEventWidgets ? "Период событий и интервалов статусов" : "На текущие тикеты и SLA-отчет период событий не влияет"}>
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
              scopeValue: normalizeJiraAnalyticsScopeValue(jiraScope.type, jiraScope.value),
            })}
            disabled={!isSystemAdmin || syncing || clearing || !scopeValueValid}
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
          {canEditWidgets && config?.version === 4 && !editing && (
            <button type="button" className="button" onClick={onStartEditing}>
              <Pencil size={16} /> Редактировать
            </button>
          )}
          {canEditWidgets && config?.version !== 4 && !editing && catalogDashboard?.editableConfigError && (
            <button type="button" className="button" onClick={startEmptyV4}>
              <Pencil size={16} /> Начать с пустого v4
            </button>
          )}
          {canEditWidgets && config && editing && (
            <>
              <button
                type="button"
                className="button"
                onClick={addWidget}
                disabled={config.version !== 4 || config.widgets.length >= 100 || sectionDefinitions.length === 0}
              >
                <Plus size={16} /> Добавить виджет
              </button>
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
      {editing && (config?.version === 2 || config?.version === 3 || config?.version === 4) && sectionDefinitions.length === 0 && (
        <div className="jira-analytics-missing-aggregate">
          <span>Для виджетов ещё нет агрегатов.</span>
          <button type="button" className="button" onClick={onOpenAggregates}><Plus size={15} /> Создать агрегат</button>
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
        </div>
        {editing && selectedWidget && config?.version === 4 && "aggregateId" in selectedWidget && "periodMode" in selectedWidget && (
          <JiraManagedWidgetEditor definitions={definitions} revisionContracts={revisionContracts} widget={selectedWidget as JiraAnalyticsManagedWidget} onChange={updateManagedWidget} onClose={() => setSelectedWidgetId(null)} />
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
