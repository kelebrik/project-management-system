import { wbsImportFields, type WbsImportField, type WbsImportPlanSummary, type WbsImportProblem } from "@pms/shared";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, apiClient } from "../../api/client";
import type { WbsItem } from "../../app/domainTypes";
import { parseDelimited, writeCsv } from "../../app/tables/csv";
import { TABLE_LIMITS, type TableDocument } from "../../app/tables/tableDocument";
import { guessColumnFields, tableToWbsRows, WBS_TABLE_COLUMNS, wbsToTable } from "../../app/tables/wbsTable";
import { readXlsx, writeXlsx } from "../../app/tables/xlsx";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useI18n } from "../../i18n/I18nProvider";
import "../../styles/wbs-table.css";

const PREVIEW_ROWS = 5;
const LISTED_CHANGES = 200;

function download(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const newImportKey = () => `imp_${crypto.randomUUID().replaceAll("-", "")}`;

/**
 * The Structure to and from Excel and Google Sheets. Every format goes through
 * one plain table: export writes it as .xlsx, CSV or text for pasting into
 * Google Sheets; import reads an .xlsx, a CSV or pasted cells into it, matches
 * its columns to Structure fields, shows what would change, and only then
 * writes, all rows or none.
 */
export function WbsTableDrawer({
  projectId,
  projectCode,
  items,
  canWrite,
  hasUnsavedEdits,
  onImported,
  onClose,
}: {
  projectId: string;
  projectCode: string;
  items: WbsItem[];
  canWrite: boolean;
  hasUnsavedEdits: () => boolean;
  onImported: () => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const containerRef = useFocusTrap<HTMLElement>(true, onClose);
  const [table, setTable] = useState<TableDocument | null>(null);
  const [fields, setFields] = useState<Array<WbsImportField | null>>([]);
  const [pasted, setPasted] = useState("");
  const [plan, setPlan] = useState<WbsImportPlanSummary | null>(null);
  const [importKey, setImportKey] = useState(newImportKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const parsed = useMemo(() => (table ? tableToWbsRows(table, fields) : null), [table, fields]);
  const fieldLabel = (field: WbsImportField) => WBS_TABLE_COLUMNS.find((column) => column.field === field)?.[locale] ?? field;

  const fileName = (extension: string) => `${projectCode}-structure-${new Date().toISOString().slice(0, 10)}.${extension}`;
  const exported = () => wbsToTable(items, locale);
  const copyForSheets = async () => {
    const { headers, rows } = exported();
    await navigator.clipboard.writeText([headers, ...rows].map((row) => row.map((cell) => cell.replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n"));
    setNotice(t("ui.wbsTable.copied"));
  };

  const showTable = (next: TableDocument) => {
    setTable(next);
    setFields(guessColumnFields(next.headers));
    setPlan(null);
    setError("");
    setNotice("");
    setImportKey(newImportKey());
  };
  const read = async (load: () => Promise<TableDocument> | TableDocument) => {
    setError("");
    try {
      showTable(await load());
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

  const setField = (index: number, field: WbsImportField | null) => {
    setFields((current) => current.map((value, at) => (at === index ? field : value === field && field !== null ? null : value)));
    setPlan(null);
  };

  const send = async (dryRun: boolean) => {
    if (!parsed) return;
    // The import reads the saved Structure; edits still on their way would be overwritten or lost.
    if (hasUnsavedEdits()) {
      setError(t("ui.wbsTable.saveEditsFirst"));
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiClient.post<WbsImportPlanSummary | { summary: WbsImportPlanSummary }>(
        `/api/projects/${projectId}/wbs-import`,
        { rows: parsed.rows, dryRun, importKey },
        t("ui.wbsTable.failed"),
      );
      if (dryRun) setPlan(result as WbsImportPlanSummary);
      else {
        const { summary } = result as { summary: WbsImportPlanSummary };
        setNotice(t("ui.wbsTable.imported", { created: summary.creates.length, updated: summary.updates.length }));
        setTable(null);
        setPlan(null);
        setImportKey(newImportKey());
        onImported();
      }
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 422 && failure.details && typeof failure.details === "object") setPlan(failure.details as WbsImportPlanSummary);
      setError(failure instanceof Error ? failure.message : t("ui.wbsTable.failed"));
    } finally {
      setBusy(false);
    }
  };

  const problemText = (problem: WbsImportProblem) =>
    t(`ui.wbsTable.problem.${problem.kind}`, { code: problem.code, field: problem.field ? fieldLabel(problem.field) : "", detail: problem.detail ?? "" });
  const nothingToDo = plan !== null && plan.creates.length === 0 && plan.updates.length === 0;

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose}>
      <aside aria-labelledby="wbs-table-title" aria-modal="true" className="side-drawer wbs-table-drawer" onClick={(event) => event.stopPropagation()} ref={containerRef} role="dialog" tabIndex={-1}>
        <div className="drawer-title">
          <h2 id="wbs-table-title">{t("ui.wbsTable.title")}</h2>
          <button aria-label={t("ui.wbsTable.close")} onClick={onClose} type="button">
            <X size={14} />
          </button>
        </div>

        <section className="wbs-table-section" aria-labelledby="wbs-table-export">
          <h3 id="wbs-table-export">{t("ui.wbsTable.export")}</h3>
          <p className="wbs-table-hint">{t("ui.wbsTable.exportHint")}</p>
          <div className="wbs-table-actions">
            <button onClick={() => download(writeXlsx(exported(), t("ui.wbsTable.sheetName")) as BlobPart, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName("xlsx"))} type="button">
              {t("ui.wbsTable.downloadXlsx")}
            </button>
            <button onClick={() => download(writeCsv(exported()), "text/csv;charset=utf-8", fileName("csv"))} type="button">
              {t("ui.wbsTable.downloadCsv")}
            </button>
            <button onClick={() => void copyForSheets().catch(() => setError(t("ui.wbsTable.copyFailed")))} type="button">
              {t("ui.wbsTable.copyForSheets")}
            </button>
          </div>
        </section>

        {canWrite && (
          <section className="wbs-table-section" aria-labelledby="wbs-table-import">
            <h3 id="wbs-table-import">{t("ui.wbsTable.import")}</h3>
            <p className="wbs-table-hint">{t("ui.wbsTable.importHint")}</p>
            <div className="wbs-table-actions">
              <label className="wbs-table-file">
                {t("ui.wbsTable.chooseFile")}
                <input
                  accept=".xlsx,.csv,.tsv,.txt"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void readFile(file);
                  }}
                  type="file"
                />
              </label>
            </div>
            <label className="wbs-table-paste">
              {t("ui.wbsTable.paste")}
              <textarea disabled={busy} onChange={(event) => setPasted(event.target.value)} placeholder={t("ui.wbsTable.pastePlaceholder")} rows={3} value={pasted} />
            </label>
            <div className="wbs-table-actions">
              <button disabled={busy || !pasted.trim()} onClick={() => void read(() => parseDelimited(pasted))} type="button">
                {t("ui.wbsTable.readPasted")}
              </button>
            </div>
          </section>
        )}

        {notice && <p role="status">{notice}</p>}
        {error && (
          <p className="automation-error" role="alert">
            {error}
          </p>
        )}

        {table && parsed && (
          <section className="wbs-table-section" aria-labelledby="wbs-table-columns">
            <h3 id="wbs-table-columns">{t("ui.wbsTable.columns", { rows: table.rows.length })}</h3>
            {!fields.includes("code") && <p className="automation-error">{t("ui.wbsTable.needCode")}</p>}
            <div className="wbs-table-preview">
              <table>
                <thead>
                  <tr>
                    {table.headers.map((header, index) => (
                      <th key={index}>
                        <span>{header || "—"}</span>
                        <select aria-label={t("ui.wbsTable.fieldFor", { column: header })} disabled={busy} onChange={(event) => setField(index, (event.target.value || null) as WbsImportField | null)} value={fields[index] ?? ""}>
                          <option value="">{t("ui.wbsTable.skipColumn")}</option>
                          {wbsImportFields.map((field) => (
                            <option key={field} value={field}>
                              {fieldLabel(field)}
                            </option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.slice(0, PREVIEW_ROWS).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, index) => (
                        <td className={fields[index] ? "" : "skipped"} key={index}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.skipped > 0 && <p className="wbs-table-hint">{t("ui.wbsTable.skippedRows", { count: parsed.skipped })}</p>}
            {parsed.problems.length > 0 && (
              <ul className="wbs-table-problems">
                {parsed.problems.slice(0, 50).map((problem, index) => (
                  <li key={index}>{t(`ui.wbsTable.cell.${problem.kind}`, { row: problem.row, field: fieldLabel(problem.field), value: problem.value })}</li>
                ))}
              </ul>
            )}
            <div className="wbs-table-actions">
              <button disabled={busy || !fields.includes("code") || parsed.rows.length === 0 || parsed.problems.length > 0} onClick={() => void send(true)} type="button">
                {t("ui.wbsTable.check")}
              </button>
            </div>
          </section>
        )}

        {plan && (
          <section className="wbs-table-section" aria-labelledby="wbs-table-plan">
            <h3 id="wbs-table-plan">{t("ui.wbsTable.plan", { created: plan.creates.length, updated: plan.updates.length, unchanged: plan.unchanged })}</h3>
            {plan.errors.length > 0 && (
              <ul className="wbs-table-problems">
                {plan.errors.map((problem, index) => (
                  <li key={index}>{problemText(problem)}</li>
                ))}
              </ul>
            )}
            {plan.warnings.length > 0 && (
              <ul className="wbs-table-warnings">
                {plan.warnings.map((problem, index) => (
                  <li key={index}>{problemText(problem)}</li>
                ))}
              </ul>
            )}
            {plan.creates.length > 0 && (
              <>
                <h4>{t("ui.wbsTable.newRows")}</h4>
                <ul className="wbs-table-changes">
                  {plan.creates.slice(0, LISTED_CHANGES).map((row) => (
                    <li key={row.code}>
                      <strong>{row.code}</strong> {row.title}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {plan.updates.length > 0 && (
              <>
                <h4>{t("ui.wbsTable.changedRows")}</h4>
                <ul className="wbs-table-changes">
                  {plan.updates.slice(0, LISTED_CHANGES).map((row) => (
                    <li key={row.code}>
                      <strong>{row.code}</strong>{" "}
                      {row.changes.map((change) => `${fieldLabel(change.field)}: ${change.from || "—"} → ${change.to || "—"}`).join("; ")}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {Math.max(plan.creates.length, plan.updates.length) > LISTED_CHANGES && <p className="wbs-table-hint">{t("ui.wbsTable.listCut", { max: LISTED_CHANGES })}</p>}
            <div className="wbs-table-actions">
              <button className="primary" disabled={busy || plan.errors.length > 0 || nothingToDo} onClick={() => void send(false)} type="button">
                {t("ui.wbsTable.apply")}
              </button>
              {nothingToDo && <span className="wbs-table-hint">{t("ui.wbsTable.nothingToDo")}</span>}
            </div>
          </section>
        )}
      </aside>
    </div>,
    document.body,
  );
}
