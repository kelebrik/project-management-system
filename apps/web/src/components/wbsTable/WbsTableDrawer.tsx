import type { WbsImportPlanSummary } from "@pms/shared";
import { X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, apiClient } from "../../api/client";
import type { WbsItem } from "../../app/domainTypes";
import { writeCsv } from "../../app/tables/csv";
import { wbsToTable } from "../../app/tables/wbsTable";
import { writeXlsx } from "../../app/tables/xlsx";
import { newImportKey, useWbsTableReader } from "../../hooks/useWbsTableReader";
import { WbsImportPlanView, WbsTableColumnsPreview, WbsTableSourceInputs } from "./WbsTableReader";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useI18n } from "../../i18n/I18nProvider";
import "../../styles/wbs-table.css";

function download(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}


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
  const [plan, setPlan] = useState<WbsImportPlanSummary | null>(null);
  const [importKey, setImportKey] = useState(newImportKey);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  // A new table or another column choice needs a new check and a new import key.
  const reader = useWbsTableReader(() => {
    setPlan(null);
    setNotice("");
    setImportKey(newImportKey());
  });
  const { parsed, fieldLabel, error, setError } = reader;

  const fileName = (extension: string) => `${projectCode}-structure-${new Date().toISOString().slice(0, 10)}.${extension}`;
  const exported = () => wbsToTable(items, locale);
  const copyForSheets = async () => {
    const { headers, rows } = exported();
    await navigator.clipboard.writeText([headers, ...rows].map((row) => row.map((cell) => cell.replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n"));
    setNotice(t("ui.wbsTable.copied"));
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
        reader.clear();
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
            <WbsTableSourceInputs busy={busy} reader={reader} />
          </section>
        )}

        {notice && <p role="status">{notice}</p>}
        {error && (
          <p className="automation-error" role="alert">
            {error}
          </p>
        )}

        {reader.table && parsed && (
          <section className="wbs-table-section" aria-labelledby="wbs-table-columns">
            <WbsTableColumnsPreview busy={busy} reader={reader} />
            <div className="wbs-table-actions">
              <button disabled={busy || !reader.ready} onClick={() => void send(true)} type="button">
                {t("ui.wbsTable.check")}
              </button>
            </div>
          </section>
        )}

        {plan && (
          <section className="wbs-table-section" aria-labelledby="wbs-table-plan">
            <WbsImportPlanView fieldLabel={fieldLabel} plan={plan} />
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
