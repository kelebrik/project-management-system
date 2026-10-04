import { encodeJiraSlice, jiraAnalyticsSliceSchema } from "@pms/shared";
import { FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import { appPathForView } from "../../app/routes";
import { writeXlsx } from "../../app/tables/xlsx";
import { useI18n } from "../../i18n/I18nProvider";

type Line = { openIssues: number; inProgress: number; overdue: number; unassigned: number; openStoryPoints: number; createdInPeriod: number; resolvedInPeriod: number; oldestOpenDays: number | null; withoutAttributes: number };
type Row = Line & { projectId: string; projectCode: string; projectName: string; portfolio: string; lastSyncedAt: string | null; refreshedAt: string | null };
type Answer = { periodDays: number; projects: Row[]; total: Line; assigneeHints: string[] };

const COLUMNS: Array<{ key: keyof Line; label: "jiraPortfolio.open" | "jiraPortfolio.inProgress" | "jiraPortfolio.overdue" | "jiraPortfolio.unassigned" | "jiraPortfolio.points" | "jiraPortfolio.created" | "jiraPortfolio.resolved" | "jiraPortfolio.oldest" }> = [
  { key: "openIssues", label: "jiraPortfolio.open" },
  { key: "inProgress", label: "jiraPortfolio.inProgress" },
  { key: "overdue", label: "jiraPortfolio.overdue" },
  { key: "unassigned", label: "jiraPortfolio.unassigned" },
  { key: "openStoryPoints", label: "jiraPortfolio.points" },
  { key: "createdInPeriod", label: "jiraPortfolio.created" },
  { key: "resolvedInPeriod", label: "jiraPortfolio.resolved" },
  { key: "oldestOpenDays", label: "jiraPortfolio.oldest" },
];

/** The total of the shown lines: what the portfolio filters let through. */
function totalOf(rows: Row[]): Line {
  const total: Line = { openIssues: 0, inProgress: 0, overdue: 0, unassigned: 0, openStoryPoints: 0, createdInPeriod: 0, resolvedInPeriod: 0, oldestOpenDays: null, withoutAttributes: 0 };
  for (const row of rows) {
    for (const key of ["openIssues", "inProgress", "overdue", "unassigned", "openStoryPoints", "createdInPeriod", "resolvedInPeriod", "withoutAttributes"] as const) total[key] += row[key];
    if (row.oldestOpenDays !== null) total.oldestOpenDays = Math.max(total.oldestOpenDays ?? 0, row.oldestOpenDays);
  }
  return total;
}

/**
 * Jira work of the portfolio, a line per project with Jira connected, from the
 * projects' own data; the portfolio filters and an assignee choice narrow it.
 */
export function JiraPortfolioReport({ shownProjects }: { shownProjects: Set<string> | null }) {
  const { t, formatters } = useI18n();
  const [period, setPeriod] = useState(30);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [answer, setAnswer] = useState<{ key: string; data: Answer | null; error: string | null } | null>(null);
  const slice = assignees.length > 0 ? `&slice=${encodeJiraSlice(jiraAnalyticsSliceSchema.parse({ assignees }))}` : "";
  const key = `${period}${slice}`;

  useEffect(() => {
    let alive = true;
    apiClient
      .get<Answer>(`/api/reports/jira-portfolio?period=${period}${slice}`, t("jiraPortfolio.failed"))
      .then((data) => alive && setAnswer({ key, data, error: null }))
      .catch((error: unknown) => alive && setAnswer({ key, data: null, error: error instanceof Error ? error.message : t("jiraPortfolio.failed") }));
    return () => {
      alive = false;
    };
  }, [key, period, slice, t]);

  const data = answer?.key === key ? answer.data : null;
  const rows = (data?.projects ?? []).filter((row) => !shownProjects || shownProjects.has(row.projectId));
  const total = totalOf(rows);
  const value = (line: Line, column: keyof Line) => (column === "oldestOpenDays" ? (line.oldestOpenDays === null ? "—" : t("jiraPortfolio.days", { count: line.oldestOpenDays })) : column === "openStoryPoints" ? Math.round(line.openStoryPoints * 10) / 10 : line[column]);
  const fresh = (row: Row) => (row.refreshedAt ?? row.lastSyncedAt ? formatters.date((row.refreshedAt ?? row.lastSyncedAt)!.slice(0, 10)) : t("jiraPortfolio.never"));
  const exportXlsx = () => {
    const headers = [t("portfolio.col.project"), ...COLUMNS.map((column) => t(column.label)), t("jiraPortfolio.fresh")];
    const body = [...rows.map((row) => [`${row.projectCode} — ${row.projectName}`, ...COLUMNS.map((column) => String(value(row, column.key))), fresh(row)]), [t("jiraPortfolio.total"), ...COLUMNS.map((column) => String(value(total, column.key))), ""]];
    const blob = new Blob([writeXlsx({ headers, rows: body }, t("jiraPortfolio.tab")) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `jira-portfolio-${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="portfolio-report-table jira-portfolio">
      <div className="portfolio-report-tools">
        <div className="segmented-control" role="group" aria-label={t("portfolio.period")}>
          {[7, 30, 90].map((days) => <button aria-pressed={period === days} key={days} onClick={() => setPeriod(days)} type="button">{t("portfolio.days", { count: days })}</button>)}
        </div>
        <label>
          {t("jiraPortfolio.assignee")}
          <select onChange={(event) => setAssignees(event.target.value ? [event.target.value] : [])} value={assignees[0] ?? ""}>
            <option value="">{t("portfolio.all")}</option>
            {[...new Set([...assignees, ...(data?.assigneeHints ?? [])])].map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <button className="secondary-button" disabled={rows.length === 0} onClick={exportXlsx} type="button"><FileSpreadsheet size={15} /> {t("portfolio.excel")}</button>
      </div>
      {!data && !answer?.error && <p className="report-loading">{t("portfolio.loading")}</p>}
      {answer?.error && answer.key === key && <p className="form-error" role="alert">{answer.error}</p>}
      {data && rows.length === 0 && <p className="empty-state">{t("jiraPortfolio.none")}</p>}
      {data && rows.length > 0 && (
        <div className="portfolio-report-scroll">
          <table>
            <thead><tr><th>{t("portfolio.col.project")}</th>{COLUMNS.map((column) => <th key={column.key}>{t(column.label)}</th>)}<th>{t("jiraPortfolio.fresh")}</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.projectId}>
                  <td><a href={appPathForView("project-jira-work", row.projectCode)}>{row.projectCode}</a> {row.projectName}</td>
                  {COLUMNS.map((column) => <td className={column.key === "overdue" && row.overdue > 0 ? "late" : ""} key={column.key}>{value(row, column.key)}</td>)}
                  <td className={!row.lastSyncedAt ? "late" : ""}>{fresh(row)}{row.withoutAttributes > 0 ? ` · ${t("jiraPortfolio.withoutAttributes", { count: row.withoutAttributes })}` : ""}</td>
                </tr>
              ))}
              <tr className="jira-portfolio-total"><th>{t("jiraPortfolio.total")}</th>{COLUMNS.map((column) => <td key={column.key}><b>{value(total, column.key)}</b></td>)}<td /></tr>
            </tbody>
          </table>
          <p className="report-loading">{t("jiraPortfolio.note")}</p>
        </div>
      )}
    </div>
  );
}
