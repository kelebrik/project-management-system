import {
  PAGE_FORMATS,
  PAGE_OTHER_KEY,
  PAGE_SOURCES,
  PAGE_TEXT_WIDGETS,
  pageCompactBoxes,
  pageLayoutProblem,
  pageField,
  pageFreeSpot,
  pageMetric,
  pageValueLabel,
  pageWidgetOutput,
  type PageBucket,
  type PageDocument,
  type PageFieldDef,
  type PageFieldFormat,
  type PageFormat,
  type PageQueryResult,
  type PageQuestionWidget,
  type PageScope,
  type PageSourceKey,
  type PageText,
  type PageValue,
  type PageWidget,
} from "@pms/shared";

/** What the pages API answers, and the pure helpers of the editor. */

export type Locale = "ru" | "en";
export type SavedPage = { id: string; title: string; document: PageDocument; revision: number; createdAt: string; updatedAt: string };
export type PagesList = { canSave: boolean; limit: number; pages: SavedPage[] };
export type ScopeProject = { id: string; code: string; name: string; portfolio: string };
export type ScopeOptions = { projects: ScopeProject[]; portfolios: string[] };
export type PageAnswer = { today: string; generatedAt: string; projects: Array<{ id: string; code: string; name: string }>; results: Record<string, PageQueryResult> };
export type PageQueryItem = { id: string; widget: Pick<PageWidget, "type" | "data" | "formula">; scope?: PageScope };

export const text = (value: PageText, locale: Locale) => value[locale];

/** The source a widget reads: its metric's, or its own when built by hand. */
export function widgetSource(widget: Pick<PageWidget, "data">): PageSourceKey | null {
  const data = widget.data;
  if (!data) return null;
  // A source removed since the page was saved reads as none.
  if (data.metric === "custom") return data.source && data.source in PAGE_SOURCES ? (data.source as PageSourceKey) : null;
  return pageMetric(data.metric)?.source ?? null;
}

export function widgetFields(widget: Pick<PageWidget, "data">): readonly PageFieldDef[] {
  const source = widgetSource(widget);
  return source ? PAGE_SOURCES[source].fields : [];
}

/** The questions of a page for the batch: data widgets only. */
export function pageQueries(document: PageDocument): PageQueryItem[] {
  return document.widgets
    .filter((widget) => !PAGE_TEXT_WIDGETS.has(widget.type) && widget.data && pageWidgetOutput(widget))
    .map((widget) => ({ id: widget.id, widget: { type: widget.type, data: widget.data, ...(widget.formula && pageWidgetOutput(widget) === "value" ? { formula: widget.formula } : {}) }, ...(widget.scope ? { scope: widget.scope } : {}) }));
}

/** A key that changes only when the answers would: scope, period and the questions, not positions or titles. */
export function pageQueryFingerprint(document: PageDocument) {
  return JSON.stringify([document.scope, document.periodDays, pageQueries(document)]);
}

export function newWidgetId(document: PageDocument) {
  const taken = new Set(document.widgets.map((widget) => widget.id));
  for (let index = 1; ; index += 1) {
    const id = `w${index}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * A ready widget placed in the first free spot; when its size does not fit,
 * smaller sizes are tried down to 2×2. Null if the sheet is full.
 */
export function placeNewWidget(document: PageDocument, widget: PageQuestionWidget, locale: Locale): PageDocument | null {
  const rows = PAGE_FORMATS[document.format].rows;
  for (let h = widget.h; h >= Math.min(2, widget.h); h -= 1) {
    for (let w = widget.w; w >= Math.min(2, widget.w); w -= 1) {
      const spot = pageFreeSpot(document.widgets, w, h, rows);
      if (!spot) continue;
      const { title, text: body, ...rest } = widget;
      const placed = { ...rest, id: newWidgetId(document), x: spot.x, y: spot.y, w, h, title: title[locale], ...(body ? { text: body[locale] } : {}) } as PageWidget;
      return { ...document, widgets: [...document.widgets, placed] };
    }
  }
  return null;
}

export function duplicateWidget(document: PageDocument, id: string): PageDocument | null {
  const source = document.widgets.find((widget) => widget.id === id);
  if (!source) return null;
  const spot = pageFreeSpot(document.widgets, source.w, source.h, PAGE_FORMATS[document.format].rows);
  if (!spot) return null;
  return { ...document, widgets: [...document.widgets, { ...structuredClone(source), id: newWidgetId(document), x: spot.x, y: spot.y }] };
}

/** Another format: widgets stay where they are if they fit, else are lifted to fit fewer rows; null if they still do not. */
export function changeFormat(document: PageDocument, format: PageFormat): PageDocument | null {
  const rows = PAGE_FORMATS[format].rows;
  const widgets = pageLayoutProblem(document.widgets, rows) === null ? document.widgets : pageCompactBoxes(document.widgets, rows);
  return widgets ? { ...document, format, widgets } : null;
}

export function updateWidget(document: PageDocument, id: string, patch: Partial<PageWidget>): PageDocument {
  return { ...document, widgets: document.widgets.map((widget) => (widget.id === id ? ({ ...widget, ...patch } as PageWidget) : widget)) };
}

const QUARTERS = ["I", "II", "III", "IV"];

/** The name of a group: an enum's name, a bucket of time, yes/no, or "not set". */
export function groupLabel(key: string | null, field: PageFieldDef | null, bucket: PageBucket | null, locale: Locale) {
  if (key === null) return field?.emptyLabel?.[locale] ?? (locale === "ru" ? "Не задано" : "Not set");
  if (key === PAGE_OTHER_KEY) return locale === "ru" ? "Остальные" : "Others";
  if (key === "__all__") return locale === "ru" ? "Все" : "All";
  if (field?.kind === "boolean") return field.values?.[key]?.[locale] ?? (key === "true" ? (locale === "ru" ? "Да" : "Yes") : locale === "ru" ? "Нет" : "No");
  if (field?.kind === "date") {
    const date = new Date(`${key}T00:00:00Z`);
    const tag = locale === "ru" ? "ru-RU" : "en-GB";
    if (bucket === "month") return new Intl.DateTimeFormat(tag, { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
    if (bucket === "quarter") return locale === "ru" ? `${QUARTERS[Math.floor(date.getUTCMonth() / 3)]} кв. ${date.getUTCFullYear()}` : `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
    return new Intl.DateTimeFormat(tag, { day: "2-digit", month: "2-digit", ...(bucket === "day" ? { year: "2-digit" } : {}), timeZone: "UTC" }).format(date);
  }
  return pageValueLabel(field, key, locale);
}

/** A value as a cell shows it. */
export function formatPageValue(value: PageValue | undefined, field: PageFieldDef | null, locale: Locale): string {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "✓" : "—";
  if (typeof value === "number") return formatNumber(value, field?.format ?? "plain", locale);
  if (field?.kind === "date") return groupLabel(value.slice(0, 10), field, "day", locale);
  if (field?.kind === "enum") return pageValueLabel(field, value, locale);
  return value;
}

export function formatNumber(value: number | null | undefined, format: PageFieldFormat, locale: Locale) {
  if (value === null || value === undefined) return "—";
  const tag = locale === "ru" ? "ru-RU" : "en-GB";
  const number = new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(value);
  if (format === "percent") return `${number}%`;
  if (format === "days") return `${value > 0 ? "+" : ""}${number}${locale === "ru" ? " дн." : " d"}`;
  return number;
}

/** In plain words what a page or widget covers. */
export function scopeLabel(scope: PageScope, options: ScopeOptions | null, locale: Locale) {
  if (scope.mode === "all") return locale === "ru" ? "Все доступные проекты" : "All projects available to me";
  if (scope.mode === "portfolio") return `${locale === "ru" ? "Портфель" : "Portfolio"}: ${scope.portfolios.join(", ")}`;
  const codes = scope.projectIds.map((id) => options?.projects.find((project) => project.id === id)?.code ?? "?");
  return codes.length <= 3 ? codes.join(", ") : `${codes.slice(0, 3).join(", ")} +${codes.length - 3}`;
}

/** The field a widget's value is measured by, for the unit of a number. */
export function widgetUnit(widget: Pick<PageWidget, "data"> & { formula?: PageWidget["formula"] }): PageFieldFormat {
  if (widget.formula?.op === "percent") return "percent";
  if (widget.formula?.op === "ratio") return "plain";
  const data = widget.data;
  if (!data) return "plain";
  const metric = data.metric === "custom" ? null : pageMetric(data.metric);
  if (metric) return metric.unit;
  const source = widgetSource(widget);
  const field = source && data.measure?.field ? pageField(source, data.measure.field) : null;
  return data.measure?.fn === "count" || data.measure?.fn === "distinct" ? "count" : field?.format ?? "plain";
}

/** How many rows of a height fit, keeping one for "N more" when they do not all fit. */
export function fitRows(available: number, rowHeight: number, total: number, loaded = total) {
  const fit = Math.max(1, Math.floor(available / rowHeight));
  const shown = Math.min(loaded, total <= fit ? total : Math.max(0, fit - 1));
  return { shown, more: total - shown };
}

/** In plain words what a widget counts, over which period, with which filters — its passport. */
export function widgetPassport(widget: PageWidget, locale: "ru" | "en", periodDays: number) {
  const data = widget.data;
  if (!data) return "";
  const metric = data.metric === "custom" ? null : pageMetric(data.metric);
  const parts = [metric ? `${metric.label[locale]}: ${metric.definition[locale]}` : locale === "ru" ? "Свой запрос" : "Custom question"];
  parts.push(
    metric?.periodField || data.periodField
      ? locale === "ru" ? `Период: последние ${periodDays} дн.` : `Period: the last ${periodDays} days`
      : locale === "ru" ? "Период не применяется — показатель на сегодня" : "The period does not apply — the figure is as of today",
  );
  if (data.filters.length > 0) {
    const fields = widgetFields(widget);
    parts.push(`${locale === "ru" ? "Фильтры" : "Filters"}: ${data.filters.map((filter) => fields.find((field) => field.key === filter.field)?.label[locale] ?? filter.field).join(", ")}`);
  }
  return parts.join("\n");
}

/** Where the grid of a sheet sits, in the sheet's CSS pixels. */
export const SHEET_PADDING = 24;
export const SHEET_HEADER = 52;
export const SHEET_GAP = 10;

export function sheetGeometry(format: PageFormat) {
  const sheet = PAGE_FORMATS[format];
  const cellWidth = (sheet.width - 2 * SHEET_PADDING - 11 * SHEET_GAP) / 12;
  const rowHeight = (sheet.height - 2 * SHEET_PADDING - SHEET_HEADER - (sheet.rows - 1) * SHEET_GAP) / sheet.rows;
  return {
    ...sheet,
    cellWidth,
    rowHeight,
    rect: (box: { x: number; y: number; w: number; h: number }) => ({
      left: SHEET_PADDING + box.x * (cellWidth + SHEET_GAP),
      top: SHEET_PADDING + SHEET_HEADER + box.y * (rowHeight + SHEET_GAP),
      width: box.w * cellWidth + (box.w - 1) * SHEET_GAP,
      height: box.h * rowHeight + (box.h - 1) * SHEET_GAP,
    }),
  };
}

/** How many open projects a scope covers, from the options the person has. */
export function scopeProjectCount(scope: PageScope, options: ScopeOptions | null) {
  if (!options) return null;
  if (scope.mode === "all") return options.projects.length;
  if (scope.mode === "portfolio") return options.projects.filter((project) => scope.portfolios.includes(project.portfolio)).length;
  return options.projects.filter((project) => scope.projectIds.includes(project.id)).length;
}

/** The colour of a traffic light: thresholds from the widget, else a default for its unit. */
export function trafficLevel(value: number | null, thresholds: { amber: number; red: number } | undefined, higherIsWorse: boolean, unit: PageFieldFormat): "GREEN" | "AMBER" | "RED" | null {
  if (value === null) return null;
  const limits = thresholds ?? (higherIsWorse ? (unit === "days" ? { amber: 1, red: 10 } : { amber: 1, red: 5 }) : unit === "percent" ? { amber: 70, red: 40 } : { amber: 1, red: 0 });
  if (higherIsWorse) return value >= limits.red ? "RED" : value >= limits.amber ? "AMBER" : "GREEN";
  return value <= limits.red ? "RED" : value <= limits.amber ? "AMBER" : "GREEN";
}

/** Where a date sits between two others, from 0 to 1. */
export function dayPosition(day: string, from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const span = Date.parse(`${to}T00:00:00Z`) - start;
  return span <= 0 ? 0.5 : (Date.parse(`${day.slice(0, 10)}T00:00:00Z`) - start) / span;
}

/** Whether a value is past the widget's alert: above its upper or below its lower limit. */
export function beyondAlert(value: number | null | undefined, alert: PageWidget["alert"]) {
  if (value === null || value === undefined || !alert) return false;
  return (alert.above !== undefined && value > alert.above) || (alert.below !== undefined && value < alert.below);
}
