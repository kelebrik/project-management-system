import { FileSpreadsheet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api/client";
import { writeXlsx } from "../../app/tables/xlsx";
import type { TableDocument } from "../../app/tables/tableDocument";
import { createDomainLabels } from "../../i18n/domainLabels";
import { useI18n } from "../../i18n/I18nProvider";
import type { SimpleTranslationKey } from "../../i18n/types";

export type PortfolioView = "summary" | "shifts" | "upcoming" | "risks";

type ProjectRef = { projectId: string; projectCode: string; projectName: string };
type Report = {
  summary: Array<{
    projectId: string; projectCode: string; projectName: string; businessUnit: string; portfolio: string; projectManager: string;
    status: "DRAFT" | "ACTIVE" | "ON_HOLD" | "CLOSED"; rag: "GREEN" | "AMBER" | "RED"; startTargetDate: string | null; targetDate: string | null; targetShiftDays: number;
    nextCheckpoint: { code: string; title: string; plannedDate: string | null; forecastDate: string | null } | null;
    redRisks: number; overdueWork: number;
    lastShift: { checkpointTitle: string; deltaDays: number | null; reasonCategory: string | null; reasonText: string | null; at: string } | null;
  }>;
  shifts: Array<ProjectRef & { id: string; checkpointCode: string; checkpointTitle: string; previousDate: string | null; newDate: string | null; deltaDays: number | null; actorName: string | null; reasonCategory: string | null; reasonText: string | null; at: string }>;
  upcoming: Array<ProjectRef & { id: string; code: string; title: string; plannedDate: string | null; forecastDate: string | null; slipDays: number | null }>;
  risks: Array<ProjectRef & { id: string; title: string; owner: string; riskScore: number; dueDate: string | null }>;
  decisions: Array<ProjectRef & { id: string; title: string; approverName: string | null; waitingDays: number }>;
};

type Column<Row> = { label: SimpleTranslationKey; value: (row: Row) => string | number; tone?: (row: Row) => string };

function DataTable<Row extends { id?: string; projectId: string }>({ columns, rows, sheet, file }: { columns: Array<Column<Row>>; rows: Row[]; sheet: string; file: string }) {
  const { t } = useI18n();
  const exportXlsx = () => {
    const table: TableDocument = { headers: columns.map((column) => t(column.label)), rows: rows.map((row) => columns.map((column) => String(column.value(row)))) };
    const blob = new Blob([writeXlsx(table, sheet) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${file}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="portfolio-report-table">
      <div className="portfolio-report-tools">
        <button className="secondary-button" disabled={rows.length === 0} onClick={exportXlsx} type="button">
          <FileSpreadsheet size={15} /> {t("portfolio.excel")}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="empty-state">{t("portfolio.empty")}</p>
      ) : (
        <div className="portfolio-report-scroll">
          <table>
            <thead>
              <tr>{columns.map((column) => <th key={column.label}>{t(column.label)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id ?? `${row.projectId}-${index}`}>
                  {columns.map((column) => (
                    <td className={column.tone?.(row) ?? ""} key={column.label}>{column.value(row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Reports across projects: a portfolio summary, milestone shifts of a period,
 * checkpoints due within a horizon, red risks and waiting decisions. One
 * request answers all four; each table goes to Excel as shown.
 */
export function PortfolioReports({ view }: { view: PortfolioView }) {
  const { t, locale, formatters } = useI18n();
  const labels = useMemo(() => createDomainLabels(locale), [locale]);
  const [period, setPeriod] = useState(30);
  const [horizon, setHorizon] = useState(28);
  const [answer, setAnswer] = useState<{ key: string; report: Report | null; error: string | null } | null>(null);
  const [filters, setFilters] = useState({ unit: "", portfolio: "", manager: "" });
  const requestKey = `${period}:${horizon}`;

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<Report>(`/api/reports/portfolio?period=${period}&horizon=${horizon}`, t("portfolio.loadError"))
      .then((report) => !cancelled && setAnswer({ key: `${period}:${horizon}`, report, error: null }))
      .catch((error: unknown) => !cancelled && setAnswer({ key: `${period}:${horizon}`, report: null, error: error instanceof Error ? error.message : t("portfolio.loadError") }));
    return () => {
      cancelled = true;
    };
  }, [horizon, period, t]);

  const date = (value: string | null) => (value ? formatters.date(value) : "—");
  const project = (row: ProjectRef) => `${row.projectCode} — ${row.projectName}`;
  const signed = (value: number | null) => (value === null ? "—" : value > 0 ? `+${value}` : String(value));
  const reason = (category: string | null, text: string | null) =>
    [category ? t(`ui.shifts.reason.${category}` as SimpleTranslationKey) : "", text ?? ""].filter(Boolean).join(": ") || t("portfolio.noReason");
  const report = answer?.key === requestKey ? answer.report : null;
  const loading = answer?.key !== requestKey;
  const summary = (report?.summary ?? []).filter(
    (row) => (!filters.unit || row.businessUnit === filters.unit) && (!filters.portfolio || row.portfolio === filters.portfolio) && (!filters.manager || row.projectManager === filters.manager),
  );
  const options = (pick: (row: Report["summary"][number]) => string) => [...new Set((report?.summary ?? []).map(pick).filter(Boolean))].sort();
  // The filters apply to every tab: a row belongs to a project of the filtered summary.
  const shown = new Set(summary.map((row) => row.projectId));
  const inFilter = <Row extends { projectId: string }>(rows: Row[] | undefined) => (rows ?? []).filter((row) => shown.has(row.projectId));

  return (
    <section className="portfolio-reports" aria-busy={loading}>
      <div className="portfolio-report-controls">
        {view === "shifts" && (
          <div className="segmented-control" role="group" aria-label={t("portfolio.period")}>
            {[7, 30, 90].map((days) => (
              <button aria-pressed={period === days} key={days} onClick={() => setPeriod(days)} type="button">{t("portfolio.days", { count: days })}</button>
            ))}
          </div>
        )}
        {view === "upcoming" && (
          <div className="segmented-control" role="group" aria-label={t("portfolio.horizon")}>
            {[14, 28, 56].map((days) => (
              <button aria-pressed={horizon === days} key={days} onClick={() => setHorizon(days)} type="button">{t("portfolio.weeks", { count: days / 7 })}</button>
            ))}
          </div>
        )}
        {([["unit", "portfolio.filterUnit", (row) => row.businessUnit], ["portfolio", "portfolio.filterPortfolio", (row) => row.portfolio], ["manager", "portfolio.filterManager", (row) => row.projectManager]] as const).map(([key, label, pick]) => (
          <label key={key}>
            {t(label)}
            <select value={filters[key]} onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))}>
              <option value="">{t("portfolio.all")}</option>
              {options(pick).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        ))}
      </div>
      {loading && <p className="report-loading">{t("portfolio.loading")}</p>}
      {answer?.error && !loading && <p className="form-error" role="alert">{answer.error}</p>}
      {report && view === "summary" && (
        <DataTable<Report["summary"][number]>
          file="portfolio-summary"
          sheet={t("portfolio.tab.summary")}
          rows={summary}
          columns={[
            { label: "portfolio.col.project", value: project },
            { label: "portfolio.col.manager", value: (row) => row.projectManager },
            { label: "portfolio.col.status", value: (row) => labels.projectStatusLabel(row.status) },
            { label: "portfolio.col.rag", value: (row) => labels.projectHealthLabel(row.rag), tone: (row) => `rag-${row.rag.toLowerCase()}` },
            { label: "portfolio.col.startTarget", value: (row) => date(row.startTargetDate) },
            { label: "portfolio.col.target", value: (row) => date(row.targetDate) },
            { label: "portfolio.col.targetShift", value: (row) => signed(row.targetShiftDays), tone: (row) => (row.targetShiftDays > 0 ? "late" : "") },
            { label: "portfolio.col.next", value: (row) => (row.nextCheckpoint ? `${row.nextCheckpoint.code} ${row.nextCheckpoint.title}` : "—") },
            { label: "portfolio.col.forecast", value: (row) => date(row.nextCheckpoint?.forecastDate ?? null) },
            { label: "portfolio.col.redRisks", value: (row) => row.redRisks, tone: (row) => (row.redRisks > 0 ? "late" : "") },
            { label: "portfolio.col.overdue", value: (row) => row.overdueWork, tone: (row) => (row.overdueWork > 0 ? "late" : "") },
            { label: "portfolio.col.lastShift", value: (row) => (row.lastShift ? `${row.lastShift.checkpointTitle} ${signed(row.lastShift.deltaDays)} (${date(row.lastShift.at)})` : "—") },
            { label: "portfolio.col.reason", value: (row) => (row.lastShift ? reason(row.lastShift.reasonCategory, row.lastShift.reasonText) : "—") },
          ]}
        />
      )}
      {report && view === "shifts" && (
        <DataTable<Report["shifts"][number]>
          file="milestone-shifts"
          sheet={t("portfolio.tab.shifts")}
          rows={inFilter(report.shifts)}
          columns={[
            { label: "portfolio.col.when", value: (row) => date(row.at) },
            { label: "portfolio.col.project", value: project },
            { label: "portfolio.col.checkpoint", value: (row) => `${row.checkpointCode} ${row.checkpointTitle}` },
            { label: "portfolio.col.from", value: (row) => date(row.previousDate) },
            { label: "portfolio.col.to", value: (row) => date(row.newDate) },
            { label: "portfolio.col.delta", value: (row) => signed(row.deltaDays), tone: (row) => ((row.deltaDays ?? 0) > 0 ? "late" : "") },
            { label: "portfolio.col.reason", value: (row) => reason(row.reasonCategory, row.reasonText) },
            { label: "portfolio.col.by", value: (row) => row.actorName ?? "—" },
          ]}
        />
      )}
      {report && view === "upcoming" && (
        <DataTable<Report["upcoming"][number]>
          file="upcoming-milestones"
          sheet={t("portfolio.tab.upcoming")}
          rows={inFilter(report.upcoming)}
          columns={[
            { label: "portfolio.col.forecast", value: (row) => date(row.forecastDate) },
            { label: "portfolio.col.project", value: project },
            { label: "portfolio.col.checkpoint", value: (row) => `${row.code} ${row.title}` },
            { label: "portfolio.col.planned", value: (row) => date(row.plannedDate) },
            { label: "portfolio.col.slip", value: (row) => signed(row.slipDays), tone: (row) => ((row.slipDays ?? 0) > 0 ? "late" : "") },
          ]}
        />
      )}
      {report && view === "risks" && (
        <>
          <h3>{t("portfolio.risksTitle")}</h3>
          <DataTable<Report["risks"][number]>
            file="red-risks"
            sheet={t("portfolio.risksTitle")}
            rows={inFilter(report.risks)}
            columns={[
              { label: "portfolio.col.project", value: project },
              { label: "portfolio.col.title", value: (row) => row.title },
              { label: "portfolio.col.owner", value: (row) => row.owner || "—" },
              { label: "portfolio.col.score", value: (row) => row.riskScore },
              { label: "portfolio.col.due", value: (row) => date(row.dueDate) },
            ]}
          />
          <h3>{t("portfolio.decisionsTitle")}</h3>
          <DataTable<Report["decisions"][number]>
            file="waiting-decisions"
            sheet={t("portfolio.decisionsTitle")}
            rows={inFilter(report.decisions)}
            columns={[
              { label: "portfolio.col.project", value: project },
              { label: "portfolio.col.title", value: (row) => row.title },
              { label: "portfolio.col.approver", value: (row) => row.approverName ?? "—" },
              { label: "portfolio.col.waiting", value: (row) => row.waitingDays, tone: (row) => (row.waitingDays > 7 ? "late" : "") },
            ]}
          />
        </>
      )}
    </section>
  );
}
