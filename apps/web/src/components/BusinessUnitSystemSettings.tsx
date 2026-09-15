import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { Building2, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { apiClient } from "../api/client";
import { BUSINESS_UNITS_CHANGED_EVENT } from "../app/businessUnitContext";
import type { SystemUser } from "../app/adminTypes";
import { useConfirm } from "../hooks/useConfirm";

type BusinessUnit = {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  memberships: Array<{
    id: string;
    role: "ADMIN" | "PROJECT_MANAGER" | "VIEWER";
    user: Pick<SystemUser, "id" | "name" | "email" | "isActive">;
  }>;
  _count: { projects: number };
};

export function BusinessUnitSystemSettings({ users }: { users: SystemUser[] }) {
  const { t: uiText } = useInterfaceTranslation();
  const confirm = useConfirm();
  const [units, setUnits] = useState<BusinessUnit[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [unitDraft, setUnitDraft] = useState({ code: "", name: "" });
  const [assignment, setAssignment] = useState({ businessUnitId: "", userId: "" });

  async function loadUnits() {
    const data = await apiClient.get<BusinessUnit[]>(
      "/api/admin/business-units",
      "Не удалось загрузить бизнес-юниты",
    );
    setUnits(data);
    setAssignment((current) => ({
      ...current,
      businessUnitId: data.some((unit) => unit.id === current.businessUnitId)
        ? current.businessUnitId
        : data[0]?.id ?? "",
    }));
    setError("");
  }

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .get<BusinessUnit[]>(
        "/api/admin/business-units",
        "Не удалось загрузить бизнес-юниты",
      )
      .then((data) => {
        if (cancelled) return;
        setUnits(data);
        setAssignment((current) => ({
          ...current,
          businessUnitId: current.businessUnitId || data[0]?.id || "",
        }));
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить бизнес-юниты");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedUnit = units.find((unit) => unit.id === assignment.businessUnitId) ?? null;
  const selectedAdministratorIds = useMemo(
    () => new Set(
      selectedUnit?.memberships
        .filter((membership) => membership.role === "ADMIN")
        .map((membership) => membership.user.id) ?? [],
    ),
    [selectedUnit],
  );
  const availableUsers = users.filter(
    (user) => user.isActive && user.role !== "ADMIN" && !selectedAdministratorIds.has(user.id),
  );

  async function createUnit(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      await apiClient.post("/api/admin/business-units", unitDraft, "Не удалось создать бизнес-юнит");
      setUnitDraft({ code: "", name: "" });
      await loadUnits();
      window.dispatchEvent(new CustomEvent(BUSINESS_UNITS_CHANGED_EVENT));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось создать бизнес-юнит");
    } finally {
      setCreating(false);
    }
  }

  async function renameUnit(event: FormEvent) {
    event.preventDefault();
    if (!editing || renaming) return;
    setRenaming(true);
    setError("");
    try {
      const updated = await apiClient.patch<BusinessUnit>(
        `/api/admin/business-units/${editing.id}`,
        { name: editing.name.trim() },
        "Не удалось переименовать бизнес-юнит",
      );
      setUnits((current) => current.map((unit) => unit.id === updated.id ? updated : unit));
      setEditing(null);
      window.dispatchEvent(new CustomEvent(BUSINESS_UNITS_CHANGED_EVENT));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось переименовать бизнес-юнит");
    } finally {
      setRenaming(false);
    }
  }

  async function assignAdministrator(event: FormEvent) {
    event.preventDefault();
    if (!assignment.businessUnitId || !assignment.userId) return;
    setError("");
    try {
      await apiClient.post(
        `/api/admin/business-units/${assignment.businessUnitId}/memberships`,
        { userId: assignment.userId, role: "ADMIN" },
        "Не удалось назначить администратора БЮ",
      );
      setAssignment((current) => ({ ...current, userId: "" }));
      await loadUnits();
      window.dispatchEvent(new CustomEvent(BUSINESS_UNITS_CHANGED_EVENT));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось назначить администратора БЮ");
    }
  }

  async function removeAdministrator(unit: BusinessUnit, membershipId: string, userName: string) {
    if (!(await confirm({
      title: "Снять роль администратора БЮ?",
      message: `${userName} потеряет административные права в БЮ «${unit.name}».`,
      confirmLabel: "Снять роль",
    }))) return;
    try {
      await apiClient.delete(
        `/api/admin/business-unit-memberships/${membershipId}`,
        "Не удалось снять роль администратора БЮ",
      );
      await loadUnits();
      window.dispatchEvent(new CustomEvent(BUSINESS_UNITS_CHANGED_EVENT));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось снять роль");
    }
  }

  return (
    <section className="business-unit-admin" aria-labelledby="business-unit-settings-heading">
      <div className="business-unit-admin-heading">
        <div>
          <h2 id="business-unit-settings-heading"><Building2 size={20} /> {uiText("ui.admin.businessUnitRegistry")}</h2>
          <p>{uiText("ui.admin.businessUnitRegistryDescription")}</p>
        </div>
        <form className="business-unit-create" onSubmit={createUnit}>
          <input
            aria-label={uiText("ui.admin.businessUnitCode")}
            placeholder={uiText("ui.admin.code")}
            pattern="[a-z0-9-]+"
            value={unitDraft.code}
            onChange={(event) => setUnitDraft({
              ...unitDraft,
              code: event.currentTarget.value.toLowerCase(),
            })}
            required
          />
          <input
            aria-label={uiText("ui.admin.businessUnitName")}
            placeholder={uiText("ui.admin.name")}
            value={unitDraft.name}
            onChange={(event) => setUnitDraft({ ...unitDraft, name: event.currentTarget.value })}
            required
          />
          <button type="submit" disabled={creating}>
            <Plus size={16} /> {creating ? uiText("ui.admin.creatingEllipsis") : uiText("ui.admin.createBusinessUnitShort")}
          </button>
        </form>
      </div>

      {error && <p className="business-unit-error">{error}</p>}

      <form className="business-unit-membership-form" onSubmit={assignAdministrator}>
        <select
          aria-label={uiText("ui.admin.businessUnitForAdminAssignment")}
          value={assignment.businessUnitId}
          onChange={(event) => setAssignment({
            businessUnitId: event.currentTarget.value,
            userId: "",
          })}
          required
        >
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
        </select>
        <select
          aria-label={uiText("ui.admin.newBusinessUnitAdmin")}
          value={assignment.userId}
          onChange={(event) => setAssignment({ ...assignment, userId: event.currentTarget.value })}
          required
        >
          <option value="">{uiText("ui.admin.selectBusinessUnitAdmin")}</option>
          {availableUsers.map((user) => (
            <option key={user.id} value={user.id}>{user.name} · {user.email}</option>
          ))}
        </select>
        <button type="submit">{uiText("ui.admin.assign")}</button>
      </form>

      <div className="business-unit-list">
        {units.map((unit) => {
          const administrators = unit.memberships.filter((membership) => membership.role === "ADMIN");
          return (
            <div className="business-unit-row" key={unit.id}>
              <div className="business-unit-name">
                {editing?.id === unit.id ? (
                  <form onSubmit={renameUnit}>
                    <input
                      aria-label={`Новое название БЮ ${unit.name}`}
                      value={editing.name}
                      onChange={(event) => setEditing({ id: unit.id, name: event.currentTarget.value })}
                      minLength={2}
                      maxLength={120}
                      required
                      autoFocus
                      disabled={renaming}
                    />
                    <button type="submit" disabled={renaming || editing.name.trim().length < 2}>
                      {renaming ? uiText("ui.admin.savingEllipsisChar") : uiText("ui.admin.save")}
                    </button>
                    <button type="button" disabled={renaming} onClick={() => setEditing(null)}>{uiText("ui.admin.cancel")}</button>
                  </form>
                ) : (
                  <>
                    <b>{unit.name}</b>
                    <button type="button" className="ghost-button" disabled={editing !== null}
                      aria-label={`Переименовать БЮ ${unit.name}`}
                      onClick={() => { setError(""); setEditing({ id: unit.id, name: unit.name }); }}>
                      {uiText("ui.admin.rename")}
                    </button>
                  </>
                )}
                <small>{unit.code} {uiText("ui.admin.projectsCountSuffix")} {unit._count.projects}{unit.isDefault ? uiText("ui.admin.primaryBadgeSuffix") : ""}</small>
              </div>
              <div className="business-unit-members">
                {administrators.map((membership) => (
                  <span className="business-unit-member" key={membership.id}>
                    <span>
                      <b>{membership.user.name}</b>
                      <small>{membership.user.email}</small>
                    </span>
                    <button
                      type="button"
                      className="ghost-button icon-button"
                      aria-label={`Снять роль администратора БЮ с ${membership.user.name}`}
                      onClick={() => void removeAdministrator(unit, membership.id, membership.user.name)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>
                ))}
                {administrators.length === 0 && <small>{uiText("ui.admin.businessUnitAdminNotAssigned")}</small>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
