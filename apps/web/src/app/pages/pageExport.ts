import { PAGE_FORMATS, PAGE_SOURCES, type PageFormat, type PageQueryResult, type PageValue, type PageWidget } from "@pms/shared";
import type { TableDocument } from "../tables/tableDocument";
import { writeXlsx } from "../tables/xlsx";
import { formatPageValue, groupLabel, widgetFields, widgetSource, type Locale } from "./pageModel";

/**
 * A page and its widgets out of the browser: the sheet as a PNG picture at
 * twice its size, and the answer of a widget as an Excel table: numbers as
 * numbers the sheet can add up, everything else as the text the page shows.
 */

export function saveDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** A name for a file from a title: letters, digits and dashes. */
export function fileName(title: string, extension: string) {
  const base = title.trim().replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").slice(0, 80) || "page";
  return `${base}.${extension}`;
}

/** The sheet as it is at its real size, without the editing marks. */
export async function exportPagePng(sheet: HTMLElement, format: PageFormat, title: string) {
  const { toPng } = await import("html-to-image");
  const size = PAGE_FORMATS[format];
  const url = await toPng(sheet, {
    width: size.width,
    height: size.height,
    pixelRatio: 2,
    style: { transform: "none", left: "0", top: "0", boxShadow: "none" },
    filter: (node) => !(node instanceof HTMLElement && (node.classList.contains("mp-grid") || node.classList.contains("mp-resize") || node.classList.contains("mp-plain-handle"))),
  });
  const blob = await (await fetch(url)).blob();
  saveDownload(blob, fileName(title, "png"));
}

/** The answer of a widget as a table: rows with their columns, or groups with their values. */
export function widgetTable(widget: PageWidget, result: PageQueryResult, locale: Locale): (TableDocument & { numeric: Set<number> }) | null {
  const fields = widgetFields(widget);
  if (result.kind === "rows") {
    const source = widgetSource(widget);
    const keys = [...new Set([...(source && !result.columns.includes(PAGE_SOURCES[source].titleField) ? [PAGE_SOURCES[source].titleField] : []), ...result.columns])];
    const columns = keys.map((key) => fields.find((field) => field.key === key)).filter((field) => field !== undefined);
    // Numbers go out as plain numbers (no units), so the sheet can count with them.
    const plain = (field: (typeof columns)[number], value: PageValue | undefined) => (field.kind === "number" && typeof value === "number" ? String(value) : formatPageValue(value, field, locale));
    return {
      headers: columns.map((field) => field.label[locale]),
      rows: result.rows.map((row) => columns.map((field) => plain(field, row.values[field.key]))),
      numeric: new Set(columns.flatMap((field, index) => (field.kind === "number" ? [index] : []))),
    };
  }
  if (result.kind === "groups") {
    const field = fields.find((entry) => entry.key === widget.data?.groupBy) ?? null;
    const subField = fields.find((entry) => entry.key === widget.data?.groupBy2) ?? null;
    const value = locale === "ru" ? "Значение" : "Value";
    const number = (entry: number | null) => (entry === null ? "" : String(entry));
    const width = 1 + (subField ? result.subKeys.length : 0) + 1;
    return {
      headers: [field?.label[locale] ?? "", ...(subField ? result.subKeys.map((key) => groupLabel(key, subField, null, locale)) : []), value],
      rows: result.groups.map((group) => [groupLabel(group.key, field, result.bucket, locale), ...(subField ? (group.sub ?? []).map((part) => number(part.value)) : []), number(group.value)]),
      numeric: new Set(Array.from({ length: width - 1 }, (_, index) => index + 1)),
    };
  }
  if (result.kind === "value") return { headers: [widget.title || (locale === "ru" ? "Значение" : "Value")], rows: [[result.value === null ? "" : String(result.value)]], numeric: new Set([0]) };
  return null;
}

export function exportWidgetXlsx(widget: PageWidget, result: PageQueryResult, locale: Locale) {
  const table = widgetTable(widget, result, locale);
  if (!table) return false;
  const bytes = writeXlsx(table, widget.title || "Sheet1", table.numeric);
  saveDownload(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName(widget.title || "widget", "xlsx"));
  return true;
}
