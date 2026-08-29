import {
  JIRA_SEMANTIC_COLUMN_WIDTH_MAX,
  JIRA_SEMANTIC_COLUMN_WIDTH_MIN,
  type JiraAnalyticsFilterField,
  type JiraSemanticWidget,
} from "@pms/shared";

const DEFAULT_COLUMN_WIDTH = 140;

const DEFAULT_COLUMN_WIDTHS: Partial<Record<JiraAnalyticsFilterField, number>> = {
  assignee: 190,
  criticalPriorityAt: 180,
  eventAt: 180,
  goalDate: 150,
  goalLabels: 190,
  goalName: 220,
  intervalEndAt: 180,
  intervalStartAt: 180,
  issueCreatedAt: 180,
  issueKey: 110,
  labels: 190,
  matchedLabels: 170,
  reporter: 190,
  resolutionAt: 180,
  sprint: 180,
  summary: 300,
  updatedAt: 180,
};

export function jiraWidgetColumnWidth(widget: JiraSemanticWidget, field: JiraAnalyticsFilterField) {
  return widget.columnWidths?.[field] ?? DEFAULT_COLUMN_WIDTHS[field] ?? DEFAULT_COLUMN_WIDTH;
}

export function jiraWidgetTableWidth(widget: JiraSemanticWidget) {
  return widget.selectedFields.reduce((sum, field) => sum + jiraWidgetColumnWidth(widget, field), 0);
}

export function jiraWidgetWithColumnWidth(
  widget: JiraSemanticWidget,
  field: JiraAnalyticsFilterField,
  width: number,
): JiraSemanticWidget {
  const normalized = Math.min(
    JIRA_SEMANTIC_COLUMN_WIDTH_MAX,
    Math.max(JIRA_SEMANTIC_COLUMN_WIDTH_MIN, Math.round(width)),
  );
  return { ...widget, columnWidths: { ...widget.columnWidths, [field]: normalized } };
}

export function jiraWidgetWithoutColumnWidth(
  widget: JiraSemanticWidget,
  field: JiraAnalyticsFilterField,
): JiraSemanticWidget {
  const columnWidths = { ...widget.columnWidths };
  delete columnWidths[field];
  const next = { ...widget };
  if (Object.keys(columnWidths).length === 0) {
    delete next.columnWidths;
    return next;
  }
  return { ...next, columnWidths };
}

export function jiraWidgetWithSelectedFields(
  widget: JiraSemanticWidget,
  selectedFields: JiraAnalyticsFilterField[],
): JiraSemanticWidget {
  const selected = new Set(selectedFields);
  const columnWidths = Object.fromEntries(
    Object.entries(widget.columnWidths ?? {}).filter(([field]) => selected.has(field as JiraAnalyticsFilterField)),
  );
  const next = { ...widget, selectedFields };
  if (Object.keys(columnWidths).length === 0) {
    delete next.columnWidths;
    return next;
  }
  return {
    ...next,
    columnWidths,
  };
}
