import { Trash2, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../api/client";
import type { AllocationLoad, WorkloadAllocation } from "../../app/workloadAllocations";
import type { WorkloadProject } from "../../app/workloadModel";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useI18n } from "../../i18n/I18nProvider";

type Draft = { id: string | null; projectId: string; percent: string; startsOn: string; endsOn: string };

const toDraft = (allocation: WorkloadAllocation): Draft => ({
  id: allocation.id,
  projectId: allocation.project?.id ?? "",
  percent: String(allocation.percent),
  startsOn: allocation.startsOn,
  endsOn: allocation.endsOn ?? "",
});

/**
 * A person's shares in projects over the shown period and their capacity.
 * A share is changed by whoever may change its project; shares on projects
 * the user may not read are only summed. The capacity is set by an
 * administrator. Each change is saved on its own and the page reloads.
 */
export function AllocationsDialog({
  person,
  allocations,
  capacityPercent,
  canEditCapacity,
  load,
  projects,
  today,
  onClose,
  onChanged,
}: {
  person: { id: string; name: string };
  allocations: WorkloadAllocation[];
  capacityPercent: number;
  canEditCapacity: boolean;
  load: AllocationLoad;
  /** Projects the user may change: a new share goes on one of them. */
  projects: WorkloadProject[];
  today: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const containerRef = useFocusTrap<HTMLElement>(true, onClose);
  const [drafts, setDrafts] = useState<Draft[]>(() => allocations.filter((allocation) => allocation.editable).map(toDraft));
  const [capacity, setCapacity] = useState(String(capacityPercent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const readOnly = allocations.filter((allocation) => !allocation.editable);
  const hidden = readOnly.filter((allocation) => !allocation.project);
  // Shares on projects the user may not read come only as one sum: the highest it reaches in the shown period.
  const hiddenNow = load.hiddenPeak;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("ui.workload.share.failed"));
    } finally {
      setBusy(false);
    }
  };
  const save = (draft: Draft) =>
    run(() =>
      apiClient.put(
        "/api/workload/allocations",
        { ...(draft.id ? { id: draft.id } : {}), employeeId: person.id, projectId: draft.projectId, percent: Number(draft.percent), startsOn: draft.startsOn, endsOn: draft.endsOn || null },
        t("ui.workload.share.failed"),
      ),
    );
  const remove = (draft: Draft) => (draft.id ? run(() => apiClient.delete(`/api/workload/allocations/${encodeURIComponent(draft.id!)}`, t("ui.workload.share.failed"))) : setDrafts((current) => current.filter((entry) => entry !== draft)));
  const change = (draft: Draft, patch: Partial<Draft>) => setDrafts((current) => current.map((entry) => (entry === draft ? { ...entry, ...patch } : entry)));
  const valid = (draft: Draft) => {
    const percent = Number(draft.percent);
    return Boolean(draft.projectId && Number.isInteger(percent) && percent >= 1 && percent <= 100 && draft.startsOn && (!draft.endsOn || draft.endsOn >= draft.startsOn));
  };
  const capacityValue = Number(capacity);
  const capacityValid = Number.isInteger(capacityValue) && capacityValue >= 0 && capacityValue <= 100;

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose}>
      <aside aria-labelledby="workload-shares-title" aria-modal="true" className="side-drawer workload-shares" onClick={(event) => event.stopPropagation()} ref={containerRef} role="dialog" tabIndex={-1}>
        <div className="drawer-title">
          <h2 id="workload-shares-title">{t("ui.workload.share.title", { name: person.name })}</h2>
          <button aria-label={t("ui.workload.dismiss")} onClick={onClose} type="button">
            <X size={14} />
          </button>
        </div>
        <p className="wbs-table-hint">{t("ui.workload.share.hint")}</p>
        <p className={load.overloadDays > 0 ? "automation-warning" : "wbs-table-hint"}>
          {load.overloadDays > 0
            ? t("ui.workload.share.overloaded", { peak: load.peak, capacity: capacityPercent, days: load.overloadDays })
            : t("ui.workload.share.fits", { peak: load.peak, capacity: capacityPercent })}
        </p>
        <div className="workload-capacity">
          <label>
            {t("ui.workload.share.capacity")}
            <input disabled={busy || !canEditCapacity} max={100} min={0} onChange={(event) => setCapacity(event.target.value)} type="number" value={capacity} />
          </label>
          {canEditCapacity && (
            <button disabled={busy || !capacityValid || capacityValue === capacityPercent} onClick={() => void run(() => apiClient.patch(`/api/workload/employees/${encodeURIComponent(person.id)}/capacity`, { capacityPercent: capacityValue }, t("ui.workload.share.failed")))} type="button">
              {t("ui.workload.share.save")}
            </button>
          )}
        </div>
        <table className="workload-shares-table">
          <thead>
            <tr>
              <th>{t("ui.workload.share.project")}</th>
              <th>{t("ui.workload.share.percent")}</th>
              <th>{t("ui.workload.share.from")}</th>
              <th>{t("ui.workload.share.to")}</th>
              <th aria-label={t("ui.workload.share.actions")} />
            </tr>
          </thead>
          <tbody>
            {readOnly
              .filter((allocation) => allocation.project)
              .map((allocation, index) => (
                <tr className="read-only" key={`ro-${index}`}>
                  <td>{allocation.project!.code}</td>
                  <td>{allocation.percent}</td>
                  <td>{allocation.startsOn}</td>
                  <td>{allocation.endsOn ?? "—"}</td>
                  <td />
                </tr>
              ))}
            {hidden.length > 0 && (
              <tr className="read-only">
                <td>{t("ui.workload.share.otherProjects")}</td>
                <td>{hiddenNow}</td>
                <td colSpan={3}>{t("ui.workload.share.otherProjectsHint")}</td>
              </tr>
            )}
            {drafts.map((draft, index) => (
              <tr key={draft.id ?? `new-${index}`}>
                <td>
                  <select aria-label={t("ui.workload.share.project")} disabled={busy} onChange={(event) => change(draft, { projectId: event.target.value })} value={draft.projectId}>
                    <option value="">{t("ui.workload.newWorkChooseProject")}</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.code}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input aria-label={t("ui.workload.share.percent")} disabled={busy} max={100} min={1} onChange={(event) => change(draft, { percent: event.target.value })} type="number" value={draft.percent} />
                </td>
                <td>
                  <input aria-label={t("ui.workload.share.from")} disabled={busy} onChange={(event) => change(draft, { startsOn: event.target.value })} type="date" value={draft.startsOn} />
                </td>
                <td>
                  <input aria-label={t("ui.workload.share.to")} disabled={busy} onChange={(event) => change(draft, { endsOn: event.target.value })} type="date" value={draft.endsOn} />
                </td>
                <td className="workload-shares-actions">
                  <button disabled={busy || !valid(draft)} onClick={() => void save(draft)} type="button">
                    {t("ui.workload.share.save")}
                  </button>
                  <button aria-label={t("ui.workload.share.remove")} disabled={busy} onClick={() => void remove(draft)} title={t("ui.workload.share.remove")} type="button">
                    <Trash2 aria-hidden="true" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {projects.length > 0 && (
          <button disabled={busy} onClick={() => setDrafts((current) => [...current, { id: null, projectId: projects.length === 1 ? projects[0].id : "", percent: "50", startsOn: today, endsOn: "" }])} type="button">
            {t("ui.workload.share.add")}
          </button>
        )}
        {error && (
          <p className="automation-error" role="alert">
            {error}
          </p>
        )}
      </aside>
    </div>,
    document.body,
  );
}
