import { z } from "zod";
import { jiraSemanticWidgetSchema, type JiraSemanticWidget } from "./jira-semantic-analytics.js";

/**
 * One person's layer over a project's shared Jira dashboard: shared widgets
 * they hide, the order they like, and widgets of their own. It changes the
 * dashboard only for them.
 */
export const JIRA_PERSONAL_WIDGETS_MAX = 30;
/** Personal widgets carry this prefix, so they never clash with shared ones. */
export const JIRA_PERSONAL_WIDGET_PREFIX = "my-";

export const jiraPersonalDashboardSchema = z
  .object({
    version: z.literal(1),
    hidden: z.array(z.string().min(1).max(200)).max(100).default([]),
    order: z.array(z.string().min(1).max(200)).max(200).default([]),
    widgets: z.array(jiraSemanticWidgetSchema).max(JIRA_PERSONAL_WIDGETS_MAX).default([]),
  })
  .strict()
  .superRefine((layer, context) => {
    const ids = layer.widgets.map((widget) => widget.id);
    if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["widgets"], message: "Идентификаторы личных виджетов не должны повторяться" });
    // Personal widgets live in their own namespace so they never take the place of a shared one.
    if (ids.some((id) => !id.startsWith(JIRA_PERSONAL_WIDGET_PREFIX))) context.addIssue({ code: "custom", path: ["widgets"], message: "Личный виджет должен начинаться с my-" });
  });
export type JiraPersonalDashboard = z.infer<typeof jiraPersonalDashboardSchema>;

export const JIRA_EMPTY_PERSONAL_DASHBOARD: JiraPersonalDashboard = { version: 1, hidden: [], order: [], widgets: [] };

/**
 * The dashboard a person sees: shared widgets they did not hide and their own,
 * in their order; ids they no longer have are skipped and new shared widgets
 * come at the end.
 */
export function applyJiraPersonalDashboard<T extends { widgets: JiraSemanticWidget[] }>(shared: T, layer: JiraPersonalDashboard | null | undefined): T {
  if (!layer) return shared;
  const hidden = new Set(layer.hidden);
  const all = [...shared.widgets.filter((widget) => !hidden.has(widget.id)), ...layer.widgets.filter((widget) => !shared.widgets.some((sharedWidget) => sharedWidget.id === widget.id))];
  const rank = new Map(layer.order.map((id, index) => [id, index]));
  const ordered = all
    .map((widget, index) => ({ widget, index }))
    .sort((left, right) => (rank.get(left.widget.id) ?? layer.order.length + left.index) - (rank.get(right.widget.id) ?? layer.order.length + right.index))
    .map((entry) => entry.widget);
  return { ...shared, widgets: ordered };
}

/** Whether a widget is the person's own. */
export function isJiraPersonalWidget(layer: JiraPersonalDashboard | null | undefined, widgetId: string) {
  return Boolean(layer?.widgets.some((widget) => widget.id === widgetId));
}
