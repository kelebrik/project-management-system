import { z } from "zod";

/**
 * The data a widget of "My page" reads: rows of a source (projects, work,
 * checkpoints...) with named fields, and the question asked of them — filter,
 * then count or add up, optionally split by one or two fields or by weeks.
 * The server loads the rows and answers; this file only names the shapes.
 */

export type PageText = { ru: string; en: string };

export const pageSourceKeys = ["projects", "work", "checkpoints", "risks", "decisions", "shifts", "issues", "changes", "lessons", "workload", "checkins", "jira"] as const;
export type PageSourceKey = (typeof pageSourceKeys)[number];

export type PageFieldKind = "text" | "number" | "date" | "enum" | "boolean" | "list";
/** How a value is shown: a RAG dot, a progress bar, days with a sign, a date... */
export type PageFieldFormat = "plain" | "rag" | "percent" | "days" | "date" | "count" | "score" | "code" | "hours";

export type PageFieldDef = {
  key: string;
  label: PageText;
  kind: PageFieldKind;
  format?: PageFieldFormat;
  /** Known values of an enum field, with their names; other values are shown as they are. */
  values?: Readonly<Record<string, PageText>>;
  /** May split a widget into groups. */
  groupable?: boolean;
  /** The name of the group of rows without a value, when "not set" says too little. */
  emptyLabel?: PageText;
};

export type PageSourceDef = {
  key: PageSourceKey;
  label: PageText;
  /** One row is…, for the editor's explanation. */
  rowLabel: PageText;
  fields: readonly PageFieldDef[];
  /** Date fields the page period may apply to. */
  periodFields: readonly string[];
  /** Columns a table of this source shows by default. */
  defaultColumns: readonly string[];
  /** The field that names a row in a list. */
  titleField: string;
};

/** A value of a row: dates are calendar days ("2026-10-06", UTC as in the portfolio reports), lists are arrays of strings. */
export type PageValue = string | number | boolean | null | string[];

export type PageDatasetRow = {
  id: string;
  projectId: string;
  /** Where the row opens in the application. */
  href?: string | null;
  values: Record<string, PageValue>;
};

export const pageFilterOps = ["eq", "neq", "in", "notIn", "gt", "gte", "lt", "lte", "between", "empty", "notEmpty", "contains", "isTrue", "isFalse"] as const;
export type PageFilterOp = (typeof pageFilterOps)[number];

const filterValueSchema = z.union([z.string().max(200), z.number(), z.boolean(), z.array(z.union([z.string().max(200), z.number()])).max(50)]);

export const pageFilterSchema = z.object({
  field: z.string().min(1).max(60),
  op: z.enum(pageFilterOps),
  value: filterValueSchema.optional(),
  value2: z.union([z.string().max(200), z.number()]).optional(),
});
export type PageFilter = z.infer<typeof pageFilterSchema>;

export const pageMeasureFns = ["count", "sum", "avg", "min", "max", "distinct"] as const;
export type PageMeasureFn = (typeof pageMeasureFns)[number];
export const pageMeasureSchema = z.object({ fn: z.enum(pageMeasureFns), field: z.string().max(60).optional() });
export type PageMeasure = z.infer<typeof pageMeasureSchema>;

export const pageBuckets = ["day", "week", "month", "quarter"] as const;
export type PageBucket = (typeof pageBuckets)[number];

export const pageOutputs = ["value", "groups", "rows"] as const;
export type PageOutput = (typeof pageOutputs)[number];

/** A complete question to a source, after a named metric has been unfolded. */
export type PageQuerySpec = {
  source: PageSourceKey;
  filters: PageFilter[];
  measure: PageMeasure;
  /** The page period applies to this date field: the last N days up to today. */
  periodField?: string | null;
  groupBy?: string | null;
  groupBy2?: string | null;
  bucket?: PageBucket | null;
  sort?: { by: string; dir: "asc" | "desc" } | null;
  limit?: number | null;
  columns?: string[] | null;
  compare?: boolean;
  output: PageOutput;
};

export type PageGroup = { key: string | null; value: number | null; count: number; sub?: Array<{ key: string | null; value: number | null }> };

export type PageQueryResult =
  | { kind: "value"; value: number | null; previous?: number | null; rowCount: number; warnings: string[] }
  | { kind: "groups"; groups: PageGroup[]; subKeys: Array<string | null>; total: number | null; rowCount: number; multiValued: boolean; bucket: PageBucket | null; warnings: string[] }
  | { kind: "rows"; columns: string[]; rows: PageDatasetRow[]; total: number; truncated: boolean; warnings: string[] }
  | { kind: "error"; error: string; code?: PageQueryErrorCode; warnings: string[] };

/** Why a widget got no answer, for the page to say in the person's language; `error` is the Russian text. */
export type PageQueryErrorCode = "PAGE_QUERY_INVALID" | "PAGE_METRIC_GONE" | "PAGE_SOURCE_TOO_LARGE" | "PAGE_SOURCE_MISSING";
