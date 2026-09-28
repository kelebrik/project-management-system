import { useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import type { WorkloadItem, WorkloadProject } from "../../app/workloadModel";
import { workloadChange, workloadEditRights, type WorkloadChange } from "../../app/workloadPlanning";
import { appPathForView } from "../../app/routes";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useI18n } from "../../i18n/I18nProvider";

const EMPLOYEE_NAMES_LIST = "workload-employee-names";

/**
 * A piece of work opened from the workload: who does it and when, editable where
 * the planner allows it. It is also the keyboard way to change what a drag changes.
 */
export function WorkloadItemPanel({
  item,
  project,
  editableProjectIds,
  employeeNames,
  saving,
  onSave,
  onOpenStructure,
  onClose,
}: {
  item: WorkloadItem;
  project: WorkloadProject | undefined;
  editableProjectIds: ReadonlySet<string>;
  employeeNames: string[];
  saving: boolean;
  onSave: (change: WorkloadChange) => void;
  onOpenStructure: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  onClose: () => void;
}) {
  const { t, labels } = useI18n();
  const containerRef = useFocusTrap<HTMLElement>(true, onClose);
  const rights = workloadEditRights(item, editableProjectIds);
  const [owner, setOwner] = useState(item.owner);
  const [startDate, setStartDate] = useState(item.startDate);
  const [dueDate, setDueDate] = useState(item.dueDate);
  const change = workloadChange(item, {
    owner: rights.owner ? owner : undefined,
    startDate: rights.start ? startDate : undefined,
    dueDate: rights.end ? dueDate : undefined,
  });
  const datesValid = Boolean(startDate && dueDate && startDate <= dueDate);
  const ownerValid = !rights.owner || owner.trim().length > 0;
  const canSave = Boolean(change) && datesValid && ownerValid && !saving;
  const readOnlyNote =
    rights.reason === "access"
      ? t("ui.workload.readOnlyAccess")
      : rights.reason === "issue"
        ? t("ui.workload.readOnlyIssue")
        : rights.reason === "done"
          ? t("ui.workload.readOnlyDone")
          : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canSave && change) onSave(change);
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        aria-labelledby="workload-item-title"
        aria-modal="true"
        className="side-drawer workload-item-panel"
        onClick={(event) => event.stopPropagation()}
        ref={containerRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="drawer-title">
          <div>
            <h2 id="workload-item-title">
              {item.code} {item.title}
            </h2>
            <p>{project ? `${project.code} — ${project.name}` : ""}</p>
          </div>
          <button aria-label={t("ui.workload.closePanel")} onClick={onClose} type="button">
            x
          </button>
        </div>
        <form className="stack-form" onSubmit={submit}>
          <p className="workload-item-status">
            {t("ui.workload.status")}: {labels.wbsStatusLabel(item.status)}
          </p>
          {readOnlyNote && (
            <p className="workload-item-note" role="note">
              {readOnlyNote}
            </p>
          )}
          <label>
            {t("ui.workload.owner")}
            <input
              disabled={!rights.owner}
              list={EMPLOYEE_NAMES_LIST}
              onChange={(event) => setOwner(event.target.value)}
              value={owner}
            />
          </label>
          <datalist id={EMPLOYEE_NAMES_LIST}>
            {employeeNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <div className="workload-item-dates">
            <label>
              {t("ui.workload.start")}
              <input
                disabled={!rights.start}
                max={dueDate || undefined}
                onChange={(event) => setStartDate(event.target.value)}
                required
                type="date"
                value={startDate}
              />
            </label>
            <label>
              {t("ui.workload.finish")}
              <input
                disabled={!rights.end}
                min={startDate || undefined}
                onChange={(event) => setDueDate(event.target.value)}
                required
                type="date"
                value={dueDate}
              />
            </label>
          </div>
          {rights.reason === null && item.startLocked && <p className="workload-item-note">{t("ui.workload.startLocked")}</p>}
          {rights.reason === null && item.finishLocked && <p className="workload-item-note">{t("ui.workload.finishLocked")}</p>}
          {!datesValid && <p className="workload-item-error" role="alert">{t("ui.workload.datesInvalid")}</p>}
          <div className="workload-item-actions">
            <a
              href={`${appPathForView("project-structure", project?.code ?? null)}?focusWbs=${encodeURIComponent(item.id)}`}
              onClick={onOpenStructure}
            >
              {t("ui.workload.openInStructure")}
            </a>
            <span>
              <button onClick={onClose} type="button">
                {rights.reason === null ? t("ui.workload.cancel") : t("ui.workload.closePanel")}
              </button>
              {rights.reason === null && (
                <button className="primary" disabled={!canSave} type="submit">
                  {saving ? t("ui.workload.saving") : t("ui.workload.save")}
                </button>
              )}
            </span>
          </div>
        </form>
      </aside>
    </div>
  );
}
