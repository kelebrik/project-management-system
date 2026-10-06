import type { PageBucket, PageDatasetRow, PageFieldDef, PageFilter, PageGroup, PageMeasure, PageQueryResult, PageQuerySpec, PageValue } from "./dataset-types.js";
import { PAGE_SOURCES } from "./sources.js";

/**
 * Answers a widget's question over the rows of a source: the page period,
 * the filters, then one number, groups (by a field, by weeks or months, by two
 * fields) or the rows themselves. Pure: the server runs it after loading the
 * rows, tests run it on fixtures. Days are compared as "YYYY-MM-DD" strings,
 * UTC calendar days as the adapters give them.
 */

export type PageEvalContext = { today: string; periodDays: number };

const DAY_MS = 86_400_000;
export const PAGE_GROUP_LIMIT = 20;
export const PAGE_SUB_LIMIT = 8;
export const PAGE_ROW_LIMIT = 50;
export const PAGE_ROW_LIMIT_MAX = 500;
const MAX_BUCKETS = 400;
export const PAGE_OTHER_KEY = "__other__";

const toTime = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00.000Z`);
const toDay = (time: number) => new Date(time).toISOString().slice(0, 10);
export const pageAddDays = (day: string, days: number) => toDay(toTime(day) + days * DAY_MS);

/** The first day of the bucket that holds a day: the Monday, the first of the month or of the quarter. */
export function pageBucketKey(day: string, bucket: PageBucket) {
  const date = new Date(toTime(day));
  if (bucket === "day") return day.slice(0, 10);
  if (bucket === "week") return toDay(date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY_MS);
  const month = bucket === "month" ? date.getUTCMonth() : Math.floor(date.getUTCMonth() / 3) * 3;
  return toDay(Date.UTC(date.getUTCFullYear(), month, 1));
}

function nextBucket(key: string, bucket: PageBucket) {
  if (bucket === "day") return pageAddDays(key, 1);
  if (bucket === "week") return pageAddDays(key, 7);
  const date = new Date(toTime(key));
  return toDay(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + (bucket === "month" ? 1 : 3), 1));
}

/** Every bucket from the one of `from` to the one of `to`, empty ones too; null past the limit. */
export function pageBucketRange(from: string, to: string, bucket: PageBucket) {
  const keys: string[] = [];
  const last = pageBucketKey(to, bucket);
  for (let key = pageBucketKey(from, bucket); key <= last; key = nextBucket(key, bucket)) {
    keys.push(key);
    if (keys.length > MAX_BUCKETS) return null;
  }
  return keys;
}

const isEmpty = (value: PageValue | undefined) => value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
const asList = (value: PageValue | undefined): string[] => (isEmpty(value) ? [] : Array.isArray(value) ? value : [String(value)]);
const same = (left: PageValue | undefined, right: unknown) => String(left) === String(right);

function compare(field: PageFieldDef, value: PageValue | undefined, target: unknown) {
  if (isEmpty(value) || target === undefined || target === null || target === "") return null;
  if (field.kind === "number") {
    const right = Number(target);
    return Number.isFinite(right) ? Number(value) - right : null;
  }
  const left = String(value).slice(0, field.kind === "date" ? 10 : undefined);
  const right = String(target);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Whether a row passes one filter; a list field passes when any of its values does. */
export function pageFilterMatches(field: PageFieldDef, value: PageValue | undefined, filter: PageFilter) {
  const target = filter.value;
  switch (filter.op) {
    case "empty":
      return isEmpty(value);
    case "notEmpty":
      return !isEmpty(value);
    case "isTrue":
      return value === true;
    case "isFalse":
      return value === false;
    case "eq":
      return field.kind === "list" ? asList(value).some((entry) => same(entry, target)) : !isEmpty(value) && same(value, target);
    case "neq":
      return field.kind === "list" ? !asList(value).some((entry) => same(entry, target)) : isEmpty(value) || !same(value, target);
    case "in":
    case "notIn": {
      const options = (Array.isArray(target) ? target : target === undefined ? [] : [target]).map(String);
      const hit = asList(value).some((entry) => options.includes(String(entry)));
      return filter.op === "in" ? hit : !hit;
    }
    case "contains": {
      const needle = String(target ?? "").toLocaleLowerCase("ru");
      return asList(value).some((entry) => String(entry).toLocaleLowerCase("ru").includes(needle));
    }
    case "between": {
      const low = compare(field, value, target);
      const high = compare(field, value, filter.value2);
      return low !== null && high !== null && low >= 0 && high <= 0;
    }
    default: {
      const order = compare(field, value, target);
      if (order === null) return false;
      if (filter.op === "gt") return order > 0;
      if (filter.op === "gte") return order >= 0;
      if (filter.op === "lt") return order < 0;
      return order <= 0;
    }
  }
}

/** One number over rows; sums of nothing are 0, averages and extremes of nothing are empty. */
export function pageMeasureValue(rows: PageDatasetRow[], measure: PageMeasure) {
  if (measure.fn === "count") return rows.length;
  const field = measure.field ?? "";
  if (measure.fn === "distinct") return new Set(rows.flatMap((row) => asList(row.values[field]))).size;
  const numbers = rows.map((row) => row.values[field]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (measure.fn === "sum") return numbers.reduce((sum, value) => sum + value, 0);
  if (numbers.length === 0) return null;
  if (measure.fn === "avg") return Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 10) / 10;
  return measure.fn === "min" ? Math.min(...numbers) : Math.max(...numbers);
}

/** What is wrong with a question before it is asked, or null. */
export function pageQueryProblem(spec: PageQuerySpec) {
  const source = PAGE_SOURCES[spec.source];
  if (!source) return `Источник ${spec.source} не найден`;
  const field = (key: string | null | undefined) => (key ? source.fields.find((entry) => entry.key === key) ?? null : null);
  for (const key of [spec.groupBy, spec.groupBy2, spec.periodField, spec.measure.field, ...spec.filters.map((filter) => filter.field), ...(spec.columns ?? [])]) {
    if (key && !field(key)) return `Поля «${key}» нет в источнике «${source.label.ru}»`;
  }
  if (spec.periodField && !source.periodFields.includes(spec.periodField)) return `Период не применяется к полю «${spec.periodField}»`;
  for (const key of [spec.groupBy, spec.groupBy2]) {
    if (key && !field(key)!.groupable) return `По полю «${field(key)!.label.ru}» нельзя разбить`;
  }
  if (spec.groupBy2 && spec.groupBy2 === spec.groupBy) return "Второе разбиение должно отличаться от первого";
  const measured = field(spec.measure.field);
  if (spec.measure.fn === "distinct" && !measured) return "Укажите поле для подсчёта разных значений";
  if (["sum", "avg", "min", "max"].includes(spec.measure.fn)) {
    if (!measured || measured.kind !== "number") return "Сумма, среднее и крайние значения считаются только по числовому полю";
    if (spec.measure.fn === "sum" && measured.format === "percent") return "Проценты нельзя складывать — выберите среднее";
  }
  if (spec.compare && !spec.periodField) return "Сравнение с прошлым периодом возможно, только если задан период";
  return null;
}

function groupKeys(field: PageFieldDef, value: PageValue | undefined, bucket: PageBucket | null): Array<string | null> {
  if (isEmpty(value)) return [null];
  if (field.kind === "list") return [...new Set(asList(value))];
  if (field.kind === "date") return [pageBucketKey(String(value), bucket ?? "day")];
  return [String(value)];
}

function compareKeys(left: string | null, right: string | null) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.localeCompare(right, "ru", { numeric: true });
}

function windowOf(ctx: PageEvalContext, back: number) {
  const to = pageAddDays(ctx.today, -back * ctx.periodDays);
  return { from: pageAddDays(to, -(ctx.periodDays - 1)), to };
}

export function evaluatePageQuery(rows: PageDatasetRow[], spec: PageQuerySpec, ctx: PageEvalContext): PageQueryResult {
  const problem = pageQueryProblem(spec);
  if (problem) return { kind: "error", error: problem, warnings: [] };
  const source = PAGE_SOURCES[spec.source];
  const fieldOf = (key: string) => source.fields.find((field) => field.key === key)!;
  const warnings: string[] = [];
  const filtered = (back: number) => {
    const window = spec.periodField ? windowOf(ctx, back) : null;
    return rows.filter((row) => {
      if (window) {
        const day = row.values[spec.periodField!];
        if (typeof day !== "string" || day.slice(0, 10) < window.from || day.slice(0, 10) > window.to) return false;
      }
      return spec.filters.every((filter) => pageFilterMatches(fieldOf(filter.field), row.values[filter.field], filter));
    });
  };
  const current = filtered(0);

  if (spec.output === "value") {
    const value = pageMeasureValue(current, spec.measure);
    return { kind: "value", value, ...(spec.compare ? { previous: pageMeasureValue(filtered(1), spec.measure) } : {}), rowCount: current.length, warnings };
  }

  if (spec.output === "rows") {
    const columns = spec.columns?.length ? spec.columns : [...source.defaultColumns];
    const sortField = spec.sort && spec.sort.by !== "value" && spec.sort.by !== "label" ? fieldOf(spec.sort.by) : null;
    const sorted = sortField
      ? [...current].sort((left, right) => {
          const a = left.values[sortField.key];
          const b = right.values[sortField.key];
          if (isEmpty(a) || isEmpty(b)) return isEmpty(a) === isEmpty(b) ? 0 : isEmpty(a) ? 1 : -1;
          const order = sortField.kind === "number" ? Number(a) - Number(b) : String(a).localeCompare(String(b), "ru", { numeric: true });
          return spec.sort!.dir === "desc" ? -order : order;
        })
      : current;
    const limit = Math.min(spec.limit ?? PAGE_ROW_LIMIT, PAGE_ROW_LIMIT_MAX);
    const keep = new Set([...columns, source.titleField, "project"]);
    return {
      kind: "rows",
      columns,
      rows: sorted.slice(0, limit).map((row) => ({ ...row, values: Object.fromEntries(Object.entries(row.values).filter(([key]) => keep.has(key))) })),
      total: sorted.length,
      truncated: sorted.length > limit,
      warnings,
    };
  }

  // Groups: by a field, its buckets in time, and optionally a second field inside each group.
  const groupField = spec.groupBy ? fieldOf(spec.groupBy) : null;
  const bucket = groupField?.kind === "date" ? spec.bucket ?? "week" : null;
  const buckets = new Map<string | null, PageDatasetRow[]>();
  let multiValued = false;
  for (const row of current) {
    const keys = groupField ? groupKeys(groupField, row.values[groupField.key], bucket) : ["__all__"];
    if (keys.length > 1) multiValued = true;
    for (const key of keys) {
      const list = buckets.get(key) ?? [];
      list.push(row);
      buckets.set(key, list);
    }
  }
  let keys = [...buckets.keys()];
  if (bucket) {
    const days = keys.filter((key): key is string => key !== null);
    const range = spec.periodField === spec.groupBy ? windowOf(ctx, 0) : days.length ? { from: days.reduce((a, b) => (a < b ? a : b)), to: days.reduce((a, b) => (a > b ? a : b)) } : null;
    const filled = range ? pageBucketRange(range.from, range.to, bucket) : [];
    if (filled === null) warnings.push("Слишком много шагов времени — показаны только непустые");
    keys = [...new Set([...(filled ?? []), ...days])].sort(compareKeys);
    if (buckets.has(null)) keys.push(null);
  }
  let groups: PageGroup[] = keys.map((key) => {
    const members = buckets.get(key) ?? [];
    return { key, value: pageMeasureValue(members, spec.measure), count: members.length };
  });
  if (!bucket) {
    const dir = spec.sort?.dir ?? (spec.sort?.by === "label" ? "asc" : "desc");
    groups.sort((left, right) => {
      if (spec.sort?.by === "label") return dir === "asc" ? compareKeys(left.key, right.key) : -compareKeys(left.key, right.key);
      const order = (left.value ?? -Infinity) - (right.value ?? -Infinity);
      return (dir === "desc" ? -order : order) || compareKeys(left.key, right.key);
    });
    const limit = Math.min(spec.limit ?? PAGE_GROUP_LIMIT, PAGE_ROW_LIMIT_MAX);
    if (groups.length > limit) {
      const kept = groups.slice(0, limit);
      const keptKeys = new Set(kept.map((group) => group.key));
      // The rest is one more group when it can be added up; rows already in a kept group are not counted twice.
      const rest = current.filter((row) => !groupKeys(groupField!, row.values[groupField!.key], bucket).some((key) => keptKeys.has(key)));
      if (spec.measure.fn === "count" || spec.measure.fn === "sum") kept.push({ key: PAGE_OTHER_KEY, value: pageMeasureValue(rest, spec.measure), count: rest.length });
      else warnings.push(`Показаны первые ${limit} групп`);
      groups = kept;
    }
  }

  const subField = spec.groupBy2 ? fieldOf(spec.groupBy2) : null;
  let subKeys: Array<string | null> = [];
  if (subField) {
    const subBucket = subField.kind === "date" ? "month" : null;
    const totals = new Map<string | null, number>();
    const parts = groups.map((group) => {
      const members = group.key === PAGE_OTHER_KEY ? [] : buckets.get(group.key) ?? [];
      const inner = new Map<string | null, PageDatasetRow[]>();
      for (const row of members) {
        for (const key of groupKeys(subField, row.values[subField.key], subBucket)) {
          inner.set(key, [...(inner.get(key) ?? []), row]);
          totals.set(key, (totals.get(key) ?? 0) + 1);
        }
      }
      return inner;
    });
    const ranked = [...totals.entries()].sort((left, right) => right[1] - left[1] || compareKeys(left[0], right[0])).map(([key]) => key);
    subKeys = ranked.slice(0, PAGE_SUB_LIMIT);
    const folded = ranked.length > PAGE_SUB_LIMIT;
    if (folded) subKeys.push(PAGE_OTHER_KEY);
    groups = groups.map((group, index) => ({
      ...group,
      sub: subKeys.map((key) => {
        const members = key === PAGE_OTHER_KEY
          ? [...new Set([...parts[index].entries()].filter(([inner]) => !subKeys.includes(inner)).flatMap(([, list]) => list))]
          : parts[index].get(key) ?? [];
        return { key, value: pageMeasureValue(members, spec.measure) };
      }),
    }));
  }

  return { kind: "groups", groups, subKeys, total: pageMeasureValue(current, spec.measure), rowCount: current.length, multiValued, bucket, warnings };
}
