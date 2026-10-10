import { History } from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { apiClient } from "../api/client";
import { appPathForView } from "../app/routes";
import { useI18n } from "../i18n/I18nProvider";
import type { SimpleTranslationKey } from "../i18n/types";
import { usePageContext } from "./PageContext";

type Row = Record<string, unknown> & { id: string };
type Provenance = "daily" | "partial" | "reconstructed" | "unknown" | "unavailable";
type Comparison = { added: Row[]; removed: Row[]; changed: Array<{ id: string; label: string; fields: Array<{ field: string; then: unknown; now: unknown }> }> };
type Section<T> = { provenance: Provenance; note: string | null; unknown: number; data: T | null; compare: Comparison | null };
type HistoryResult = {
  date: string;
  firstCapturedDay: string | null;
  structure: Section<{ rows: Row[]; dependencies: Row[] }> & { dependencies: { added: number; removed: number } | null };
  raid: Section<Row[]>;
  issues: Section<Row[]>;
  project: Section<Row>;
};
type HistoryDay = { day: string; changes: number; captured: boolean; partial: boolean; unavailable: boolean };
type Tab = "structure" | "raid" | "issues" | "project";

const PROVENANCE_KEYS: Record<Provenance, SimpleTranslationKey> = {
  daily: "ui.history.provenance.daily",
  partial: "ui.history.provenance.partial",
  reconstructed: "ui.history.provenance.reconstructed",
  unknown: "ui.history.provenance.unknown",
  unavailable: "ui.history.provenance.unavailable",
};
const HINT_KEYS: Record<Provenance, SimpleTranslationKey> = {
  daily: "ui.history.hint.daily",
  partial: "ui.history.hint.partial",
  reconstructed: "ui.history.hint.reconstructed",
  unknown: "ui.history.hint.unknown",
  unavailable: "ui.history.hint.unavailable",
};

function moscowToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function dayBefore(day: string) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * The project's time machine: how it stood at the end of a chosen day and
 * what has changed since, section by section, each saying how exact it is.
 */
export function ProjectHistoryPage() {
  const { t, formatters, labels } = useI18n();
  const ctx = usePageContext();
  const project = ctx.project as { id: string; code: string };
  const [date, setDate] = useState(() => dayBefore(moscowToday()));
  const [days, setDays] = useState<HistoryDay[]>([]);
  const [history, setHistory] = useState<HistoryResult | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("structure");

  useEffect(() => {
    let alive = true;
    apiClient.get<{ days: HistoryDay[] }>(`/api/projects/${project.id}/history/days`, t("ui.history.failed"))
      .then((result) => alive && setDays(result.days))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [project.id, t]);

  useEffect(() => {
    let alive = true;
    apiClient.get<HistoryResult>(`/api/projects/${project.id}/history?date=${date}`, t("ui.history.failed"))
      .then((result) => {
        if (!alive) return;
        setHistory(result);
        setError("");
      })
      .catch((failure) => alive && setError(failure instanceof Error ? failure.message : t("ui.history.failed")));
    return () => {
      alive = false;
    };
  }, [date, project.id, t]);

  const recentDays = useMemo(() => [...days].reverse().slice(0, 30), [days]);
  const value = (field: string, raw: unknown) => {
    if (raw === null || raw === undefined || raw === "") return "—";
    if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw)) return formatters.date(raw.slice(0, 10));
    if (field === "status" && typeof raw === "string") return tab === "structure" ? labels.wbsStatusLabel(raw as never) : tab === "raid" ? labels.raidStatusLabel(raw as never) : raw;
    if (typeof raw === "boolean") return raw ? "✓" : "—";
    return String(raw);
  };
  const openRow = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    const url = new URL(event.currentTarget.href);
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
    ctx.openView("project-structure");
  };

  const section = history ? (tab === "structure" ? history.structure : tab === "raid" ? history.raid : tab === "issues" ? history.issues : history.project) : null;
  const rowsThen: Row[] = !history ? [] : tab === "structure" ? history.structure.data?.rows ?? [] : tab === "raid" ? history.raid.data ?? [] : tab === "issues" ? history.issues.data ?? [] : [];
  const changedIds = new Map((section?.compare?.changed ?? []).map((change) => [change.id, change]));
  const removedIds = new Set((section?.compare?.removed ?? []).map((row) => row.id));
  const count = (item: Section<unknown> | undefined) => (item?.compare ? item.compare.changed.length + item.compare.added.length + item.compare.removed.length : null);

  return (
    <section className="project-history-page">
      <header className="project-history-header">
        <div>
          <h2><History aria-hidden="true" size={20} /> {t("ui.history.title")}</h2>
          <p>{t("ui.history.subtitle")}</p>
        </div>
        <label>
          <span>{t("ui.history.date")}</span>
          <input type="date" value={date} max={moscowToday()} onChange={(event) => event.target.value && setDate(event.target.value)} />
        </label>
      </header>
      {recentDays.length > 0 && (
        <div className="project-history-days" role="group" aria-label={t("ui.history.daysWithChanges")}>
          {recentDays.map((day) => (
            <button
              key={day.day}
              type="button"
              className={`${day.day === date ? "active" : ""} ${day.captured ? "captured" : ""}`}
              aria-pressed={day.day === date}
              onClick={() => setDate(day.day)}
              title={day.changes > 0 ? `${day.changes}` : undefined}
            >
              {formatters.date(day.day)}
            </button>
          ))}
        </div>
      )}
      {error && <p className="automation-error" role="alert">{error}</p>}
      {!history && !error && <p className="jira-analytics-empty">{t("ui.history.loading")}</p>}
      {history && (
        <>
          <p className="project-history-coverage">{history.firstCapturedDay ? t("ui.history.firstCaptured", { day: formatters.date(history.firstCapturedDay) }) : t("ui.history.noCaptures")}</p>
          <div className="project-history-tabs" role="tablist">
            {(["structure", "raid", "issues", "project"] as Tab[]).map((key) => {
              const item = history[key] as Section<unknown>;
              const changes = count(item);
              return (
                <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
                  <span>{t(`ui.history.tab.${key}`)}</span>
                  <small className={`project-history-provenance is-${item.provenance}`}>{t(PROVENANCE_KEYS[item.provenance])}</small>
                  {changes !== null && <b>{changes}</b>}
                </button>
              );
            })}
          </div>
          {section && (
            <div className="project-history-section" role="tabpanel">
              <p className={`project-history-hint is-${section.provenance}`}>
                {t(HINT_KEYS[section.provenance])}
                {section.note === "issueLinksNotCovered" ? ` ${t("ui.history.hint.issueLinksNotCovered")}` : ""}
                {section.unknown > 0 ? ` ${t("ui.history.unknownRows", { count: section.unknown })}` : ""}
              </p>
              {tab === "structure" && history.structure.dependencies && (
                <p className="project-history-hint">{t("ui.history.links", history.structure.dependencies)}</p>
              )}
              {section.compare && section.compare.changed.length === 0 && section.compare.added.length === 0 && section.compare.removed.length === 0 && (
                <p className="jira-analytics-empty">{t("ui.history.nothingChanged")}</p>
              )}
              {tab === "project" && history.project.data && (
                <table className="project-history-table">
                  <thead><tr><th>{t("ui.history.field")}</th><th>{t("ui.history.then")}</th><th>{t("ui.history.now")}</th></tr></thead>
                  <tbody>
                    {(history.project.compare?.changed[0]?.fields ?? []).map((field) => (
                      <tr key={field.field} className="is-changed"><td>{labels.auditFieldLabel(field.field)}</td><td>{value(field.field, field.then)}</td><td>{value(field.field, field.now)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              {tab !== "project" && rowsThen.length > 0 && (
                <table className="project-history-table">
                  <thead>
                    <tr>
                      {tab === "structure" && <th>{t("fields.code")}</th>}
                      <th>{t("fields.title")}</th>
                      <th>{t("fields.status")}</th>
                      <th>{t("ui.history.changed")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsThen.map((row) => {
                      const change = changedIds.get(row.id);
                      const removed = removedIds.has(row.id);
                      return (
                        <tr key={row.id} className={removed ? "is-removed" : change ? "is-changed" : ""}>
                          {tab === "structure" && <td>{String(row.code ?? "")}</td>}
                          <td>
                            {tab === "structure" && !removed ? (
                              <a href={`${appPathForView("project-structure", project.code)}?focusWbs=${encodeURIComponent(row.id)}`} onClick={openRow} title={t("ui.history.openCurrent")}>{String(row.title ?? "")}</a>
                            ) : String(row.title ?? "")}
                          </td>
                          <td>{value("status", row.status)}</td>
                          <td>
                            {removed ? t("ui.history.removed") : change ? change.fields.map((field) => `${labels.auditFieldLabel(field.field)}: ${value(field.field, field.then)} → ${value(field.field, field.now)}`).join("; ") : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {tab !== "project" && section.provenance !== "unknown" && section.provenance !== "unavailable" && rowsThen.length === 0 && <p className="jira-analytics-empty">{t("ui.history.empty")}</p>}
              {section.compare && section.compare.added.length > 0 && tab !== "project" && (
                <div className="project-history-added">
                  <h3>{t("ui.history.added")}</h3>
                  <ul>{section.compare.added.map((row) => <li key={row.id}>{[row.code, row.title].filter(Boolean).join(" ")}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
