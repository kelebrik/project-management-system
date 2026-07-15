import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { apiClient } from "../api/client";
import {
  BUSINESS_UNITS_CHANGED_EVENT,
  selectedBusinessUnitId,
} from "../app/businessUnitContext";
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
};

export function BusinessUnitSystemSettings({ users }: { users: SystemUser[] }) {
  const confirm = useConfirm();
  const [units, setUnits] = useState<BusinessUnit[]>([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [unitDraft, setUnitDraft] = useState({ code: "", name: "" });
  const [administratorId, setAdministratorId] = useState("");

  async function loadUnits() {
    const data = await apiClient.get<BusinessUnit[]>(
      "/api/admin/business-units",
      "Не удалось загрузить бизнес-юниты",
    );
    setUnits(data);
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
        if (!cancelled) setUnits(data);
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

  const selectedUnit = useMemo(() => {
    const selectedId = selectedBusinessUnitId();
    return units.find((unit) => unit.id === selectedId) ??
      units.find((unit) => unit.isDefault) ??
      units[0] ?? null;
  }, [units]);
  const administrators = selectedUnit?.memberships.filter((item) => item.role === "ADMIN") ?? [];
  const availableUsers = users.filter(
    (user) =>
      user.isActive &&
      user.role !== "ADMIN" &&
      !administrators.some((item) => item.user.id === user.id),
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

  async function assignAdministrator(event: FormEvent) {
    event.preventDefault();
    if (!selectedUnit || !administratorId) return;
    setError("");
    try {
      await apiClient.post(
        `/api/admin/business-units/${selectedUnit.id}/memberships`,
        { userId: administratorId, role: "ADMIN" },
        "Не удалось назначить администратора БЮ",
      );
      setAdministratorId("");
      await loadUnits();
      window.dispatchEvent(new CustomEvent(BUSINESS_UNITS_CHANGED_EVENT));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось назначить администратора БЮ");
    }
  }

  return (
    <section className="business-unit-admin business-unit-registry-settings" aria-labelledby="business-unit-settings-heading">
      <div className="business-unit-admin-heading">
        <div>
          <h3 id="business-unit-settings-heading">Настройки бизнес-юнита</h3>
          <p>Создание бизнес-юнитов и назначение администраторов. Доступно только администратору системы.</p>
        </div>
        <form className="business-unit-create" onSubmit={createUnit}>
          <input
            aria-label="Код бизнес-юнита"
            placeholder="Код"
            pattern="[a-z0-9-]+"
            value={unitDraft.code}
            onChange={(event) => setUnitDraft({
              ...unitDraft,
              code: event.currentTarget.value.toLowerCase(),
            })}
            required
          />
          <input
            aria-label="Название бизнес-юнита"
            placeholder="Название"
            value={unitDraft.name}
            onChange={(event) => setUnitDraft({ ...unitDraft, name: event.currentTarget.value })}
            required
          />
          <button type="submit" disabled={creating}>
            <Plus size={16} /> {creating ? "Создаю..." : "Создать БЮ"}
          </button>
        </form>
      </div>

      {error && <p className="business-unit-error">{error}</p>}
      {selectedUnit && (
        <div className="business-unit-registry-admins">
          <div className="business-unit-name">
            <b>{selectedUnit.name}</b>
            <small>{selectedUnit.code} · администраторы БЮ</small>
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
                  onClick={async () => {
                    if (!(await confirm({
                      title: "Снять роль администратора БЮ?",
                      message: `${membership.user.name} потеряет административные права в БЮ «${selectedUnit.name}».`,
                      confirmLabel: "Снять роль",
                    }))) return;
                    try {
                      await apiClient.delete(
                        `/api/admin/business-unit-memberships/${membership.id}`,
                        "Не удалось снять роль администратора БЮ",
                      );
                      await loadUnits();
                      window.dispatchEvent(new CustomEvent(BUSINESS_UNITS_CHANGED_EVENT));
                    } catch (deleteError) {
                      setError(deleteError instanceof Error ? deleteError.message : "Не удалось снять роль");
                    }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </span>
            ))}
            {administrators.length === 0 && <small>Администратор БЮ не назначен</small>}
          </div>
          <form className="business-unit-admin-assignment" onSubmit={assignAdministrator}>
            <select
              aria-label="Новый администратор БЮ"
              value={administratorId}
              onChange={(event) => setAdministratorId(event.currentTarget.value)}
              required
            >
              <option value="">Выберите администратора БЮ</option>
              {availableUsers.map((user) => (
                <option key={user.id} value={user.id}>{user.name} · {user.email}</option>
              ))}
            </select>
            <button type="submit">Назначить</button>
          </form>
        </div>
      )}
    </section>
  );
}
