import { JIRA_PERSONAL_WIDGET_PREFIX, type JiraPersonalDashboard, type JiraSemanticWidget } from "@pms/shared";

/** Moves a widget one place among the widgets shown in a section; the whole shown order becomes the person's order. */
export function moveInLayer(layer: JiraPersonalDashboard, shownIds: string[], widgetId: string, direction: -1 | 1): JiraPersonalDashboard {
  const index = shownIds.indexOf(widgetId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= shownIds.length) return layer;
  const order = [...shownIds];
  [order[index], order[target]] = [order[target], order[index]];
  // Keep the places of widgets of the other section, which this list does not show.
  const rest = layer.order.filter((id) => !order.includes(id));
  return { ...layer, order: [...order, ...rest] };
}

export function hideInLayer(layer: JiraPersonalDashboard, widgetId: string): JiraPersonalDashboard {
  return layer.hidden.includes(widgetId) ? layer : { ...layer, hidden: [...layer.hidden, widgetId] };
}

export function showInLayer(layer: JiraPersonalDashboard, widgetId: string): JiraPersonalDashboard {
  return { ...layer, hidden: layer.hidden.filter((id) => id !== widgetId) };
}

export function addToLayer(layer: JiraPersonalDashboard, widget: JiraSemanticWidget): JiraPersonalDashboard {
  const own = widget.id.startsWith(JIRA_PERSONAL_WIDGET_PREFIX) ? widget : { ...widget, id: `${JIRA_PERSONAL_WIDGET_PREFIX}${widget.id}` };
  return { ...layer, widgets: [...layer.widgets, own] };
}

export function patchInLayer(layer: JiraPersonalDashboard, widget: JiraSemanticWidget): JiraPersonalDashboard {
  return { ...layer, widgets: layer.widgets.map((entry) => (entry.id === widget.id ? widget : entry)) };
}

export function removeFromLayer(layer: JiraPersonalDashboard, widgetId: string): JiraPersonalDashboard {
  return { ...layer, widgets: layer.widgets.filter((entry) => entry.id !== widgetId), order: layer.order.filter((id) => id !== widgetId) };
}
