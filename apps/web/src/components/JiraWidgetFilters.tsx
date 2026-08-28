import type {
  JiraAnalyticsFilter,
  JiraAnalyticsFilterField,
  JiraAnalyticsFilterOperator,
  JiraSemanticWidget,
} from "@pms/shared";
import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";

import {
  JIRA_ANALYTICS_FILTER_LABELS,
  JIRA_ANALYTICS_OPERATOR_LABELS,
  jiraAnalyticsFilterLogicLabel,
  jiraAnalyticsOperatorsFor,
} from "../app/jiraAnalytics";

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function FilterEditor({ filter, fields, onChange, onDelete }: {
  filter: JiraAnalyticsFilter;
  fields: JiraAnalyticsFilterField[];
  onChange: (value: JiraAnalyticsFilter) => void;
  onDelete: () => void;
}) {
  const operators = jiraAnalyticsOperatorsFor(filter.field);
  const noValue = filter.operator === "empty" || filter.operator === "notEmpty";
  return <div className="jira-widget-filter-row">
    <select value={filter.field} onChange={(event) => { const field = event.target.value as JiraAnalyticsFilterField; onChange({ ...filter, field, operator: jiraAnalyticsOperatorsFor(field)[0] ?? "equals", value: "" }); }}>{fields.map((field) => <option key={field} value={field}>{JIRA_ANALYTICS_FILTER_LABELS[field]}</option>)}</select>
    <select value={filter.operator} onChange={(event) => { const operator = event.target.value as JiraAnalyticsFilterOperator; onChange({ ...filter, operator, value: operator === "empty" || operator === "notEmpty" ? "" : filter.value }); }}>{operators.map((operator) => <option key={operator} value={operator}>{JIRA_ANALYTICS_OPERATOR_LABELS[operator]}</option>)}</select>
    <input value={filter.value} disabled={noValue} onChange={(event) => onChange({ ...filter, value: event.target.value })} />
    <button type="button" className="icon-button danger" title="Удалить условие" onClick={onDelete}><Trash2 size={16} /></button>
  </div>;
}

export function JiraWidgetFilters({ widget, onChange }: {
  widget: JiraSemanticWidget;
  onChange: (value: JiraSemanticWidget) => void;
}) {
  const filterConnector = jiraAnalyticsFilterLogicLabel(widget.filterLogic);
  const filterLogicLabelId = useId();

  return <fieldset className="jira-widget-filter-fieldset">
    <legend>Условия</legend>
    <div className="jira-widget-filter-mode">
      <span id={filterLogicLabelId}>Объединение условий</span>
      <div className="jira-widget-segments" role="group" aria-labelledby={filterLogicLabelId}>
        <button type="button" className={widget.filterLogic === "and" ? "active" : ""} aria-pressed={widget.filterLogic === "and"} onClick={() => onChange({ ...widget, filterLogic: "and" })}>Все (И)</button>
        <button type="button" className={widget.filterLogic === "or" ? "active" : ""} aria-pressed={widget.filterLogic === "or"} onClick={() => onChange({ ...widget, filterLogic: "or" })}>Любое (ИЛИ)</button>
      </div>
    </div>
    <div className="jira-widget-filter-list">
      {widget.filters.map((filter, index) => <div className="jira-widget-filter-item" key={filter.id}>
        {index > 0 ? <div className="jira-widget-filter-connector"><span className="jira-widget-filter-connector-value" aria-hidden="true">{filterConnector}</span><span className="jira-widget-filter-connector-label">Связь с предыдущим условием: {filterConnector}</span></div> : null}
        <FilterEditor filter={filter} fields={widget.selectedFields} onChange={(next) => onChange({ ...widget, filters: widget.filters.map((item, itemIndex) => itemIndex === index ? next : item) })} onDelete={() => onChange({ ...widget, filters: widget.filters.filter((_, itemIndex) => itemIndex !== index) })} />
      </div>)}
    </div>
    <button type="button" className="secondary-button" onClick={() => onChange({ ...widget, filters: [...widget.filters, { id: uid("filter"), field: widget.selectedFields[0] ?? "issueKey", operator: "equals", value: "" }] })}><Plus size={16} />Условие</button>
  </fieldset>;
}
