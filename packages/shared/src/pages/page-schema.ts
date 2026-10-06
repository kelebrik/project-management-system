import { z } from "zod";
import { pageBuckets, pageFilterSchema, pageMeasureSchema, pageSourceKeys, type PageOutput, type PageQuerySpec } from "./dataset-types.js";
import { pageMetric } from "./metrics.js";
import { PAGE_SOURCES } from "./sources.js";
import { pageLayoutProblem } from "./page-layout.js";

/**
 * A page of "My page": a sheet of a fixed format split into a 12-column grid
 * with a fixed number of rows, so what is on screen is what prints on one
 * page. Widgets sit in cells without overlapping; each asks a named metric
 * (or, for experts, a question of its own) and shows the answer its way.
 */

export const PAGE_SCHEMA_VERSION = 1;
export const PAGE_COLUMNS = 12;
export const pageFormats = ["wide", "a4-landscape", "a4-portrait"] as const;
export type PageFormat = (typeof pageFormats)[number];

/** Size of the sheet in CSS pixels at 96 dpi and the rows of its grid. */
export const PAGE_FORMATS: Record<PageFormat, { width: number; height: number; rows: number }> = {
  wide: { width: 1280, height: 720, rows: 14 },
  "a4-landscape": { width: 1123, height: 794, rows: 16 },
  "a4-portrait": { width: 794, height: 1123, rows: 24 },
};

export const pageThemes = ["light", "dark", "brand", "print"] as const;
export type PageTheme = (typeof pageThemes)[number];

export const pageWidgetTypes = ["kpi", "chart", "table", "list", "status-grid", "text", "callout", "heading", "traffic-light", "timeline", "progress", "metric-grid", "divider"] as const;
export type PageWidgetType = (typeof pageWidgetTypes)[number];
/** Widgets that show text written on the page, not data. */
export const PAGE_TEXT_WIDGETS: ReadonlySet<PageWidgetType> = new Set(["text", "callout", "heading", "divider"]);

export const pageChartKinds = ["columns", "bars", "line", "area", "pie", "donut", "stacked"] as const;
export type PageChartKind = (typeof pageChartKinds)[number];

export const pagePeriods = [7, 14, 30, 90, 180, 365] as const;
export const pageTones = ["neutral", "info", "success", "warning", "danger"] as const;

const fieldKey = z.string().max(60);

export const pageFormulaOps = ["percent", "ratio", "difference"] as const;
export type PageFormulaOp = (typeof pageFormulaOps)[number];

/** Two numbers into one: a share in percent, a ratio, or a difference; nothing when dividing by nothing. */
export function combinePageValues(value: number | null, other: number | null, op: PageFormulaOp) {
  if (value === null || other === null) return null;
  if (op === "difference") return Math.round((value - other) * 10) / 10;
  if (other === 0) return null;
  return op === "percent" ? Math.round((value / other) * 1000) / 10 : Math.round((value / other) * 100) / 100;
}

export const pageWidgetDataSchema = z.object({
  /** A named metric, or "custom" for a question built by hand. */
  metric: z.string().min(1).max(60),
  source: z.enum(pageSourceKeys).optional(),
  measure: pageMeasureSchema.optional(),
  periodField: fieldKey.nullable().optional(),
  filters: z.array(pageFilterSchema).max(12).default([]),
  groupBy: fieldKey.nullable().optional(),
  groupBy2: fieldKey.nullable().optional(),
  bucket: z.enum(pageBuckets).nullable().optional(),
  sort: z.object({ by: fieldKey, dir: z.enum(["asc", "desc"]) }).nullable().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  columns: z.array(fieldKey).max(12).optional(),
  compare: z.boolean().optional(),
});
export type PageWidgetData = z.infer<typeof pageWidgetDataSchema>;

export const pageScopeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("all") }),
  z.object({ mode: z.literal("projects"), projectIds: z.array(z.string().min(1).max(64)).min(1).max(200) }),
  z.object({ mode: z.literal("portfolio"), portfolios: z.array(z.string().min(1).max(200)).min(1).max(50) }),
]);
export type PageScope = z.infer<typeof pageScopeSchema>;

export const pageWidgetSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  type: z.enum(pageWidgetTypes),
  x: z.number().int().min(0).max(PAGE_COLUMNS - 1),
  y: z.number().int().min(0).max(40),
  w: z.number().int().min(1).max(PAGE_COLUMNS),
  h: z.number().int().min(1).max(40),
  title: z.string().max(120).default(""),
  data: pageWidgetDataSchema.optional(),
  chart: z.enum(pageChartKinds).optional(),
  showValues: z.boolean().optional(),
  text: z.string().max(4000).optional(),
  tone: z.enum(pageTones).optional(),
  /** A traffic light: from which value it turns amber and red (or below which, when less is worse). */
  thresholds: z.object({ amber: z.number(), red: z.number() }).optional(),
  /** A progress bar: the value that fills it. */
  target: z.number().positive().max(1_000_000_000).optional(),
  /** Another scope than the page's, marked on the widget. */
  scope: pageScopeSchema.optional(),
  /** A number made of two: this widget's value as a share of, against or minus another metric's. */
  formula: z.object({ op: z.enum(pageFormulaOps), data: pageWidgetDataSchema }).optional(),
  /** Values past these are marked red: above for bad news that grows, below for figures that should stay high. */
  alert: z.object({ above: z.number().optional(), below: z.number().optional() }).optional(),
});
export type PageWidget = z.infer<typeof pageWidgetSchema>;

export const pageDocumentSchema = z
  .object({
    schemaVersion: z.literal(PAGE_SCHEMA_VERSION),
    format: z.enum(pageFormats),
    theme: z.enum(pageThemes),
    scope: pageScopeSchema,
    periodDays: z.number().int().refine((value) => (pagePeriods as readonly number[]).includes(value), "Период: 7, 14, 30, 90, 180 или 365 дней"),
    subtitle: z.string().max(200).default(""),
    widgets: z.array(pageWidgetSchema).max(30),
  })
  .superRefine((page, context) => {
    const ids = new Set<string>();
    for (const widget of page.widgets) {
      if (ids.has(widget.id)) context.addIssue({ code: "custom", message: `Виджет ${widget.id} повторяется` });
      ids.add(widget.id);
    }
    const problem = pageLayoutProblem(page.widgets, PAGE_FORMATS[page.format].rows);
    if (problem) context.addIssue({ code: "custom", message: problem });
  });
export type PageDocument = z.infer<typeof pageDocumentSchema>;

/** What a widget asks for: one number, groups or rows. */
export function pageWidgetOutput(widget: Pick<PageWidget, "type" | "data">): PageOutput | null {
  if (PAGE_TEXT_WIDGETS.has(widget.type) || !widget.data) return null;
  if (widget.type === "kpi" || widget.type === "progress" || widget.type === "traffic-light") return "value";
  if (widget.type === "chart" || widget.type === "metric-grid") return "groups";
  if (widget.type === "table") return widget.data.groupBy ? "groups" : "rows";
  return "rows";
}

/** The complete question of a widget: its metric unfolded with the widget's own split, filters and order. */
export function resolvePageWidgetQuery(widget: Pick<PageWidget, "type" | "data">): { spec: PageQuerySpec } | { error: string } | null {
  const output = pageWidgetOutput(widget);
  const data = widget.data;
  if (!output || !data) return null;
  const metric = data.metric === "custom" ? null : pageMetric(data.metric);
  if (data.metric !== "custom" && !metric) return { error: `Показатель «${data.metric}» больше не существует` };
  const source = metric?.source ?? data.source;
  if (!source) return { error: "Не выбран источник данных" };
  return {
    spec: {
      source,
      filters: [...(metric?.filters ?? []), ...data.filters],
      measure: metric?.measure ?? data.measure ?? { fn: "count" },
      periodField: metric ? metric.periodField ?? null : data.periodField ?? null,
      groupBy: output === "groups" ? data.groupBy ?? null : null,
      groupBy2: output === "groups" ? data.groupBy2 ?? null : null,
      bucket: data.bucket ?? null,
      sort: data.sort ?? null,
      limit: data.limit ?? null,
      // Tiles are coloured by the RAG of their row, so they always read it when the source has one.
      columns: widget.type === "status-grid" && data.columns?.length && PAGE_SOURCES[source].fields.some((field) => field.key === "rag") && !data.columns.includes("rag") ? [...data.columns, "rag"] : data.columns ?? null,
      compare: output === "value" ? Boolean(data.compare) : false,
      output,
    },
  };
}
