import { PAGE_ROADMAP_DEFAULT, PAGE_SOURCES, pageMetric, type PageChartKind, type PageFieldDef, type PageWidget, type PageWidgetType } from "@pms/shared";
import { widgetFields, widgetSource } from "./pageModel";

/**
 * "Show as": the looks a widget can take and what each needs. A number needs
 * no split, a chart needs one, a line needs a split by time, stacked bars need
 * two splits; a list and tiles show rows. Switching fills in what is missing
 * with a sensible choice, so a switch never ends in an empty widget.
 */

export const PAGE_VIZ = ["kpi", "traffic", "progress", "columns", "bars", "line", "area", "donut", "pie", "stacked", "grid", "table", "list", "tiles", "timeline", "roadmap"] as const;
export type PageVizId = (typeof PAGE_VIZ)[number];

const CHARTS = new Set<string>(["columns", "bars", "line", "area", "donut", "pie", "stacked"]);

export function vizOf(widget: Pick<PageWidget, "type" | "chart">): PageVizId | null {
  if (widget.type === "kpi") return "kpi";
  if (widget.type === "chart") return widget.chart ?? "columns";
  if (widget.type === "table") return "table";
  if (widget.type === "list") return "list";
  if (widget.type === "status-grid") return "tiles";
  if (widget.type === "traffic-light") return "traffic";
  if (widget.type === "progress") return "progress";
  if (widget.type === "metric-grid") return "grid";
  if (widget.type === "timeline") return "timeline";
  if (widget.type === "roadmap") return "roadmap";
  return null;
}

const groupable = (fields: readonly PageFieldDef[]) => fields.filter((field) => field.groupable);
const timeFields = (fields: readonly PageFieldDef[]) => groupable(fields).filter((field) => field.kind === "date");

/** Why a look is not available for this widget, or null when it is. */
export function vizProblem(widget: Pick<PageWidget, "data">, viz: PageVizId): "needsTime" | "needsTwo" | "needsDates" | "needsCheckpoints" | null {
  const fields = widgetFields(widget);
  if (viz === "roadmap" && widgetSource(widget) !== "checkpoints") return "needsCheckpoints";
  if (viz === "timeline" && !fields.some((field) => field.kind === "date")) return "needsDates";
  if ((viz === "line" || viz === "area") && timeFields(fields).length === 0) return "needsTime";
  if (viz === "stacked" && groupable(fields).length < 2) return "needsTwo";
  return null;
}

/** The widget after switching to a look; null when the look is not available. */
export function applyViz(widget: PageWidget, viz: PageVizId): PageWidget | null {
  if (!widget.data || vizProblem(widget, viz)) return null;
  const fields = widgetFields(widget);
  const field = (key: string | null | undefined) => fields.find((entry) => entry.key === key) ?? null;
  const metric = widget.data.metric === "custom" ? null : pageMetric(widget.data.metric);
  const source = widgetSource(widget);
  let data = { ...widget.data };
  let type: PageWidgetType;
  let chart: PageChartKind | undefined;
  if (viz === "kpi" || viz === "traffic" || viz === "progress") {
    type = viz === "kpi" ? "kpi" : viz === "traffic" ? "traffic-light" : "progress";
    data = { ...data, groupBy: null, groupBy2: null };
  } else if (viz === "grid") {
    type = "metric-grid";
    if (!data.groupBy) data = { ...data, groupBy: field("project")?.groupable ? "project" : groupable(fields)[0]?.key ?? null };
    data = { ...data, groupBy2: null };
  } else if (viz === "roadmap") {
    type = "roadmap";
    // A metric that keeps only the next weeks would empty the window: the roadmap reads all milestones and goals.
    const narrowed = metric?.filters.some((filter) => filter.field === "inDays");
    data = { ...data, ...(narrowed ? { metric: "checkpoints.all" } : {}), groupBy: null, groupBy2: null, sort: null };
    return { ...widget, type, chart: undefined, data, roadmap: widget.roadmap ?? { ...PAGE_ROADMAP_DEFAULT } };
  } else if (viz === "timeline") {
    type = "timeline";
    const dates = fields.filter((entry) => entry.kind === "date");
    const columns = data.columns?.length ? data.columns : source ? [...PAGE_SOURCES[source].defaultColumns] : [];
    const dated = columns.some((key) => dates.some((entry) => entry.key === key)) ? columns : [...columns, (dates.find((entry) => entry.key === metric?.periodField) ?? dates[0]).key];
    const firstDate = dated.find((key) => dates.some((entry) => entry.key === key))!;
    data = { ...data, groupBy: null, groupBy2: null, columns: dated.slice(0, 12), sort: data.sort ?? { by: firstDate, dir: "asc" } };
  } else if (CHARTS.has(viz)) {
    type = "chart";
    chart = viz as PageChartKind;
    if (viz === "line" || viz === "area") {
      if (field(data.groupBy)?.kind !== "date") {
        const time = timeFields(fields).find((entry) => entry.key === metric?.periodField) ?? timeFields(fields)[0];
        data = { ...data, groupBy: time.key, bucket: data.bucket ?? "week" };
      }
    } else if (!data.groupBy) {
      data = { ...data, groupBy: field("project")?.groupable ? "project" : groupable(fields)[0]?.key ?? null };
    }
    if (viz === "stacked" && !data.groupBy2) data = { ...data, groupBy2: groupable(fields).find((entry) => entry.key !== data.groupBy && entry.kind !== "date")?.key ?? null };
    if (viz !== "stacked") data = { ...data, groupBy2: null };
  } else if (viz === "table") {
    type = "table";
  } else {
    type = viz === "list" ? "list" : "status-grid";
    data = { ...data, groupBy: null, groupBy2: null };
  }
  if ((type === "list" || type === "status-grid" || (type === "table" && !data.groupBy)) && !data.columns?.length && source) {
    data = { ...data, columns: [...PAGE_SOURCES[source].defaultColumns] };
  }
  if (type !== "kpi" && type !== "traffic-light") data = { ...data, compare: undefined };
  return { ...widget, type, chart, data };
}
