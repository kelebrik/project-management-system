import { wbsImportFields, type WbsImportField, type WbsImportPlanSummary, type WbsImportProblem } from "@pms/shared";
import type { WbsTableReader } from "../../hooks/useWbsTableReader";
import { useI18n } from "../../i18n/I18nProvider";
import "../../styles/wbs-table.css";

const PREVIEW_ROWS = 5;
const LISTED_CHANGES = 200;

/** Choosing a file or pasting cells. */
export function WbsTableSourceInputs({ reader, busy }: { reader: WbsTableReader; busy: boolean }) {
  const { t } = useI18n();
  return (
    <>
      <div className="wbs-table-actions">
        <label className="wbs-table-file">
          {t("ui.wbsTable.chooseFile")}
          <input
            accept=".xlsx,.csv,.tsv,.txt"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void reader.readFile(file);
            }}
            type="file"
          />
        </label>
      </div>
      <label className="wbs-table-paste">
        {t("ui.wbsTable.paste")}
        <textarea disabled={busy} onChange={(event) => reader.setPasted(event.target.value)} placeholder={t("ui.wbsTable.pastePlaceholder")} rows={3} value={reader.pasted} />
      </label>
      <div className="wbs-table-actions">
        <button disabled={busy || !reader.pasted.trim()} onClick={() => void reader.readPasted()} type="button">
          {t("ui.wbsTable.readPasted")}
        </button>
      </div>
    </>
  );
}

/** The first rows of the table with a field chosen for each column, and the cells that could not be read. */
export function WbsTableColumnsPreview({ reader, busy }: { reader: WbsTableReader; busy: boolean }) {
  const { t } = useI18n();
  const { table, parsed, fields, fieldLabel } = reader;
  if (!table || !parsed) return null;
  return (
    <>
      <h3 id="wbs-table-columns">{t("ui.wbsTable.columns", { rows: table.rows.length })}</h3>
      {!fields.includes("code") && <p className="automation-error">{t("ui.wbsTable.needCode")}</p>}
      <div className="wbs-table-preview">
        <table>
          <thead>
            <tr>
              {table.headers.map((header, index) => (
                <th key={index}>
                  <span>{header || "—"}</span>
                  <select aria-label={t("ui.wbsTable.fieldFor", { column: header })} disabled={busy} onChange={(event) => reader.setField(index, (event.target.value || null) as WbsImportField | null)} value={fields[index] ?? ""}>
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
    </>
  );
}

/** What an import would do: errors that stop it, values not taken, new rows and changed ones. */
export function WbsImportPlanView({ plan, fieldLabel }: { plan: WbsImportPlanSummary; fieldLabel: (field: WbsImportField) => string }) {
  const { t } = useI18n();
  const problemText = (problem: WbsImportProblem) =>
    t(`ui.wbsTable.problem.${problem.kind}`, { code: problem.code, field: problem.field ? fieldLabel(problem.field) : "", detail: problem.detail ?? "" });
  return (
    <>
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
                <strong>{row.code}</strong> {row.changes.map((change) => `${fieldLabel(change.field)}: ${change.from || "—"} → ${change.to || "—"}`).join("; ")}
              </li>
            ))}
          </ul>
        </>
      )}
      {Math.max(plan.creates.length, plan.updates.length) > LISTED_CHANGES && <p className="wbs-table-hint">{t("ui.wbsTable.listCut", { max: LISTED_CHANGES })}</p>}
    </>
  );
}
