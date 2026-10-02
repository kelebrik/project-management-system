import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import type { SavedView } from "../../app/domainTypes";
import { PLANNER_LIMITS, type WorkloadPlannerConfig } from "../../app/workloadPlanners";
import { useI18n } from "../../i18n/I18nProvider";

/**
 * Saved planners of the Workload page: a named set of people, projects and
 * filters. Anyone signed in keeps their own and may show one to everybody;
 * only its author (or an administrator) changes or deletes it.
 */
export function WorkloadPlanners({
  current,
  currentUser,
  onApply,
}: {
  current: WorkloadPlannerConfig;
  currentUser: { id: string; role: string } | null;
  onApply: (config: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const [planners, setPlanners] = useState<SavedView[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    if (!currentUser) return;
    apiClient
      .get<SavedView[]>("/api/saved-views?viewType=workload")
      .then((views) => setPlanners(views.filter((view) => view.viewType === "workload" && !view.projectId)))
      .catch(() => undefined);
  }, [currentUser]);
  useEffect(load, [load]);

  if (!currentUser) return null;
  const selected = planners.find((planner) => planner.id === selectedId) ?? null;
  const mine = (planner: SavedView) => planner.ownerId === currentUser.id || currentUser.role === "ADMIN";

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setMessage("");
    try {
      setMessage(await action());
      load();
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : t("ui.workload.plannerFailed"));
    } finally {
      setBusy(false);
    }
  };
  const apply = (id: string) => {
    setSelectedId(id);
    const planner = planners.find((entry) => entry.id === id);
    if (!planner) return;
    onApply(planner.config);
    void apiClient.post(`/api/saved-views/${planner.id}/use`, {}).catch(() => undefined);
  };
  const saveAs = () =>
    run(async () => {
      const created = await apiClient.post<SavedView>("/api/saved-views", { viewType: "workload", projectId: null, name: name.trim(), config: current, isShared: shared }, t("ui.workload.plannerFailed"));
      setSelectedId(created.id);
      setName("");
      return t("ui.workload.plannerSaved", { name: created.name });
    });
  const update = () =>
    run(async () => {
      await apiClient.patch(`/api/saved-views/${selected!.id}`, { config: current }, t("ui.workload.plannerFailed"));
      return t("ui.workload.plannerUpdated", { name: selected!.name });
    });
  const remove = () =>
    run(async () => {
      await apiClient.delete(`/api/saved-views/${selected!.id}`, t("ui.workload.plannerFailed"));
      setSelectedId("");
      return t("ui.workload.plannerDeleted", { name: selected!.name });
    });

  return (
    <details className="leave-departments workload-planners">
      <summary>{selected ? t("ui.workload.plannerCurrent", { name: selected.name }) : t("ui.workload.planners")}</summary>
      <div>
        <label>
          {t("ui.workload.plannerChoose")}
          <select disabled={busy} onChange={(event) => apply(event.target.value)} value={selectedId}>
            <option value="">{t("ui.workload.plannerNone")}</option>
            {planners.map((planner) => (
              <option key={planner.id} value={planner.id}>
                {planner.name}
                {planner.isShared ? ` · ${t("ui.workload.plannerShared")}` : ""}
              </option>
            ))}
          </select>
        </label>
        {selected && mine(selected) && (
          <div className="workload-planner-actions">
            <button disabled={busy} onClick={() => void update()} type="button">
              {t("ui.workload.plannerUpdate")}
            </button>
            <button disabled={busy} onClick={() => void remove()} type="button">
              {t("ui.workload.plannerDelete")}
            </button>
          </div>
        )}
        <label>
          {t("ui.workload.plannerName")}
          <input disabled={busy} maxLength={PLANNER_LIMITS.name} onChange={(event) => setName(event.target.value)} value={name} />
        </label>
        <label className="leave-check">
          <input checked={shared} disabled={busy} onChange={(event) => setShared(event.target.checked)} type="checkbox" />
          {t("ui.workload.plannerShowEveryone")}
        </label>
        <button disabled={busy || !name.trim()} onClick={() => void saveAs()} type="button">
          {t("ui.workload.plannerSaveAs")}
        </button>
        {message && <p role="status">{message}</p>}
      </div>
    </details>
  );
}
