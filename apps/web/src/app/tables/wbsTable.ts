import { wbsItemStatuses, wbsItemTypes, type WbsImportField, type WbsImportRow } from "@pms/shared";
import { createDomainLabels } from "../../i18n/domainLabels";
import type { Locale } from "../../i18n/types";
import type { WbsItem } from "../domainTypes";
import type { TableDocument } from "./tableDocument";

/** The Structure columns a table carries, with the headers they are written and recognised under. */
export const WBS_TABLE_COLUMNS: Array<{ field: WbsImportField; ru: string; en: string; aliases: string[] }> = [
  { field: "id", ru: "ID", en: "ID", aliases: ["id", "идентификатор"] },
  { field: "code", ru: "Код", en: "Code", aliases: ["код", "code", "wbs", "№", "номер", "outline number", "wbs code"] },
  { field: "title", ru: "Название", en: "Title", aliases: ["название", "наименование", "title", "name", "task name", "задача", "работа"] },
  { field: "type", ru: "Тип", en: "Type", aliases: ["тип", "type"] },
  { field: "status", ru: "Статус", en: "Status", aliases: ["статус", "status", "состояние"] },
  { field: "owner", ru: "Ответственный", en: "Owner", aliases: ["ответственный", "исполнитель", "owner", "assignee", "resource names", "ресурсы"] },
  { field: "startDate", ru: "Начало", en: "Start", aliases: ["начало", "старт", "дата начала", "start", "start date"] },
  { field: "dueDate", ru: "Окончание", en: "Finish", aliases: ["окончание", "срок", "конец", "дата окончания", "finish", "end", "due", "due date", "end date"] },
  { field: "workDays", ru: "Рабочих дней", en: "Work days", aliases: ["рабочих дней", "длительность", "дней", "work days", "duration", "days"] },
  { field: "predecessors", ru: "Предшественники", en: "Predecessors", aliases: ["предшественники", "предшественник", "зависит от", "predecessors", "predecessor", "depends on"] },
  { field: "progress", ru: "Прогресс, %", en: "Progress, %", aliases: ["прогресс", "прогресс, %", "% выполнения", "готовность", "progress", "progress, %", "% complete"] },
  { field: "priority", ru: "Приоритет", en: "Priority", aliases: ["приоритет", "priority"] },
  { field: "comment", ru: "Комментарий", en: "Comment", aliases: ["комментарий", "примечание", "comment", "notes", "note"] },
];

const predecessorsOf = (item: WbsItem) =>
  [item.predecessor1, item.predecessor2, item.predecessor3, item.predecessor4, item.predecessor5, item.predecessor6].filter(Boolean).join("; ");

/** The Structure as a table in the order it is shown; the ID column lets the same file come back. */
export function wbsToTable(items: WbsItem[], locale: Locale): TableDocument {
  const labels = createDomainLabels(locale);
  const ordered = [...items].sort((left, right) => left.sortOrder - right.sortOrder);
  const value = (item: WbsItem, field: WbsImportField): string => {
    switch (field) {
      case "type":
        return labels.wbsTypeLabel(item.type);
      case "status":
        return labels.wbsStatusLabel(item.status);
      case "startDate":
        return item.startDate?.slice(0, 10) ?? "";
      case "dueDate":
        return item.dueDate?.slice(0, 10) ?? "";
      case "workDays":
        return item.workDays === null ? "" : String(item.workDays);
      case "predecessors":
        return predecessorsOf(item);
      case "progress":
        return String(item.progress);
      case "priority":
      case "comment":
        return item[field] ?? "";
      default:
        return String(item[field] ?? "");
    }
  };
  return {
    headers: WBS_TABLE_COLUMNS.map((column) => column[locale]),
    rows: ordered.map((item) => WBS_TABLE_COLUMNS.map((column) => value(item, column.field))),
  };
}

const simplify = (text: string) => text.toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ").trim();

/** Which Structure field each table column holds, guessed from its header; null leaves a column out. */
export function guessColumnFields(headers: string[]): Array<WbsImportField | null> {
  const taken = new Set<WbsImportField>();
  return headers.map((header) => {
    const name = simplify(header);
    const column = WBS_TABLE_COLUMNS.find((candidate) => !taken.has(candidate.field) && candidate.aliases.some((alias) => simplify(alias) === name));
    if (!column) return null;
    taken.add(column.field);
    return column.field;
  });
}

export type CellProblem = { row: number; field: WbsImportField; value: string; kind: "date" | "number" | "percent" | "type" | "status" | "code" | "predecessor" };

function reverseLabels(codes: readonly string[], label: (locale: Locale) => (code: string) => string) {
  const map = new Map<string, string>();
  for (const code of codes) {
    map.set(simplify(code), code);
    for (const locale of ["ru", "en"] as const) map.set(simplify(label(locale)(code)), code);
  }
  return map;
}
const TYPE_BY_NAME = reverseLabels(wbsItemTypes, (locale) => createDomainLabels(locale).wbsTypeLabel);
const STATUS_BY_NAME = reverseLabels(wbsItemStatuses, (locale) => createDomainLabels(locale).wbsStatusLabel);
const CODE = /^\d{1,4}(\.\d{1,4}){0,9}$/;

/** A date as YYYY-MM-DD from 2026-10-01 or 01.10.2026; undefined when it is neither. */
export function readDate(text: string) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  const [year, month, day] = iso ? [iso[1], iso[2], iso[3]] : dotted ? [dotted[3], dotted[2].padStart(2, "0"), dotted[1].padStart(2, "0")] : [];
  if (!year) return undefined;
  const value = `${year}-${month}-${day}`;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
}

/**
 * The rows of a table as Structure rows for the given column fields. An empty
 * cell clears a date, the duration, the owner, the priority or the comment,
 * and leaves the other fields as they are. Rows without a code are skipped;
 * cells that cannot be read are reported and keep the row out.
 */
export function tableToWbsRows(table: TableDocument, fields: Array<WbsImportField | null>) {
  const rows: WbsImportRow[] = [];
  const problems: CellProblem[] = [];
  let skipped = 0;
  table.rows.forEach((cells, index) => {
    const rowNumber = index + 2;
    const get = (field: WbsImportField) => {
      const at = fields.indexOf(field);
      return at < 0 ? undefined : (cells[at] ?? "").trim();
    };
    const code = get("code")?.replace(/\.$/, "");
    if (!code) {
      if (cells.some((cell) => cell.trim() !== "")) skipped += 1;
      return;
    }
    const problem = (field: WbsImportField, value: string, kind: CellProblem["kind"]) => problems.push({ row: rowNumber, field, value, kind });
    if (!CODE.test(code)) {
      problem("code", code, "code");
      return;
    }
    const row: WbsImportRow = { code };
    const before = problems.length;
    const id = get("id");
    if (id) row.id = id;
    const title = get("title");
    if (title) row.title = title;
    const type = get("type");
    if (type) {
      const known = TYPE_BY_NAME.get(simplify(type));
      if (known) row.type = known as WbsImportRow["type"];
      else problem("type", type, "type");
    }
    const status = get("status");
    if (status) {
      const known = STATUS_BY_NAME.get(simplify(status));
      if (known) row.status = known as WbsImportRow["status"];
      else problem("status", status, "status");
    }
    const owner = get("owner");
    if (owner !== undefined) row.owner = owner;
    for (const field of ["startDate", "dueDate"] as const) {
      const text = get(field);
      if (text === undefined) continue;
      const date = text ? readDate(text) : null;
      if (date === undefined) problem(field, text, "date");
      else row[field] = date;
    }
    const workDays = get("workDays");
    if (workDays !== undefined) {
      const number = workDays === "" ? null : Number(workDays.replace(",", "."));
      if (number !== null && (!Number.isInteger(number) || number < 0)) problem("workDays", workDays, "number");
      else row.workDays = number;
    }
    const predecessors = get("predecessors");
    if (predecessors !== undefined) {
      const codes = predecessors.split(/[;,\s]+/).map((value) => value.replace(/\.$/, "")).filter(Boolean);
      const wrong = codes.find((value) => !CODE.test(value));
      if (wrong || codes.length > 6) problem("predecessors", predecessors, "predecessor");
      else row.predecessors = codes;
    }
    const progress = get("progress");
    if (progress) {
      const number = Number(progress.replace("%", "").replace(",", ".").trim());
      if (!Number.isFinite(number) || number < 0 || number > 100) problem("progress", progress, "percent");
      else row.progress = Math.round(number);
    }
    const priority = get("priority");
    if (priority !== undefined) row.priority = priority || null;
    const comment = get("comment");
    if (comment !== undefined) row.comment = comment || null;
    if (problems.length === before) rows.push(row);
  });
  return { rows, problems, skipped };
}
