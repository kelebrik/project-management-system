import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../api/client";
import { defaultSnapshotName, type PlanComparison, type PlanSnapshotSummary } from "../../app/planSnapshots";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useOpenFactRef } from "../../hooks/useOpenFactRef";
import { useI18n } from "../../i18n/I18nProvider";
import "../../styles/plan-snapshots.css";

const CURRENT = "current";

/**
 * Plan snapshots for committees: take a named copy of the plan, and compare
 * any snapshot with another one or with the plan today. A snapshot changes
 * neither the baseline nor the plan.
 */
export function PlanSnapshotsDrawer({
  projectId,
  canWrite,
  hasUnsavedEdits,
  onClose,
}: {
  projectId: string;
  canWrite: boolean;
  /** Whether structure edits are still waiting to be saved: a snapshot would miss them. */
  hasUnsavedEdits: () => boolean;
  onClose: () => void;
}) {
  const { t, formatters, labels } = useI18n();
  const openRef = useOpenFactRef();
  const containerRef = useFocusTrap<HTMLElement>(true, onClose);
  const [snapshots, setSnapshots] = useState<PlanSnapshotSummary[]>([]);
  const [name, setName] = useState(() => defaultSnapshotName(t("ui.snapshots.defaultName")));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(CURRENT);
  const [comparison, setComparison] = useState<PlanComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    apiClient
      .get<PlanSnapshotSummary[]>(`/api/projects/${projectId}/plan-snapshots`, t("ui.snapshots.failed"))
      .then((rows) => {
        setSnapshots(rows);
        setFrom((current) => current || rows[0]?.id || "");
      })
      .catch((failure) => setError(failure instanceof Error ? failure.message : t("ui.snapshots.failed")));
  }, [projectId, t]);
  useEffect(load, [load]);

  const take = async () => {
    // The snapshot reads the saved plan; edits still on their way would be missing from it for good.
    if (hasUnsavedEdits()) {
      setError(t("ui.snapshots.saveEditsFirst"));
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const created = await apiClient.post<PlanSnapshotSummary>(`/api/projects/${projectId}/plan-snapshots`, { name }, t("ui.snapshots.failed"));
      setNotice(t("ui.snapshots.taken", { name: created.name }));
      setFrom(created.id);
      setComparison(null);
      load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("ui.snapshots.failed"));
    } finally {
      setBusy(false);
    }
  };

  const compare = async () => {
    setBusy(true);
    setError("");
    setComparison(null);
    try {
      setComparison(
        await apiClient.get<PlanComparison>(`/api/projects/${projectId}/plan-snapshots/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, t("ui.snapshots.failed")),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("ui.snapshots.failed"));
    } finally {
      setBusy(false);
    }
  };

  const label = (snapshot: PlanSnapshotSummary) => `${snapshot.name} · ${formatters.date(snapshot.takenAt)}`;
  const days = (value: number | null) => (value ? formatters.signedDaysLabel(value) : "");
  const open = (item: { id: string; code: string }) => {
    onClose();
    openRef({ kind: "wbs", id: item.id, label: item.code });
  };

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose}>
      <aside aria-labelledby="plan-snapshots-title" aria-modal="true" className="side-drawer plan-snapshots-drawer" onClick={(event) => event.stopPropagation()} ref={containerRef} role="dialog" tabIndex={-1}>
        <div className="drawer-title">
          <h2 id="plan-snapshots-title">{t("ui.snapshots.title")}</h2>
          <button aria-label={t("ui.snapshots.close")} onClick={onClose} type="button">
            <X size={14} />
          </button>
        </div>
        <p className="plan-snapshots-intro">{t("ui.snapshots.intro")}</p>
        {canWrite && (
          <div className="plan-snapshots-row">
            <label>
              {t("ui.snapshots.name")}
              <input disabled={busy} maxLength={120} onChange={(event) => setName(event.target.value)} value={name} />
            </label>
            <button className="primary" disabled={busy || name.trim().length < 2} onClick={() => void take()} type="button">
              {t("ui.snapshots.take")}
            </button>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p className="automation-error" role="alert">
            {error}
          </p>
        )}
        {snapshots.length === 0 ? (
          <p className="plan-snapshots-empty">{t("ui.snapshots.none")}</p>
        ) : (
          <div className="plan-snapshots-row">
            <label>
              {t("ui.snapshots.from")}
              <select
                disabled={busy}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setComparison(null);
                }}
                value={from}
              >
                {snapshots.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>
                    {label(snapshot)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("ui.snapshots.to")}
              <select
                disabled={busy}
                onChange={(event) => {
                  setTo(event.target.value);
                  setComparison(null);
                }}
                value={to}
              >
                <option value={CURRENT}>{t("ui.snapshots.current")}</option>
                {snapshots.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>
                    {label(snapshot)}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy || !from || from === to} onClick={() => void compare()} type="button">
              {t("ui.snapshots.compare")}
            </button>
          </div>
        )}
        {comparison && (
          <section className="plan-comparison" aria-label={t("ui.snapshots.result")}>
            <p className="plan-comparison-summary">
              {t("ui.snapshots.summary", {
                moved: comparison.summary.moved,
                later: comparison.summary.later,
                earlier: comparison.summary.earlier,
                added: comparison.summary.added,
                removed: comparison.summary.removed,
              })}
            </p>
            {comparison.changes.length > 0 && (
              <table className="plan-comparison-table">
                <thead>
                  <tr>
                    <th>{t("ui.snapshots.row")}</th>
                    <th>{t("ui.snapshots.start")}</th>
                    <th>{t("ui.snapshots.due")}</th>
                    <th>{t("ui.snapshots.other")}</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.changes.map((change) => (
                    <tr className={change.checkpoint ? "checkpoint" : ""} key={change.id}>
                      <td>
                        <button className="link-button" onClick={() => open(change)} type="button">
                          {change.code} {change.title}
                        </button>
                      </td>
                      <td>
                        {change.from.startDate !== change.to.startDate && (
                          <>
                            {formatters.date(change.from.startDate)} → {formatters.date(change.to.startDate)} <strong>{days(change.startDays)}</strong>
                          </>
                        )}
                      </td>
                      <td>
                        {change.from.dueDate !== change.to.dueDate && (
                          <>
                            {formatters.date(change.from.dueDate)} → {formatters.date(change.to.dueDate)}{" "}
                            <strong className={(change.dueDays ?? 0) > 0 ? "late" : "early"}>{days(change.dueDays)}</strong>
                          </>
                        )}
                      </td>
                      <td>
                        {change.statusChanged && <div>{t("ui.snapshots.statusChange", { from: labels.wbsStatusLabel(change.from.status), to: labels.wbsStatusLabel(change.to.status) })}</div>}
                        {change.ownerChanged && <div>{t("ui.snapshots.ownerChange", { from: change.from.owner || "—", to: change.to.owner || "—" })}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {comparison.added.length > 0 && (
              <p>
                <strong>{t("ui.snapshots.added")}</strong> {comparison.added.map((item) => `${item.code} ${item.title}`).join("; ")}
              </p>
            )}
            {comparison.removed.length > 0 && (
              <p>
                <strong>{t("ui.snapshots.removed")}</strong> {comparison.removed.map((item) => `${item.code} ${item.title}`).join("; ")}
              </p>
            )}
          </section>
        )}
      </aside>
    </div>,
    document.body,
  );
}
