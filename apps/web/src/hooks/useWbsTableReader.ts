import type { WbsImportField } from "@pms/shared";
import { useMemo, useState } from "react";
import { parseDelimited } from "../app/tables/csv";
import { TABLE_LIMITS, type TableDocument } from "../app/tables/tableDocument";
import { guessColumnFields, tableToWbsRows, WBS_TABLE_COLUMNS } from "../app/tables/wbsTable";
import { readXlsx } from "../app/tables/xlsx";
import { useI18n } from "../i18n/I18nProvider";

export const newImportKey = () => `imp_${crypto.randomUUID().replaceAll("-", "")}`;

/**
 * Reading a Structure table: an .xlsx, a CSV or cells pasted from Google
 * Sheets become one plain table, whose columns are matched to Structure
 * fields. Shared by the Excel / Sheets panel of a project and by creating a
 * project from a table.
 */
export function useWbsTableReader(onTableChange?: () => void) {
  const { t, locale } = useI18n();
  const [table, setTable] = useState<TableDocument | null>(null);
  const [fields, setFields] = useState<Array<WbsImportField | null>>([]);
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState("");
  const parsed = useMemo(() => (table ? tableToWbsRows(table, fields) : null), [table, fields]);
  const fieldLabel = (field: WbsImportField) => WBS_TABLE_COLUMNS.find((column) => column.field === field)?.[locale] ?? field;

  const show = (next: TableDocument) => {
    setTable(next);
    setFields(guessColumnFields(next.headers));
    setError("");
    onTableChange?.();
  };
  const read = async (load: () => Promise<TableDocument> | TableDocument) => {
    setError("");
    try {
      show(await load());
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "";
      setError(
        message.startsWith("too many rows")
          ? t("ui.wbsTable.tooManyRows", { max: TABLE_LIMITS.rows })
          : message === "TOO_MANY_COLUMNS"
            ? t("ui.wbsTable.tooManyColumns", { max: TABLE_LIMITS.columns })
            : message === "CELL_TOO_LONG"
              ? t("ui.wbsTable.cellTooLong", { max: TABLE_LIMITS.cellChars })
              : message === "TOO_LARGE"
                ? t("ui.wbsTable.tooLarge")
                : t("ui.wbsTable.unreadable"),
      );
    }
  };
  const readFile = (file: File) =>
    read(async () => {
      if (file.size > TABLE_LIMITS.fileBytes) throw new Error("TOO_LARGE");
      const bytes = new Uint8Array(await file.arrayBuffer());
      // A workbook is a ZIP whatever its name says; anything else is read as text.
      if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return readXlsx(bytes);
      return parseDelimited(new TextDecoder().decode(bytes));
    });
  const readPasted = () => read(() => parseDelimited(pasted));
  const setField = (index: number, field: WbsImportField | null) => {
    setFields((current) => current.map((value, at) => (at === index ? field : value === field && field !== null ? null : value)));
    onTableChange?.();
  };
  const clear = () => {
    setTable(null);
    setPasted("");
  };
  /** Rows ready to plan: a code column, at least one row and no unreadable cells. */
  const ready = Boolean(parsed && fields.includes("code") && parsed.rows.length > 0 && parsed.problems.length === 0);
  return { table, fields, parsed, pasted, setPasted, error, setError, readFile, readPasted, setField, clear, ready, fieldLabel };
}

export type WbsTableReader = ReturnType<typeof useWbsTableReader>;
