import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../api/client";
import { countWorkingDays, projectCalendarTest, type ProjectCalendarCode, type ProjectCalendarOverrideDay } from "../../app/projectCalendar";
import type { WorkloadProject } from "../../app/workloadModel";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useI18n } from "../../i18n/I18nProvider";
import type { NewWorkRequest } from "./useNewWorkSelection";

type Parent = { id: string; code: string; title: string; type: string; level: number; calendarCode: ProjectCalendarCode };
type Targets = { projectId: string; defaultCalendarCode: ProjectCalendarCode; parents: Parent[]; calendar: ProjectCalendarOverrideDay[] };
export type CreatedWork = { item: { id: string; code: string; title: string }; project: WorkloadProject };
const TOP = "__top__";

/**
 * A new piece of work for the days picked on the Workload page: who does it,
 * when, in which project and under which phase or work package. The working
 * days are counted in that project's calendar; dates on a day off move to the
 * nearest working day when the work is created.
 */
export function NewWorkDialog({
  request,
  projects,
  people,
  onClose,
  onCreated,
}: {
  request: NewWorkRequest;
  projects: WorkloadProject[];
  people: string[];
  onClose: () => void;
  onCreated: (created: CreatedWork) => void;
}) {
  const { t } = useI18n();
  const containerRef = useFocusTrap<HTMLElement>(true, onClose);
  const [owner, setOwner] = useState(request.owner);
  const [startDate, setStartDate] = useState(request.startDate);
  const [dueDate, setDueDate] = useState(request.dueDate);
  const [projectId, setProjectId] = useState(projects.length === 1 ? projects[0].id : "");
  const [targets, setTargets] = useState<Targets | null>(null);
  const [parentId, setParentId] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("TASK");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Read again when the dates change, so the calendar always covers them; the chosen parent stays.
  const datesValid = Boolean(startDate && dueDate && startDate <= dueDate);
  useEffect(() => {
    if (!projectId || !datesValid) return;
    let cancelled = false;
    apiClient
      .get<Targets>(`/api/workload/parents?projectId=${encodeURIComponent(projectId)}&from=${startDate}&to=${dueDate}`, t("ui.workload.newWorkFailed"))
      .then((answer) => {
        if (cancelled) return;
        setTargets(answer);
        setParentId((current) => (current === TOP || answer.parents.some((parent) => parent.id === current) ? current : answer.parents[0]?.id ?? TOP));
      })
      .catch((failure) => !cancelled && setError(failure instanceof Error ? failure.message : t("ui.workload.newWorkFailed")));
    return () => {
      cancelled = true;
    };
  }, [datesValid, dueDate, projectId, startDate, t]);

  const shownTargets = targets?.projectId === projectId ? targets : null;
  const calendarCode = shownTargets ? (shownTargets.parents.find((parent) => parent.id === parentId)?.calendarCode ?? shownTargets.defaultCalendarCode) : null;
  const isWorking = useMemo(() => (shownTargets && calendarCode ? projectCalendarTest(calendarCode, shownTargets.calendar) : null), [calendarCode, shownTargets]);
  const workingDays = isWorking && datesValid ? countWorkingDays(startDate, dueDate, isWorking) : null;
  const offDay = isWorking && datesValid && (!isWorking(startDate) || !isWorking(dueDate));

  const create = async () => {
    const project = projects.find((entry) => entry.id === projectId);
    if (!project) return;
    setBusy(true);
    setError("");
    try {
      const answer = await apiClient.post<{ item: CreatedWork["item"] }>(
        `/api/projects/${project.id}/wbs-items/append`,
        { parentId: parentId === TOP ? null : parentId, title: title.trim(), owner: owner.trim(), startDate, dueDate, type },
        t("ui.workload.newWorkFailed"),
      );
      onCreated({ item: answer.item, project });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("ui.workload.newWorkFailed"));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose}>
      <aside aria-labelledby="new-work-title" aria-modal="true" className="side-drawer workload-new-work" onClick={(event) => event.stopPropagation()} ref={containerRef} role="dialog" tabIndex={-1}>
        <div className="drawer-title">
          <h2 id="new-work-title">{t("ui.workload.newWorkTitle")}</h2>
          <button aria-label={t("ui.workload.dismiss")} onClick={onClose} type="button">
            <X size={14} />
          </button>
        </div>
        <label>
          {t("ui.workload.newWorkName")}
          <input autoFocus disabled={busy} maxLength={500} onChange={(event) => setTitle(event.target.value)} value={title} />
        </label>
        <label>
          {t("ui.workload.newWorkOwner")}
          <input disabled={busy} list="new-work-people" maxLength={200} onChange={(event) => setOwner(event.target.value)} value={owner} />
          <datalist id="new-work-people">
            {people.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <div className="workload-new-work-dates">
          <label>
            {t("ui.workload.newWorkStart")}
            <input disabled={busy} onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
          </label>
          <label>
            {t("ui.workload.newWorkEnd")}
            <input disabled={busy} onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} />
          </label>
        </div>
        <label>
          {t("ui.workload.newWorkProject")}
          <select disabled={busy} onChange={(event) => setProjectId(event.target.value)} value={projectId}>
            <option value="">{t("ui.workload.newWorkChooseProject")}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} — {project.name}
              </option>
            ))}
          </select>
        </label>
        {shownTargets && (
          <label>
            {t("ui.workload.newWorkParent")}
            <select disabled={busy} onChange={(event) => setParentId(event.target.value)} value={parentId}>
              {shownTargets.parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {" ".repeat(Math.max(0, parent.level - 1) * 2)}
                  {parent.code} {parent.title}
                </option>
              ))}
              <option value={TOP}>{t("ui.workload.newWorkTopLevel")}</option>
            </select>
          </label>
        )}
        <label>
          {t("ui.workload.newWorkType")}
          <select disabled={busy} onChange={(event) => setType(event.target.value)} value={type}>
            <option value="TASK">{t("ui.workload.newWorkTypeTask")}</option>
            <option value="WORK_PACKAGE">{t("ui.workload.newWorkTypePackage")}</option>
            <option value="DELIVERABLE">{t("ui.workload.newWorkTypeDeliverable")}</option>
          </select>
        </label>
        {workingDays !== null && calendarCode && (
          <p className="wbs-table-hint">{t("ui.workload.newWorkWorkingDays", { count: workingDays, calendar: calendarCode })}</p>
        )}
        {offDay && <p className="automation-warning">{t("ui.workload.newWorkOffDay")}</p>}
        {!datesValid && <p className="automation-warning">{t("ui.workload.newWorkDatesInvalid")}</p>}
        {error && (
          <p className="automation-error" role="alert">
            {error}
          </p>
        )}
        <div className="automation-actions">
          <button className="primary" disabled={busy || !title.trim() || !projectId || !shownTargets || !datesValid} onClick={() => void create()} type="button">
            {t("ui.workload.newWorkCreate")}
          </button>
          <button disabled={busy} onClick={onClose} type="button">
            {t("ui.workload.newWorkCancel")}
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
